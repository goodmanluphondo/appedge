export type QueryValues = Record<string, string | null | undefined>;

export function buildHref(path: string, values: QueryValues): string {
  const parameters = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value) parameters.set(key, value);
  }
  const queryString = parameters.toString();
  return queryString ? `${path}?${queryString}` : path;
}

export function firstValue(value: string | string[] | undefined): string | null {
  const single = Array.isArray(value) ? value[0] : value;
  return single ? single : null;
}
