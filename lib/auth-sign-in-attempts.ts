import type { AppEdgeD1Database } from "../app/lib/d1";
import { SIGN_IN_STATE_MAX_AGE_SECONDS } from "./auth-cookies";

const SIGN_IN_ATTEMPT_LIFETIME_MS = SIGN_IN_STATE_MAX_AGE_SECONDS * 1000;

export type SignInAttempt = {
  nonce: string;
  codeVerifier: string;
  createdAt: number;
};

export async function saveSignInAttempt(
  db: AppEdgeD1Database,
  stateHash: string,
  attempt: SignInAttempt,
): Promise<void> {
  await db
    .prepare("DELETE FROM auth_sign_in_attempts WHERE created_at <= ?")
    .bind(attempt.createdAt - SIGN_IN_ATTEMPT_LIFETIME_MS)
    .run();
  await db
    .prepare(
      "INSERT INTO auth_sign_in_attempts (state_hash, nonce, code_verifier, created_at) VALUES (?, ?, ?, ?)",
    )
    .bind(stateHash, attempt.nonce, attempt.codeVerifier, attempt.createdAt)
    .run();
}

export async function takeSignInAttempt(
  db: AppEdgeD1Database,
  stateHash: string,
  now: number,
): Promise<SignInAttempt | null> {
  const row = await db
    .prepare(
      "DELETE FROM auth_sign_in_attempts WHERE state_hash = ? RETURNING nonce, code_verifier, created_at",
    )
    .bind(stateHash)
    .first<{ nonce: string; code_verifier: string; created_at: number }>();

  if (!row || now - row.created_at > SIGN_IN_ATTEMPT_LIFETIME_MS) {
    return null;
  }

  return {
    nonce: row.nonce,
    codeVerifier: row.code_verifier,
    createdAt: row.created_at,
  };
}
