const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MILLISECONDS_PER_MINUTE = 60_000;
const MINUTES_PER_HOUR = 60;
const HOURS_PER_DAY = 24;
const RELATIVE_DAY_LIMIT = 7;

export type ClientPaletteEntry = { background: string; foreground: string };

export const CLIENT_PALETTE: ClientPaletteEntry[] = [
  { background: "#EEF2FF", foreground: "#2748C4" },
  { background: "#F4F0FF", foreground: "#6941C6" },
  { background: "#ECFDF3", foreground: "#067647" },
  { background: "#FFFAEB", foreground: "#B54708" },
  { background: "#FDF2FA", foreground: "#C11574" },
];

function parseStoredTimestamp(value: string): Date | null {
  const parsed = new Date(`${value.replace(" ", "T")}Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function formatDate(value: string): string {
  const date = parseStoredTimestamp(value);
  if (!date) return value;
  return `${String(date.getUTCDate()).padStart(2, "0")} ${MONTH_NAMES[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

export function formatRelativeTime(value: string, now: number): string {
  const date = parseStoredTimestamp(value);
  if (!date) return value;
  const minutes = Math.floor((now - date.getTime()) / MILLISECONDS_PER_MINUTE);
  if (minutes < 1) return "Just now";
  if (minutes < MINUTES_PER_HOUR) return `${minutes} min ago`;
  const hours = Math.floor(minutes / MINUTES_PER_HOUR);
  if (hours < HOURS_PER_DAY) return `${hours} h ago`;
  const days = Math.floor(hours / HOURS_PER_DAY);
  if (days === 1) return "Yesterday";
  if (days < RELATIVE_DAY_LIMIT) return `${days} days ago`;
  return formatDate(value);
}

export function initialsOf(name: string): string {
  return name.split(/\s+/).filter(Boolean).map((word) => word[0]).join("").slice(0, 2).toUpperCase();
}

export function clientPaletteFor(clientId: string): ClientPaletteEntry {
  let hash = 0;
  for (const character of clientId) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  return CLIENT_PALETTE[hash % CLIENT_PALETTE.length];
}

export function currentTime(): number {
  return Date.now();
}
