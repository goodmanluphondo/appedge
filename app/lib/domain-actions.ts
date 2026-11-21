"use server";

import { revalidatePath } from "next/cache";
import { authoriseAction } from "../../lib/auth";
import { auditStatement } from "./audit";
import {
  CloudflareApiError,
  createCustomHostname,
  deleteCustomHostname,
  findCustomHostname,
  getCustomHostname,
  requestRevalidation,
  type CustomHostname,
} from "./cloudflare-custom-hostnames";
import { getAppEdgeDatabase } from "./d1";
import { observeDns } from "./dns-lookup";
import { DOMAIN_OPERATION_IN_PROGRESS_MESSAGE, beginDomainOperation, finishDomainOperation } from "./domain-operations";
import { PIPELINE_STAGES, pipelineStage } from "./domain-pipeline";
import { evaluateVerification, shouldRequestRevalidation, type VerificationOutcome } from "./domain-verification";
import { getEdgeHostname } from "./edge";
import { FORBIDDEN_MESSAGE } from "./permissions";
import { isHostname } from "./record-validation";

export type DnsInstruction = { type: "TXT" | "CNAME"; name: string; value: string };
type Failure = { error: string };

const STAGE_REACHED_ACTIONS = ["", "Ownership verified", "DNS validated", "SSL certificate issued", "SSL certificate issued"] as const;

function describeFailure(error: unknown): string {
  return error instanceof CloudflareApiError ? error.message : "The request could not be completed. Try again.";
}

function refreshDashboard() {
  revalidatePath("/", "layout");
}

async function registerCustomHostname(hostname: string): Promise<CustomHostname> {
  try {
    return await createCustomHostname(hostname);
  } catch (error) {
    if (error instanceof CloudflareApiError && error.isDuplicateHostname) {
      const existing = await findCustomHostname(hostname);
      if (existing) return existing;
    }
    throw error;
  }
}

function ownershipRecordsJson(custom: CustomHostname): string {
  return JSON.stringify(custom.ownershipRecord ? [{ type: "TXT", name: custom.ownershipRecord.name, value: custom.ownershipRecord.value }] : []);
}

function instructionsFor(hostname: string, custom: CustomHostname): DnsInstruction[] {
  const records: DnsInstruction[] = [];
  if (custom.ownershipRecord) records.push({ type: "TXT", name: custom.ownershipRecord.name, value: custom.ownershipRecord.value });
  records.push({ type: "CNAME", name: hostname, value: getEdgeHostname() });
  return records;
}

