import Link from "next/link";
import type { CreateRecordOptions, ManagementSection } from "./lib/data";
import { CreateRecordForm } from "./create-record-form";

const descriptions: Record<string, string> = {
  Clients: "Add an organisation to manage its applications and hostnames.",
  Applications: "Register an application and its runtime configuration.",
  Domains: "Register a hostname for an existing application.",
  Routes: "Create a draft mapping from a domain to its application.",
};

export function CreateRecordPage({ section, options }: { section: ManagementSection; options: CreateRecordOptions }) {
  const singularLabel = section === "Applications" ? "an application" : section === "Routes" ? "a route" : `a ${section.slice(0, -1).toLowerCase()}`;
  return <>
    <div className="page-heading">
      <div><div className="eyebrow">APPEDGE WORKSPACE</div><h1>Add {singularLabel}</h1><p>{descriptions[section]}</p></div>
      <Link className="button button-secondary" href={`/${section.toLowerCase()}`}>Back to {section.toLowerCase()}</Link>
    </div>
    <section className="record-form-card" aria-label={`Add ${singularLabel}`}>
      <CreateRecordForm section={section} options={options}/>
    </section>
  </>;
}
