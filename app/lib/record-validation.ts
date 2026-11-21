const HOSTNAME_MAXIMUM_LENGTH = 253;
const HOSTNAME_LABEL_MAXIMUM_LENGTH = 63;
const IDENTIFIER_SLUG_MAXIMUM_LENGTH = 60;

export function slugify(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, IDENTIFIER_SLUG_MAXIMUM_LENGTH);
}

const IPV4_LITERAL_PATTERN = /^\d{1,3}(\.\d{1,3}){3}$/;
const FORBIDDEN_ORIGIN_HOSTNAMES = ["localhost"];
const FORBIDDEN_ORIGIN_SUFFIXES = [".local", ".internal"];

export function normaliseOriginUrl(value: string): string | null {
  if (!value || value.includes("?") || value.includes("#")) return null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.username || url.password) return null;
  const hostname = url.hostname.replace(/\.$/, "");
  const isIpLiteral = hostname.startsWith("[") || IPV4_LITERAL_PATTERN.test(hostname);
  const isInternalName = FORBIDDEN_ORIGIN_HOSTNAMES.includes(hostname)
    || FORBIDDEN_ORIGIN_SUFFIXES.some((suffix) => hostname.endsWith(suffix));
  if (isIpLiteral || isInternalName || !hostname.includes(".")) return null;
  return url.toString();
}

export function isHostname(value: string): boolean {
  return value.length <= HOSTNAME_MAXIMUM_LENGTH
    && value.includes(".")
    && value.split(".").every((label) => label.length > 0 && label.length <= HOSTNAME_LABEL_MAXIMUM_LENGTH && /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label));
}

export function isEmailAddress(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}
