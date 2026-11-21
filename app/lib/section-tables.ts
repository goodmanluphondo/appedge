import {
  getActivity,
  getApplications,
  getClients,
  getDomains,
  type ClientScope,
  type ManagementSection,
} from "./data";
import {
  PIPELINE_STAGES,
  domainState,
  domainStateLabel,
  domainTone,
  pipelineStage,
  type Tone,
} from "./domain-pipeline";
import { formatDate, formatRelativeTime } from "./format";

export type TableCell =
  | { kind: "text"; text: string; strong?: boolean; muted?: boolean }
  | { kind: "mono"; text: string; muted?: boolean }
  | { kind: "badge"; text: string; tone: Tone }
  | { kind: "switch"; on: boolean; domainId: string; hostname: string };

export type TableRow = {
  key: string;
  domainId?: string;
  originApplicationId?: string;
  searchText: string;
  cells: TableCell[];
};

export type TableFilter = { key: string; label: string; count: number; active: boolean };

export type SectionTable = {
  columns: string[];
  rows: TableRow[];
  filters: TableFilter[];
};

export type TableTarget = Exclude<ManagementSection, "Settings">;

const ACTIVITY_LIMIT = 100;
const NEEDS_ATTENTION_FILTER = "attention";
const ALL_FILTER = "all";

function text(value: string, options: { strong?: boolean; muted?: boolean } = {}): TableCell {
  return { kind: "text", text: value, ...options };
}

function hostnameFrom(originUrl: string | null): TableCell {
  return originUrl ? { kind: "mono", text: originUrl.replace(/^https:\/\//, "") } : text("Not set", { muted: true });
}

function searchTextOf(cells: TableCell[]): string {
  return cells.map((cell) => (cell.kind === "switch" ? "" : cell.text)).join(" ").toLowerCase();
}

function row(key: string, cells: TableCell[], domainId?: string, originApplicationId?: string): TableRow {
  return { key, domainId, originApplicationId, searchText: searchTextOf(cells), cells };
}

function applicationTypeLabel(type: string): string {
  return type === "cloudflare_worker" ? "Cloudflare Worker" : "External HTTPS";
}

export async function getSectionTable(
  section: TableTarget,
  scope: ClientScope,
  filterKey: string,
  now: number,
): Promise<SectionTable> {
  switch (section) {
    case "Clients": {
      const clients = await getClients(scope);
      return {
        columns: ["Client", "Contact", "Applications", "Domains", "Created"],
        filters: [],
        rows: clients.map((client) => row(client.id, [
          text(client.name, { strong: true }),
          text(client.contactEmail ?? "No contact email", { muted: true }),
          text(String(client.applicationCount)),
          text(String(client.domainCount)),
          text(formatDate(client.createdAt), { muted: true }),
        ])),
      };
    }
    case "Applications": {
      const applications = await getApplications(scope);
      return {
        columns: ["Application", "Client", "Type", "Origin", "Domains", "Status"],
        filters: [],
        rows: applications.map((application) => row(application.id, [
          text(application.name, { strong: true }),
          text(application.clientName, { muted: true }),
          text(applicationTypeLabel(application.applicationType), { muted: true }),
          hostnameFrom(application.originUrl),
          text(String(application.domainCount)),
          application.originUrl
            ? { kind: "badge", text: "Ready", tone: "green" }
            : { kind: "badge", text: "Origin not set", tone: "amber" },
        ], undefined, application.originUrl ? undefined : application.id)),
      };
    }
    case "Domains": {
      const domains = await getDomains(scope);
      const filterDefinitions = [
        { key: ALL_FILTER, label: "All", matches: () => true },
        { key: NEEDS_ATTENTION_FILTER, label: "Needs attention", matches: (state: string) => state === "error" },
        ...PIPELINE_STAGES.map((stage, index) => ({
          key: String(index),
          label: stage.name,
          matches: (_state: string, stageIndex: number) => stageIndex === index,
        })),
      ];
      const stageOf = (domain: (typeof domains)[number]) => pipelineStage(domain);
      const filters = filterDefinitions.map((definition) => ({
        key: definition.key,
        label: definition.label,
        active: definition.key === filterKey,
        count: domains.filter((domain) => definition.matches(domainState(domain), stageOf(domain))).length,
      }));
      const activeDefinition = filterDefinitions.find((definition) => definition.key === filterKey) ?? filterDefinitions[0];
      return {
        columns: ["Hostname", "Application", "Client", "Stage", "Status"],
        filters,
        rows: domains
          .filter((domain) => activeDefinition.matches(domainState(domain), stageOf(domain)))
          .map((domain) => {
            const state = domainState(domain);
            return row(domain.id, [
              { kind: "mono", text: domain.hostname },
              text(domain.applicationName),
              text(domain.clientName, { muted: true }),
              text(PIPELINE_STAGES[stageOf(domain)].name),
              { kind: "badge", text: domainStateLabel(state), tone: domainTone(state) },
            ], domain.id);
          }),
      };
    }
    case "Routes": {
      const domains = (await getDomains(scope)).filter((domain) => pipelineStage(domain) === 3);
      return {
        columns: ["Public hostname", "Origin", "Application", "Status", "Active"],
        filters: [],
        rows: domains.map((domain) => {
          const state = domainState(domain);
          const live = state === "live";
          return row(domain.id, [
            { kind: "mono", text: domain.hostname },
            hostnameFrom(domain.originUrl),
            text(domain.applicationName),
            live ? { kind: "badge", text: "Live", tone: "green" } : { kind: "badge", text: "Inactive", tone: "gray" },
            { kind: "switch", on: live, domainId: domain.id, hostname: domain.hostname },
          ], domain.id);
        }),
      };
    }
    case "Activity": {
      const events = await getActivity(ACTIVITY_LIMIT);
      return {
        columns: ["Action", "Resource", "Actor", "Outcome", "Time"],
        filters: [],
        rows: events.map((event) => row(event.id, [
          text(event.action, { strong: true }),
          { kind: "mono", text: event.resourceName },
          text(event.actorName, { muted: true }),
          event.outcome === "success"
            ? { kind: "badge", text: "Success", tone: "green" }
            : { kind: "badge", text: "Failure", tone: "red" },
          text(formatRelativeTime(event.createdAt, now), { muted: true }),
        ])),
      };
    }
  }
}
