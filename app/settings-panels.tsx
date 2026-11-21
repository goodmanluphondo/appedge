"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { IntegrationState } from "./lib/integration-status";
import { testIntegration } from "./lib/modal-actions";
import { useShellActions } from "./shell-actions";

export type IntegrationRow = { name: string; description: string; state: IntegrationState };

const STATE_PRESENTATION: Record<IntegrationState, { label: string; tone: string }> = {
  connected: { label: "Connected", tone: "tone-green" },
  not_connected: { label: "Not connected", tone: "tone-gray" },
  error: { label: "Error", tone: "tone-red" },
};

const ROLES = [
  { name: "Administrator", description: "Manage clients, applications, domains and routes, and view settings." },
  { name: "Viewer", description: "Read-only access to infrastructure information." },
];

export function SettingsPanels({ integrations }: { integrations: IntegrationRow[] }) {
  const router = useRouter();
  const { notify } = useShellActions();
  const [testing, setTesting] = useState("");
  const [, startTransition] = useTransition();

  function test(name: string) {
    setTesting(name);
    startTransition(async () => {
      const result = await testIntegration(name);
      setTesting("");
      notify({ message: result.message, warning: !result.ok });
      router.refresh();
    });
  }

  return <div className="panel-grid">
    <section className="panel">
      <h2 className="panel-title">Integrations</h2>
      {integrations.map((integration) => {
        const presentation = STATE_PRESENTATION[integration.state];
        return <div className="integration-row" key={integration.name}>
          <div><strong>{integration.name}</strong><span>{integration.description}</span></div>
          <span className={`pill ${presentation.tone}`}>{presentation.label}</span>
          <button type="button" className="outline-button" onClick={() => test(integration.name)} disabled={testing !== ""}>{testing === integration.name ? "Testing…" : "Test connection"}</button>
        </div>;
      })}
    </section>
    <section className="panel">
      <h2 className="panel-title">Roles</h2>
      {ROLES.map((role) => <div className="role-row" key={role.name}><strong>{role.name}</strong><span>{role.description}</span></div>)}
      <p className="panel-note">Roles are assigned in Microsoft Entra ID and enforced on the server.</p>
    </section>
  </div>;
}
