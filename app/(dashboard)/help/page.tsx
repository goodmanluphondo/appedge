import Link from "next/link";
import { Icon } from "../../icons";

const createLinks = [
  { label: "Add a client", href: "/clients/new", description: "Start by registering the organisation." },
  { label: "Add an application", href: "/applications/new", description: "Connect an application to an active client." },
  { label: "Add a domain", href: "/domains/new", description: "Register a hostname for an application." },
  { label: "Add a route", href: "/routes/new", description: "Save a draft route for a registered domain." },
];

export default function HelpPage() {
  return <>
    <div className="page-heading"><div><div className="eyebrow">APPEDGE WORKSPACE</div><h1>Help</h1><p>Get started with AppEdge records and platform settings.</p></div><Link className="button button-secondary" href="/">Back to overview</Link></div>
    <section className="help-grid" aria-label="Getting started">
      {createLinks.map((item) => <Link className="help-card" href={item.href} key={item.href}>
        <span><strong>{item.label}</strong><small>{item.description}</small></span>
        <Icon name="arrow" size={17}/>
      </Link>)}
      <Link className="help-card" href="/settings">
        <span><strong>Settings and integrations</strong><small>Review authentication, access control and service connection guidance.</small></span>
        <Icon name="arrow" size={17}/>
      </Link>
      <Link className="help-card" href="/activity">
        <span><strong>Audit activity</strong><small>Review the recorded outcomes of management changes.</small></span>
        <Icon name="arrow" size={17}/>
      </Link>
    </section>
  </>;
}
