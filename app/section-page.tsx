import Link from "next/link";
import styles from "./settings.module.css";
import type { ManagementData, ManagementSection } from "./lib/data";
import { settingOptions } from "./lib/settings";
import { Icon } from "./icons";

const descriptions: Record<ManagementSection, string> = {
  Clients: "Manage the organisations whose applications run through AppEdge.",
  Applications: "Manage service origins, environments and application health.",
  Domains: "Manage custom hostnames, DNS validation and certificates.",
  Routes: "Control how incoming hostnames reach application origins.",
  Activity: "Review configuration changes and infrastructure events.",
  Settings: "Manage integrations, authentication and platform access.",
};

const columns: Partial<Record<ManagementSection, string[]>> = {
  Clients: ["CLIENT", "APPLICATIONS", "DOMAINS", "STATUS", "DATE CREATED"],
  Applications: ["APPLICATION", "CLIENT", "TYPE", "ENVIRONMENT", "ORIGIN", "HOSTNAME", "STATUS"],
  Domains: ["HOSTNAME", "CLIENT", "APPLICATION", "OWNERSHIP", "DNS", "SSL", "ROUTE"],
  Routes: ["PUBLIC HOSTNAME", "APPLICATION", "ORIGIN", "ENVIRONMENT", "STATUS", "LAST UPDATED"],
  Activity: ["ACTION", "RESOURCE", "ACTOR", "OUTCOME", "TIME"],
};

const sectionsBySlug = {
  clients: "Clients",
  applications: "Applications",
  domains: "Domains",
  routes: "Routes",
  activity: "Activity",
  settings: "Settings",
} as const satisfies Record<string, ManagementSection>;

export function SectionPage({ section, query, created = false, data }: { section: ManagementSection; query: string; created?: boolean; data: ManagementData }) {
  const tableRows = data.rows.filter((row) => row.cells.join(" ").toLowerCase().includes(query.toLowerCase()));
  const action = section === "Clients" ? "Add a client" : section === "Applications" ? "Add an application" : section === "Domains" ? "Add a domain" : `New ${section.toLowerCase().replace(/s$/, "")}`;

  return <>
    <div className="page-heading">
      <div>
        <div className="eyebrow">APPEDGE WORKSPACE {data.demoRecordCount > 0 && <span className="live-pill demo"><i/> {data.demoRecordCount} DEMO RECORDS</span>}</div>
        <h1>{section}</h1>
        <p>{descriptions[section]}</p>
      </div>
      {section !== "Activity" && section !== "Settings" && <Link className="button button-primary" href={`/${section.toLowerCase()}/new`}><Icon name="plus" size={17}/>{action}</Link>}
    </div>
    {created && <p className="inline-success" role="status">{section.slice(0, -1)} created successfully.</p>}
    {section === "Settings" ? (
      <div className="settings-grid">
        {settingOptions.map((setting) => <Link className={`setting-card ${styles.settingCard}`} href={`/settings/${setting.slug}`} key={setting.slug}>
          <span className="setting-icon"><Icon name={setting.icon}/></span>
          <strong>{setting.title}</strong>
          <span>{setting.description}</span>
          <small>{setting.status}</small>
          <Icon name="chevron" size={16}/>
        </Link>)}
      </div>
    ) : (
      <div className="table-card section-table-card">
        <div className="table-toolbar">
          <div className="table-caption"><span className="table-total">{tableRows.length}</span> {section.toLowerCase()} {data.demoRecordCount > 0 && <span className="data-label">· {data.demoRecordCount} demo records</span>}</div>
          <form className="search-field" role="search">
            <Icon name="search" size={16}/>
            <input aria-label={`Search ${section}`} name="q" placeholder={`Search ${section.toLowerCase()}...`} defaultValue={query}/>
            <button className="search-submit" type="submit">Search</button>
          </form>
        </div>
        <div className="table-scroll">
          <table>
            <thead><tr>{(columns[section] ?? []).map((column) => <th key={column}>{column}</th>)}</tr></thead>
            <tbody>
              {tableRows.map((row) => <tr key={row.key}>{row.cells.map((cell, index) => <td key={`${row.key}-${index}`} className={index === 0 ? "first-cell" : ""}>{section === "Domains" && index === 0 ? <code className="hostname">{cell}</code> : cell}</td>)}</tr>)}
              {tableRows.length === 0 && <tr><td colSpan={columns[section]?.length ?? 1} className="no-results">No {section.toLowerCase()} records are available.</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="table-footer"><span>Records loaded from AppEdge D1</span><Link href="/">Back to overview <Icon name="arrow" size={14}/></Link></div>
      </div>
    )}
    <footer className="page-footer"><span>AppEdge <b>·</b> Internal infrastructure console</span><span>Data is loaded from AppEdge D1.</span></footer>
  </>;
}

export function managementSectionForSlug(value: string): ManagementSection | null {
  return Object.prototype.hasOwnProperty.call(sectionsBySlug, value)
    ? sectionsBySlug[value as keyof typeof sectionsBySlug]
    : null;
}
