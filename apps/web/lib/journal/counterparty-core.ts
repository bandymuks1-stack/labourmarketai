import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { emitJournalReviewDecisionNotification } from "@/lib/notifications/event-emitters";
import {
  DECISION_TO_RPC,
  counterpartyNoteProblem,
  decideRefusalKey,
  isCounterpartyDecision,
  isUuid,
  parseQueueRows,
  submitOutcomeKey,
  type CounterpartyDecision,
  type QueueRow,
} from "./counterparty-review-model";

/**
 * THE ONE DOMAIN CORE of the counterparty write path (decision 0018).
 *
 * The web server actions (`counterparty-actions.ts`) and the chat / MCP
 * capabilities (`lib/capabilities/counterparty-review-capabilities.ts`) both
 * call THESE functions - there is no second implementation of the rules.
 * Identity is never an argument: the caller's own session client is passed in
 * and the database re-derives `auth.uid()` inside every SECURITY DEFINER
 * function.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = SupabaseClient<any, any, any>;

const RPC_MISSING = "42883";

export type DecideResult =
  | { ok: true; decision: "approved" | "changes_requested" | "rejected" }
  | { ok: false; code: string };

export type SubmitResult =
  | { ok: true; code: "submitted" | "already_submitted" }
  | { ok: false; code: string };

function failure(error: { code?: string } | null): { ok: false; code: string } {
  return { ok: false, code: error?.code === RPC_MISSING ? "needs_migration" : "error" };
}

/** The caller's own counterparty queue (UNKNOWN = null, never empty). */
export async function readOwnQueueRows(db: Db): Promise<QueueRow[] | null> {
  try {
    const { data, error } = await db.rpc("list_counterparty_review_queue_v1");
    if (error) return null;
    return parseQueueRows(data);
  } catch {
    return null;
  }
}

/** Validate the decision word and its note, without touching the database. */
export function validateDecisionInput(input: {
  entryId: unknown;
  decision: unknown;
  note?: unknown;
}):
  | { ok: true; entryId: string; decision: CounterpartyDecision; note: string }
  | { ok: false; code: string } {
  if (!isUuid(input.entryId)) return { ok: false, code: "error" };
  if (!isCounterpartyDecision(input.decision)) return { ok: false, code: "invalid_decision" };
  const note = typeof input.note === "string" ? input.note : "";
  const problem = counterpartyNoteProblem(input.decision, note);
  if (problem) return { ok: false, code: problem === "required" ? "note_required" : "note_too_long" };
  return { ok: true, entryId: input.entryId, decision: input.decision, note };
}

/**
 * Decide ONE submitted entry as the counterparty. Re-derives the caller's
 * queue first (the entry must be in it), then calls `review_journal_entry`,
 * then tells the worker (best effort). No skill effects: a client acceptance
 * is CLIENT_ACCEPTED, not a skill verification.
 */
export async function decideCounterpartyCore(
  db: Db,
  userId: string,
  input: { entryId: string; decision: CounterpartyDecision; note: string },
): Promise<DecideResult> {
  const queue = await readOwnQueueRows(db);
  if (queue === null) return { ok: false, code: "error" };
  const row = queue.find((r) => r.entryId === input.entryId);
  if (!row) return { ok: false, code: "review_authority_not_established" };

  const rpcDecision = DECISION_TO_RPC[input.decision];
  const note = input.note.trim();
  const { data, error } = await db.rpc("review_journal_entry", {
    p_entry_id: input.entryId,
    p_decision: rpcDecision,
    p_note: note === "" ? null : note,
  });
  if (error) {
    const msg = String(error.message ?? "");
    for (const known of [
      "review_authority_not_established",
      "self_review_not_allowed",
      "entry_superseded",
      "entry_deleted",
      "note_required",
    ]) {
      if (msg.includes(known)) return { ok: false, code: known };
    }
    return failure(error);
  }
  const outcome = String(data);
  if (outcome !== rpcDecision) return { ok: false, code: decideRefusalKey(outcome) };

  try {
    await emitJournalReviewDecisionNotification({
      entryId: input.entryId,
      workerId: row.workerId,
      actorProfileId: userId,
      decision: rpcDecision,
    });
  } catch {
    // never fails the committed decision
  }
  return { ok: true, decision: rpcDecision };
}

/** Explicit SUBMIT FOR REVIEW by the subject (the database resolves/validates the counterparty). */
export async function submitEntryCore(
  db: Db,
  input: { entryId: string; linkId: string | null },
): Promise<SubmitResult> {
  const { data, error } = await db.rpc("submit_journal_entry_for_review_v1", {
    p_entry_id: input.entryId,
    p_link_id: input.linkId,
  });
  if (error) return failure(error);
  const code = submitOutcomeKey(String(data));
  return code === "submitted" || code === "already_submitted"
    ? { ok: true, code }
    : { ok: false, code };
}
