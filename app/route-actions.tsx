"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition, type ReactNode } from "react";
import { checkDomain, removeDomain } from "./lib/domain-actions";
import { activateRoute, deactivateRoute } from "./lib/modal-actions";
import { useShellActions } from "./shell-actions";

const READ_ONLY_MESSAGE = "Viewer role is read-only";

export function ActivateRouteButton({ domainId, hostname, variant }: { domainId: string; hostname: string; variant: "card" | "drawer" }) {
  const { notify, canManage } = useShellActions();
  const [pending, startTransition] = useTransition();
  if (!canManage) return null;

  function activate() {
    startTransition(async () => {
      const result = await activateRoute(domainId);
      if (result.error !== null) return notify({ message: result.error, warning: true });
      notify({ message: `${hostname} is live`, warning: false });
    });
  }

  if (pending && variant === "card") return <div className="busy-indicator"><span className="spinner"/>Publishing to D1…</div>;
  return <button type="button" className={variant === "card" ? "card-action is-primary" : "drawer-primary"} disabled={pending} onClick={activate}>{pending ? "Publishing…" : "Activate route"}</button>;
}

export function CheckDomainButton({ domainId, label, variant }: { domainId: string; label: string; variant: "card" | "drawer" | "attention" }) {
  const { notify, canManage } = useShellActions();
  const [pending, startTransition] = useTransition();
  if (!canManage) return null;

  function check() {
    startTransition(async () => {
      const result = await checkDomain(domainId);
      if (result.error !== null) return notify({ message: result.error, warning: true });
      notify({ message: result.message, warning: result.warning });
    });
  }

  if (pending && variant === "card") return <div className="busy-indicator"><span className="spinner"/>Checking…</div>;
  const className = variant === "card" ? "card-action" : variant === "drawer" ? "drawer-primary" : "attention-action";
  return <button type="button" className={className} disabled={pending} onClick={check}>{pending ? "Checking…" : label}</button>;
}

export function DeactivateRouteButton({ domainId }: { domainId: string }) {
  const { notify, canManage } = useShellActions();
  const [pending, startTransition] = useTransition();
  if (!canManage) return null;

  function deactivate() {
    startTransition(async () => {
      const result = await deactivateRoute(domainId);
      if (result.error !== null) return notify({ message: result.error, warning: true });
      notify({ message: "Route deactivated. The gateway stops serving it immediately.", warning: false });
    });
  }

  return <button type="button" className="drawer-secondary" disabled={pending} onClick={deactivate}>Deactivate route</button>;
}

export function RemoveDomainButton({ domainId, closeHref }: { domainId: string; closeHref: string }) {
  const router = useRouter();
  const { notify, canManage } = useShellActions();
  const [pending, startTransition] = useTransition();
  if (!canManage) return <span className="read-only-note">Read-only access</span>;

  function remove() {
    startTransition(async () => {
      const result = await removeDomain(domainId);
      if (result.error !== null) return notify({ message: result.error, warning: true });
      router.replace(closeHref, { scroll: false });
      notify({ message: "Domain removed", warning: false });
    });
  }

  return <button type="button" className="drawer-remove" disabled={pending} onClick={remove}>Remove</button>;
}

export function RouteSwitch({ domainId, hostname, on }: { domainId: string; hostname: string; on: boolean }) {
  const { notify, canManage } = useShellActions();
  const [pending, startTransition] = useTransition();

  function toggle() {
    if (!canManage) return notify({ message: READ_ONLY_MESSAGE, warning: true });
    startTransition(async () => {
      const result = on ? await deactivateRoute(domainId) : await activateRoute(domainId);
      if (result.error !== null) return notify({ message: result.error, warning: true });
      notify({ message: on ? "Route deactivated. The gateway stops serving it immediately." : `${hostname} is live`, warning: false });
    });
  }

  return <button type="button" role="switch" aria-checked={on} aria-label={`${hostname} route`} className={`switch${on ? " is-on" : ""}${canManage ? "" : " is-read-only"}`} disabled={pending} onClick={toggle}><i/></button>;
}

export function AddRouteButton() {
  const { openCreateModal, canManage } = useShellActions();
  if (!canManage) return null;
  return <button type="button" className="add-route-button" onClick={() => openCreateModal("route")}>Add route</button>;
}

export function OriginAction({ href, className, children }: { href: string; className: string; children: ReactNode }) {
  const { notify, canManage } = useShellActions();
  if (canManage) return <Link className={className} href={href} scroll={false}>{children}</Link>;
  return <button type="button" className={className} onClick={() => notify({ message: READ_ONLY_MESSAGE, warning: true })}>{children}</button>;
}
