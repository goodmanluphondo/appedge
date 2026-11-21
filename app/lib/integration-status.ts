import "server-only";
import { CloudflareApiError, confirmCustomHostnameAccess } from "./cloudflare-custom-hostnames";
import { getAppEdgeDatabase } from "./d1";
import { getEdgeHostname } from "./edge";
import { getGatewayMetrics } from "./gateway-metrics";

export type IntegrationState = "connected" | "not_connected" | "error";
export type IntegrationCheck = { state: IntegrationState; message: string };
export type IntegrationName = "Cloudflare for SaaS" | "Cloudflare D1" | "AppEdge Gateway" | "Microsoft Entra ID";

export type IntegrationSummary = {
  name: IntegrationName;
  description: string;
  check: IntegrationCheck;
};

const ENTRA_VARIABLES = [
  "AUTH_MICROSOFT_ENTRA_ID_TENANT_ID",
  "AUTH_MICROSOFT_ENTRA_ID_CLIENT_ID",
  "AUTH_MICROSOFT_ENTRA_ID_CLIENT_SECRET",
] as const;

const CLOUDFLARE_VARIABLES = ["CLOUDFLARE_API_TOKEN", "CLOUDFLARE_ZONE_ID"] as const;

function connected(message: string): IntegrationCheck {
  return { state: "connected", message };
}

function notConnected(message: string): IntegrationCheck {
  return { state: "not_connected", message };
}

function failed(message: string): IntegrationCheck {
  return { state: "error", message };
}

function firstMissing(names: readonly string[]): string | null {
  return names.find((name) => !process.env[name]?.trim()) ?? null;
}

async function checkD1(): Promise<IntegrationCheck> {
  try {
    await getAppEdgeDatabase().prepare("SELECT 1 AS ok").first();
    return connected("Cloudflare D1 responded OK.");
  } catch {
    return failed("Cloudflare D1 did not respond.");
  }
}

function checkEntra(): IntegrationCheck {
  const missing = firstMissing(ENTRA_VARIABLES);
  return missing
    ? notConnected(`${missing} is not set.`)
    : connected("Microsoft Entra ID is configured and your session is valid.");
}

async function checkCloudflareForSaas(): Promise<IntegrationCheck> {
  const missing = firstMissing(CLOUDFLARE_VARIABLES);
  if (missing) return notConnected(`${missing} is not set.`);
  try {
    await confirmCustomHostnameAccess();
    return connected("Cloudflare for SaaS responded OK and the token can read custom hostnames.");
  } catch (error) {
    if (error instanceof CloudflareApiError && (error.httpStatus === 401 || error.httpStatus === 403)) {
      return failed(`Cloudflare rejected the API token for this zone: ${error.message}`);
    }
    return failed(error instanceof CloudflareApiError ? error.message : "Cloudflare for SaaS could not be checked.");
  }
}

async function checkGateway(): Promise<IntegrationCheck> {
  const metrics = await getGatewayMetrics();
  return metrics.status === "available"
    ? connected("Gateway telemetry is readable.")
    : notConnected(metrics.reason);
}

export async function checkIntegration(name: string): Promise<IntegrationCheck> {
  switch (name) {
    case "Cloudflare D1": return checkD1();
    case "Microsoft Entra ID": return checkEntra();
    case "Cloudflare for SaaS": return checkCloudflareForSaas();
    case "AppEdge Gateway": return checkGateway();
    default: return failed(`${name} is not a known integration.`);
  }
}

export async function getIntegrationSummaries(): Promise<IntegrationSummary[]> {
  const definitions: { name: IntegrationName; description: string }[] = [
    { name: "Cloudflare for SaaS", description: "Custom hostname registration and TLS certificates" },
    { name: "Cloudflare D1", description: "Operational records and routing configuration" },
    { name: "AppEdge Gateway", description: `Cloudflare Worker at ${getEdgeHostname()}, reads routes from D1` },
    { name: "Microsoft Entra ID", description: "Sign-in and AppEdge role assignment" },
  ];
  const checks = await Promise.all(definitions.map((definition) => checkIntegration(definition.name)));
  return definitions.map((definition, index) => ({ ...definition, check: checks[index] }));
}
