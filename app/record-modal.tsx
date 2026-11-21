"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";
import { Icon } from "./icons";
import { clientPaletteFor, initialsOf } from "./lib/format";
import {
  createApplicationFromModal,
  createClientFromModal,
  createDomainFromModal,
  prepareDomainFromModal,
  publishRoute,
  setApplicationOrigin,
  type DnsInstruction,
} from "./lib/modal-actions";
import type { ShellApplication, ShellClient, ShellReadyDomain } from "./lib/data";

export type ModalKind = "domain" | "route" | "client" | "application" | "origin";
export type Notice = { message: string; warning: boolean };

const COPY_CONFIRMATION_MILLISECONDS = 1400;
const APPLICATION_TYPES = [
  { value: "cloudflare_worker", label: "Cloudflare Worker" },
  { value: "external_https", label: "External HTTPS" },
] as const;

const ORIGIN_HINT = "The gateway forwards requests for this application to this HTTPS address.";

type SelectOption = { id: string; label: string; meta: string; initials: string; background: string; foreground: string };

function typeLabel(type: string): string {
  return APPLICATION_TYPES.find((option) => option.value === type)?.label ?? type;
}

export function parseModalKind(value: string | null): ModalKind | null {
  return value === "domain" || value === "route" || value === "client" || value === "application" || value === "origin" ? value : null;
}

