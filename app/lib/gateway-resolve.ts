import { isHostname, normaliseOriginUrl } from "./record-validation";

const REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;
const HOST_PORT_SUFFIX = /:\d{1,5}$/;
const MAXIMUM_RAW_HOST_LENGTH = 300;
const ACTIVE_STATUS = "active";
const VERIFIED_STATUS = "verified";

export type NotRoutableReason =
  | "ownership_pending"
  | "dns_pending"
  | "ssl_pending"
  | "route_missing"
  | "route_inactive"
  | "application_inactive"
  | "no_origin"
  | "client_archived"
  | "route_mismatch";

export type GatewayRouteRow = {
  hostname: string;
  domain_client_id: string;
  domain_application_id: string;
  ownership_status: string;
  dns_status: string;
  ssl_status: string;
  route_id: string | null;
  route_status: string | null;
  route_application_id: string | null;
  environment: string | null;
  published_version: string | null;
  application_client_id: string | null;
  application_type: string | null;
  application_status: string | null;
  origin_url: string | null;
  client_status: string | null;
};

export type GatewayRouteData = {
  hostname: string;
  client_id: string;
  application_id: string;
  application_type: string;
  environment: string;
  origin_url: string;
  route_version: string | null;
};

export type GatewayResolution =
  | { kind: "routable"; data: GatewayRouteData }
  | { kind: "not_routable"; reason: NotRoutableReason };

export function resolveRequestId(incoming: string | null, generate: () => string): string {
  return incoming !== null && REQUEST_ID_PATTERN.test(incoming) ? incoming : generate();
}

export function normaliseGatewayHost(raw: string | null): string | null {
  if (raw === null || raw.length > MAXIMUM_RAW_HOST_LENGTH) return null;
  const host = raw.trim().toLowerCase().replace(HOST_PORT_SUFFIX, "").replace(/\.$/, "");
  return isHostname(host) ? host : null;
}

function firstBlockingReason(row: GatewayRouteRow, validatedOrigin: string | null): NotRoutableReason | null {
  if (row.ownership_status !== VERIFIED_STATUS) return "ownership_pending";
  if (row.dns_status !== VERIFIED_STATUS) return "dns_pending";
  if (row.ssl_status !== ACTIVE_STATUS) return "ssl_pending";
  if (row.route_id === null) return "route_missing";
  if (row.route_status !== ACTIVE_STATUS) return "route_inactive";
  if (row.application_status !== ACTIVE_STATUS) return "application_inactive";
  if (validatedOrigin === null) return "no_origin";
  if (row.client_status !== ACTIVE_STATUS) return "client_archived";
  const routeServesOtherApplication = row.route_application_id !== row.domain_application_id;
  const applicationBelongsToOtherClient = row.application_client_id !== row.domain_client_id;
  if (routeServesOtherApplication || applicationBelongsToOtherClient) return "route_mismatch";
  return null;
}

export function evaluateGatewayRoute(row: GatewayRouteRow): GatewayResolution {
  const validatedOrigin = row.origin_url === null ? null : normaliseOriginUrl(row.origin_url);
  const reason = firstBlockingReason(row, validatedOrigin);
  if (reason !== null || validatedOrigin === null || row.application_type === null || row.environment === null) {
    return { kind: "not_routable", reason: reason ?? "no_origin" };
  }
  return {
    kind: "routable",
    data: {
      hostname: row.hostname,
      client_id: row.domain_client_id,
      application_id: row.domain_application_id,
      application_type: row.application_type,
      environment: row.environment,
      origin_url: validatedOrigin,
      route_version: row.published_version,
    },
  };
}
