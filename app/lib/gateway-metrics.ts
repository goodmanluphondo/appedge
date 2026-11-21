import "server-only";
import { requireEnv } from "../../lib/.env";

const GRAPHQL_ENDPOINT = "https://api.cloudflare.com/client/v4/graphql";
const REQUEST_TIMEOUT_MILLISECONDS = 6_000;
const MILLISECONDS_PER_MINUTE = 60_000;
const MICROSECONDS_PER_MILLISECOND = 1_000;
const SUMMARY_WINDOW_MINUTES = 5;
const SERIES_WINDOW_MINUTES = 20;
const SERIES_ROW_LIMIT = 100;

export type GatewayLatency = { label: string; milliseconds: number };

export type GatewayMetrics =
  | { status: "unavailable"; reason: string }
  | {
      status: "available";
      windowMinutes: number;
      requestCount: number;
      requestsPerMinute: number;
      errorRate: number | null;
      latency: GatewayLatency | null;
      requestsPerMinuteSeries: number[];
    };

export interface GatewayMetricsSource {
  read(): Promise<GatewayMetrics>;
}

const SUMMARY_QUERY = `
  query GatewaySummary($accountTag: String!, $scriptName: String!, $since: Time!, $until: Time!) {
    viewer {
      accounts(filter: { accountTag: $accountTag }) {
        workersInvocationsAdaptive(limit: 1, filter: { scriptName: $scriptName, datetime_geq: $since, datetime_leq: $until }) {
          sum { requests errors }
          quantiles { cpuTimeP99 }
        }
      }
    }
  }
`;

const SERIES_QUERY = `
  query GatewaySeries($accountTag: String!, $scriptName: String!, $since: Time!, $until: Time!, $limit: Int!) {
    viewer {
      accounts(filter: { accountTag: $accountTag }) {
        workersInvocationsAdaptive(limit: $limit, orderBy: [datetimeMinute_ASC], filter: { scriptName: $scriptName, datetime_geq: $since, datetime_leq: $until }) {
          dimensions { datetimeMinute }
          sum { requests }
        }
      }
    }
  }
`;

function readNumber(source: unknown, key: string): number | null {
  if (typeof source !== "object" || source === null) return null;
  const value: unknown = Reflect.get(source, key);
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readPath(source: unknown, path: string[]): unknown {
  return path.reduce<unknown>((current, key) => (typeof current === "object" && current !== null ? Reflect.get(current, key) : undefined), source);
}

async function runQuery(token: string, query: string, variables: Record<string, string | number>): Promise<unknown[]> {
  const response = await fetch(GRAPHQL_ENDPOINT, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MILLISECONDS),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Cloudflare analytics answered ${response.status}.`);
  const body: unknown = await response.json();
  const errors = readPath(body, ["errors"]);
  if (Array.isArray(errors) && errors.length > 0) {
    const message = readPath(errors[0], ["message"]);
    throw new Error(typeof message === "string" ? message : "Cloudflare analytics returned an error.");
  }
  const rows = readPath(body, ["data", "viewer", "accounts", "0", "workersInvocationsAdaptive"]);
  return Array.isArray(rows) ? rows : [];
}

function bucketByMinute(rows: unknown[], now: number): number[] {
  const buckets = new Array<number>(SERIES_WINDOW_MINUTES).fill(0);
  const windowStart = now - SERIES_WINDOW_MINUTES * MILLISECONDS_PER_MINUTE;
  for (const row of rows) {
    const minute = readPath(row, ["dimensions", "datetimeMinute"]);
    const requests = readNumber(readPath(row, ["sum"]), "requests");
    if (typeof minute !== "string" || requests === null) continue;
    const index = Math.floor((new Date(minute).getTime() - windowStart) / MILLISECONDS_PER_MINUTE);
    if (index >= 0 && index < SERIES_WINDOW_MINUTES) buckets[index] += requests;
  }
  return buckets;
}

class CloudflareWorkersAnalyticsSource implements GatewayMetricsSource {
  async read(): Promise<GatewayMetrics> {
    let configuration: { token: string; accountTag: string; scriptName: string };
    try {
      configuration = {
        token: requireEnv("CLOUDFLARE_API_TOKEN", process.env.CLOUDFLARE_API_TOKEN),
        accountTag: requireEnv("CLOUDFLARE_ACCOUNT_ID", process.env.CLOUDFLARE_ACCOUNT_ID),
        scriptName: requireEnv("APPEDGE_GATEWAY_WORKER_NAME", process.env.APPEDGE_GATEWAY_WORKER_NAME),
      };
    } catch (error) {
      return { status: "unavailable", reason: error instanceof Error ? error.message : "Gateway telemetry is not configured." };
    }

    const now = Date.now();
    const until = new Date(now).toISOString();
    const identity = { accountTag: configuration.accountTag, scriptName: configuration.scriptName, until };
    try {
      const [summaryRows, seriesRows] = await Promise.all([
        runQuery(configuration.token, SUMMARY_QUERY, { ...identity, since: new Date(now - SUMMARY_WINDOW_MINUTES * MILLISECONDS_PER_MINUTE).toISOString() }),
        runQuery(configuration.token, SERIES_QUERY, { ...identity, since: new Date(now - SERIES_WINDOW_MINUTES * MILLISECONDS_PER_MINUTE).toISOString(), limit: SERIES_ROW_LIMIT }).catch(() => []),
      ]);
      const summary = summaryRows[0];
      const requestCount = readNumber(readPath(summary, ["sum"]), "requests") ?? 0;
      const errorCount = readNumber(readPath(summary, ["sum"]), "errors") ?? 0;
      const cpuMicroseconds = readNumber(readPath(summary, ["quantiles"]), "cpuTimeP99");
      return {
        status: "available",
        windowMinutes: SUMMARY_WINDOW_MINUTES,
        requestCount,
        requestsPerMinute: requestCount / SUMMARY_WINDOW_MINUTES,
        errorRate: requestCount > 0 ? errorCount / requestCount : null,
        latency: cpuMicroseconds === null ? null : { label: "CPU p99", milliseconds: cpuMicroseconds / MICROSECONDS_PER_MILLISECOND },
        requestsPerMinuteSeries: bucketByMinute(seriesRows, now),
      };
    } catch (error) {
      return { status: "unavailable", reason: error instanceof Error ? error.message : "Gateway telemetry could not be read." };
    }
  }
}

export async function getGatewayMetrics(): Promise<GatewayMetrics> {
  return new CloudflareWorkersAnalyticsSource().read();
}
