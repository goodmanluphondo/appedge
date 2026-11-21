import "server-only";
import { requireEnv } from "../../lib/.env";

const CLOUDFLARE_API_ORIGIN = "https://api.cloudflare.com/client/v4";
const REQUEST_TIMEOUT_MILLISECONDS = 10_000;
const DUPLICATE_CUSTOM_HOSTNAME_ERROR_CODE = 1406;
const CERTIFICATE_VALIDATION_METHOD = "http";
const CERTIFICATE_TYPE = "dv";

export type CustomHostname = {
  id: string;
  hostname: string;
  status: string;
  sslStatus: string | null;
  verificationErrors: string[];
  certificateErrors: string[];
  ownershipRecord: { name: string; value: string } | null;
};

export class CloudflareApiError extends Error {
  constructor(message: string, readonly codes: number[], readonly httpStatus: number | null = null) {
    super(message);
  }

  get isNotFound(): boolean {
    return this.httpStatus === 404;
  }

  get isDuplicateHostname(): boolean {
    return this.codes.includes(DUPLICATE_CUSTOM_HOSTNAME_ERROR_CODE);
  }
}

function readText(source: unknown, key: string): string | null {
  if (typeof source !== "object" || source === null) return null;
  const value: unknown = Reflect.get(source, key);
  return typeof value === "string" && value !== "" ? value : null;
}

function readObject(source: unknown, key: string): object | null {
  if (typeof source !== "object" || source === null) return null;
  const value: unknown = Reflect.get(source, key);
  return typeof value === "object" && value !== null ? value : null;
}

function readMessages(source: unknown, key: string): string[] {
  if (typeof source !== "object" || source === null) return [];
  const value: unknown = Reflect.get(source, key);
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry): string[] => {
    if (typeof entry === "string") return [entry];
    const message = readText(entry, "message");
    return message ? [message] : [];
  });
}

export function parseCustomHostname(result: unknown): CustomHostname {
  const id = readText(result, "id");
  const hostname = readText(result, "hostname");
  const status = readText(result, "status");
  if (!id || !hostname || !status) {
    throw new CloudflareApiError("Cloudflare returned a custom hostname without an id, hostname or status.", []);
  }
  const ssl = readObject(result, "ssl");
  const ownership = readObject(result, "ownership_verification");
  const ownershipName = readText(ownership, "name");
  const ownershipValue = readText(ownership, "value");
  return {
    id,
    hostname,
    status,
    sslStatus: readText(ssl, "status"),
    verificationErrors: readMessages(result, "verification_errors"),
    certificateErrors: readMessages(ssl, "validation_errors"),
    ownershipRecord: ownershipName && ownershipValue ? { name: ownershipName, value: ownershipValue } : null,
  };
}

function collectionUrl(): string {
  return `${CLOUDFLARE_API_ORIGIN}/zones/${encodeURIComponent(requireEnv("CLOUDFLARE_ZONE_ID", process.env.CLOUDFLARE_ZONE_ID))}/custom_hostnames`;
}

async function callCloudflare(url: string, init: { method: string; body?: unknown }): Promise<unknown> {
  const token = requireEnv("CLOUDFLARE_API_TOKEN", process.env.CLOUDFLARE_API_TOKEN);
  let response: Response;
  try {
    response = await fetch(url, {
      method: init.method,
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MILLISECONDS),
      cache: "no-store",
    });
  } catch {
    throw new CloudflareApiError("Cloudflare could not be reached.", []);
  }
  const body: unknown = await response.json().catch(() => null);
  const success = typeof body === "object" && body !== null && Reflect.get(body, "success") === true;
  if (!response.ok || !success) {
    const errors = typeof body === "object" && body !== null ? Reflect.get(body, "errors") : null;
    const entries: unknown[] = Array.isArray(errors) ? errors : [];
    const messages = entries.flatMap((entry) => readText(entry, "message") ?? []);
    const codes = entries.flatMap((entry) => {
      const code = typeof entry === "object" && entry !== null ? Reflect.get(entry, "code") : null;
      return typeof code === "number" ? [code] : [];
    });
    throw new CloudflareApiError(messages.join(" ") || `Cloudflare answered ${response.status}.`, codes, response.status);
  }
  return typeof body === "object" && body !== null ? Reflect.get(body, "result") : null;
}

export async function createCustomHostname(hostname: string): Promise<CustomHostname> {
  const result = await callCloudflare(collectionUrl(), {
    method: "POST",
    body: { hostname, ssl: { method: CERTIFICATE_VALIDATION_METHOD, type: CERTIFICATE_TYPE } },
  });
  return parseCustomHostname(result);
}

export async function getCustomHostname(customHostnameId: string): Promise<CustomHostname> {
  return parseCustomHostname(await callCloudflare(`${collectionUrl()}/${encodeURIComponent(customHostnameId)}`, { method: "GET" }));
}

export async function findCustomHostname(hostname: string): Promise<CustomHostname | null> {
  const result = await callCloudflare(`${collectionUrl()}?hostname=${encodeURIComponent(hostname)}`, { method: "GET" });
  const match = Array.isArray(result) ? result.find((entry) => readText(entry, "hostname") === hostname) : null;
  return match ? parseCustomHostname(match) : null;
}

export async function requestRevalidation(customHostnameId: string): Promise<CustomHostname> {
  const result = await callCloudflare(`${collectionUrl()}/${encodeURIComponent(customHostnameId)}`, {
    method: "PATCH",
    body: { ssl: { method: CERTIFICATE_VALIDATION_METHOD, type: CERTIFICATE_TYPE } },
  });
  return parseCustomHostname(result);
}

export async function deleteCustomHostname(customHostnameId: string): Promise<void> {
  await callCloudflare(`${collectionUrl()}/${encodeURIComponent(customHostnameId)}`, { method: "DELETE" });
}
