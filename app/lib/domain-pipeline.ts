export type PipelineStage = 0 | 1 | 2 | 3;
export type DomainState = "live" | "error" | "ready" | "pending";
export type Tone = "green" | "amber" | "red" | "blue" | "gray";

export const PIPELINE_STAGES = [
  { name: "Ownership", hint: "TXT record verified", tone: "amber" },
  { name: "DNS", hint: "CNAME record verified", tone: "amber" },
  { name: "SSL", hint: "Certificate issued", tone: "blue" },
  { name: "Route", hint: "Published to the gateway", tone: "green" },
] as const satisfies readonly { name: string; hint: string; tone: Tone }[];

export type DomainStatuses = {
  ownershipStatus: string;
  dnsStatus: string;
  sslStatus: string;
  routeStatus: string | null;
  recordsIssued?: boolean;
  statusMessage?: string | null;
};

function pendingMessages(edgeHostname: string): readonly string[] {
  return [
    "Add TXT record to prove ownership",
    `Waiting for CNAME to ${edgeHostname}`,
    "Certificate issuing via Cloudflare for SaaS",
  ];
}

const FAILURE_MESSAGES = [
  "Ownership verification failed",
  "DNS validation failed",
  "SSL certificate issuance failed",
] as const;

const FAILURE_GUIDANCE = [
  "Confirm the TXT record is published at the DNS provider exactly as shown below.",
  "Confirm the CNAME record at the DNS provider points to the AppEdge edge target shown below.",
  "Certificate issuance failed. Confirm the DNS records below are published and unchanged.",
] as const;

export function pipelineStage(statuses: DomainStatuses): PipelineStage {
  if (statuses.ownershipStatus !== "verified") return 0;
  if (statuses.dnsStatus !== "verified") return 1;
  if (statuses.sslStatus !== "active") return 2;
  return 3;
}

export function domainState(statuses: DomainStatuses): DomainState {
  const stage = pipelineStage(statuses);
  if (stage === 3) return statuses.routeStatus === "active" ? "live" : "ready";
  const currentStatus = [statuses.ownershipStatus, statuses.dnsStatus, statuses.sslStatus][stage];
  return currentStatus === "failed" ? "error" : "pending";
}

export function domainTone(state: DomainState): Tone {
  switch (state) {
    case "live": return "green";
    case "error": return "red";
    case "pending": return "amber";
    case "ready": return "blue";
  }
}

export function domainStateLabel(state: DomainState): string {
  switch (state) {
    case "live": return "Live";
    case "error": return "Error";
    case "pending": return "Pending";
    case "ready": return "Ready";
  }
}

export function domainStatusText(statuses: DomainStatuses, edgeHostname: string): string {
  const stage = pipelineStage(statuses);
  const state = domainState(statuses);
  if (state === "pending" && statuses.recordsIssued === false) return "Waiting for DNS records to be issued";
  if (state === "live") return "Live";
  if (statuses.statusMessage && (state === "error" || state === "pending")) return statuses.statusMessage;
  if (state === "ready") return "Certificate active · route not published";
  if (stage === 3) return "";
  return state === "error" ? FAILURE_MESSAGES[stage] : pendingMessages(edgeHostname)[stage];
}

export function domainFailureGuidance(statuses: DomainStatuses): string {
  const stage = pipelineStage(statuses);
  return stage === 3 ? "" : FAILURE_GUIDANCE[stage];
}

export function domainActionLabel(statuses: DomainStatuses): string | null {
  const state = domainState(statuses);
  if (state === "live") return null;
  if (state === "ready") return "Activate route";
  if (state === "error") return "Retry check";
  return ["Verify ownership", "Check DNS", "Check status"][pipelineStage(statuses)] ?? null;
}

export type DnsRecordState = "Verified" | "Failed" | "Pending";

export type DnsRecord = {
  type: string;
  name: string;
  value: string;
  state: DnsRecordState;
};

type RawRecord = Record<string, unknown>;

function readText(record: RawRecord, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value) return value;
  }
  return null;
}

function parseStoredRecords(json: string, state: DnsRecordState): DnsRecord[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const records: DnsRecord[] = [];
  for (const entry of parsed) {
    if (typeof entry !== "object" || entry === null) continue;
    const record = entry as RawRecord;
    const name = readText(record, "name", "txt_name", "cname");
    const value = readText(record, "value", "txt_value", "cname_target");
    if (!name || !value) continue;
    const explicitType = readText(record, "type");
    const inferredType = readText(record, "cname") ? "CNAME" : "TXT";
    records.push({ type: (explicitType ?? inferredType).toUpperCase(), name, value, state });
  }
  return records;
}

function recordState(status: string, verifiedValue: string): DnsRecordState {
  if (status === verifiedValue) return "Verified";
  return status === "failed" ? "Failed" : "Pending";
}

export function buildDnsRecords(domain: {
  hostname: string;
  cnameTarget: string | null;
  ownershipStatus: string;
  dnsStatus: string;
  sslStatus: string;
  ownershipRecords: string;
  certificateRecords: string;
}): DnsRecord[] {
  const records = parseStoredRecords(domain.ownershipRecords, recordState(domain.ownershipStatus, "verified"));
  if (domain.cnameTarget) {
    records.push({
      type: "CNAME",
      name: domain.hostname,
      value: domain.cnameTarget,
      state: recordState(domain.dnsStatus, "verified"),
    });
  }
  records.push(...parseStoredRecords(domain.certificateRecords, recordState(domain.sslStatus, "active")));
  return records;
}
