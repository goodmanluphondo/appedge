import { getAppEdgeDatabase } from "./d1";

export type ApplicationRow = {
  id: string;
  name: string;
  client: string;
  host: string;
  type: string;
  status: string;
  initials: string;
  colour: string;
};

export type DashboardAttention = {
  kind: "application" | "domain";
  title: string;
  detail: string;
  meta: string;
};

export type DashboardActivity = {
  id: string;
  title: string;
  resource: string;
  actor: string;
  time: string;
  outcome: string;
};

export type DashboardData = {
  clientCount: number;
  applicationCount: number;
  domainCount: number;
  activeRouteCount: number;
  missingOriginCount: number;
  pendingDomainCount: number;
  demoRecordCount: number;
  applications: ApplicationRow[];
  attention: DashboardAttention[];
  activity: DashboardActivity[];
};

export type ManagementSection = "Clients" | "Applications" | "Domains" | "Routes" | "Activity" | "Settings";

export type ManagementRow = {
  key: string;
  cells: string[];
};

export type ManagementData = {
  rows: ManagementRow[];
  demoRecordCount: number;
};

type DashboardCounts = {
  client_count: number;
  application_count: number;
  domain_count: number;
  active_route_count: number;
  missing_origin_count: number;
  pending_domain_count: number;
  demo_record_count: number;
};

type RawApplication = {
  id: string;
  name: string;
  identifier: string;
  client_name: string;
  application_type: string;
  hostname: string | null;
  origin_url: string | null;
  status: string;
};

type RawAttention = {
  kind: "application" | "domain";
  title: string;
  detail: string;
  meta: string;
};

type RawActivity = {
  id: string;
  action: string;
  resource_id: string;
  actor_name: string;
  outcome: string;
  created_at: string;
};

export async function getDashboardData(): Promise<DashboardData> {
  const database = getAppEdgeDatabase();
  const [countResult, applicationResult, attentionResult, activityResult] = await Promise.all([
    database.prepare(`
      SELECT
        (SELECT COUNT(*) FROM clients) AS client_count,
        (SELECT COUNT(*) FROM applications) AS application_count,
        (SELECT COUNT(*) FROM domains) AS domain_count,
        (SELECT COUNT(*) FROM routes WHERE status = 'active') AS active_route_count,
        (SELECT COUNT(*) FROM applications WHERE origin_url IS NULL AND status != 'disabled') AS missing_origin_count,
        (SELECT COUNT(*) FROM domains WHERE ownership_status != 'verified' OR dns_status != 'verified' OR ssl_status != 'active') AS pending_domain_count,
        (SELECT COUNT(*) FROM clients WHERE is_demo = 1) +
        (SELECT COUNT(*) FROM applications WHERE is_demo = 1) +
        (SELECT COUNT(*) FROM domains WHERE is_demo = 1) +
        (SELECT COUNT(*) FROM routes WHERE is_demo = 1) AS demo_record_count
    `).all<DashboardCounts>(),
    database.prepare(`
      SELECT
        applications.id,
        applications.name,
        applications.identifier,
        clients.name AS client_name,
        applications.application_type,
        (
          SELECT domains.hostname
          FROM domains
          WHERE domains.application_id = applications.id
          ORDER BY domains.created_at ASC
          LIMIT 1
        ) AS hostname,
        applications.origin_url,
        applications.status
      FROM applications
      INNER JOIN clients ON clients.id = applications.client_id
      ORDER BY applications.created_at DESC, applications.name ASC
      LIMIT 10
    `).all<RawApplication>(),
    database.prepare(`
      SELECT
        'application' AS kind,
        'Origin configuration needed' AS title,
        applications.identifier AS detail,
        'No origin URL has been configured' AS meta
      FROM applications
      WHERE applications.origin_url IS NULL AND applications.status != 'disabled'
      UNION ALL
      SELECT
        'domain' AS kind,
        CASE
          WHEN domains.ownership_status != 'verified' THEN 'Hostname ownership pending'
          WHEN domains.dns_status != 'verified' THEN 'DNS validation pending'
          ELSE 'SSL certificate pending'
        END AS title,
        domains.hostname AS detail,
        'Ownership: ' || domains.ownership_status || ', DNS: ' || domains.dns_status || ', SSL: ' || domains.ssl_status AS meta
      FROM domains
      WHERE domains.ownership_status != 'verified' OR domains.dns_status != 'verified' OR domains.ssl_status != 'active'
      LIMIT 6
    `).all<RawAttention>(),
    database.prepare(`
      SELECT
        id,
        action,
        resource_id,
        actor_name,
        outcome,
        created_at
      FROM audit_events
      ORDER BY created_at DESC
      LIMIT 5
    `).all<RawActivity>(),
  ]);

  const counts = countResult.results[0];

  if (!counts) {
    throw new Error("The AppEdge D1 summary query returned no result.");
  }

  return {
    clientCount: counts.client_count,
    applicationCount: counts.application_count,
    domainCount: counts.domain_count,
    activeRouteCount: counts.active_route_count,
    missingOriginCount: counts.missing_origin_count,
    pendingDomainCount: counts.pending_domain_count,
    demoRecordCount: counts.demo_record_count,
    applications: applicationResult.results.map((application) => ({
      id: application.identifier,
      name: application.name,
      client: application.client_name,
      host: application.hostname ?? "Not assigned",
      type: application.application_type === "cloudflare_worker" ? "Cloudflare Worker" : "External HTTPS",
      status: application.origin_url ? application.status : "Origin not set",
      initials: application.client_name.split(/\s+/).map((word) => word[0]).join("").slice(0, 2).toUpperCase(),
      colour: application.client_name.toLowerCase().includes("motors") ? "violet" : "blue",
    })),
    attention: attentionResult.results,
    activity: activityResult.results.map((event) => ({
      id: event.id,
      title: event.action,
      resource: event.resource_id,
      actor: event.actor_name,
      time: event.created_at,
      outcome: event.outcome,
    })),
  };
}

