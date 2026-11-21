"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, type ReactNode } from "react";
import { Brand } from "./brand";
import { Icon, type IconName } from "./icons";
import { clientPaletteFor, initialsOf } from "./lib/format";
import { buildHref } from "./lib/query";
import type { AuthenticatedAdministrator } from "../lib/auth";
import { NoticeDialog, RecordModal, parseModalKind, type ModalKind, type Notice } from "./record-modal";
import { ShellActionsContext } from "./shell-actions";
import type { ShellApplication, ShellClient, ShellReadyDomain } from "./lib/data";

type NavigationItem = { label: string; href: string; icon: IconName; title: string; subtitle: string };

const navigation: NavigationItem[] = [
  { label: "Overview", href: "/", icon: "grid", title: "Overview", subtitle: "Where every custom domain stands between request and live traffic." },
  { label: "Clients", href: "/clients", icon: "users", title: "Clients", subtitle: "Organisations whose applications run through AppEdge." },
  { label: "Applications", href: "/applications", icon: "box", title: "Applications", subtitle: "Registered applications and their upstream origins." },
  { label: "Domains", href: "/domains", icon: "globe", title: "Domains", subtitle: "Custom hostnames and their validation status." },
  { label: "Routes", href: "/routes", icon: "route", title: "Routes", subtitle: "Hostname to origin mappings the gateway serves from D1." },
  { label: "Activity", href: "/activity", icon: "activity", title: "Activity", subtitle: "Configuration changes and provisioning events." },
  { label: "Settings", href: "/settings", icon: "settings", title: "Settings", subtitle: "Integrations and access control." },
];

const createItems: { label: string; description: string; modal: ModalKind; icon: IconName }[] = [
  { label: "Domain", description: "Connect a custom hostname", modal: "domain", icon: "globe" },
  { label: "Route", description: "Publish a hostname to an origin", modal: "route", icon: "route" },
  { label: "Client", description: "Add an organisation", modal: "client", icon: "users" },
  { label: "Application", description: "Register an origin", modal: "application", icon: "box" },
];

type OpenMenu = "scope" | "create" | "user" | null;

