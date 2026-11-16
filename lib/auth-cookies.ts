import type { NextResponse } from "next/server";

export const ADMIN_SESSION_COOKIE = "__Host-appedge_admin_session";
export const SIGN_IN_STATE_COOKIE = "__Host-appedge_sign_in";
export const SIGN_IN_STATE_MAX_AGE_SECONDS = 10 * 60;
export const ADMIN_SESSION_MAX_AGE_SECONDS = 8 * 60 * 60;

const baseCookieOptions = {
  httpOnly: true,
  secure: true,
  sameSite: "lax",
  path: "/",
} as const;

export function setAdminSessionCookie(response: NextResponse, token: string): void {
  response.cookies.set(ADMIN_SESSION_COOKIE, token, {
    ...baseCookieOptions,
    maxAge: ADMIN_SESSION_MAX_AGE_SECONDS,
  });
}

export function setSignInStateCookie(response: NextResponse, state: string): void {
  response.cookies.set(SIGN_IN_STATE_COOKIE, state, {
    ...baseCookieOptions,
    maxAge: SIGN_IN_STATE_MAX_AGE_SECONDS,
  });
}

export function clearAuthCookie(response: NextResponse, name: string): void {
  response.cookies.set(name, "", { ...baseCookieOptions, maxAge: 0 });
}
