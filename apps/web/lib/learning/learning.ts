"use server";

import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  MANAGER_SETTABLE_STATUSES,
  isTerminalStaleOutcome,
  type LearningMutateResult,
  type LearningPolicyListResult,
  type LearningPolicyRow,
  type ManagerSettableStatus,
  type ReviewItemRow,
  type ReviewQueueListResult,
} from "@/lib/learning/learning-shared";

/**
 * W6 — Human-in-loop learning model (Phase 1) server actions.
 *
 * Honesty / authority invariants:
 *   * These actions read/write learning SIGNALS and review-queue SUGGESTIONS via
 *     the caller's RLS-scoped client. They NEVER write `verified`. The only
 *     confirmation path is `apply_learning_auto_confirmation` (a SECURITY DEFINER
 *     RPC), which reuses the existing confirmation spine and re-checks live
 *     manager authority + the journal_review_enabled gate at fire time.
 *   * Worker can SELECT their own rows (transparency); only an org manager/admin
 *     can review items or set policy — enforced server-side by RLS, mirrored here
 *     by tagged results.
 *
 * HONEST DEGRADATION: the migration is owner-applied (RED). Until applied, the
 * tables/RPC are absent — every function returns `needs-migration` and the UI
 * shows a calm "not available yet" state, never an error and never a fake row.
 */

// PostgREST: table absent → 42P01 (undefined_table) / PGRST205 (not in schema
// cache); function absent → 42883 / PGRST202.
const ABSENT = new Set(["42P01", "42883", "PGRST202", "PGRST204", "PGRST205"]);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(c: SupabaseClient): any {
  return c;
}

function isAbsent(error: { code?: string } | null): boolean {
  return !!error?.code && ABSENT.has(error.code);
}

function mapReviewRow(r: Record<string, unknown>): ReviewItemRow {
  // Joined display fields (left joins — null when the relation is not readable
  // under the caller's RLS; the UI degrades to a neutral fallback, never blank
  // approve buttons).
  const workerRel = r.workers as { profiles?: { full_name?: string | null; email?: string | null } | null } | null;
  const prof = workerRel?.profiles ?? null;
  const skillRel = r.skills as { slug?: string | null } | null;
  return {
    id: String(r.id),
    subjectWorkerId: String(r.subject_worker_id ?? ""),
    subjectWorkerName:
      prof?.full_name ?? (prof?.email ? String(prof.email).split("@")[0] : null),
    subjectSkillId: (r.subject_skill_id as string | null) ?? null,
    subjectSkillSlug: skillRel?.slug ?? null,
    organizationId: String(r.organization_id ?? ""),
    journalEntryId: (r.journal_entry_id as string | null) ?? null,
    suggestionKind: (r.suggestion_kind as ReviewItemRow["suggestionKind"]) ?? "review_skill",
    status: (r.status as ReviewItemRow["status"]) ?? "pending",
    entryStale: (() => {
      const je = r.journal_entries as
        | { superseded_by?: string | null; deleted_at?: string | null }
        | null
        | undefined;
      return Boolean(je && (je.superseded_by != null || je.deleted_at != null));
    })(),
    reviewedBy: (r.reviewed_by as string | null) ?? null,
    reviewedAt: (r.reviewed_at as string | null) ?? null,
    reviewNote: (r.review_note as string | null) ?? null,
    producedConfirmationId: (r.produced_confirmation_id as string | null) ?? null,
    policyId: (r.policy_id as string | null) ?? null,
    createdAt: String(r.created_at ?? ""),
  };
}

/**
 * SERVER-SIDE READ CLEANUP (owner-hold v5 P2-1). Before listing, transition
 * every PENDING queue row whose source journal entry is superseded/deleted to
 * the honest terminal 'superseded' status, via the race-safe SECURITY DEFINER
 * RPC. This is what guarantees a stale item cannot sit `pending` forever:
 *
 *   * it does NOT depend on a UI button (the UI hides controls exactly when an
 *     item is stale, which is what stranded the row in the first place);
 *   * it fires even when the page is opened long AFTER the entry went stale;
 *   * it is IDEMPOTENT — `status = 'pending'` is the idempotency key, so a
 *     second call closes nothing;
 *   * it re-checks live manager/admin authority per row inside the RPC, so a
 *     worker loading their own transparency list closes nothing.
 *
 * Best-effort by design: if the RPC is absent (migration not applied) or the
 * sweep fails, the listing below still renders — the rows simply keep their
 * current status and the UI keeps degrading honestly. Never throws.
 */
