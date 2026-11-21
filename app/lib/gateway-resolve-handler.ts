import { isAuthorisedGatewayRequest } from "./gateway-auth";
import { evaluateGatewayRoute, normaliseGatewayHost, resolveRequestId, type GatewayRouteRow } from "./gateway-resolve";

export type GatewayResolveDependencies = {
  readExpectedToken: () => string;
  findRoute: (hostname: string) => Promise<GatewayRouteRow | null>;
  generateRequestId: () => string;
  logFailure: (requestId: string, error: unknown) => void;
};

function jsonResponse(body: unknown, status: number, requestId: string): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "X-Request-Id": requestId,
    },
  });
}

export async function handleGatewayResolve(request: Request, dependencies: GatewayResolveDependencies): Promise<Response> {
  const requestId = resolveRequestId(request.headers.get("x-request-id"), dependencies.generateRequestId);

  let expectedToken: string;
  try {
    expectedToken = dependencies.readExpectedToken();
  } catch (error) {
    dependencies.logFailure(requestId, error);
    return jsonResponse({ error: "internal_error" }, 500, requestId);
  }

  if (!(await isAuthorisedGatewayRequest(request.headers.get("authorization"), expectedToken))) {
    return jsonResponse({ error: "unauthorised" }, 401, requestId);
  }

  const hostname = normaliseGatewayHost(new URL(request.url).searchParams.get("host"));
  if (hostname === null) return jsonResponse({ error: "invalid_host" }, 400, requestId);

  let row: GatewayRouteRow | null;
  try {
    row = await dependencies.findRoute(hostname);
  } catch (error) {
    dependencies.logFailure(requestId, error);
    return jsonResponse({ error: "internal_error" }, 500, requestId);
  }
  if (row === null) return jsonResponse({ error: "unknown_host" }, 404, requestId);

  const resolution = evaluateGatewayRoute(row);
  if (resolution.kind === "routable") return jsonResponse({ data: resolution.data }, 200, requestId);
  return jsonResponse({ error: "not_routable", reason: resolution.reason }, 409, requestId);
}
