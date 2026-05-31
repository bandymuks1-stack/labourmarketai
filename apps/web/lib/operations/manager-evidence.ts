import { createClient } from "@/lib/supabase/server";

/**
 * Manager / reviewer evidence — computed, read-only, from existing records.
 *
 * Every review action (approve / reject / request-changes) is appended as one
 * row in `journal_entry_confirmations` by the `review_journal_entry` RPC
 * (migration 0034), carrying `confirmer_id`, `confirmer_role` and a
 * `confirmation_scope.action` of `confirm` | `reject` | `request_changes`.
 *
 * Reading the caller's own rows (RLS-scoped: `confirmer_id = auth.uid()`) lets
 * us show that a manager's leadership activity is *evidenced by system
 * records* — NOT externally verified. This is "system-evidenced activity",
 * never "verified manager". No schema, no storage, no AI.
 */
export type ManagerEvidence = {
  /** Distinct journal entries this manager has acted on. */
  entriesReviewed: number;
  /** Total review actions recorded (rows). */
  reviewActions: number;
  /** Approvals / confirmations (action = confirm). */
  confirmations: number;
  /** Corrections requested (action = request_changes). */
  correctionsRequested: number;
  /** Rejections (action = reject). */
  rejections: number;
  /** ISO timestamp of the most recent recorded action, if any. */
  lastActivity: string | null;
};

type ConfirmationRow = {
  entry_id: string | null;
  confirmation_scope: { action?: string } | null;
  created_at: string;
};

export async function getManagerEvidence(): Promise<ManagerEvidence | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from("journal_entry_confirmations")
    .select("entry_id, confirmation_scope, created_at")
    .eq("confirmer_id", user.id);

  if (error || !Array.isArray(data) || data.length === 0) return null;

  const entries = new Set<string>();
  let confirmations = 0;
  let correctionsRequested = 0;
  let rejections = 0;
  let lastActivity: string | null = null;

  for (const raw of data as ConfirmationRow[]) {
    if (raw.entry_id) entries.add(raw.entry_id);
    const action = raw.confirmation_scope?.action;
    if (action === "confirm") confirmations += 1;
    else if (action === "request_changes") correctionsRequested += 1;
    else if (action === "reject") rejections += 1;
    if (!lastActivity || raw.created_at > lastActivity) lastActivity = raw.created_at;
  }

  return {
    entriesReviewed: entries.size,
    reviewActions: data.length,
    confirmations,
    correctionsRequested,
    rejections,
    lastActivity,
  };
}