async function closeStaleReviewItems(supabase: SupabaseClient): Promise<void> {
  try {
    await asAny(supabase).rpc("close_stale_learning_review_items", {
      p_organization_id: null,
    });
  } catch {
    // Read paths never fail because a cleanup sweep failed.
  }
}

/** Review-queue items the caller is allowed to see (RLS: own-worker, org-manager,
 *  or admin). Newest first. Stale items are closed server-side first, so the
 *  list never renders a permanently-unactionable pending badge. */
export async function listVisibleReviewItems(): Promise<ReviewQueueListResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { kind: "not-authed" };

  // P2-1: close stale rows BEFORE reading, so the snapshot the UI renders is
  // already truthful (no pending badge on an unactionable item).
  await closeStaleReviewItems(supabase);

  const { data, error } = await asAny(supabase)
    .from("learning_review_queue")
    .select(
      "id, subject_worker_id, subject_skill_id, organization_id, journal_entry_id, suggestion_kind, status, reviewed_by, reviewed_at, review_note, produced_confirmation_id, policy_id, created_at, workers(profiles(full_name, email)), skills(slug), journal_entries(superseded_by, deleted_at)",
    )
    .order("created_at", { ascending: false });
  if (error) {
    if (isAbsent(error)) return { kind: "needs-migration" };
    // Any other read failure degrades to an empty list — never a fabricated row.
    return { kind: "ok", rows: [] };
  }
  return { kind: "ok", rows: ((data ?? []) as Record<string, unknown>[]).map(mapReviewRow) };
}

/**
 * Set a review item's status (manager review decision).
 *
 * OWNER-HOLD v5 P2-2: this goes through the SECURITY DEFINER RPC
 * `set_learning_review_item_status`, NOT a direct table update. The RPC locks
 * the queue row and RE-READS the linked journal entry inside the same
 * transaction (FOR KEY SHARE against the supersedes' FOR UPDATE), so:
 *
 *   * the client's render-time `entryStale` snapshot is never trusted — the
 *     entry can go stale between render and click and the decision is still
 *     refused;
 *   * a stale source is closed with the honest terminal 'superseded' status
 *     and reported back as `{ kind: "stale" }` — it is NEVER recorded as an
 *     approval or a rejection;
 *   * authority is re-checked live inside the RPC (admin or org manager),
 *     matching the table's RLS, and the audit fields (reviewed_by /
 *     reviewed_at / review_note) are written on every terminal transition.
 *
 * Only approved/rejected are settable here — 'superseded' is systemic and
 * auto_actioned is produced ONLY by the audited spine RPC. A BEFORE UPDATE
 * guard trigger is the final race-proof backstop underneath all of this.
 */
export async function setReviewItemStatus(
  id: string,
  status: ManagerSettableStatus,
  note?: string | null,
): Promise<LearningMutateResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { kind: "not-authed" };
  if (!id) return { kind: "invalid", field: "id" };
  if (!MANAGER_SETTABLE_STATUSES.includes(status)) return { kind: "invalid", field: "status" };

  const cleanNote = typeof note === "string" ? note.trim().slice(0, 2000) || null : null;
  const { data, error } = await asAny(supabase).rpc("set_learning_review_item_status", {
    p_review_item_id: id,
    p_status: status,
    p_note: cleanNote,
  });
  if (error) {
    if (isAbsent(error)) return { kind: "needs-migration" };
    // The guard trigger refused a decision that raced a supersede after the
    // RPC's own re-read. Report it as the same terminal stale outcome rather
    // than a retryable error — the item is unactionable either way.
    const raw = `${error.message ?? ""}`;
    if (raw.includes("entry_deleted")) return { kind: "stale", outcome: "entry_deleted" };
    if (raw.includes("entry_superseded")) return { kind: "stale", outcome: "entry_superseded" };
    return { kind: "error", message: error.message ?? "unknown" };
  }

  const outcome = typeof data === "string" ? data : "";
  revalidatePath("/dashboard/learning");
  // TERMINAL STALE: the RPC closed the item instead of recording the decision.
  if (isTerminalStaleOutcome(outcome)) return { kind: "stale", outcome };
  if (outcome !== status) {
    // 'not_authorized' | 'not_pending' | 'item_not_found' | 'invalid_status'
    return { kind: "error", message: outcome || "unknown" };
  }
  return { kind: "ok", id, detail: outcome };
}

