import type { AppEdgeD1Database } from "../app/lib/d1";
import { isRole, type Role } from "../app/lib/permissions";
import { ADMIN_SESSION_MAX_AGE_SECONDS } from "./auth-cookies";
import { hashAuthToken, randomAuthToken } from "./auth-tokens";

export type AdministratorIdentity = {
  tenantId: string;
  objectId: string;
  email: string;
  displayName: string;
  role: Role;
};

export async function createAdminSession(
  db: AppEdgeD1Database,
  administrator: AdministratorIdentity,
  now: number,
): Promise<string> {
  const token = randomAuthToken();
  const tokenHash = await hashAuthToken(token);
  const expiresAt = now + ADMIN_SESSION_MAX_AGE_SECONDS * 1000;

  await db
    .prepare("DELETE FROM admin_sessions WHERE expires_at <= ? OR revoked_at IS NOT NULL")
    .bind(now)
    .run();
  await db
    .prepare(
      "INSERT INTO admin_sessions (token_hash, entra_tenant_id, entra_object_id, email, display_name, role, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(
      tokenHash,
      administrator.tenantId,
      administrator.objectId,
      administrator.email,
      administrator.displayName,
      administrator.role,
      now,
      expiresAt,
    )
    .run();

  return token;
}

export async function revokeAdminSession(
  db: AppEdgeD1Database,
  token: string | undefined,
  now: number,
): Promise<void> {
  if (!token) {
    return;
  }

  await db
    .prepare("UPDATE admin_sessions SET revoked_at = ? WHERE token_hash = ? AND revoked_at IS NULL")
    .bind(now, await hashAuthToken(token))
    .run();
}

export async function findActiveAdministrator(
  db: AppEdgeD1Database,
  token: string | undefined,
  now: number,
): Promise<{
  id: string;
  displayName: string;
  email: string;
  role: Role;
} | null> {
  if (!token) {
    return null;
  }

  const administrator = await db
    .prepare(`
      SELECT entra_object_id AS id, display_name AS displayName, email, role
      FROM admin_sessions
      WHERE admin_sessions.token_hash = ?
        AND admin_sessions.expires_at > ?
        AND admin_sessions.revoked_at IS NULL
      LIMIT 1
    `)
    .bind(await hashAuthToken(token), now)
    .first<{
      id: string;
      displayName: string;
      email: string;
      role: string;
    }>();

  return administrator && isRole(administrator.role) ? { ...administrator, role: administrator.role } : null;
}