export async function getManagementData(section: ManagementSection): Promise<ManagementData> {
  const database = getAppEdgeDatabase();

  if (section === "Settings") {
    const demoResult = await database.prepare(`
      SELECT
        (SELECT COUNT(*) FROM clients WHERE is_demo = 1) +
        (SELECT COUNT(*) FROM applications WHERE is_demo = 1) +
        (SELECT COUNT(*) FROM domains WHERE is_demo = 1) +
        (SELECT COUNT(*) FROM routes WHERE is_demo = 1) AS count
    `).all<{ count: number }>();
    return { rows: [], demoRecordCount: demoResult.results[0]?.count ?? 0 };
  }

  const statements: Record<Exclude<ManagementSection, "Settings">, { query: string; demoQuery: string }> = {
    Clients: {
      query: `
        SELECT
          clients.id,
          clients.name,
          clients.status,
          clients.created_at,
          (SELECT COUNT(*) FROM applications WHERE applications.client_id = clients.id) AS application_count,
          (SELECT COUNT(*) FROM domains WHERE domains.client_id = clients.id) AS domain_count
        FROM clients
        ORDER BY clients.created_at DESC, clients.name ASC
      `,
      demoQuery: "SELECT COUNT(*) AS count FROM clients WHERE is_demo = 1",
    },
    Applications: {
      query: `
        SELECT
          applications.id,
          applications.name,
          applications.identifier,
          applications.application_type,
          applications.environment,
          applications.origin_url,
          applications.status,
          clients.name AS client_name,
          COALESCE((SELECT hostname FROM domains WHERE domains.application_id = applications.id LIMIT 1), 'Not assigned') AS hostname
        FROM applications
        INNER JOIN clients ON clients.id = applications.client_id
        ORDER BY applications.created_at DESC, applications.name ASC
      `,
      demoQuery: "SELECT COUNT(*) AS count FROM applications WHERE is_demo = 1",
    },
    Domains: {
      query: `
        SELECT
          domains.id,
          domains.hostname,
          domains.ownership_status,
          domains.dns_status,
          domains.ssl_status,
          clients.name AS client_name,
          applications.name AS application_name,
          COALESCE(routes.status, 'Not activated') AS route_status
        FROM domains
        INNER JOIN clients ON clients.id = domains.client_id
        INNER JOIN applications ON applications.id = domains.application_id
        LEFT JOIN routes ON routes.domain_id = domains.id
        ORDER BY domains.created_at DESC, domains.hostname ASC
      `,
      demoQuery: "SELECT COUNT(*) AS count FROM domains WHERE is_demo = 1",
    },
    Routes: {
      query: `
        SELECT
          routes.id,
          domains.hostname,
          applications.name AS application_name,
          applications.origin_url,
          routes.environment,
          routes.status,
          routes.updated_at
        FROM routes
        INNER JOIN domains ON domains.id = routes.domain_id
        INNER JOIN applications ON applications.id = routes.application_id
        ORDER BY routes.updated_at DESC
      `,
      demoQuery: "SELECT COUNT(*) AS count FROM routes WHERE is_demo = 1",
    },
    Activity: {
      query: `
        SELECT
          audit_events.id,
          audit_events.action,
          audit_events.resource_type,
          audit_events.resource_id,
          audit_events.actor_name,
          audit_events.outcome,
          audit_events.created_at
        FROM audit_events
        ORDER BY audit_events.created_at DESC
        LIMIT 100
      `,
      demoQuery: "SELECT 0 AS count",
    },
  };
  const selected = statements[section];
  const [rowResult, demoResult] = await Promise.all([
    database.prepare(selected.query).all<Record<string, unknown>>(),
    database.prepare(selected.demoQuery).all<{ count: number }>(),
  ]);

  return {
    rows: rowResult.results.map((row) => mapManagementRow(section, row)),
    demoRecordCount: demoResult.results[0]?.count ?? 0,
  };
}

