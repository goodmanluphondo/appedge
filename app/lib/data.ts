import { getAppEdgeDatabase } from "./d1";
import { buildDnsRecords, type DomainStatuses } from "./domain-pipeline";

export type ManagementSection = "Clients" | "Applications" | "Domains" | "Routes" | "Activity" | "Settings";

export type CreateRecordOptions = {
  clients: { id: string; name: string }[];
  applications: { id: string; name: string; clientName: string }[];
  domains: { id: string; hostname: string; applicationName: string }[];
};

export type ClientScope = string | null;

export type ShellClient = { id: string; name: string; contactEmail: string | null };

export type ClientRecord = {
  id: string;
  name: string;
  contactName: string | null;
  contactEmail: string | null;
  status: string;
  createdAt: string;
  applicationCount: number;
  domainCount: number;
};

export type ApplicationRecord = {
  id: string;
  name: string;
  clientId: string;
  clientName: string;
  applicationType: string;
  originUrl: string | null;
  status: string;
  domainCount: number;
};

export type DomainRecord = DomainStatuses & {
  id: string;
  hostname: string;
  clientId: string;
  clientName: string;
  applicationId: string;
  applicationName: string;
  originUrl: string | null;
  cnameTarget: string | null;
  ownershipRecords: string;
  certificateRecords: string;
  cloudflareHostnameId: string | null;
  cloudflareStatus: string | null;
  lastCheckedAt: string | null;
};

export type ActivityRecord = {
  id: string;
  action: string;
  resourceType: string;
  resourceName: string;
  actorName: string;
  outcome: string;
  createdAt: string;
};

type RawDomain = {
  id: string;
  hostname: string;
  client_id: string;
  client_name: string;
  application_id: string;
  application_name: string;
  origin_url: string | null;
  cname_target: string | null;
  ownership_status: string;
  dns_status: string;
  ssl_status: string;
  ownership_records: string;
  certificate_records: string;
  route_status: string | null;
  cloudflare_hostname_id: string | null;
  cloudflare_status: string | null;
  status_message: string | null;
  last_checked_at: string | null;
};

const DOMAIN_SELECT = `
  SELECT
    domains.id,
    domains.hostname,
    domains.client_id,
    clients.name AS client_name,
    domains.application_id,
    applications.name AS application_name,
    applications.origin_url,
    domains.cname_target,
    domains.ownership_status,
    domains.dns_status,
    domains.ssl_status,
    domains.ownership_records,
    domains.certificate_records,
    routes.status AS route_status,
    domains.cloudflare_hostname_id,
    domains.cloudflare_status,
    domains.status_message,
    domains.last_checked_at
  FROM domains
  INNER JOIN clients ON clients.id = domains.client_id
  INNER JOIN applications ON applications.id = domains.application_id
  LEFT JOIN routes ON routes.domain_id = domains.id
`;

function mapDomain(row: RawDomain): DomainRecord {
  const recordsIssued = buildDnsRecords({
    hostname: row.hostname,
    cnameTarget: row.cname_target,
    ownershipStatus: row.ownership_status,
    dnsStatus: row.dns_status,
    sslStatus: row.ssl_status,
    ownershipRecords: row.ownership_records,
    certificateRecords: row.certificate_records,
  }).length > 0;
  return {
    recordsIssued,
    id: row.id,
    hostname: row.hostname,
    clientId: row.client_id,
    clientName: row.client_name,
    applicationId: row.application_id,
    applicationName: row.application_name,
    originUrl: row.origin_url,
    cnameTarget: row.cname_target,
    ownershipStatus: row.ownership_status,
    dnsStatus: row.dns_status,
    sslStatus: row.ssl_status,
    ownershipRecords: row.ownership_records,
    certificateRecords: row.certificate_records,
    routeStatus: row.route_status,
    statusMessage: row.status_message,
    cloudflareHostnameId: row.cloudflare_hostname_id,
    cloudflareStatus: row.cloudflare_status,
    lastCheckedAt: row.last_checked_at,
  };
}

