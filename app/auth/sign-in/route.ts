import { NextResponse } from "next/server";
import { getApplicationOrigin, getAuthConfig } from "../../../lib/auth-config";
import { setSignInStateCookie } from "../../../lib/auth-cookies";
import { saveSignInAttempt } from "../../../lib/auth-sign-in-attempts";
import { allowSignInRequest } from "../../../lib/auth-rate-limit";
import { buildAuthorizeUrl } from "../../../lib/entra-oidc";
import { hashAuthToken, randomAuthToken } from "../../../lib/auth-tokens";

function loginRedirect(origin: string, error?: string) {
  const url = new URL("/login", origin);
  if (error) {
    url.searchParams.set("error", error);
  }
  const response = NextResponse.redirect(url, 303);
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export function GET() {
  return loginRedirect(getApplicationOrigin());
}

export async function POST(request: Request) {
  const config = getAuthConfig();
  if (request.headers.get("origin") !== config.siteOrigin) {
    return new Response(null, {
      status: 403,
      headers: { "Cache-Control": "no-store" },
    });
  }

  const now = Date.now();
  if (!(await allowSignInRequest(config.db, request, now))) {
    return loginRedirect(config.siteOrigin, "RateLimited");
  }

  const state = randomAuthToken();
  const nonce = randomAuthToken();
  const codeVerifier = randomAuthToken(48);

  await saveSignInAttempt(config.db, await hashAuthToken(state), {
    nonce,
    codeVerifier,
    createdAt: now,
  });

  const response = NextResponse.redirect(
    buildAuthorizeUrl(config, {
      state,
      nonce,
      codeChallenge: await hashAuthToken(codeVerifier),
    }),
    303,
  );
  response.headers.set("Cache-Control", "no-store");
  setSignInStateCookie(response, state);
  return response;
}