function mapManagementRow(section: Exclude<ManagementSection, "Settings">, row: Record<string, unknown>): ManagementRow {
  switch (section) {
    case "Clients":
      return {
        key: readString(row, "id"),
        cells: [
          readString(row, "name"),
          `${readString(row, "application_count", "0")} applications`,
          `${readString(row, "domain_count", "0")} domains`,
          readString(row, "status"),
          readString(row, "created_at"),
        ],
      };
    case "Applications":
      return {
        key: readString(row, "id"),
        cells: [
          readString(row, "name"),
          readString(row, "client_name"),
          readString(row, "application_type") === "cloudflare_worker" ? "Cloudflare Worker" : "External HTTPS",
          readString(row, "environment"),
          readString(row, "origin_url"),
          readString(row, "hostname", "Not assigned"),
          row.origin_url ? readString(row, "status") : "Origin not set",
        ],
      };
    case "Domains":
      return {
        key: readString(row, "id"),
        cells: [
          readString(row, "hostname"),
          readString(row, "client_name"),
          readString(row, "application_name"),
          readString(row, "ownership_status"),
          readString(row, "dns_status"),
          readString(row, "ssl_status"),
          readString(row, "route_status"),
        ],
      };
    case "Routes":
      return {
        key: readString(row, "id"),
        cells: [
          readString(row, "hostname"),
          readString(row, "application_name"),
          readString(row, "origin_url"),
          readString(row, "environment"),
          readString(row, "status"),
          readString(row, "updated_at"),
        ],
      };
    case "Activity":
      return {
        key: readString(row, "id"),
        cells: [
          readString(row, "action"),
          `${readString(row, "resource_type")}: ${readString(row, "resource_id")}`,
          readString(row, "actor_name"),
          readString(row, "outcome"),
          readString(row, "created_at"),
        ],
      };
  }
}

function readString(row: Record<string, unknown>, key: string, emptyValue = "Not provided"): string {
  const value = row[key];
  return value === null || value === undefined || value === "" ? emptyValue : String(value);
}
