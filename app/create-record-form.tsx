"use client";

import Link from "next/link";
import { useActionState } from "react";
import { createManagementRecord, type CreateRecordFormState } from "./lib/actions";
import type { CreateRecordOptions, ManagementSection } from "./lib/data";

const initialState: CreateRecordFormState = { error: null };

export function CreateRecordForm({ section, options }: { section: ManagementSection; options: CreateRecordOptions }) {
  const [state, formAction, pending] = useActionState(createManagementRecord, initialState);
  const prerequisite = section === "Applications" && options.clients.length === 0
    ? { message: "Create an active client before adding an application.", href: "/clients/new", label: "Add a client" }
    : section === "Domains" && options.applications.length === 0
      ? { message: "Create an application before adding a domain.", href: "/applications/new", label: "Add an application" }
      : section === "Routes" && options.domains.length === 0
        ? { message: "Register a domain before adding a route.", href: "/domains/new", label: "Add a domain" }
        : null;

  return <form className="record-form" action={formAction}>
    <input type="hidden" name="section" value={section}/>
    {prerequisite ? <div className="form-prerequisite"><p>{prerequisite.message}</p><Link className="button button-secondary" href={prerequisite.href}>{prerequisite.label}</Link></div> : <>
      {section === "Clients" && <>
        <Field label="Client name" name="name" required maxLength={120}/>
        <Field label="Client reference" name="client_reference" maxLength={100}/>
        <Field label="Contact name" name="contact_name" maxLength={120}/>
        <Field label="Contact email" name="contact_email" type="email" maxLength={254}/>
        <Field label="Notes" name="notes" multiline maxLength={2000}/>
      </>}
      {section === "Applications" && <>
        <SelectField label="Client" name="client_id" required options={options.clients.map(({ id, name }) => ({ value: id, label: name }))}/>
        <Field label="Application name" name="name" required maxLength={120}/>
        <Field label="Identifier" name="identifier" pattern="[a-z0-9]+(-[a-z0-9]+)*" maxLength={80} hint="Leave blank to generate one from the application name."/>
        <SelectField label="Application type" name="application_type" required options={[
          { value: "cloudflare_worker", label: "Cloudflare Worker" },
          { value: "external_https", label: "External HTTPS" },
        ]}/>
        <SelectField label="Environment" name="environment" required options={environmentOptions}/>
        <Field label="Origin URL" name="origin_url" type="url" placeholder="https://origin.example.com" hint="Optional. Use an HTTPS origin URL."/>
      </>}
      {section === "Domains" && <>
        <SelectField label="Application" name="application_id" required options={options.applications.map(({ id, name, clientName }) => ({ value: id, label: `${name} · ${clientName}` }))}/>
        <Field label="Hostname" name="hostname" required maxLength={253} placeholder="app.example.com" hint="Ownership, DNS and SSL checks will start as pending."/>
      </>}
      {section === "Routes" && <>
        <SelectField label="Domain" name="domain_id" required options={options.domains.map(({ id, hostname, applicationName }) => ({ value: id, label: `${hostname} · ${applicationName}` }))}/>
        <SelectField label="Environment" name="environment" required options={environmentOptions}/>
        <p className="form-note">New routes are saved as drafts and do not publish traffic.</p>
      </>}
      {state.error && <p className="form-error" role="alert">{state.error}</p>}
      <div className="form-actions">
        <Link className="button button-secondary" href={`/${section.toLowerCase()}`}>Cancel</Link>
        <button className="button button-primary" type="submit" disabled={pending}>{pending ? "Saving…" : `Create ${section === "Routes" ? "route" : section.slice(0, -1).toLowerCase()}`}</button>
      </div>
    </>}
  </form>;
}

function Field({ label, name, type = "text", required = false, maxLength, pattern, placeholder, hint, multiline = false }: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  maxLength?: number;
  pattern?: string;
  placeholder?: string;
  hint?: string;
  multiline?: boolean;
}) {
  const id = `record-${name}`;
  return <label className="record-field" htmlFor={id}>
    <span>{label}{required && <b aria-hidden="true"> *</b>}</span>
    {multiline
      ? <textarea id={id} name={name} maxLength={maxLength} rows={4}/>
      : <input id={id} name={name} type={type} required={required} maxLength={maxLength} pattern={pattern} placeholder={placeholder}/>}
    {hint && <small>{hint}</small>}
  </label>;
}

function SelectField({ label, name, options, required = false }: {
  label: string;
  name: string;
  options: { value: string; label: string }[];
  required?: boolean;
}) {
  return <label className="record-field" htmlFor={`record-${name}`}>
    <span>{label}{required && <b aria-hidden="true"> *</b>}</span>
    <select id={`record-${name}`} name={name} required={required} defaultValue="">
      <option value="" disabled>Select {label.toLowerCase()}</option>
      {options.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}
    </select>
  </label>;
}

const environmentOptions = [
  { value: "development", label: "Development" },
  { value: "staging", label: "Staging" },
  { value: "production", label: "Production" },
];
