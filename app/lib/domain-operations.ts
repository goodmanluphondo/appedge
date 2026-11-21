import "server-only";
import { getAppEdgeDatabase } from "./d1";

const OPERATION_TIMEOUT_MODIFIER = "-2 minutes";

export const DOMAIN_OPERATION_IN_PROGRESS_MESSAGE = "Another operation is already running for this domain. Wait for it to finish, then try again.";

export async function beginDomainOperation(domainId: string, operationType: string): Promise<string | null> {
  const database = getAppEdgeDatabase();
  await database.prepare(`
    UPDATE provisioning_operations
    SET status = 'failed', error_message = 'The operation did not finish and timed out.', completed_at = CURRENT_TIMESTAMP
    WHERE domain_id = ? AND status IN ('pending', 'running') AND created_at < datetime('now', ?)
  `).bind(domainId, OPERATION_TIMEOUT_MODIFIER).run();

  const operationId = crypto.randomUUID();
  try {
    await database.prepare(`
      INSERT INTO provisioning_operations (id, domain_id, operation_type, status, started_at)
      VALUES (?, ?, ?, 'running', CURRENT_TIMESTAMP)
    `).bind(operationId, domainId, operationType).run();
  } catch {
    return null;
  }
  return operationId;
}

export async function finishDomainOperation(operationId: string, outcome: { error: string } | { result: Record<string, string | number | null> }): Promise<void> {
  const failed = "error" in outcome;
  await getAppEdgeDatabase().prepare(`
    UPDATE provisioning_operations
    SET status = ?, error_message = ?, result_metadata = ?, completed_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).bind(
    failed ? "failed" : "succeeded",
    failed ? outcome.error : null,
    JSON.stringify(failed ? {} : outcome.result),
    operationId,
  ).run();
}
