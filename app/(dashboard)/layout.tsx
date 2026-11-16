import { Suspense } from "react";
import type { ReactNode } from "react";
import { DashboardShell } from "../dashboard-shell";
import { requireAdministrator } from "../../lib/auth";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return <Suspense fallback={null}><AuthenticatedDashboardLayout>{children}</AuthenticatedDashboardLayout></Suspense>;
}

async function AuthenticatedDashboardLayout({ children }: { children: ReactNode }) {
  const administrator = await requireAdministrator();

  return <DashboardShell administrator={administrator}>{children}</DashboardShell>;
}
