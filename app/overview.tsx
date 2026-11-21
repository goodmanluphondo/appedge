import Link from "next/link";
import { DomainDrawer } from "./domain-drawer";
import { ActivateRouteButton } from "./route-actions";
import { Icon, type IconName } from "./icons";
import {
  getActivity,
  getApplications,
  getDomains,
  type ApplicationRecord,
  type ClientScope,
  type DomainRecord,
} from "./lib/data";
import {
  PIPELINE_STAGES,
  domainState,
  domainStatusText,
  pipelineStage,
} from "./lib/domain-pipeline";
import { getEdgeHostname } from "./lib/edge";
import { clientPaletteFor, formatRelativeTime, initialsOf } from "./lib/format";
import { buildHref } from "./lib/query";

const RECENT_ACTIVITY_LIMIT = 6;
const APPLICATION_LIST_LIMIT = 6;

export async function Overview({ scope, domainId, now }: { scope: ClientScope; domainId: string | null; now: number }) {
  const [domains, applications, activity] = await Promise.all([
    getDomains(scope),
    getApplications(scope),
    getActivity(RECENT_ACTIVITY_LIMIT),
  ]);

  const edgeHostname = getEdgeHostname();
  const failing = domains.filter((domain) => domainState(domain) === "error");
  const live = domains.filter((domain) => domainState(domain) === "live");
  const inProgress = domains.length - live.length - failing.length;
  const withoutOrigin = applications.filter((application) => !application.originUrl);
  const parameters = { client: scope };
  const domainHref = (id: string) => buildHref("/", { ...parameters, domain: id });

  return <>
    <div className="tile-grid">
      <Tile label="Live routes" value={live.length} note="serving traffic" icon="route" tone="green"/>
      <Tile label="In progress" value={inProgress} note="moving through stages" icon="globe" tone="blue"/>
      <Tile label="Needs attention" value={failing.length} note={failing.length ? "failing checks" : "all clear"} icon="alert" tone={failing.length ? "red" : "gray"}/>
      <Tile label="Applications" value={applications.length} note={`${withoutOrigin.length} without origin`} icon="box" tone="violet"/>
    </div>

    {(failing.length > 0 || withoutOrigin.length > 0) && <section className="attention-panel" aria-label="Needs attention">
      <div className="attention-title"><Icon name="alert" size={18}/>Needs attention</div>
      {failing.map((domain) => <div className="attention-row" key={domain.id}>
        <div><span className="attention-name">{domain.hostname}</span><span className="attention-message">{domainStatusText(domain, edgeHostname)}</span></div>
        <Link className="attention-details" href={domainHref(domain.id)} scroll={false}>Details</Link>
      </div>)}
      {withoutOrigin.map((application) => <div className="attention-row" key={application.id}>
        <div><span className="attention-name">{application.name}</span><span className="attention-message">No origin URL configured, so a route cannot be published.</span></div>
        <Link className="attention-details" href={buildHref("/", { ...parameters, modal: "origin", application: application.id })} scroll={false}>Details</Link>
        <Link className="attention-action" href={buildHref("/", { ...parameters, modal: "origin", application: application.id })} scroll={false}>Set origin</Link>
      </div>)}
    </section>}

    <section className="pipeline-section">
      <div className="section-header">
        <div><h2>Domain pipeline</h2><p>Each hostname moves through four stages before traffic is routed.</p></div>
        <Link className="link-action" href={buildHref("/domains", parameters)}>All domains</Link>
      </div>
      <div className="pipeline-grid">
        {PIPELINE_STAGES.map((stage, index) => {
          const items = domains.filter((domain) => pipelineStage(domain) === index);
          return <div className="pipeline-column" key={stage.name}>
            <div className="pipeline-column-header">
              <span className={`stage-number tone-${stage.tone}`}>{index + 1}</span>
              <div><strong>{stage.name}</strong><small>{index === 1 ? `CNAME to ${edgeHostname}` : stage.hint}</small></div>
              <span className="count-pill">{items.length}</span>
            </div>
            {items.map((domain) => <PipelineCard key={domain.id} domain={domain} href={domainHref(domain.id)} edgeHostname={edgeHostname}/>)}
            {items.length === 0 && <div className="pipeline-empty">No domains at this stage</div>}
          </div>;
        })}
      </div>
    </section>

    <div className="panel-grid">
      <section className="panel">
        <div className="panel-header"><h2>Recent activity</h2><Link className="link-action" href="/activity">View all</Link></div>
        {activity.map((event) => {
          const succeeded = event.outcome === "success";
          return <div className="panel-row" key={event.id}>
            <span className={`event-icon ${succeeded ? "tone-green" : "tone-red"}`}><Icon name={succeeded ? "check" : "alert"} size={14}/></span>
            <div className="panel-row-main"><strong>{event.action}</strong><code>{event.resourceName}</code></div>
            <time>{formatRelativeTime(event.createdAt, now)}</time>
          </div>;
        })}
        {activity.length === 0 && <p className="panel-empty">No activity yet. Add a domain to get started.</p>}
      </section>
      <section className="panel">
        <div className="panel-header"><h2>Applications</h2><Link className="link-action" href={buildHref("/applications", parameters)}>Manage</Link></div>
        {applications.slice(0, APPLICATION_LIST_LIMIT).map((application) => <ApplicationRow key={application.id} application={application} scope={scope}/>)}
        {applications.length === 0 && <p className="panel-empty">No applications registered.</p>}
      </section>
    </div>

    <DomainDrawer domainId={domainId} closeHref={buildHref("/", parameters)} now={now}/>
  </>;
}

function Tile({ label, value, note, icon, tone }: { label: string; value: number; note: string; icon: IconName; tone: string }) {
  return <div className="tile">
    <div className="tile-top"><span>{label}</span><span className={`tile-icon tone-${tone}`}><Icon name={icon} size={17}/></span></div>
    <div className="tile-value"><strong>{value}</strong><span className={tone === "red" ? "is-danger" : ""}>{note}</span></div>
  </div>;
}

function PipelineCard({ domain, href, edgeHostname }: { domain: DomainRecord; href: string; edgeHostname: string }) {
  const state = domainState(domain);
  return <div className={`pipeline-card state-${state}`}>
    <Link href={href} scroll={false} className="pipeline-card-link" aria-label={`Open ${domain.hostname}`}/>
    <span className="pipeline-card-host"><i/>{domain.hostname}</span>
    <span className="pipeline-card-meta">{domain.applicationName} · {domain.clientName}</span>
    <span className="pipeline-card-status">{domainStatusText(domain, edgeHostname)}</span>
    {state === "ready" && <ActivateRouteButton domainId={domain.id} hostname={domain.hostname} variant="card"/>}
  </div>;
}

function ApplicationRow({ application, scope }: { application: ApplicationRecord; scope: ClientScope }) {
  const palette = clientPaletteFor(application.clientId);
  return <div className="panel-row">
    <span className="menu-avatar is-square" style={{ background: palette.background, color: palette.foreground }}>{initialsOf(application.clientName)}</span>
    <div className="panel-row-main"><strong>{application.name}</strong><span>{application.clientName} · {application.applicationType === "cloudflare_worker" ? "Cloudflare Worker" : "External HTTPS"}</span></div>
    {application.originUrl
      ? <span className="origin-state is-set"><i/>Origin set</span>
      : <Link className="origin-state is-missing" scroll={false} href={buildHref("/", { client: scope, modal: "origin", application: application.id })}>Set origin</Link>}
  </div>;
}
