import { Suspense } from "react";
import type { ReactNode } from "react";
import { DashboardShell } from "../dashboard-shell";
import { getDomains, getShellApplications, getShellClients, type ShellReadyDomain } from "../lib/data";
import { domainState } from "../lib/domain-pipeline";
import { requireAdministrator } from "../../lib/auth";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return <Suspense fallback={null}><AuthenticatedDashboardLayout>{children}</AuthenticatedDashboardLayout></Suspense>;
}

async function AuthenticatedDashboardLayout({ children }: { children: ReactNode }) {
  const administrator = await requireAdministrator();
  const [clients, applications, domains] = await Promise.all([getShellClients(), getShellApplications(), getDomains(null)]);
  const attentionCount = domains.filter((domain) => domainState(domain) === "error").length;
  const readyDomains: ShellReadyDomain[] = domains
    .filter((domain) => domainState(domain) === "ready")
    .map((domain) => ({ id: domain.id, hostname: domain.hostname, applicationId: domain.applicationId }));

  return <DashboardShell administrator={administrator} clients={clients} applications={applications} readyDomains={readyDomains} attentionCount={attentionCount}>{children}</DashboardShell>;
}