export async function getShellClients(): Promise<ShellClient[]> {
  const result = await getAppEdgeDatabase().prepare(
    "SELECT id, name, contact_email FROM clients ORDER BY name ASC",
  ).all<{ id: string; name: string; contact_email: string | null }>();
  return result.results.map((row) => ({ id: row.id, name: row.name, contactEmail: row.contact_email }));
}

export async function getDomains(scope: ClientScope): Promise<DomainRecord[]> {
  const result = await getAppEdgeDatabase().prepare(`
    ${DOMAIN_SELECT}
    WHERE (?1 IS NULL OR domains.client_id = ?1)
    ORDER BY domains.created_at DESC, domains.hostname ASC
  `).bind(scope).all<RawDomain>();
  return result.results.map(mapDomain);
}

export async function getDomainById(domainId: string): Promise<DomainRecord | null> {
  const row = await getAppEdgeDatabase().prepare(`
    ${DOMAIN_SELECT}
    WHERE domains.id = ?1
  `).bind(domainId).first<RawDomain>();
  return row ? mapDomain(row) : null;
}

export async function getDomainHistory(domainId: string, limit: number): Promise<ActivityRecord[]> {
  const result = await getAppEdgeDatabase().prepare(`
    SELECT id, action, resource_type, resource_id, actor_name, outcome, created_at
    FROM audit_events
    WHERE resource_type = 'domain' AND resource_id = ?1
    ORDER BY created_at DESC
    LIMIT ?2
  `).bind(domainId, limit).all<RawActivity>();
  return result.results.map((row) => mapActivity(row, row.resource_id));
}

export async function getClients(scope: ClientScope): Promise<ClientRecord[]> {
  const result = await getAppEdgeDatabase().prepare(`
    SELECT
      clients.id,
      clients.name,
      clients.contact_name,
      clients.contact_email,
      clients.status,
      clients.created_at,
      (SELECT COUNT(*) FROM applications WHERE applications.client_id = clients.id) AS application_count,
      (SELECT COUNT(*) FROM domains WHERE domains.client_id = clients.id) AS domain_count
    FROM clients
    WHERE (?1 IS NULL OR clients.id = ?1)
    ORDER BY clients.created_at DESC, clients.name ASC
  `).bind(scope).all<{
    id: string;
    name: string;
    contact_name: string | null;
    contact_email: string | null;
    status: string;
    created_at: string;
    application_count: number;
    domain_count: number;
  }>();
  return result.results.map((row) => ({
    id: row.id,
    name: row.name,
    contactName: row.contact_name,
    contactEmail: row.contact_email,
    status: row.status,
    createdAt: row.created_at,
    applicationCount: row.application_count,
    domainCount: row.domain_count,
  }));
}

export async function getApplications(scope: ClientScope): Promise<ApplicationRecord[]> {
  const result = await getAppEdgeDatabase().prepare(`
    SELECT
      applications.id,
      applications.name,
      applications.client_id,
      clients.name AS client_name,
      applications.application_type,
      applications.origin_url,
      applications.status,
      (SELECT COUNT(*) FROM domains WHERE domains.application_id = applications.id) AS domain_count
    FROM applications
    INNER JOIN clients ON clients.id = applications.client_id
    WHERE (?1 IS NULL OR applications.client_id = ?1)
    ORDER BY applications.created_at DESC, applications.name ASC
  `).bind(scope).all<{
    id: string;
    name: string;
    client_id: string;
    client_name: string;
    application_type: string;
    origin_url: string | null;
    status: string;
    domain_count: number;
  }>();
  return result.results.map((row) => ({
    id: row.id,
    name: row.name,
    clientId: row.client_id,
    clientName: row.client_name,
    applicationType: row.application_type,
    originUrl: row.origin_url,
    status: row.status,
    domainCount: row.domain_count,
  }));
}

