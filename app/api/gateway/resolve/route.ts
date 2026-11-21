import { requireEnv } from "../../../../lib/require-env";
import { handleGatewayResolve } from "../../../lib/gateway-resolve-handler";
import { findGatewayRouteRow } from "../../../lib/gateway-route-query";

export const dynamic = "force-dynamic";

export function GET(request: Request) {
  return handleGatewayResolve(request, {
    readExpectedToken: () => requireEnv("GATEWAY_API_TOKEN", process.env.GATEWAY_API_TOKEN),
    findRoute: findGatewayRouteRow,
    generateRequestId: () => crypto.randomUUID(),
    logFailure: (requestId, error) => {
      console.error(`Gateway resolve failed (request ${requestId}):`, error instanceof Error ? error.message : "unknown error");
    },
  });
}
