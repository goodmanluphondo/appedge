import "server-only";
import { getAppEdgeDatabase } from "./d1";

export type AuditOutcome = "success" | "failure";

export function auditStatement(input: {
  resourceType: string;
  action: string;
  resourceId: string;
  actorName: string;
  outcome?: AuditOutcome;
  metadata?: Record<string, string>;
}) {
  return getAppEdgeDatabase().prepare(`
    INSERT INTO audit_events (id, actor_name, action, resource_type, resource_id, outcome, metadata)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).bind(
    crypto.randomUUID(),
    input.actorName,
    input.action,
    input.resourceType,
    input.resourceId,
    input.outcome ?? "success",
    JSON.stringify(input.metadata ?? {}),
  );
}
