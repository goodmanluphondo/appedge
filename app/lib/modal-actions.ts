"use server";

import { revalidatePath } from "next/cache";
import { requireAdministrator } from "../../lib/auth";
import { requireEnv } from "../../lib/.env";
import { getAppEdgeDatabase } from "./d1";
import { isEmailAddress, isHostname, normalizeHttpsUrl, slugify } from "./record-validation";

export type ActionFailure = { error: string };
export type DnsInstruction = { type: "TXT" | "CNAME"; name: string; value: string };

const SAVE_FAILURE_MESSAGE = "The record could not be saved. Check for a duplicate name or hostname and try again.";
const CLIENT_NAME_MAXIMUM_LENGTH = 120;
const VERIFICATION_TOKEN_PATTERN = /^[a-f0-9]{32}$/;
const DEFAULT_APPLICATION_ENVIRONMENT = "production";
const APPLICATION_TYPES = ["cloudflare_worker", "external_https"];
const ORIGIN_ERROR_MESSAGE = "Origin must be an HTTPS URL, for example https://app.example.workers.dev.";

function audit(resourceType: string, action: string, resourceId: string, actorName: string, metadata: Record<string, string> = {}) {
  return getAppEdgeDatabase().prepare(`
    INSERT INTO audit_events (id, actor_name, action, resource_type, resource_id, outcome, metadata)
    VALUES (?, ?, ?, ?, ?, 'success', ?)
  `).bind(crypto.randomUUID(), actorName, action, resourceType, resourceId, JSON.stringify(metadata));
}

function refreshDashboard() {
  revalidatePath("/", "layout");
}

export async function createClientFromModal(input: { name: string; email: string }): Promise<ActionFailure | { error: null }> {
  const administrator = await requireAdministrator();
  const name = input.name.trim();
  const email = input.email.trim().toLowerCase();
  if (!name) return { error: "Client name is required." };
  if (name.length > CLIENT_NAME_MAXIMUM_LENGTH) return { error: "Client name must be 120 characters or fewer." };
  if (!isEmailAddress(email)) return { error: "Enter a valid contact email." };

  const database = getAppEdgeDatabase();
  const clientId = crypto.randomUUID();
  try {
    await database.batch([
      database.prepare(`
        INSERT INTO clients (id, name, contact_email, status) VALUES (?, ?, ?, 'active')
      `).bind(clientId, name, email),
      audit("client", "Client created", clientId, administrator.displayName),
    ]);
  } catch {
    return { error: SAVE_FAILURE_MESSAGE };
  }
  refreshDashboard();
  return { error: null };
}

export async function createApplicationFromModal(input: {
  clientId: string;
  name: string;
  type: string;
  origin: string;
}): Promise<ActionFailure | { error: null; hasOrigin: boolean }> {
  const administrator = await requireAdministrator();
  const name = input.name.trim();
  const originInput = input.origin.trim();
  if (!name) return { error: "Application name is required." };
  if (name.length > CLIENT_NAME_MAXIMUM_LENGTH) return { error: "Application name must be 120 characters or fewer." };
  if (!APPLICATION_TYPES.includes(input.type)) return { error: "Choose an application type." };
  const originUrl = normalizeHttpsUrl(originInput);
  if (originInput && !originUrl) return { error: ORIGIN_ERROR_MESSAGE };

  const database = getAppEdgeDatabase();
  const client = await database.prepare("SELECT id FROM clients WHERE id = ? AND status = 'active'")
    .bind(input.clientId).first<{ id: string }>();
  if (!client) return { error: "Select an active client." };

  const applicationId = crypto.randomUUID();
  const identifier = `${slugify(name) || "application"}-${crypto.randomUUID().slice(0, 8)}`;
  try {
    await database.batch([
      database.prepare(`
        INSERT INTO applications (id, client_id, name, identifier, application_type, environment, origin_url, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'draft')
      `).bind(applicationId, input.clientId, name, identifier, input.type, DEFAULT_APPLICATION_ENVIRONMENT, originUrl),
      audit("application", "Application registered", applicationId, administrator.displayName),
    ]);
  } catch {
    return { error: SAVE_FAILURE_MESSAGE };
  }
  refreshDashboard();
  return { error: null, hasOrigin: originUrl !== null };
}

