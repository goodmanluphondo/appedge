"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { Icon, type IconName } from "./icons";
import type { AuthenticatedAdministrator } from "../lib/auth";

const navigation: { label: string; href: string; icon: IconName }[] = [
  { label: "Overview", href: "/", icon: "grid" },
  { label: "Clients", href: "/clients", icon: "users" },
  { label: "Applications", href: "/applications", icon: "box" },
  { label: "Domains", href: "/domains", icon: "globe" },
  { label: "Routes", href: "/routes", icon: "route" },
  { label: "Activity", href: "/activity", icon: "activity" },
];

export function DashboardShell({ children, administrator }: { children: ReactNode; administrator: AuthenticatedAdministrator }) {
  const pathname = usePathname();
  const [dark, setDark] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const active = pathname === "/" ? "Overview" : pathname.split("/")[1]?.replace(/^./, (letter) => letter.toUpperCase()) ?? "Overview";
  const initials = administrator.displayName.split(/\s+/).filter(Boolean).map((word) => word[0]).join("").slice(0, 2).toUpperCase();
  return <div className={`app-shell${dark ? " theme-dark" : ""}`}>
    {mobileOpen && <button className="mobile-scrim" aria-label="Close navigation" onClick={() => setMobileOpen(false)} />}
    <aside className={`sidebar${collapsed ? " is-collapsed" : ""}${mobileOpen ? " is-mobile-open" : ""}`}>
      <Link className="brand" href="/" aria-label="AppEdge home"><span className="brand-mark"><span/><span/><span/></span>{!collapsed && <span className="brand-name">App<span>Edge</span></span>}</Link>
      <div className="workspace-switch"><span className="workspace-avatar">A</span>{!collapsed && <><span className="workspace-name">AppEdge workspace</span><span className="workspace-chevron">⌄</span></>}</div>
      <div className="nav-label">PLATFORM</div>
      <nav aria-label="Main navigation">{navigation.map((item) => <Link key={item.label} href={item.href} title={collapsed ? item.label : undefined} className={`nav-item${active === item.label ? " selected" : ""}`} onClick={() => setMobileOpen(false)}><Icon name={item.icon}/><span>{item.label}</span>{item.label === "Domains" && <i className="nav-count">2</i>}</Link>)}</nav>
      <div className="sidebar-spacer"/>
      <Link className="sidebar-integration" href="/settings/gateway" title={collapsed ? "Gateway settings" : undefined}><span className="integration-dot"/>{!collapsed && <><span className="integration-copy"><strong>Gateway</strong><small>Not connected</small></span><span className="integration-chevron">↗</span></>}</Link>
      <Link className={`nav-item settings-item${active === "Settings" ? " selected" : ""}`} href="/settings" title={collapsed ? "Settings" : undefined} onClick={() => setMobileOpen(false)}><Icon name="settings"/><span>Settings</span></Link>
      <div className="profile-card"><span className="profile-avatar">{initials}</span>{!collapsed && <span className="profile-copy"><strong>{administrator.displayName}</strong><small>{administrator.email}</small><small>Administrator</small></span>}<form action="/auth/sign-out" method="post" className="profile-sign-out-form"><button className="profile-sign-out" type="submit" aria-label="Sign out" title="Sign out"><Icon name="logout" size={15}/><span>Sign out</span></button></form></div>
    </aside>
    <main className="main-area">
      <header className="topbar">
        <button className="icon-button mobile-menu" aria-label="Open navigation" onClick={() => setMobileOpen(true)}><Icon name="menu"/></button>
        <div className="breadcrumbs"><span>AppEdge</span><Icon name="chevron" size={14}/><strong>{active}</strong></div>
        <div className="topbar-actions"><span className="environment"><i/>AppEdge D1</span><span className="topbar-divider"/><button className="icon-button theme-toggle" aria-label={dark ? "Use light theme" : "Use dark theme"} onClick={() => setDark(!dark)}><Icon name={dark ? "sun" : "moon"}/></button><Link className="help-button" href="/help">Help <Icon name="arrow" size={14}/></Link><button className="icon-button collapse-toggle" title={collapsed ? "Expand sidebar" : "Collapse sidebar"} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} onClick={() => setCollapsed(!collapsed)}><span className={collapsed ? "flip" : ""}>◧</span></button></div>
      </header>
      <div className="content-wrap">{children}</div>
    </main>
  </div>;
}