export function DashboardShell({ children, administrator, clients, applications, readyDomains, attentionCount }: {
  children: ReactNode;
  administrator: AuthenticatedAdministrator;
  clients: ShellClient[];
  applications: ShellApplication[];
  readyDomains: ShellReadyDomain[];
  attentionCount: number;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [openMenu, setOpenMenu] = useState<OpenMenu>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);

  const segment = pathname === "/" ? "" : `/${pathname.split("/")[1]}`;
  const activeItem = navigation.find((item) => item.href === (segment || "/")) ?? null;
  const showsPageHeader = activeItem !== null && pathname === activeItem.href;
  const selectedClientId = searchParams.get("client");
  const selectedClient = clients.find((client) => client.id === selectedClientId) ?? null;
  const initials = initialsOf(administrator.displayName);

  const navigationHref = (item: NavigationItem) => buildHref(item.href, { client: selectedClient?.id });
  const toggleMenu = (menu: Exclude<OpenMenu, null>) => setOpenMenu((current) => (current === menu ? null : menu));
  const closeMenus = () => setOpenMenu(null);

  function selectClient(clientId: string | null) {
    const parameters = new URLSearchParams(searchParams.toString());
    parameters.delete("domain");
    if (clientId) parameters.set("client", clientId);
    else parameters.delete("client");
    const queryString = parameters.toString();
    closeMenus();
    router.push(queryString ? `${pathname}?${queryString}` : pathname);
  }

  const modalKind = parseModalKind(searchParams.get("modal"));

  function openCreateModal(modal: ModalKind) {
    closeMenus();
    if (modal === "domain" && applications.length === 0) return setNotice({ message: "Register a client and an application first", warning: true });
    if (modal === "application" && clients.length === 0) return setNotice({ message: "Create a client first", warning: true });
    if (modal === "route" && readyDomains.length === 0) return setNotice({ message: "No domains are ready for a route. A domain needs a verified hostname and an active certificate before it can be published.", warning: true });
    if (modal === "route" && !applications.some((application) => application.originUrl)) return setNotice({ message: "No application has an origin yet. Set an origin on an application first", warning: true });
    const parameters = new URLSearchParams(searchParams.toString());
    parameters.set("modal", modal);
    router.push(`${pathname}?${parameters.toString()}`, { scroll: false });
  }

  const navigationLinks = (onNavigate?: () => void) => navigation.map((item) => {
    const selected = activeItem?.label === item.label;
    const badge = item.label === "Domains" && attentionCount > 0 ? attentionCount : 0;
    return <Link key={item.label} href={navigationHref(item)} className={`nav-link${selected ? " is-selected" : ""}`} aria-current={selected ? "page" : undefined} onClick={onNavigate}>
      <Icon name={item.icon}/>
      <span>{item.label}</span>
      {badge > 0 && <i className="nav-badge" aria-label={`${badge} needing attention`}>{badge}</i>}
    </Link>;
  });

  return <ShellActionsContext value={{ notify: setNotice, openCreateModal }}><div className="shell">
    <aside className="sidebar">
      <Link href="/" aria-label="AppEdge home" className="sidebar-brand"><Brand inverse/></Link>
      <nav aria-label="Main navigation" className="sidebar-nav">{navigationLinks()}</nav>
      <div className="user-menu-anchor">
        <button type="button" className={`user-button${openMenu === "user" ? " is-open" : ""}`} aria-haspopup="menu" aria-expanded={openMenu === "user"} onClick={() => toggleMenu("user")}>
          <span className="user-avatar">{initials}</span>
          <span className="user-copy"><strong>{administrator.displayName}</strong><small>Administrator</small></span>
          <Icon name="chevron" size={16}/>
        </button>
        {openMenu === "user" && <>
          <button type="button" className="menu-scrim" aria-label="Close menu" onClick={closeMenus}/>
          <div role="menu" className="menu menu-above">
            <Link role="menuitem" className="menu-item" href="/settings" onClick={closeMenus}>Settings</Link>
            <form action="/auth/sign-out" method="post"><button role="menuitem" type="submit" className="menu-item is-danger">Sign out</button></form>
          </div>
        </>}
      </div>
    </aside>

    {mobileOpen && <>
      <button type="button" className="drawer-scrim is-navigation" aria-label="Close navigation" onClick={() => setMobileOpen(false)}/>
      <aside role="dialog" aria-label="Navigation" className="mobile-navigation">
        <Brand inverse/>
        <nav aria-label="Main navigation" className="sidebar-nav">{navigationLinks(() => setMobileOpen(false))}</nav>
        <div className="mobile-user"><span className="user-avatar">{initials}</span><span className="user-copy"><strong>{administrator.displayName}</strong><small>Administrator</small></span></div>
        <form action="/auth/sign-out" method="post"><button type="submit" className="mobile-sign-out">Sign out</button></form>
      </aside>
    </>}

    <main className="main-area">
      <div className="mobile-bar">
        <button type="button" className="mobile-menu-button" aria-label="Open navigation" onClick={() => setMobileOpen(true)}><Icon name="menu" size={20}/></button>
        <Brand size={28}/>
      </div>
      {showsPageHeader && activeItem && <div className="page-header">
        <div className="page-title"><h1>{activeItem.title}</h1><p>{activeItem.subtitle}</p></div>
        <div className="page-actions">
          <div className="menu-anchor">
            <button type="button" className={`scope-button${openMenu === "scope" ? " is-open" : ""}`} aria-haspopup="listbox" aria-expanded={openMenu === "scope"} onClick={() => toggleMenu("scope")}>
              <span className="scope-label">Client</span><strong>{selectedClient?.name ?? "All clients"}</strong><Icon name="chevron" size={16}/>
            </button>
            {openMenu === "scope" && <>
              <button type="button" className="menu-scrim" aria-label="Close menu" onClick={closeMenus}/>
              <div role="listbox" aria-label="Filter by client" className="menu menu-scope">
                <span className="menu-heading">Show data for</span>
                <ScopeOption selected={!selectedClient} label="All clients" meta={`${clients.length} ${clients.length === 1 ? "client" : "clients"}`} initials="∗" background="#F2F4F7" foreground="#475467" onPick={() => selectClient(null)}/>
                {clients.map((client) => {
                  const palette = clientPaletteFor(client.id);
                  return <ScopeOption key={client.id} selected={client.id === selectedClient?.id} label={client.name} meta={client.contactEmail ?? "Not provided"} initials={initialsOf(client.name)} background={palette.background} foreground={palette.foreground} onPick={() => selectClient(client.id)}/>;
                })}
              </div>
            </>}
          </div>
          <div className="menu-anchor">
            <button type="button" className="create-button" aria-haspopup="menu" aria-expanded={openMenu === "create"} onClick={() => toggleMenu("create")}>
              <Icon name="plus" size={15}/>New<Icon name="chevron" size={16}/>
            </button>
            {openMenu === "create" && <>
              <button type="button" className="menu-scrim" aria-label="Close menu" onClick={closeMenus}/>
              <div role="menu" className="menu menu-create">
                {createItems.map((item) => <button key={item.modal} type="button" role="menuitem" className="menu-item has-icon" onClick={() => openCreateModal(item.modal)}>
                  <span className="menu-icon"><Icon name={item.icon} size={17}/></span>
                  <span><strong>{item.label}</strong><small>{item.description}</small></span>
                </button>)}
              </div>
            </>}
          </div>
        </div>
      </div>}
      {children}
    </main>
    {modalKind && (modalKind !== "origin" || applications.some((application) => application.id === searchParams.get("application"))) && <RecordModal key={`${modalKind}-${searchParams.get("application") ?? ""}`} kind={modalKind} clients={clients} applications={applications} readyDomains={readyDomains} onNotice={setNotice}/>}
    {notice && <NoticeDialog notice={notice} onDismiss={() => setNotice(null)}/>}
  </div></ShellActionsContext>;
}

function ScopeOption({ selected, label, meta, initials, background, foreground, onPick }: {
  selected: boolean;
  label: string;
  meta: string;
  initials: string;
  background: string;
  foreground: string;
  onPick: () => void;
}) {
  return <button type="button" role="option" aria-selected={selected} className={`menu-item has-icon${selected ? " is-selected" : ""}`} onClick={onPick}>
    <span className="menu-avatar" style={{ background, color: foreground }}>{initials}</span>
    <span><strong>{label}</strong><small>{meta}</small></span>
    {selected && <Icon name="check" size={16}/>}
  </button>;
}