export async function setApplicationOrigin(input: { applicationId: string; origin: string }): Promise<ActionFailure | { error: null }> {
  const administrator = await requireAdministrator();
  const originUrl = normalizeHttpsUrl(input.origin.trim());
  if (!originUrl) return { error: ORIGIN_ERROR_MESSAGE };

  const database = getAppEdgeDatabase();
  const application = await database.prepare("SELECT id FROM applications WHERE id = ?")
    .bind(input.applicationId).first<{ id: string }>();
  if (!application) return { error: "Select a registered application." };

  try {
    await database.batch([
      database.prepare("UPDATE applications SET origin_url = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
        .bind(originUrl, input.applicationId),
      audit("application", "Origin configured", input.applicationId, administrator.displayName),
    ]);
  } catch {
    return { error: SAVE_FAILURE_MESSAGE };
  }
  refreshDashboard();
  return { error: null };
}

function ownershipRecordName(hostname: string): string {
  return `_appedge.${hostname}`;
}

function ownershipRecordValue(token: string): string {
  return `appedge-verify=${token}`;
}

export async function prepareDomainFromModal(input: { hostname: string; applicationId: string }): Promise<ActionFailure | {
  error: null;
  hostname: string;
  verificationToken: string;
  records: DnsInstruction[];
}> {
  await requireAdministrator();
  const hostname = input.hostname.trim().toLowerCase().replace(/\.$/, "");
  if (!isHostname(hostname)) return { error: "Enter a valid hostname, for example portal.example.com." };

  const database = getAppEdgeDatabase();
  const existing = await database.prepare("SELECT id FROM domains WHERE hostname = ?").bind(hostname).first<{ id: string }>();
  if (existing) return { error: "This hostname is already registered." };
  const application = await findAttachableApplication(input.applicationId);
  if (!application) return { error: "Select an application attached to an active client." };

  const verificationToken = crypto.randomUUID().replaceAll("-", "");
  const edgeHostname = requireEnv("APPEDGE_EDGE_HOSTNAME", process.env.APPEDGE_EDGE_HOSTNAME);
  return {
    error: null,
    hostname,
    verificationToken,
    records: [
      { type: "TXT", name: ownershipRecordName(hostname), value: ownershipRecordValue(verificationToken) },
      { type: "CNAME", name: hostname, value: edgeHostname },
    ],
  };
}

async function findAttachableApplication(applicationId: string): Promise<{ client_id: string } | null> {
  return getAppEdgeDatabase().prepare(`
    SELECT applications.client_id FROM applications
    INNER JOIN clients ON clients.id = applications.client_id
    WHERE applications.id = ? AND applications.status != 'disabled' AND clients.status = 'active'
  `).bind(applicationId).first<{ client_id: string }>();
}

export async function createDomainFromModal(input: {
  hostname: string;
  applicationId: string;
  verificationToken: string;
}): Promise<ActionFailure | { error: null; domainId: string }> {
  const administrator = await requireAdministrator();
  const hostname = input.hostname.trim().toLowerCase();
  if (!isHostname(hostname)) return { error: "Enter a valid hostname, for example portal.example.com." };
  if (!VERIFICATION_TOKEN_PATTERN.test(input.verificationToken)) return { error: "The DNS records have expired. Go back and continue again." };
  const application = await findAttachableApplication(input.applicationId);
  if (!application) return { error: "Select an application attached to an active client." };

  const edgeHostname = requireEnv("APPEDGE_EDGE_HOSTNAME", process.env.APPEDGE_EDGE_HOSTNAME);
  const ownershipRecords = JSON.stringify([
    { type: "TXT", name: ownershipRecordName(hostname), value: ownershipRecordValue(input.verificationToken) },
  ]);
  const database = getAppEdgeDatabase();
  const domainId = crypto.randomUUID();
  try {
    await database.batch([
      database.prepare(`
        INSERT INTO domains (id, client_id, application_id, hostname, cname_target, ownership_records, ownership_status, dns_status, ssl_status)
        VALUES (?, ?, ?, ?, ?, ?, 'pending', 'pending', 'pending')
      `).bind(domainId, application.client_id, input.applicationId, hostname, edgeHostname, ownershipRecords),
      audit("domain", "Domain added", domainId, administrator.displayName),
    ]);
  } catch {
    return { error: "This hostname is already registered." };
  }
  refreshDashboard();
  return { error: null, domainId };
}

type RouteDomainRow = {
  id: string;
  hostname: string;
  application_id: string;
  ownership_status: string;
  dns_status: string;
  ssl_status: string;
  route_id: string | null;
  route_status: string | null;
};

async function findDomainForRoute(domainId: string): Promise<RouteDomainRow | null> {
  return getAppEdgeDatabase().prepare(`
    SELECT
      domains.id, domains.hostname, domains.application_id,
      domains.ownership_status, domains.dns_status, domains.ssl_status,
      routes.id AS route_id, routes.status AS route_status
    FROM domains
    LEFT JOIN routes ON routes.domain_id = domains.id
    WHERE domains.id = ?
  `).bind(domainId).first<RouteDomainRow>();
}

export async function publishRoute(input: { domainId: string; applicationId: string }): Promise<ActionFailure | { error: null; hostname: string }> {
  const administrator = await requireAdministrator();
  const domain = await findDomainForRoute(input.domainId);
  if (!domain) return { error: "Select a registered domain." };
  const certificateActive = domain.ownership_status === "verified" && domain.dns_status === "verified" && domain.ssl_status === "active";
  if (!certificateActive) return { error: "This domain needs a verified hostname and an active certificate before it can be published." };
  if (domain.route_status === "active") return { error: "This domain already has a live route." };

  const database = getAppEdgeDatabase();
  const application = await database.prepare(`
    SELECT applications.client_id, applications.origin_url FROM applications
    INNER JOIN clients ON clients.id = applications.client_id
    WHERE applications.id = ? AND applications.status != 'disabled' AND clients.status = 'active'
  `).bind(input.applicationId).first<{ client_id: string; origin_url: string | null }>();
  if (!application?.origin_url) return { error: "Choose an application that has an origin URL." };

  const routeStatement = domain.route_id
    ? database.prepare("UPDATE routes SET application_id = ?, status = 'active', published_version = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
      .bind(input.applicationId, domain.route_id)
    : database.prepare(`
      INSERT INTO routes (id, domain_id, application_id, environment, status, published_version)
      VALUES (?, ?, ?, ?, 'active', CURRENT_TIMESTAMP)
    `).bind(crypto.randomUUID(), domain.id, input.applicationId, DEFAULT_APPLICATION_ENVIRONMENT);
  try {
    await database.batch([
      database.prepare("UPDATE domains SET application_id = ?, client_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
        .bind(input.applicationId, application.client_id, domain.id),
      routeStatement,
      audit("domain", "Route published", domain.id, administrator.displayName),
    ]);
  } catch {
    return { error: SAVE_FAILURE_MESSAGE };
  }
  refreshDashboard();
  return { error: null, hostname: domain.hostname };
}

export async function activateRoute(domainId: string): Promise<ActionFailure | { error: null; hostname: string }> {
  const domain = await findDomainForRoute(domainId);
  if (!domain) return { error: "Select a registered domain." };
  return publishRoute({ domainId, applicationId: domain.application_id });
}

export async function deactivateRoute(domainId: string): Promise<ActionFailure | { error: null }> {
  const administrator = await requireAdministrator();
  const domain = await findDomainForRoute(domainId);
  if (!domain?.route_id) return { error: "This domain has no route to deactivate." };
  const database = getAppEdgeDatabase();
  try {
    await database.batch([
      database.prepare("UPDATE routes SET status = 'disabled', updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(domain.route_id),
      audit("domain", "Route deactivated", domain.id, administrator.displayName),
    ]);
  } catch {
    return { error: SAVE_FAILURE_MESSAGE };
  }
  refreshDashboard();
  return { error: null };
}

export async function removeDomain(domainId: string): Promise<ActionFailure | { error: null }> {
  const administrator = await requireAdministrator();
  const domain = await findDomainForRoute(domainId);
  if (!domain) return { error: "This domain no longer exists." };
  const database = getAppEdgeDatabase();
  try {
    await database.batch([
      database.prepare("DELETE FROM routes WHERE domain_id = ?").bind(domain.id),
      database.prepare("DELETE FROM domains WHERE id = ?").bind(domain.id),
      audit("domain", "Domain removed", domain.id, administrator.displayName, { hostname: domain.hostname }),
    ]);
  } catch {
    return { error: SAVE_FAILURE_MESSAGE };
  }
  refreshDashboard();
  return { error: null };
}

export async function testIntegration(name: string): Promise<{ ok: boolean; message: string }> {
  await requireAdministrator();
  switch (name) {
    case "Cloudflare D1":
      try {
        await getAppEdgeDatabase().prepare("SELECT 1 AS ok").first();
        return { ok: true, message: "Cloudflare D1 responded OK" };
      } catch {
        return { ok: false, message: "Cloudflare D1 did not respond." };
      }
    case "Microsoft Entra ID": {
      const required = ["AUTH_MICROSOFT_ENTRA_ID_TENANT_ID", "AUTH_MICROSOFT_ENTRA_ID_CLIENT_ID", "AUTH_MICROSOFT_ENTRA_ID_CLIENT_SECRET"];
      const missing = required.filter((variable) => !process.env[variable]);
      return missing.length === 0
        ? { ok: true, message: "Microsoft Entra ID is configured and your session is valid." }
        : { ok: false, message: `Microsoft Entra ID is missing ${missing.join(", ")}.` };
    }
    default:
      return { ok: false, message: `${name} is not connected yet.` };
  }
}
