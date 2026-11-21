import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { getAppEdgeDatabase } from "../app/lib/d1";
import { roleAllows, type Permission, type Role } from "../app/lib/permissions";
import { ADMIN_SESSION_COOKIE } from "./auth-cookies";
import { findActiveAdministrator } from "./auth-sessions";

export type AuthenticatedUser = {
  id: string;
  displayName: string;
  email: string;
  role: Role;
};

const loadSignedInUser = cache(async (): Promise<AuthenticatedUser | null> => {
  await connection();
  const cookieStore = await cookies();
  return findActiveAdministrator(
    getAppEdgeDatabase(),
    cookieStore.get(ADMIN_SESSION_COOKIE)?.value,
    Date.now(),
  );
});

export async function requireUser(): Promise<AuthenticatedUser> {
  const user = await loadSignedInUser();
  if (!user) {
    redirect("/login");
  }
  return user;
}

export async function requirePermissionOrRedirect(permission: Permission): Promise<AuthenticatedUser> {
  const user = await requireUser();
  if (!roleAllows(user.role, permission)) {
    redirect("/");
  }
  return user;
}

export async function authoriseAction(permission: Permission): Promise<AuthenticatedUser | null> {
  const user = await requireUser();
  return roleAllows(user.role, permission) ? user : null;
}
