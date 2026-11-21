const DNS_OVER_HTTPS_ORIGIN = "https://cloudflare-dns.com/dns-query";
const LOOKUP_TIMEOUT_MILLISECONDS = 5_000;
const RECORD_TYPE_NUMBERS = { A: 1, CNAME: 5, TXT: 16, AAAA: 28 } as const;
const RESPONSE_CODE_NO_ERROR = 0;
const RESPONSE_CODE_NAME_NOT_FOUND = 3;

export type DnsObservation = {
  lookupFailed: boolean;
  txtValues: string[];
  cnameTargets: string[];
  addresses: string[];
};

type RecordName = keyof typeof RECORD_TYPE_NUMBERS;
type LookupResult = { failed: boolean; values: string[] };

function normaliseName(value: string): string {
  return value.trim().replace(/\.$/, "").toLowerCase();
}

function decodeTxtData(data: string): string {
  const quoted = [...data.matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((match) => match[1].replace(/\\(.)/g, "$1"));
  return quoted.length > 0 ? quoted.join("") : data;
}

async function lookup(name: string, type: RecordName): Promise<LookupResult> {
  try {
    const response = await fetch(`${DNS_OVER_HTTPS_ORIGIN}?name=${encodeURIComponent(name)}&type=${type}`, {
      headers: { Accept: "application/dns-json" },
      signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MILLISECONDS),
      cache: "no-store",
    });
    if (!response.ok) return { failed: true, values: [] };
    const body: unknown = await response.json();
    const status = typeof body === "object" && body !== null ? Reflect.get(body, "Status") : null;
    if (status !== RESPONSE_CODE_NO_ERROR && status !== RESPONSE_CODE_NAME_NOT_FOUND) return { failed: true, values: [] };
    const answers: unknown = typeof body === "object" && body !== null ? Reflect.get(body, "Answer") : null;
    const entries: unknown[] = Array.isArray(answers) ? answers : [];
    const values = entries.flatMap((entry) => {
      if (typeof entry !== "object" || entry === null) return [];
      const answerType: unknown = Reflect.get(entry, "type");
      const data: unknown = Reflect.get(entry, "data");
      return answerType === RECORD_TYPE_NUMBERS[type] && typeof data === "string" ? [data] : [];
    });
    return { failed: false, values };
  } catch {
    return { failed: true, values: [] };
  }
}

export async function observeDns(input: { txtName: string | null; hostname: string }): Promise<DnsObservation> {
  const [txt, cname, addressV4, addressV6] = await Promise.all([
    input.txtName ? lookup(input.txtName, "TXT") : Promise.resolve<LookupResult>({ failed: false, values: [] }),
    lookup(input.hostname, "CNAME"),
    lookup(input.hostname, "A"),
    lookup(input.hostname, "AAAA"),
  ]);
  return {
    lookupFailed: [txt, cname, addressV4, addressV6].some((result) => result.failed),
    txtValues: txt.values.map(decodeTxtData),
    cnameTargets: cname.values.map(normaliseName),
    addresses: [...addressV4.values, ...addressV6.values],
  };
}

export { normaliseName };
