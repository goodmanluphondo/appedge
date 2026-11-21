import "server-only";
import { requireEnv } from "../../lib/require-env";

export function getEdgeHostname(): string {
  return requireEnv("APPEDGE_EDGE_HOSTNAME", process.env.APPEDGE_EDGE_HOSTNAME);
}
