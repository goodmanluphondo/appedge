"use client";

import { useMemo, useState } from "react";
import type { ApplicationRow } from "./lib/data";
import { Icon } from "./icons";

export function ApplicationTable({ applications, demoRecordCount }: { applications: ApplicationRow[]; demoRecordCount: number }) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => applications.filter((application) => `${application.name} ${application.client} ${application.host}`.toLowerCase().includes(query.toLowerCase())), [applications, query]);

  return <div className="table-card"><div className="table-toolbar"><div className="table-caption"><span className="table-total">{applications.length}</span> applications {demoRecordCount > 0 && <span className="data-label">· {demoRecordCount} demo records</span>}</div><label className="search-field"><Icon name="search" size={16}/><input aria-label="Search applications" placeholder="Search applications..." value={query} onChange={(event) => setQuery(event.target.value)}/></label></div>
    <div className="table-scroll"><table><thead><tr><th>APPLICATION</th><th>CLIENT</th><th>TYPE</th><th>ASSIGNED HOSTNAME</th><th>STATUS</th></tr></thead><tbody>{filtered.map((application) => <tr key={application.id}><td><div className="app-cell"><span className={`client-avatar ${application.colour}`}>{application.initials}</span><span><strong>{application.name}</strong><small>{application.id}</small></span></div></td><td>{application.client}</td><td><span className="type-label"><span className="type-dot"/>{application.type}</span></td><td><code className="hostname">{application.host}</code></td><td><Status label={application.status}/></td></tr>)}{filtered.length === 0 && <tr><td colSpan={5} className="no-results">No applications match this search.</td></tr>}</tbody></table></div>
    <div className="table-footer"><span>Showing {filtered.length} of {applications.length} applications</span><span>AppEdge D1</span></div>
  </div>;
}

function Status({ label }: { label: string }) {
  return <span className="status-badge neutral"><i/>{label}</span>;
}