type RawActivity = {
  id: string;
  action: string;
  resource_type: string;
  resource_id: string;
  actor_name: string;
  outcome: string;
  created_at: string;
  resource_name?: string | null;
  recorded_hostname?: string | null;
};

function mapActivity(row: RawActivity, resourceName: string): ActivityRecord {
  return {
    id: row.id,
    action: row.action,
    resourceType: row.resource_type,
    resourceName,
    actorName: row.actor_name,
    outcome: row.outcome,
    createdAt: row.created_at,
  };
}

export async function getActivity(limit: number): Promise<ActivityRecord[]> {
  const result = await getAppEdgeDatabase().prepare(`
    SELECT
      audit_events.id,
      audit_events.action,
      audit_events.resource_type,
      audit_events.resource_id,
      audit_events.actor_name,
      audit_events.outcome,
      audit_events.created_at,
      CASE audit_events.resource_type
        WHEN 'client' THEN (SELECT name FROM clients WHERE clients.id = audit_events.resource_id)
        WHEN 'application' THEN (SELECT name FROM applications WHERE applications.id = audit_events.resource_id)
        WHEN 'domain' THEN (SELECT hostname FROM domains WHERE domains.id = audit_events.resource_id)
        WHEN 'route' THEN (
          SELECT domains.hostname FROM routes
          INNER JOIN domains ON domains.id = routes.domain_id
          WHERE routes.id = audit_events.resource_id
        )
      END AS resource_name,
      json_extract(audit_events.metadata, '$.hostname') AS recorded_hostname
    FROM audit_events
    ORDER BY audit_events.created_at DESC
    LIMIT ?1
  `).bind(limit).all<RawActivity>();
  return result.results.map((row) => mapActivity(row, row.resource_name ?? row.recorded_hostname ?? row.resource_id));
}

export async function getCreateRecordOptions(): Promise<CreateRecordOptions> {
  const database = getAppEdgeDatabase();
  const [clients, applications, domains] = await Promise.all([
    database.prepare("SELECT id, name FROM clients WHERE status = 'active' ORDER BY name").all<{ id: string; name: string }>(),
    database.prepare(`
      SELECT applications.id, applications.name, clients.name AS client_name
      FROM applications
      INNER JOIN clients ON clients.id = applications.client_id
      WHERE clients.status = 'active' AND applications.status != 'disabled'
      ORDER BY clients.name, applications.name
    `).all<{ id: string; name: string; client_name: string }>(),
    database.prepare(`
      SELECT domains.id, domains.hostname, applications.name AS application_name
      FROM domains
      INNER JOIN applications ON applications.id = domains.application_id
      WHERE applications.status != 'disabled'
      ORDER BY domains.hostname
    `).all<{ id: string; hostname: string; application_name: string }>(),
  ]);

  return {
    clients: clients.results,
    applications: applications.results.map(({ id, name, client_name }) => ({ id, name, clientName: client_name })),
    domains: domains.results.map(({ id, hostname, application_name }) => ({ id, hostname, applicationName: application_name })),
  };
}

export type ShellApplication = {
  id: string;
  name: string;
  clientId: string;
  clientName: string;
  applicationType: string;
  originUrl: string | null;
};

export async function getShellApplications(): Promise<ShellApplication[]> {
  const result = await getAppEdgeDatabase().prepare(`
    SELECT applications.id, applications.name, applications.client_id, clients.name AS client_name, applications.application_type, applications.origin_url
    FROM applications
    INNER JOIN clients ON clients.id = applications.client_id
    ORDER BY applications.name ASC
  `).all<{ id: string; name: string; client_id: string; client_name: string; application_type: string; origin_url: string | null }>();
  return result.results.map((row) => ({
    id: row.id,
    name: row.name,
    clientId: row.client_id,
    clientName: row.client_name,
    applicationType: row.application_type,
    originUrl: row.origin_url,
  }));
}

export type ShellReadyDomain = { id: string; hostname: string; applicationId: string };
