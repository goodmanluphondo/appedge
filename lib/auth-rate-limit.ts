import type { AppEdgeD1Database } from "../app/lib/d1";
import { hashAuthToken } from "./auth-tokens";

const SIGN_IN_WINDOW_MS = 5 * 60 * 1000;
const SIGN_IN_REQUESTS_PER_WINDOW = 20;

export async function allowSignInRequest(
  db: AppEdgeD1Database,
  request: Request,
  now: number,
): Promise<boolean> {
  const address = request.headers.get("CF-Connecting-IP") ?? "unknown";
  const clientHash = await hashAuthToken(`appedge-sign-in:${address}`);
  const windowStart = now - SIGN_IN_WINDOW_MS;
  const recent = await db
    .prepare(
      "SELECT COUNT(*) AS request_count FROM auth_sign_in_requests WHERE client_hash = ? AND requested_at > ?",
    )
    .bind(clientHash, windowStart)
    .first<{ request_count: number }>();

  if ((recent?.request_count ?? 0) >= SIGN_IN_REQUESTS_PER_WINDOW) {
    return false;
  }

  await db
    .prepare("DELETE FROM auth_sign_in_requests WHERE requested_at <= ?")
    .bind(windowStart)
    .run();
  await db
    .prepare(
      "INSERT INTO auth_sign_in_requests (client_hash, requested_at) VALUES (?, ?)",
    )
    .bind(clientHash, now)
    .run();

  return true;
}
