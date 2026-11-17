import Link from "next/link";
import { headers } from "next/headers";
import { ApplicationTable } from "../application-table";
import { getDashboardData } from "../lib/data";
import { Icon, type IconName } from "../icons";

export default async function Home() {
  await headers();
  const dashboard = await getDashboardData();

  return <>
    <div className="page-heading"><div><div className="eyebrow">APPEDGE WORKSPACE {dashboard.demoRecordCount > 0 && <span className="live-pill demo"><i/> {dashboard.demoRecordCount} DEMO RECORDS</span>}</div><h1>Overview</h1><p>Application delivery and routing status.</p></div><Link className="button button-primary" href="/domains/new"><Icon name="plus" size={17}/> Add a domain</Link></div>
    <div className="metrics-grid"><Metric icon="users" label="Total clients" value={dashboard.clientCount} foot="Client records in D1" tone="blue"/><Metric icon="box" label="Applications" value={dashboard.applicationCount} foot={`${dashboard.missingOriginCount} origins need configuration`} tone="violet"/><Metric icon="globe" label="Custom domains" value={dashboard.domainCount} foot={`${dashboard.pendingDomainCount} need validation`} tone="amber"/><Metric icon="route" label="Active routes" value={dashboard.activeRouteCount} foot="Published routing records" tone="green"/></div>
    <section className="operations-section"><div className="section-heading"><div><h2>Needs attention</h2><p>Configuration items from AppEdge D1</p></div><Link className="text-button" href="/domains">View domains <Icon name="arrow" size={15}/></Link></div><div className="attention-grid">{dashboard.attention.map((item) => <Attention key={`${item.kind}-${item.detail}`} item={item}/>)}{dashboard.attention.length === 0 && <div className="empty-state">No outstanding configuration items.</div>}</div></section>
    <section className="applications-section"><div className="section-heading"><div><h2>Applications</h2><p>Registered application origins</p></div><Link className="text-button" href="/applications">All applications <Icon name="arrow" size={15}/></Link></div><ApplicationTable applications={dashboard.applications} demoRecordCount={dashboard.demoRecordCount}/></section>
    <div className="lower-grid"><section className="events-section"><div className="section-heading"><div><h2>Recent activity</h2><p>Audit events recorded in AppEdge D1</p></div><Link className="text-button" href="/activity">View activity <Icon name="arrow" size={15}/></Link></div><div className="events-card">{dashboard.activity.map((event) => <Event key={event.id} event={event}/>)}{dashboard.activity.length === 0 && <div className="empty-state">No audit activity has been recorded.</div>}</div></section>
      <section className="readiness-section"><div className="section-heading"><div><h2>Platform status</h2><p>Integration readiness</p></div><span className="muted-dot-label"><i/> Live</span></div><div className="readiness-card"><Readiness label="AppEdge D1" status="Connected" tone="green"/><Readiness label="Gateway" status="Not configured" tone="neutral"/><Readiness label="Cloudflare for SaaS" status="Not configured" tone="neutral"/><Readiness label="Microsoft Entra ID" status="Not configured" tone="neutral"/><div className="readiness-note"><Icon name="alert" size={15}/><span>Configure the remaining integrations to enable production routing operations.</span></div><Link className="button button-secondary" href="/settings/integrations">Configure integrations <Icon name="arrow" size={15}/></Link></div></section></div>
    <footer className="page-footer"><span>AppEdge <b>·</b> Internal infrastructure console</span><span>Operational records are loaded from AppEdge D1.</span></footer>
  </>;
}

function Metric({ icon, label, value, foot, tone }: { icon: "users" | "box" | "globe" | "route"; label: string; value: number; foot: string; tone: string }) {
  return <div className="metric-card"><div className="metric-top"><span>{label}</span><span className={`metric-icon ${tone}`}><Icon name={icon} size={17}/></span></div><strong className="metric-value">{value}</strong><span className="metric-foot"><i className={tone}/>{foot}</span></div>;
}

function Attention({ item }: { item: { kind: "application" | "domain"; title: string; detail: string; meta: string } }) {
  const href = item.kind === "domain" ? `/domains?q=${encodeURIComponent(item.detail)}` : `/applications?q=${encodeURIComponent("Origin not set")}`;
  const icon: IconName = item.kind === "domain" ? "globe" : "activity";
  return <article className="attention-card"><span className="attention-icon amber"><Icon name={icon} size={18}/></span><div className="attention-content"><h3>{item.title}</h3><code>{item.detail}</code><p>{item.meta}</p></div><Link className="button button-small" href={href}>Review <Icon name="chevron" size={14}/></Link></article>;
}

function Event({ event }: { event: { title: string; resource: string; actor: string; time: string; outcome: string } }) {
  const kind = event.outcome === "success" ? "green" : "red";
  return <div className="event-row"><span className={`event-marker ${kind}`}><Icon name={event.outcome === "success" ? "check" : "alert"} size={15}/></span><div className="event-main"><strong>{event.title}</strong><code>{event.resource}</code><span>{event.actor}</span></div><time>{event.time}</time></div>;
}

function Readiness({ label, status, tone }: { label: string; status: string; tone: string }) {
  return <div className="readiness-row"><span>{label}</span><span className={`readiness-status ${tone}`}><i/>{status}</span></div>;
}
