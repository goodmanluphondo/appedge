const BEARER_PREFIX = /^Bearer (.+)$/i;
const TEXT_ENCODER = new TextEncoder();

async function digestOf(value: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", TEXT_ENCODER.encode(value)));
}

function equalInConstantTime(left: Uint8Array, right: Uint8Array): boolean {
  let difference = left.length ^ right.length;
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    difference |= (left[index] ?? 0) ^ (right[index] ?? 0);
  }
  return difference === 0;
}

export async function isAuthorisedGatewayRequest(authorisationHeader: string | null, expectedToken: string): Promise<boolean> {
  const presentedToken = authorisationHeader?.match(BEARER_PREFIX)?.[1] ?? "";
  const [presentedDigest, expectedDigest] = await Promise.all([digestOf(presentedToken), digestOf(expectedToken)]);
  const digestsMatch = equalInConstantTime(presentedDigest, expectedDigest);
  return digestsMatch && presentedToken !== "";
}
