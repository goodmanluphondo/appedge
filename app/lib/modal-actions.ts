"use server";

import { revalidatePath } from "next/cache";
import { authoriseAction } from "../../lib/auth";
import { auditStatement } from "./audit";
import { getAppEdgeDatabase } from "./d1";
import { FORBIDDEN_MESSAGE } from "./permissions";
import { isEmailAddress, normalizeHttpsUrl, slugify } from "./record-validation";

export type ActionFailure = { error: string };

const SAVE_FAILURE_MESSAGE = "The record could not be saved. Check for a duplicate name or hostname and try again.";
const CLIENT_NAME_MAXIMUM_LENGTH = 120;
const DEFAULT_APPLICATION_ENVIRONMENT = "production";
const APPLICATION_TYPES = ["cloudflare_worker", "external_https"];
const ORIGIN_ERROR_MESSAGE = "Origin must be an HTTPS URL, for example https://app.example.workers.dev.";

function audit(resourceType: string, action: string, resourceId: string, actorName: string) {
  return auditStatement({ resourceType, action, resourceId, actorName });
}

function refreshDashboard() {
  revalidatePath("/", "layout");
}

export async function createClientFromModal(input: { name: string; email: string }): Promise<ActionFailure | { error: null }> {
  const administrator = await authoriseAction("manage");
  if (!administrator) return { error: FORBIDDEN_MESSAGE };
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
  const administrator = await authoriseAction("manage");
  if (!administrator) return { error: FORBIDDEN_MESSAGE };
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
  const administrator = await authoriseAction("manage");
  if (!administrator) return { error: FORBIDDEN_MESSAGE };
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
  const administrator = await authoriseAction("manage");
  if (!administrator) return { error: FORBIDDEN_MESSAGE };
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
  if (!(await authoriseAction("manage"))) return { error: FORBIDDEN_MESSAGE };
  const domain = await findDomainForRoute(domainId);
  if (!domain) return { error: "Select a registered domain." };
  return publishRoute({ domainId, applicationId: domain.application_id });
}

export async function deactivateRoute(domainId: string): Promise<ActionFailure | { error: null }> {
  const administrator = await authoriseAction("manage");
  if (!administrator) return { error: FORBIDDEN_MESSAGE };
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

export async function testIntegration(name: string): Promise<{ ok: boolean; message: string }> {
  const settingsUser = await authoriseAction("settings");
  if (!settingsUser) return { ok: false, message: FORBIDDEN_MESSAGE };
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
