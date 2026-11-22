export const GATEWAY_HEALTH_PATH = "/__appedge/health";
export const GATEWAY_HEALTH_TIMEOUT_MILLISECONDS = 6_000;

export type GatewayHealth =
  | { reachable: true }
  | { reachable: false; reason: string };

type HealthFetch = (url: string, init: { method: string; headers: Record<string, string>; signal: AbortSignal; cache: "no-store"; redirect: "manual" }) => Promise<Response>;

export function gatewayHealthUrl(gatewayHostname: string): string {
  return `https://${gatewayHostname}${GATEWAY_HEALTH_PATH}`;
}

async function hasHealthyBody(response: Response): Promise<boolean> {
  try {
    const body: unknown = await response.json();
    return typeof body === "object" && body !== null && Reflect.get(body, "status") === "ok";
  } catch {
    return false;
  }
}

export async function probeGatewayHealth(gatewayHostname: string, fetchHealth: HealthFetch): Promise<GatewayHealth> {
  const url = gatewayHealthUrl(gatewayHostname);
  let response: Response;
  try {
    response = await fetchHealth(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(GATEWAY_HEALTH_TIMEOUT_MILLISECONDS),
      cache: "no-store",
      redirect: "manual",
    });
  } catch {
    return { reachable: false, reason: `${url} could not be reached or did not answer in time.` };
  }
  if (response.status !== 200) {
    return { reachable: false, reason: `${url} answered ${response.status} instead of 200.` };
  }
  if (!(await hasHealthyBody(response))) {
    return { reachable: false, reason: `${url} answered 200 but not with the gateway's health response, so it is probably not served by the AppEdge Gateway.` };
  }
  return { reachable: true };
}
