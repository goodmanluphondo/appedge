import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getAuthConfig } from "../../../lib/auth-config";
import { ADMIN_SESSION_COOKIE, clearAuthCookie } from "../../../lib/auth-cookies";
import { revokeAdminSession } from "../../../lib/auth-sessions";

export async function POST(request: NextRequest) {
  const config = getAuthConfig();
  if (request.headers.get("origin") !== config.siteOrigin) {
    return new Response(null, {
      status: 403,
      headers: { "Cache-Control": "no-store" },
    });
  }

  await revokeAdminSession(
    config.db,
    request.cookies.get(ADMIN_SESSION_COOKIE)?.value,
    Date.now(),
  );

  const response = NextResponse.redirect(new URL("/login", config.siteOrigin), 303);
  response.headers.set("Cache-Control", "no-store");
  clearAuthCookie(response, ADMIN_SESSION_COOKIE);
  return response;
}