export async function addDomainFromModal(input: { hostname: string; applicationId: string }): Promise<Failure | {
  error: null;
  domainId: string;
  hostname: string;
  records: DnsInstruction[];
}> {
  const user = await authoriseAction("manage");
  if (!user) return { error: FORBIDDEN_MESSAGE };
  const hostname = input.hostname.trim().toLowerCase().replace(/\.$/, "");
  if (!isHostname(hostname)) return { error: "Enter a valid hostname, for example portal.example.com." };

  const database = getAppEdgeDatabase();
  const application = await database.prepare(`
    SELECT applications.client_id FROM applications
    INNER JOIN clients ON clients.id = applications.client_id
    WHERE applications.id = ? AND applications.status != 'disabled' AND clients.status = 'active'
  `).bind(input.applicationId).first<{ client_id: string }>();
  if (!application) return { error: "Select an application attached to an active client." };

  const domainId = crypto.randomUUID();
  const edgeHostname = getEdgeHostname();
  try {
    await database.prepare(`
      INSERT INTO domains (id, client_id, application_id, hostname, cname_target, ownership_status, dns_status, ssl_status)
      VALUES (?, ?, ?, ?, ?, 'pending', 'pending', 'pending')
    `).bind(domainId, application.client_id, input.applicationId, hostname, edgeHostname).run();
  } catch {
    return { error: "This hostname is already registered." };
  }

  const operationId = await beginDomainOperation(domainId, "register_custom_hostname");
  if (!operationId) return { error: DOMAIN_OPERATION_IN_PROGRESS_MESSAGE };

  let custom: CustomHostname;
  try {
    custom = await registerCustomHostname(hostname);
    await database.batch([
      database.prepare(`
        UPDATE domains
        SET cloudflare_hostname_id = ?, cloudflare_status = ?, ownership_records = ?, last_checked_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).bind(custom.id, custom.status, ownershipRecordsJson(custom), domainId),
      auditStatement({ resourceType: "domain", action: "Domain added", resourceId: domainId, actorName: user.displayName }),
    ]);
  } catch (error) {
    const message = `Cloudflare could not register this hostname: ${describeFailure(error)}`;
    await finishDomainOperation(operationId, { error: message });
    await database.prepare("DELETE FROM provisioning_operations WHERE domain_id = ?").bind(domainId).run();
    await database.prepare("DELETE FROM domains WHERE id = ?").bind(domainId).run();
    return { error: message };
  }

  await finishDomainOperation(operationId, { result: { cloudflare_hostname_id: custom.id, cloudflare_status: custom.status } });
  refreshDashboard();
  return { error: null, domainId, hostname, records: instructionsFor(hostname, custom) };
}

type StoredDomain = {
  id: string;
  hostname: string;
  cloudflare_hostname_id: string | null;
  ownership_status: string;
  dns_status: string;
  ssl_status: string;
};

function describeResult(before: StoredDomain, outcome: VerificationOutcome, custom: CustomHostname): { message: string; advanced: boolean; failed: boolean } {
  const stageBefore = pipelineStage({ ownershipStatus: before.ownership_status, dnsStatus: before.dns_status, sslStatus: before.ssl_status, routeStatus: null });
  const stageAfter = pipelineStage({ ownershipStatus: outcome.ownershipStatus, dnsStatus: outcome.dnsStatus, sslStatus: outcome.sslStatus, routeStatus: null });
  if (stageAfter > stageBefore) return { message: STAGE_REACHED_ACTIONS[stageAfter], advanced: true, failed: false };
  const failed = [outcome.ownershipStatus, outcome.dnsStatus, outcome.sslStatus].includes("failed");
  const fallback = `Cloudflare is still validating this hostname (${custom.status}${custom.sslStatus ? `, certificate ${custom.sslStatus.replaceAll("_", " ")}` : ""}).`;
  return { message: outcome.message ?? fallback, advanced: false, failed };
}

export async function checkDomain(domainId: string): Promise<Failure | { error: null; message: string; warning: boolean }> {
  const user = await authoriseAction("manage");
  if (!user) return { error: FORBIDDEN_MESSAGE };

  const database = getAppEdgeDatabase();
  const domain = await database.prepare(`
    SELECT id, hostname, cloudflare_hostname_id, ownership_status, dns_status, ssl_status FROM domains WHERE id = ?
  `).bind(domainId).first<StoredDomain>();
  if (!domain) return { error: "This domain no longer exists." };

  const operationId = await beginDomainOperation(domain.id, "check_domain");
  if (!operationId) return { error: DOMAIN_OPERATION_IN_PROGRESS_MESSAGE };

  try {
    const edgeHostname = getEdgeHostname();
    let custom = domain.cloudflare_hostname_id
      ? await getCustomHostname(domain.cloudflare_hostname_id)
      : await registerCustomHostname(domain.hostname);
    const observation = await observeDns({ txtName: custom.ownershipRecord?.name ?? null, hostname: domain.hostname });
    let outcome = evaluateVerification({ hostname: custom, observation, edgeHostname });
    if (shouldRequestRevalidation(custom, outcome)) {
      custom = await requestRevalidation(custom.id);
      outcome = evaluateVerification({ hostname: custom, observation, edgeHostname });
    }

    const result = describeResult(domain, outcome, custom);
    await database.batch([
      database.prepare(`
        UPDATE domains
        SET cloudflare_hostname_id = ?, cloudflare_status = ?, ownership_status = ?, dns_status = ?, ssl_status = ?,
            status_message = ?, ownership_records = ?, last_checked_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).bind(custom.id, outcome.cloudflareStatus, outcome.ownershipStatus, outcome.dnsStatus, outcome.sslStatus, outcome.message, ownershipRecordsJson(custom), domain.id),
      auditStatement({
        resourceType: "domain",
        action: result.advanced ? result.message : result.failed ? "Domain check failed" : "Domain check pending",
        resourceId: domain.id,
        actorName: user.displayName,
        outcome: result.advanced ? "success" : "failure",
        metadata: { cloudflare_status: outcome.cloudflareStatus },
      }),
    ]);
    await finishDomainOperation(operationId, { result: { cloudflare_status: outcome.cloudflareStatus, stage: PIPELINE_STAGES[pipelineStage({ ownershipStatus: outcome.ownershipStatus, dnsStatus: outcome.dnsStatus, sslStatus: outcome.sslStatus, routeStatus: null })].name } });
    refreshDashboard();
    return { error: null, message: result.message, warning: !result.advanced };
  } catch (error) {
    const message = describeFailure(error);
    await finishDomainOperation(operationId, { error: message });
    return { error: `The check could not be completed: ${message}` };
  }
}

export async function removeDomain(domainId: string): Promise<Failure | { error: null }> {
  const user = await authoriseAction("manage");
  if (!user) return { error: FORBIDDEN_MESSAGE };

  const database = getAppEdgeDatabase();
  const domain = await database.prepare("SELECT id, hostname, cloudflare_hostname_id FROM domains WHERE id = ?")
    .bind(domainId).first<{ id: string; hostname: string; cloudflare_hostname_id: string | null }>();
  if (!domain) return { error: "This domain no longer exists." };

  const operationId = await beginDomainOperation(domain.id, "remove_custom_hostname");
  if (!operationId) return { error: DOMAIN_OPERATION_IN_PROGRESS_MESSAGE };
  try {
    if (domain.cloudflare_hostname_id) {
      try {
        await deleteCustomHostname(domain.cloudflare_hostname_id);
      } catch (error) {
        if (!(error instanceof CloudflareApiError && error.isNotFound)) throw error;
      }
    }
    await finishDomainOperation(operationId, { result: { hostname: domain.hostname } });
    await database.batch([
      database.prepare("DELETE FROM routes WHERE domain_id = ?").bind(domain.id),
      database.prepare("DELETE FROM domains WHERE id = ?").bind(domain.id),
      auditStatement({ resourceType: "domain", action: "Domain removed", resourceId: domain.id, actorName: user.displayName, metadata: { hostname: domain.hostname } }),
    ]);
  } catch (error) {
    const message = describeFailure(error);
    await finishDomainOperation(operationId, { error: message });
    return { error: `The domain could not be removed: ${message}` };
  }
  refreshDashboard();
  return { error: null };
}
