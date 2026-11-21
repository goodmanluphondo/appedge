import "server-only";
import { getAppEdgeDatabase, type AppEdgeD1Database } from "../app/lib/d1";
import { requireEnv } from "./require-env";

export type AppEdgeAuthConfig = {
  db: AppEdgeD1Database;
  tenantId: string;
  clientId: string;
  clientSecret: string;
  siteOrigin: string;
  redirectUri: string;
};

export const SIGN_IN_CALLBACK_PATH = "/auth/callback";

export function getApplicationOrigin(): string {
  return new URL(requireEnv("NEXT_PUBLIC_APP_URL", process.env.NEXT_PUBLIC_APP_URL)).origin;
}

export function getAuthConfig(): AppEdgeAuthConfig {
  const siteOrigin = getApplicationOrigin();

  return {
    db: getAppEdgeDatabase(),
    tenantId: requireEnv("AUTH_MICROSOFT_ENTRA_ID_TENANT_ID", process.env.AUTH_MICROSOFT_ENTRA_ID_TENANT_ID),
    clientId: requireEnv("AUTH_MICROSOFT_ENTRA_ID_CLIENT_ID", process.env.AUTH_MICROSOFT_ENTRA_ID_CLIENT_ID),
    clientSecret: requireEnv("AUTH_MICROSOFT_ENTRA_ID_CLIENT_SECRET", process.env.AUTH_MICROSOFT_ENTRA_ID_CLIENT_SECRET),
    siteOrigin,
    redirectUri: new URL(SIGN_IN_CALLBACK_PATH, siteOrigin).toString(),
  };
}
