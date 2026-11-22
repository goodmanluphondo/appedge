import "server-only";
import { getCloudflareContext } from "@opennextjs/cloudflare";

export interface AppEdgeGatewayBinding {
  fetch(url: string, init?: RequestInit): Promise<Response>;
}

export function getAppEdgeGatewayBinding(): AppEdgeGatewayBinding {
  const { env } = getCloudflareContext();
  const gateway = (env as unknown as { APPEDGE_GATEWAY?: AppEdgeGatewayBinding }).APPEDGE_GATEWAY;

  if (!gateway) {
    throw new Error("The Cloudflare service binding APPEDGE_GATEWAY to the gateway Worker is unavailable.");
  }

  return gateway;
}
