import type { GatewayMetrics } from "./lib/gateway-metrics";

const DEGRADED_ERROR_RATE = 0.05;
const THOUSAND = 1000;
const SPARKLINE_HEIGHT_PIXELS = 28;
const MINIMUM_BAR_PIXELS = 2;

type StripState = "loading" | "unavailable" | "idle" | "healthy" | "degraded";

function stateOf(metrics: GatewayMetrics | null): StripState {
  if (!metrics) return "loading";
  if (metrics.status === "unavailable") return "unavailable";
  if (metrics.requestCount === 0) return "idle";
  return metrics.errorRate !== null && metrics.errorRate >= DEGRADED_ERROR_RATE ? "degraded" : "healthy";
}

const TITLES: Record<StripState, string> = {
  loading: "Gateway",
  unavailable: "Gateway metrics unavailable",
  idle: "Gateway idle",
  healthy: "Gateway healthy",
  degraded: "Gateway degraded",
};

function formatRequests(value: number): string {
  return value >= THOUSAND ? `${(value / THOUSAND).toFixed(1)}k` : value.toFixed(value < 10 && value % 1 !== 0 ? 1 : 0);
}

function formatPercent(rate: number | null): string {
  return rate === null ? "No data" : `${(rate * 100).toFixed(1)}%`;
}

export function GatewayMetricsStrip({ metrics, edgeHostname }: { metrics: GatewayMetrics | null; edgeHostname: string }) {
  const state = stateOf(metrics);
  const available = metrics?.status === "available" ? metrics : null;
  const peak = Math.max(1, ...(available?.requestsPerMinuteSeries ?? []));
  const detail = metrics?.status === "unavailable"
    ? metrics.reason
    : state === "idle"
      ? `No requests in the last ${available?.windowMinutes ?? 0} minutes`
      : `${edgeHostname} reads routes from D1 on each request`;

  return <section className={`gateway-strip${state === "loading" ? " is-loading" : ""}`} aria-label="Gateway metrics" aria-busy={state === "loading"}>
    <div className="gateway-status">
      <span className={`gateway-dot is-${state}`}/>
      <div><strong>{TITLES[state]}</strong><span>{detail}</span></div>
    </div>
    {available && <>
      <div className="gateway-stat"><span>Requests / min</span><strong>{formatRequests(available.requestsPerMinute)}</strong></div>
      <div className="gateway-stat"><span>{available.latency?.label ?? "Latency"}</span><strong>{available.latency ? `${Math.round(available.latency.milliseconds)} ms` : "No data"}</strong></div>
      <div className="gateway-stat"><span>Errors</span><strong>{formatPercent(available.errorRate)}</strong></div>
      {available.requestsPerMinuteSeries.some((count) => count > 0) && <div className="gateway-spark" aria-hidden="true">
        {available.requestsPerMinuteSeries.map((count, index) => <span key={index} style={{ height: Math.max(MINIMUM_BAR_PIXELS, Math.round((count / peak) * SPARKLINE_HEIGHT_PIXELS)) }}/>)}
      </div>}
    </>}
  </section>;
}
