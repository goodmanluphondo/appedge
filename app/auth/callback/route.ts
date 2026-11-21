import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getAuthConfig } from "../../../lib/auth-config";
import { SIGN_IN_STATE_COOKIE, clearAuthCookie, setAdminSessionCookie } from "../../../lib/auth-cookies";
import { takeSignInAttempt } from "../../../lib/auth-sign-in-attempts";
import { allowSignInRequest } from "../../../lib/auth-rate-limit";
import { createAdminSession } from "../../../lib/auth-sessions";
import { hashAuthToken } from "../../../lib/auth-tokens";
import { redeemAuthorisationCode, verifyIdToken } from "../../../lib/entra-oidc";

function loginRedirect(origin: string, error: string): NextResponse {
  const url = new URL("/login", origin);
  url.searchParams.set("error", error);
  const response = NextResponse.redirect(url, 303);
  response.headers.set("Cache-Control", "no-store");
  clearAuthCookie(response, SIGN_IN_STATE_COOKIE);
  return response;
}

export async function GET(request: NextRequest) {
  const config = getAuthConfig();
  const now = Date.now();
  if (!(await allowSignInRequest(config.db, request, now))) {
    return loginRedirect(config.siteOrigin, "RateLimited");
  }

  const parameters = request.nextUrl.searchParams;
  const state = parameters.get("state");
  const expectedState = request.cookies.get(SIGN_IN_STATE_COOKIE)?.value;
  const attempt = state && expectedState && state === expectedState
    ? await takeSignInAttempt(config.db, await hashAuthToken(state), now)
    : null;

  if (!attempt) {
    return loginRedirect(config.siteOrigin, "SignInFailed");
  }

  const code = parameters.get("code");
  if (parameters.get("error") || !code) {
    return loginRedirect(config.siteOrigin, "SignInFailed");
  }

  try {
    const idToken = await redeemAuthorisationCode(
      config,
      code,
      attempt.codeVerifier,
    );
    const identity = await verifyIdToken(config, idToken, attempt.nonce);

    if (
      !identity.isTenantMember ||
      identity.isGuest ||
      !identity.email ||
      !identity.role
    ) {
      return loginRedirect(config.siteOrigin, "AccessDenied");
    }

    const token = await createAdminSession(config.db, {
      tenantId: identity.tenantId,
      objectId: identity.objectId,
      email: identity.email,
      displayName: identity.displayName ?? identity.email,
      role: identity.role,
    }, Date.now());
    const response = NextResponse.redirect(new URL("/", config.siteOrigin), 303);
    response.headers.set("Cache-Control", "no-store");
    clearAuthCookie(response, SIGN_IN_STATE_COOKIE);
    setAdminSessionCookie(response, token);
    return response;
  } catch {
    return loginRedirect(config.siteOrigin, "SignInFailed");
  }
}