function mapPolicyRow(r: Record<string, unknown>): LearningPolicyRow {
  return {
    id: String(r.id),
    organizationId: String(r.organization_id ?? ""),
    policyKind: (r.policy_kind as LearningPolicyRow["policyKind"]) ?? "auto_confirm_journal_skill",
    enabled: r.enabled === true,
    scope: (r.scope as Record<string, unknown>) ?? {},
    rule: (r.rule as Record<string, unknown>) ?? {},
    enabledBy: (r.enabled_by as string | null) ?? null,
    enabledAt: (r.enabled_at as string | null) ?? null,
    disabledBy: (r.disabled_by as string | null) ?? null,
    disabledAt: (r.disabled_at as string | null) ?? null,
  };
}

/** Policies the caller can see (RLS: org-manager or admin only). */
export async function listManagedLearningPolicies(): Promise<LearningPolicyListResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { kind: "not-authed" };

  const { data, error } = await asAny(supabase)
    .from("learning_policy_settings")
    .select(
      "id, organization_id, policy_kind, enabled, scope, rule, enabled_by, enabled_at, disabled_by, disabled_at",
    )
    .order("created_at", { ascending: false });
  if (error) {
    if (isAbsent(error)) return { kind: "needs-migration" };
    return { kind: "ok", rows: [] };
  }
  return { kind: "ok", rows: ((data ?? []) as Record<string, unknown>[]).map(mapPolicyRow) };
}

/**
 * Enable/disable the auto-confirmation policy for an organization the caller
 * manages. DEFAULT OFF: a fresh row is created disabled; enabling records
 * enabled_by/enabled_at, disabling records disabled_by/disabled_at. RLS enforces
 * that only an org manager/admin can write. This sets POLICY only — it never
 * confirms anything; confirmation happens later via the audited RPC.
 */
export async function setAutoConfirmPolicy(input: {
  organizationId: string;
  enabled: boolean;
  scope?: Record<string, unknown>;
  rule?: Record<string, unknown>;
}): Promise<LearningMutateResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { kind: "not-authed" };
  if (!input.organizationId) return { kind: "invalid", field: "organizationId" };

  const now = new Date().toISOString();
  const row: Record<string, unknown> = {
    organization_id: input.organizationId,
    policy_kind: "auto_confirm_journal_skill",
    enabled: input.enabled === true,
    scope: input.scope ?? {},
    rule: input.rule ?? {},
    updated_at: now,
    ...(input.enabled
      ? { enabled_by: user.id, enabled_at: now }
      : { disabled_by: user.id, disabled_at: now }),
  };

  const { data, error } = await asAny(supabase)
    .from("learning_policy_settings")
    .upsert(row, { onConflict: "organization_id,policy_kind" })
    .select("id")
    .single();
  if (error) {
    if (isAbsent(error)) return { kind: "needs-migration" };
    return { kind: "error", message: error.message ?? "unknown" };
  }
  revalidatePath("/dashboard/learning");
  return { kind: "ok", id: data?.id as string | undefined };
}

/**
 * Apply the standing auto-confirmation policy to ONE eligible pending review
 * item, via the SECURITY DEFINER RPC. The RPC re-checks live authority, policy
 * enabled state, scope, threshold, and the journal_review_enabled gate, and only
 * then produces a REAL confirmation + audit event (attributed to the live caller,
 * recording the enabling manager + policy). Returns the RPC's tagged status.
 */
export async function applyAutoConfirmation(reviewItemId: string): Promise<LearningMutateResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { kind: "not-authed" };
  if (!reviewItemId) return { kind: "invalid", field: "reviewItemId" };

  const { data, error } = await asAny(supabase).rpc("apply_learning_auto_confirmation", {
    p_review_item_id: reviewItemId,
  });
  if (error) {
    if (isAbsent(error)) return { kind: "needs-migration" };
    return { kind: "error", message: error.message ?? "unknown" };
  }
  revalidatePath("/dashboard/learning");
  // The RPC returns a tagged string (e.g. "auto_confirmed:1", "policy_disabled").
  const outcome = typeof data === "string" ? data : undefined;
  // The spine RPC already closes a stale item itself (20260720150000) — surface
  // it through the SAME terminal channel the decision path uses, so every
  // caller has one stale contract instead of two.
  if (isTerminalStaleOutcome(outcome)) return { kind: "stale", outcome };
  return { kind: "ok", detail: outcome };
}
