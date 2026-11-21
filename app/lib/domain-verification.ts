import type { CustomHostname } from "./cloudflare-custom-hostnames";
import { normaliseName, type DnsObservation } from "./dns-lookup";

const OWNERSHIP_FAILURE_STATUSES = ["blocked", "deleted", "moved"];
const CERTIFICATE_FAILURE_STATUSES = [
  "deleted",
  "expired",
  "initializing_timed_out",
  "validation_timed_out",
  "issuance_timed_out",
  "deployment_timed_out",
  "deletion_timed_out",
];

export type VerificationOutcome = {
  ownershipStatus: "pending" | "verified" | "failed";
  dnsStatus: "pending" | "verified" | "failed";
  sslStatus: "pending" | "active" | "failed";
  cloudflareStatus: string;
  message: string | null;
};

function ownershipOutcome(hostname: CustomHostname, observation: DnsObservation): { status: VerificationOutcome["ownershipStatus"]; message: string | null } {
  if (OWNERSHIP_FAILURE_STATUSES.includes(hostname.status)) {
    return { status: "failed", message: `Cloudflare reports this hostname as ${hostname.status}.` };
  }
  const expected = hostname.ownershipRecord?.value;
  const published = expected !== undefined && observation.txtValues.includes(expected);
  if (hostname.status === "active" || published) return { status: "verified", message: null };
  return { status: "pending", message: "The ownership TXT record was not found in DNS yet. DNS changes can take a few minutes." };
}

function dnsOutcome(hostname: CustomHostname, observation: DnsObservation, edgeHostname: string): { status: VerificationOutcome["dnsStatus"]; message: string | null } {
  const expected = normaliseName(edgeHostname);
  if (observation.cnameTargets.includes(expected)) return { status: "verified", message: null };
  if (hostname.status === "active") return { status: "verified", message: null };
  if (observation.lookupFailed) {
    return { status: "pending", message: "The DNS lookup did not complete. Try again shortly." };
  }
  if (observation.cnameTargets.length > 0) {
    return { status: "failed", message: `CNAME points to ${observation.cnameTargets.join(", ")}, expected ${expected}.` };
  }
  if (observation.addresses.length > 0) {
    return { status: "failed", message: `The hostname resolves to ${observation.addresses.join(", ")} instead of a CNAME to ${expected}.` };
  }
  return { status: "pending", message: `No CNAME to ${expected} was found yet. DNS changes can take a few minutes.` };
}

function certificateOutcome(hostname: CustomHostname): { status: VerificationOutcome["sslStatus"]; message: string | null } {
  if (hostname.sslStatus === "active") return { status: "active", message: null };
  if (hostname.sslStatus && CERTIFICATE_FAILURE_STATUSES.includes(hostname.sslStatus)) {
    return { status: "failed", message: hostname.certificateErrors[0] ?? `The certificate is ${hostname.sslStatus.replaceAll("_", " ")}.` };
  }
  return { status: "pending", message: hostname.certificateErrors[0] ?? null };
}

export function evaluateVerification(input: {
  hostname: CustomHostname;
  observation: DnsObservation;
  edgeHostname: string;
}): VerificationOutcome {
  const ownership = ownershipOutcome(input.hostname, input.observation);
  const dns = dnsOutcome(input.hostname, input.observation, input.edgeHostname);
  const certificate = certificateOutcome(input.hostname);
  const message = ownership.status !== "verified"
    ? ownership.message
    : dns.status !== "verified" ? dns.message : certificate.message;
  return {
    ownershipStatus: ownership.status,
    dnsStatus: dns.status,
    sslStatus: certificate.status,
    cloudflareStatus: input.hostname.status,
    message,
  };
}

export function shouldRequestRevalidation(hostname: CustomHostname, outcome: VerificationOutcome): boolean {
  return hostname.status === "pending" && outcome.ownershipStatus === "verified" && outcome.dnsStatus === "verified";
}
