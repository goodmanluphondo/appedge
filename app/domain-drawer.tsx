import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { CopyButton } from "./copy-button";
import { Icon, type IconName } from "./icons";
import { RetryButton } from "./retry-button";
import { ActivateRouteButton, CheckDomainButton, DeactivateRouteButton, RemoveDomainButton } from "./route-actions";
import { getDomainById, getDomainHistory, type ActivityRecord, type DomainRecord } from "./lib/data";
import {
  PIPELINE_STAGES,
  buildDnsRecords,
  domainActionLabel,
  domainFailureGuidance,
  domainState,
  domainStatusText,
  domainTone,
  pipelineStage,
} from "./lib/domain-pipeline";
import { getEdgeHostname } from "./lib/edge";
import { formatRelativeTime } from "./lib/format";

const HISTORY_LIMIT = 5;

function headlineLabel(state: ReturnType<typeof domainState>, stageName: string): string {
  switch (state) {
    case "live": return "Live";
    case "error": return "Needs attention";
    case "ready": return "Ready to activate";
    case "pending": return `In progress · ${stageName}`;
  }
}

function DrawerFrame({ closeHref, children }: { closeHref: string; children: ReactNode }) {
  return <>
    <Link href={closeHref} className="drawer-scrim" aria-label="Close domain details" scroll={false}/>
    <aside role="dialog" aria-label="Domain details" className="domain-drawer">{children}</aside>
  </>;
}

function CloseLink({ closeHref, large }: { closeHref: string; large?: boolean }) {
  return <Link href={closeHref} className={`icon-action${large ? " is-large" : ""}`} aria-label="Close" scroll={false}><Icon name="close" size={18}/></Link>;
}

function DrawerSkeleton({ closeHref }: { closeHref: string }) {
  return <DrawerFrame closeHref={closeHref}>
    <div aria-busy="true" className="drawer-skeleton">
      <div className="drawer-skeleton-header">
        <div><div className="skeleton-line is-wide"/><div className="skeleton-line is-narrow"/></div>
        <CloseLink closeHref={closeHref} large/>
      </div>
      <div style={{ height: 140 }}/><div style={{ height: 90 }}/><div style={{ height: 90 }}/>
    </div>
  </DrawerFrame>;
}

function DrawerFailure({ closeHref, missing }: { closeHref: string; missing: boolean }) {
  return <DrawerFrame closeHref={closeHref}>
    <div role="alert" className="drawer-failure">
      <span className={`load-error-icon ${missing ? "tone-gray" : "tone-red"}`}><Icon name="alert" size={22}/></span>
      <h2>{missing ? "Domain not found" : "Could not load this domain"}</h2>
      <p>{missing ? "It may have been removed, or the link is out of date." : "AppEdge D1 did not respond. Try again."}</p>
      <div className="drawer-failure-actions">
        <Link href={closeHref} className="modal-cancel" scroll={false}>Close</Link>
        {!missing && <RetryButton/>}
      </div>
    </div>
  </DrawerFrame>;
}

export function DomainDrawer({ domainId, closeHref, now }: { domainId: string | null; closeHref: string; now: number }) {
  if (!domainId) return null;
  return <Suspense fallback={<DrawerSkeleton closeHref={closeHref}/>}><LoadedDrawer domainId={domainId} closeHref={closeHref} now={now}/></Suspense>;
}

