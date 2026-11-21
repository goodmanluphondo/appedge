import "server-only";
import { getAppEdgeDatabase } from "./d1";
import type { GatewayRouteRow } from "./gateway-resolve";

export async function findGatewayRouteRow(hostname: string): Promise<GatewayRouteRow | null> {
  return getAppEdgeDatabase().prepare(`
    SELECT
      domains.hostname AS hostname,
      domains.client_id AS domain_client_id,
      domains.application_id AS domain_application_id,
      domains.ownership_status AS ownership_status,
      domains.dns_status AS dns_status,
      domains.ssl_status AS ssl_status,
      routes.id AS route_id,
      routes.status AS route_status,
      routes.application_id AS route_application_id,
      routes.environment AS environment,
      routes.published_version AS published_version,
      applications.client_id AS application_client_id,
      applications.application_type AS application_type,
      applications.status AS application_status,
      applications.origin_url AS origin_url,
      clients.status AS client_status
    FROM domains
    LEFT JOIN routes ON routes.domain_id = domains.id
    LEFT JOIN applications ON applications.id = routes.application_id
    LEFT JOIN clients ON clients.id = domains.client_id
    WHERE domains.hostname = ?
    LIMIT 1
  `).bind(hostname).first<GatewayRouteRow>();
}