export function RecordModal({ kind, clients, applications, readyDomains, onNotice }: {
  kind: ModalKind;
  clients: ShellClient[];
  applications: ShellApplication[];
  readyDomains: ShellReadyDomain[];
  onNotice: (notice: Notice) => void;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [openSelect, setOpenSelect] = useState<string | null>(null);

  const originApplicationId = searchParams.get("application");
  const [hostname, setHostname] = useState("");
  const [applicationId, setApplicationId] = useState(applications[0]?.id ?? "");
  const [step, setStep] = useState<"details" | "records">("details");
  const [verification, setVerification] = useState<{ token: string; records: DnsInstruction[] } | null>(null);
  const [clientName, setClientName] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [ownerId, setOwnerId] = useState(clients[0]?.id ?? "");
  const [applicationName, setApplicationName] = useState("");
  const [applicationType, setApplicationType] = useState<string>(APPLICATION_TYPES[0].value);
  const [origin, setOrigin] = useState("");
  const routableApplications = applications.filter((application) => application.originUrl);
  const [routeDomainId, setRouteDomainId] = useState(readyDomains[0]?.id ?? "");
  const [routeApplicationId, setRouteApplicationId] = useState(
    routableApplications.find((application) => application.id === readyDomains[0]?.applicationId)?.id ?? routableApplications[0]?.id ?? "",
  );

  const clientOptions: SelectOption[] = clients.map((client) => {
    const palette = clientPaletteFor(client.id);
    return { id: client.id, label: client.name, meta: client.contactEmail ?? "Not provided", initials: initialsOf(client.name), background: palette.background, foreground: palette.foreground };
  });
  const applicationOptions: SelectOption[] = applications.map((application) => {
    const palette = clientPaletteFor(application.clientId);
    return { id: application.id, label: application.name, meta: `${application.clientName} · ${typeLabel(application.applicationType)}`, initials: initialsOf(application.name), background: palette.background, foreground: palette.foreground };
  });

  const routeDomainOptions: SelectOption[] = readyDomains.map((domain) => ({
    id: domain.id, label: domain.hostname, meta: "Certificate active", initials: domain.hostname.slice(0, 2).toUpperCase(), background: "#EEF2FF", foreground: "#2748C4",
  }));
  const routeApplicationOptions: SelectOption[] = routableApplications.map((application) => {
    const palette = clientPaletteFor(application.clientId);
    return { id: application.id, label: application.name, meta: (application.originUrl ?? "").replace(/^https:\/\//, ""), initials: initialsOf(application.name), background: palette.background, foreground: palette.foreground };
  });

  function close(extra: Record<string, string | null> = {}) {
    const parameters = new URLSearchParams(searchParams.toString());
    parameters.delete("modal");
    parameters.delete("application");
    for (const [key, value] of Object.entries(extra)) {
      if (value) parameters.set(key, value);
      else parameters.delete(key);
    }
    const queryString = parameters.toString();
    router.replace(queryString ? `${pathname}?${queryString}` : pathname, { scroll: false });
  }

  function navigateAfterSave(path: string, extra: Record<string, string> = {}) {
    const parameters = new URLSearchParams();
    const client = searchParams.get("client");
    if (client) parameters.set("client", client);
    for (const [key, value] of Object.entries(extra)) parameters.set(key, value);
    const queryString = parameters.toString();
    router.push(queryString ? `${path}?${queryString}` : path);
  }

  function run(action: () => Promise<void>) {
    setError("");
    startTransition(async () => {
      await action();
    });
  }

  function submitClient() {
    run(async () => {
      const result = await createClientFromModal({ name: clientName, email: clientEmail });
      if (result.error !== null) return setError(result.error);
      navigateAfterSave("/clients");
      onNotice({ message: "Client created", warning: false });
    });
  }

  function submitApplication() {
    run(async () => {
      const result = await createApplicationFromModal({ clientId: ownerId, name: applicationName, type: applicationType, origin });
      if (result.error !== null) return setError(result.error);
      navigateAfterSave("/applications");
      onNotice({ message: result.hasOrigin ? "Application registered" : "Application registered. Set an origin before publishing routes.", warning: false });
    });
  }

  function submitRoute() {
    run(async () => {
      const result = await publishRoute({ domainId: routeDomainId, applicationId: routeApplicationId });
      if (result.error !== null) return setError(result.error);
      navigateAfterSave("/routes");
      onNotice({ message: `${result.hostname} is live`, warning: false });
    });
  }

  function submitOrigin() {
    run(async () => {
      const result = await setApplicationOrigin({ applicationId: originApplicationId ?? "", origin });
      if (result.error !== null) return setError(result.error);
      close();
      router.refresh();
      onNotice({ message: "Origin saved", warning: false });
    });
  }

  function continueDomain() {
    run(async () => {
      const result = await prepareDomainFromModal({ hostname, applicationId });
      if (result.error !== null) return setError(result.error);
      setHostname(result.hostname);
      setVerification({ token: result.verificationToken, records: result.records });
      setStep("records");
    });
  }

  function submitDomain() {
    if (!verification) return;
    run(async () => {
      const result = await createDomainFromModal({ hostname, applicationId, verificationToken: verification.token });
      if (result.error !== null) return setError(result.error);
      navigateAfterSave("/", { domain: result.domainId });
      onNotice({ message: "Domain added. Waiting for the TXT record.", warning: false });
    });
  }

  const copy = {
    domain: step === "records"
      ? { title: "Add these DNS records", subtitle: "Send these to whoever manages the domain's DNS.", cta: "Add domain", submit: submitDomain }
      : { title: "Add a domain", subtitle: "Choose the hostname and the application it should route to.", cta: "Continue", submit: continueDomain },
    route: { title: "Add a route", subtitle: "Publish a ready domain to an application origin.", cta: "Publish route", submit: submitRoute },
    client: { title: "Create a client", subtitle: "An organisation that owns applications and domains.", cta: "Create client", submit: submitClient },
    application: { title: "Register an application", subtitle: "Connect an application and its upstream origin.", cta: "Register application", submit: submitApplication },
    origin: { title: "Set origin", subtitle: "Required before a route can be published.", cta: "Save origin", submit: submitOrigin },
  }[kind];

  const updating = (setter: (value: string) => void) => (value: string) => {
    setError("");
    setter(value);
  };

  return <div className="modal-scrim" onClick={() => close()}>
    <form className="modal" role="dialog" aria-modal="true" aria-labelledby="record-modal-title" onClick={(event) => event.stopPropagation()} onSubmit={(event) => { event.preventDefault(); copy.submit(); }}>
      <div className="modal-heading"><h2 id="record-modal-title">{copy.title}</h2><p>{copy.subtitle}</p></div>
      <div className="modal-fields">
        {kind === "domain" && step === "details" && <>
          <TextField label="Hostname" value={hostname} onChange={updating(setHostname)} placeholder="portal.example.com" mono icon="globe"/>
          <SelectField label="Application" name="application" options={applicationOptions} value={applicationId} onChange={updating(setApplicationId)} open={openSelect === "application"} onToggle={() => setOpenSelect(openSelect === "application" ? null : "application")} onClose={() => setOpenSelect(null)}/>
        </>}
        {kind === "domain" && step === "records" && verification && <>
          {verification.records.map((record) => <InstructionRecord key={`${record.type}-${record.name}`} record={record}/>)}
          <p className="modal-note">The domain owner keeps their registrar and nameservers. AppEdge starts validating as soon as these records resolve.</p>
        </>}
        {kind === "route" && <>
          <SelectField label="Domain" name="route-domain" options={routeDomainOptions} value={routeDomainId} onChange={updating(setRouteDomainId)} open={openSelect === "route-domain"} onToggle={() => setOpenSelect(openSelect === "route-domain" ? null : "route-domain")} onClose={() => setOpenSelect(null)}/>
          <SelectField label="Application" name="route-application" options={routeApplicationOptions} value={routeApplicationId} onChange={updating(setRouteApplicationId)} open={openSelect === "route-application"} onToggle={() => setOpenSelect(openSelect === "route-application" ? null : "route-application")} onClose={() => setOpenSelect(null)}/>
        </>}
        {kind === "client" && <>
          <TextField label="Client name" value={clientName} onChange={updating(setClientName)} placeholder="Pulse Activations"/>
          <TextField label="Contact email" value={clientEmail} onChange={updating(setClientEmail)} placeholder="name@company.co.za"/>
        </>}
        {kind === "application" && <>
          <SelectField label="Client" name="client" options={clientOptions} value={ownerId} onChange={updating(setOwnerId)} open={openSelect === "client"} onToggle={() => setOpenSelect(openSelect === "client" ? null : "client")} onClose={() => setOpenSelect(null)}/>
          <TextField label="Application name" value={applicationName} onChange={updating(setApplicationName)} placeholder="Partner Portal"/>
          <div className="field"><span className="field-label">Type</span>
            <div role="radiogroup" aria-label="Type" className="segmented">{APPLICATION_TYPES.map((option) => <button key={option.value} type="button" role="radio" aria-checked={applicationType === option.value} className={applicationType === option.value ? "is-on" : ""} onClick={() => updating(setApplicationType)(option.value)}>{option.label}</button>)}</div>
          </div>
          <TextField label="Origin URL" optional value={origin} onChange={updating(setOrigin)} placeholder="https://app.example.workers.dev" mono hint={ORIGIN_HINT}/>
        </>}
        {kind === "origin" && <TextField label="Origin URL" value={origin} onChange={updating(setOrigin)} placeholder="https://app.example.workers.dev" mono hint={ORIGIN_HINT}/>}
        {error && <p role="alert" className="modal-error">{error}</p>}
      </div>
      <div className="modal-actions">
        <button type="button" className="modal-cancel" onClick={() => close()}>Cancel</button>
        <button type="submit" className="modal-submit" disabled={pending}>{copy.cta}</button>
      </div>
    </form>
  </div>;
}

function Field({ label, optional, hint, children }: { label: string; optional?: boolean; hint?: string; children: ReactNode }) {
  return <div className="field">
    <span className="field-label">{label}{optional && <span> (optional)</span>}</span>
    {children}
    {hint && <span className="field-hint">{hint}</span>}
  </div>;
}

function TextField({ label, value, onChange, placeholder, mono, icon, optional, hint }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  mono?: boolean;
  icon?: "globe";
  optional?: boolean;
  hint?: string;
}) {
  return <Field label={label} optional={optional} hint={hint}>
    <span className="input-wrap">
      {icon && <Icon name={icon} size={17}/>}
      <input className={`${mono ? "is-mono" : ""}${icon ? " has-icon" : ""}`} value={value} placeholder={placeholder} autoComplete="off" aria-label={label} onChange={(event) => onChange(event.target.value)}/>
    </span>
  </Field>;
}

function SelectField({ label, name, options, value, onChange, open, onToggle, onClose }: {
  label: string;
  name: string;
  options: SelectOption[];
  value: string;
  onChange: (value: string) => void;
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
}) {
  const current = options.find((option) => option.id === value) ?? options[0];
  return <Field label={label}>
    <div className="select-anchor">
      <button type="button" className={`select-button${open ? " is-open" : ""}`} aria-haspopup="listbox" aria-expanded={open} aria-label={label} data-field={name} onClick={onToggle}>
        {current && <SelectRow option={current}/>}
        <Icon name="chevron" size={16}/>
      </button>
      {open && <>
        <button type="button" className="menu-scrim is-modal" aria-label="Close list" onClick={onClose}/>
        <div role="listbox" className="menu select-menu">
          {options.map((option) => <button key={option.id} type="button" role="option" aria-selected={option.id === value} className={`menu-item has-icon${option.id === value ? " is-selected" : ""}`} onClick={() => { onChange(option.id); onClose(); }}>
            <SelectRow option={option}/>
            {option.id === value && <Icon name="check" size={16}/>}
          </button>)}
        </div>
      </>}
    </div>
  </Field>;
}

function SelectRow({ option }: { option: SelectOption }) {
  return <>
    <span className="menu-avatar" style={{ background: option.background, color: option.foreground }}>{option.initials}</span>
    <span className="select-copy"><strong>{option.label}</strong><small>{option.meta}</small></span>
  </>;
}

function InstructionRecord({ record }: { record: DnsInstruction }) {
  const [copied, setCopied] = useState(false);

  async function copyValue() {
    try {
      await navigator.clipboard.writeText(record.value);
      setCopied(true);
      setTimeout(() => setCopied(false), COPY_CONFIRMATION_MILLISECONDS);
    } catch {
      setCopied(false);
    }
  }

  return <div className="dns-record">
    <div className="dns-record-top"><span className="record-type">{record.type}</span><span className="spacer"/><button type="button" className="copy-label-button" onClick={copyValue}>{copied ? "Copied" : "Copy"}</button></div>
    <div className="dns-record-name">{record.name}</div>
    <div className="dns-record-value">{record.value}</div>
  </div>;
}

export function NoticeDialog({ notice, onDismiss }: { notice: Notice; onDismiss: () => void }) {
  return <div className="modal-scrim is-notice" onClick={onDismiss}>
    <div className="modal is-notice" role="alertdialog" aria-modal="true" aria-labelledby="notice-title" onClick={(event) => event.stopPropagation()}>
      <div className="notice-body">
        <span className={`notice-icon ${notice.warning ? "tone-amber" : "tone-green"}`}><Icon name={notice.warning ? "alert" : "check"} size={20}/></span>
        <div><h2 id="notice-title">{notice.warning ? "Could not complete that" : "Done"}</h2><p>{notice.message}</p></div>
      </div>
      <button type="button" className="modal-submit is-block" autoFocus onClick={onDismiss}>OK</button>
    </div>
  </div>;
}
