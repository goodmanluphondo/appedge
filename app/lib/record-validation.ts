const HOSTNAME_MAXIMUM_LENGTH = 253;
const HOSTNAME_LABEL_MAXIMUM_LENGTH = 63;
const IDENTIFIER_SLUG_MAXIMUM_LENGTH = 60;

export function slugify(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, IDENTIFIER_SLUG_MAXIMUM_LENGTH);
}

export function normalizeHttpsUrl(value: string): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname.includes(".") ? url.toString() : null;
  } catch {
    return null;
  }
}

export function isHostname(value: string): boolean {
  return value.length <= HOSTNAME_MAXIMUM_LENGTH
    && value.includes(".")
    && value.split(".").every((label) => label.length > 0 && label.length <= HOSTNAME_LABEL_MAXIMUM_LENGTH && /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label));
}

export function isEmailAddress(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}
