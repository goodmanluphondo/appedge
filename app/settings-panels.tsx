"use client";

import { useState, useTransition } from "react";
import { useShellActions } from "./shell-actions";
import { testIntegration } from "./lib/modal-actions";

type Integration = { name: string; description: string; connected: boolean };

function integrationsFor(edgeHostname: string): Integration[] {
  return [
    { name: "Cloudflare for SaaS", description: "Custom hostname registration and TLS certificates", connected: false },
    { name: "Cloudflare D1", description: "Operational records and routing configuration", connected: true },
    { name: "AppEdge Gateway", description: `Cloudflare Worker at ${edgeHostname}, reads routes from D1`, connected: false },
    { name: "Microsoft Entra ID", description: "Sign-in and AppEdge role assignment", connected: true },
  ];
}

const ROLES = [
  { name: "Administrator", description: "Manage clients, applications, domains and routes." },
];

export function SettingsPanels({ edgeHostname }: { edgeHostname: string }) {
  const { notify } = useShellActions();
  const [testing, setTesting] = useState("");
  const [, startTransition] = useTransition();

  function test(name: string) {
    setTesting(name);
    startTransition(async () => {
      const result = await testIntegration(name);
      setTesting("");
      notify({ message: result.message, warning: !result.ok });
    });
  }

  return <>
    <div className="panel-grid">
      <section className="panel">
        <h2 className="panel-title">Integrations</h2>
        {integrationsFor(edgeHostname).map((integration) => <div className="integration-row" key={integration.name}>
          <div><strong>{integration.name}</strong><span>{integration.description}</span></div>
          <span className={`pill ${integration.connected ? "tone-green" : "tone-gray"}`}>{integration.connected ? "Connected" : "Not connected"}</span>
          <button type="button" className="outline-button" onClick={() => test(integration.name)} disabled={testing !== ""}>{testing === integration.name ? "Testing…" : "Test connection"}</button>
        </div>)}
      </section>
      <section className="panel">
        <h2 className="panel-title">Roles</h2>
        {ROLES.map((role) => <div className="role-row" key={role.name}><strong>{role.name}</strong><span>{role.description}</span></div>)}
        <p className="panel-note">Roles are assigned in Microsoft Entra ID and enforced on the server.</p>
      </section>
    </div>
  </>;
}
