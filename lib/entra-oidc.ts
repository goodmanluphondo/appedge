import { type JWTPayload, createRemoteJWKSet, jwtVerify } from "jose";
import { highestRoleFromClaims, type Role } from "../app/lib/permissions";
import type { AppEdgeAuthConfig } from "./auth-config";

const MICROSOFT_LOGIN_ORIGIN = "https://login.microsoftonline.com";
const OIDC_SCOPE = "openid profile email";
const ID_TOKEN_CLOCK_TOLERANCE_SECONDS = 60;

export type EntraIdentity = {
  tenantId: string;
  objectId: string;
  email: string | null;
  displayName: string | null;
  role: Role | null;
  isTenantMember: boolean;
  isGuest: boolean;
};

const signingKeysByTenant = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function tenantIssuer(tenantId: string): string {
  return `${MICROSOFT_LOGIN_ORIGIN}/${tenantId}/v2.0`;
}

function signingKeysFor(tenantId: string) {
  const existing = signingKeysByTenant.get(tenantId);
  if (existing) {
    return existing;
  }

  const keys = createRemoteJWKSet(
    new URL(`${MICROSOFT_LOGIN_ORIGIN}/${encodeURIComponent(tenantId)}/discovery/v2.0/keys`),
  );
  signingKeysByTenant.set(tenantId, keys);
  return keys;
}

function readStringClaim(source: unknown, claim: string): string | null {
  if (typeof source !== "object" || source === null || !(claim in source)) {
    return null;
  }

  const value: unknown = Reflect.get(source, claim);
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

function isGuestAccount(payload: JWTPayload, tenantId: string): boolean {
  const homeIdentityProvider = readStringClaim(payload, "idp");
  const isFromAnotherIssuer =
    homeIdentityProvider !== null &&
    homeIdentityProvider !== tenantIssuer(tenantId) &&
    homeIdentityProvider !== `https://sts.windows.net/${tenantId}/`;

  return isFromAnotherIssuer || payload.acct === 1 || payload.acct === "1";
}

export function buildAuthorizeUrl(
  config: AppEdgeAuthConfig,
  request: {
    state: string;
    nonce: string;
    codeChallenge: string;
  },
): string {
  const url = new URL(
    `${MICROSOFT_LOGIN_ORIGIN}/${encodeURIComponent(config.tenantId)}/oauth2/v2.0/authorize`,
  );
  url.search = new URLSearchParams({
    client_id: config.clientId,
    response_type: "code",
    response_mode: "query",
    redirect_uri: config.redirectUri,
    scope: OIDC_SCOPE,
    state: request.state,
    nonce: request.nonce,
    code_challenge: request.codeChallenge,
    code_challenge_method: "S256",
  }).toString();

  return url.toString();
}

export async function redeemAuthorisationCode(
  config: AppEdgeAuthConfig,
  code: string,
  codeVerifier: string,
): Promise<string> {
  const response = await fetch(
    `${MICROSOFT_LOGIN_ORIGIN}/${encodeURIComponent(config.tenantId)}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        grant_type: "authorization_code",
        code,
        redirect_uri: config.redirectUri,
        code_verifier: codeVerifier,
        scope: OIDC_SCOPE,
      }),
      cache: "no-store",
    },
  );
  const responseBody: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(`Microsoft token endpoint answered ${response.status}.`);
  }

  const idToken = readStringClaim(responseBody, "id_token");
  if (!idToken) {
    throw new Error("Microsoft token endpoint returned no ID token.");
  }

  return idToken;
}

export async function verifyIdToken(
  config: AppEdgeAuthConfig,
  idToken: string,
  expectedNonce: string,
): Promise<EntraIdentity> {
  const { payload } = await jwtVerify(idToken, signingKeysFor(config.tenantId), {
    issuer: tenantIssuer(config.tenantId),
    audience: config.clientId,
    algorithms: ["RS256"],
    clockTolerance: ID_TOKEN_CLOCK_TOLERANCE_SECONDS,
    requiredClaims: ["nonce", "oid", "tid"],
  });

  if (payload.nonce !== expectedNonce) {
    throw new Error("ID token nonce does not match the sign-in attempt.");
  }

  const tenantId = readStringClaim(payload, "tid");
  const objectId = readStringClaim(payload, "oid");
  if (!tenantId || !objectId) {
    throw new Error("ID token is missing its object or tenant ID.");
  }

  const email = (
    readStringClaim(payload, "preferred_username") ??
    readStringClaim(payload, "email")
  )?.toLowerCase() ?? null;
  const roles = Array.isArray(payload.roles)
    ? payload.roles.filter((role): role is string => typeof role === "string")
    : [];

  return {
    tenantId,
    objectId,
    email,
    displayName: readStringClaim(payload, "name"),
    role: highestRoleFromClaims(roles),
    isTenantMember:
      tenantId === config.tenantId && payload.iss === tenantIssuer(config.tenantId),
    isGuest: isGuestAccount(payload, config.tenantId),
  };
}
