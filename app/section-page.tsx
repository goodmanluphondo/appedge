import { AddRouteButton } from "./route-actions";
import { DataTable } from "./data-table";
import { DomainDrawer } from "./domain-drawer";
import { requirePermissionOrRedirect } from "../lib/auth";
import { getIntegrationSummaries } from "./lib/integration-status";
import { SettingsPanels } from "./settings-panels";
import type { ClientScope, ManagementSection } from "./lib/data";
import { buildHref } from "./lib/query";
import { getSectionTable } from "./lib/section-tables";

const sectionsBySlug = {
  clients: "Clients",
  applications: "Applications",
  domains: "Domains",
  routes: "Routes",
  activity: "Activity",
  settings: "Settings",
} as const satisfies Record<string, ManagementSection>;

export async function SectionPage({ section, path, scope, query, filter, domainId, now }: {
  section: ManagementSection;
  path: string;
  scope: ClientScope;
  query: string;
  filter: string;
  domainId: string | null;
  now: number;
}) {
  const parameters = { client: scope, q: query || null, filter: filter === "all" ? null : filter };

  if (section === "Settings") {
    await requirePermissionOrRedirect("settings");
    const summaries = await getIntegrationSummaries();
    return <SettingsPanels integrations={summaries.map((summary) => ({ name: summary.name, description: summary.description, state: summary.check.state }))}/>;
  }

  const table = await getSectionTable(section, scope, filter, now);
  return <>
    <DataTable table={table} path={path} query={query} parameters={parameters} actions={section === "Routes" ? <AddRouteButton/> : null}/>
    <DomainDrawer domainId={domainId} closeHref={buildHref(path, parameters)} now={now}/>
  </>;
}

export function managementSectionForSlug(value: string): ManagementSection | null {
  return Object.prototype.hasOwnProperty.call(sectionsBySlug, value)
    ? sectionsBySlug[value as keyof typeof sectionsBySlug]
    : null;
}
