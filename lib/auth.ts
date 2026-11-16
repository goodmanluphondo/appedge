import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { getAppEdgeDatabase } from "../app/lib/d1";
import { ADMIN_SESSION_COOKIE } from "./auth-cookies";
import { findActiveAdministrator } from "./auth-sessions";

export type AuthenticatedAdministrator = {
  id: string;
  displayName: string;
  email: string;
};

export async function requireAdministrator(): Promise<AuthenticatedAdministrator> {
  await connection();
  const cookieStore = await cookies();
  const administrator = await findActiveAdministrator(
    getAppEdgeDatabase(),
    cookieStore.get(ADMIN_SESSION_COOKIE)?.value,
    Date.now(),
  );

  if (!administrator) {
    redirect("/login");
  }

  return {
    id: administrator.id,
    displayName: administrator.displayName,
    email: administrator.email,
  };
}
