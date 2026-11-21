"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { activateRoute, deactivateRoute, removeDomain } from "./lib/modal-actions";
import { useShellActions } from "./shell-actions";

export function ActivateRouteButton({ domainId, hostname, variant }: { domainId: string; hostname: string; variant: "card" | "drawer" }) {
  const { notify } = useShellActions();
  const [pending, startTransition] = useTransition();

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

export function DeactivateRouteButton({ domainId }: { domainId: string }) {
  const { notify } = useShellActions();
  const [pending, startTransition] = useTransition();

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
  const { notify } = useShellActions();
  const [pending, startTransition] = useTransition();

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
  const { notify } = useShellActions();
  const [pending, startTransition] = useTransition();

  function toggle() {
    startTransition(async () => {
      const result = on ? await deactivateRoute(domainId) : await activateRoute(domainId);
      if (result.error !== null) return notify({ message: result.error, warning: true });
      notify({ message: on ? "Route deactivated. The gateway stops serving it immediately." : `${hostname} is live`, warning: false });
    });
  }

  return <button type="button" role="switch" aria-checked={on} aria-label={`${hostname} route`} className={`switch${on ? " is-on" : ""}`} disabled={pending} onClick={toggle}><i/></button>;
}

export function AddRouteButton() {
  const { openCreateModal } = useShellActions();
  return <button type="button" className="add-route-button" onClick={() => openCreateModal("route")}>Add route</button>;
}
