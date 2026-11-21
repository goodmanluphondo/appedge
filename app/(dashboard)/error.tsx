"use client";

import { usePathname } from "next/navigation";
import { Icon } from "../icons";

const SECTION_NAMES: Record<string, string> = {
  "": "overview",
  clients: "clients",
  applications: "applications",
  domains: "domains",
  routes: "routes",
  activity: "activity",
  settings: "settings",
};

export default function DashboardError({ reset }: { error: Error; reset: () => void }) {
  const pathname = usePathname();
  const sectionName = SECTION_NAMES[pathname.split("/")[1] ?? ""] ?? "this page";

  return <div role="alert" className="load-error">
    <span className="load-error-icon tone-red"><Icon name="alert" size={22}/></span>
    <h2>Could not load {sectionName}</h2>
    <p>AppEdge D1 did not respond. Check your connection and try again.</p>
    <button type="button" className="modal-submit" onClick={reset}>Try again</button>
  </div>;
}