async function LoadedDrawer({ domainId, closeHref, now }: { domainId: string; closeHref: string; now: number }) {
  let domain: DomainRecord | null;
  let history: ActivityRecord[];
  try {
    domain = await getDomainById(domainId);
    history = domain ? await getDomainHistory(domain.id, HISTORY_LIMIT) : [];
  } catch {
    return <DrawerFailure closeHref={closeHref} missing={false}/>;
  }
  if (!domain) return <DrawerFailure closeHref={closeHref} missing/>;

  const edgeHostname = getEdgeHostname();
  const state = domainState(domain);
  const stage = pipelineStage(domain);
  const tone = domainTone(state);
  const records = buildDnsRecords(domain);
  const stageNotes = [
    "TXT record proves you control the domain",
    `CNAME points the hostname at ${edgeHostname}`,
    "Cloudflare for SaaS issues the certificate",
    domain.originUrl ? `Gateway serves it from ${domain.originUrl.replace(/^https:\/\//, "")}` : "Needs an origin URL on the application",
  ];

  return <DrawerFrame closeHref={closeHref}>
    <div className="drawer-header">
      <div className="drawer-heading">
        <div className="drawer-hostname">{domain.hostname}</div>
        <div className="drawer-subtitle">{domain.applicationName} · {domain.clientName}</div>
        <span className={`pill tone-${tone}`}>{headlineLabel(state, PIPELINE_STAGES[stage].name)}</span>
      </div>
      <CloseLink closeHref={closeHref} large/>
    </div>
    <div className="drawer-body">
      {state === "error" && <div role="alert" className="drawer-alert"><strong>{domainStatusText(domain, edgeHostname)}</strong><p>{domainFailureGuidance(domain)}</p></div>}
      <section>
        <h3 className="drawer-section-title">PROGRESS</h3>
        {PIPELINE_STAGES.map((definition, index) => {
          const done = stage > index || (stage === 3 && state === "live" && index === 3);
          const current = stage === index && !done;
          const failed = current && state === "error";
          const stepTone = done ? "done" : failed ? "failed" : current ? "current" : "upcoming";
          const icon: IconName = done ? "check" : failed ? "close" : "dot";
          return <div className="progress-step" key={definition.name}>
            <span className={`step-marker is-${stepTone}`}>{stepTone === "upcoming" ? null : <Icon name={icon} size={13}/>}</span>
            <div><strong className={done || current ? "" : "is-upcoming"}>{definition.name}</strong><span>{failed ? domainStatusText(domain, edgeHostname) : stageNotes[index]}</span></div>
          </div>;
        })}
      </section>
      <section>
        <h3 className="drawer-section-title">DNS RECORDS</h3>
        {records.length === 0 && <p className="drawer-note">No DNS records have been issued for this domain yet.</p>}
        {records.map((record) => <div className="dns-record" key={`${record.type}-${record.name}-${record.value}`}>
          <div className="dns-record-top"><span className="record-type">{record.type}</span><span className="spacer"/><span className={`record-state is-${record.state.toLowerCase()}`}>{record.state}</span><CopyButton value={record.value} label="Copy value"/></div>
          <div className="dns-record-name">{record.name}</div>
          <div className="dns-record-value">{record.value}</div>
        </div>)}
      </section>
      <section>
        <h3 className="drawer-section-title">CLOUDFLARE</h3>
        <div className="history-row"><span>Custom hostname</span><strong>{domain.cloudflareStatus ? domain.cloudflareStatus.replaceAll("_", " ") : "Not registered"}</strong></div>
        <div className="history-row"><span>Last checked</span><time>{domain.lastCheckedAt ? formatRelativeTime(domain.lastCheckedAt, now) : "Never"}</time></div>
      </section>
      <section>
        <h3 className="drawer-section-title">HISTORY</h3>
        {history.map((event) => <div className="history-row" key={event.id}><span>{event.action}</span><time>{formatRelativeTime(event.createdAt, now)}</time></div>)}
        {history.length === 0 && <p className="drawer-empty">No events recorded yet.</p>}
      </section>
    </div>
    <div className="drawer-footer">
      {state === "ready" && <ActivateRouteButton domainId={domain.id} hostname={domain.hostname} variant="drawer"/>}
      {state !== "ready" && state !== "live" && domainActionLabel(domain) && <CheckDomainButton domainId={domain.id} label={domainActionLabel(domain) ?? ""} variant="drawer"/>}
      {state === "live" && <DeactivateRouteButton domainId={domain.id}/>}
      <span className="spacer"/>
      <RemoveDomainButton domainId={domain.id} closeHref={closeHref}/>
    </div>
  </DrawerFrame>;
}
