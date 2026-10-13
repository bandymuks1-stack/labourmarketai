import { createHash } from "node:crypto";

/**
 * SPEND A CONFIRMATION — once.
 *
 * `verifyConfirmationToken` proves a token is genuine, fresh and bound to this
 * caller, action, input and state. It cannot prove the token was not already
 * used: a state fingerprint only moves when the write changes what it reads,
 * and two confirms arriving together both read the old state. This records
 * the spend in `public.confirmation_spends` (primary key = sha256 of the
 * token) BEFORE the executor runs, so of any number of submissions of one
 * token — sequential retries or concurrent ones — exactly one executes.
 *
 * Only the digest is stored (migration 20261013120000). Spent before the
 * write on purpose: a failed write costs the person one more prepare, never a
 * second effect.
 */
export type SpendOutcome =
  | "spent"
  /** Another submission of the same token got there first. */
  | "already_spent"
  /** The ledger table is not on this database yet — fingerprint-only protection. */
  | "ledger_unavailable"
  /** Any other refusal: fail closed, nothing runs. */
  | "error";

type InsertClient = {
  from(table: string): {
    insert(row: Record<string, unknown>): PromiseLike<{ error: { code?: string; message?: string } | null }>;
  };
};

export function confirmationDigest(token: string): string {
  return createHash("sha256").update(`confirmation-spend:v1:${token}`).digest("hex");
}

export async function spendConfirmation(
  supabase: unknown,
  token: string,
  actionId: string,
): Promise<SpendOutcome> {
  const { error } = await (supabase as InsertClient)
    .from("confirmation_spends")
    .insert({ token_digest: confirmationDigest(token), action_id: actionId });
  if (!error) return "spent";
  if (error.code === "23505") return "already_spent";
  // 42P01 = relation missing (Postgres), PGRST205 = not in the schema cache.
  if (error.code === "42P01" || error.code === "PGRST205") {
    console.warn("[confirmation] spend ledger unavailable; fingerprint-only replay protection");
    return "ledger_unavailable";
  }
  console.error("[confirmation] spend failed:", error.code ?? "unknown");
  return "error";
}
