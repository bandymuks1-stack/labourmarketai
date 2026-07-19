"use server";

import "server-only";
import { getLocale } from "next-intl/server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  processJournalEntrySkills,
  type JournalSkillPipelineResult,
} from "@/lib/journal/skill-pipeline";
import { applyWorkerSkillSourceReconcile } from "@/lib/journal/skill-source-apply";
import { normalizeSkillLabel } from "@/lib/skills/candidate-skills";

/**
 * Re-run the canonical skill pipeline for one of the caller's OWN journal
 * entries (P0 Track B). Idempotent by construction — the pipeline's
 * ignore-duplicate upserts + normalized-label metric dedupe make a repeat run
 * safe — so this is the honest recovery path the composer's failure line
 * points at ("Atnaujinti atpažinimą").
 *
 * Owner-scoped: entry loaded under the caller's RLS; superseded / deleted
 * entries are refused (their replacement carries the live text).
 */
export type ReprocessEntrySkillsResult =
  | { ok: true; result: JournalSkillPipelineResult }
  | { ok: false; code: ReprocessEntrySkillsErrorCode };

export type ReprocessEntrySkillsErrorCode =
  | "not_authenticated"
  | "no_worker_profile"
  | "entry_not_found"
  | "entry_superseded"
  | "entry_deleted";

export async function reprocessJournalEntrySkills(
  entryId: string,
): Promise<ReprocessEntrySkillsResult> {
  if (!entryId || typeof entryId !== "string") {
    return { ok: false, code: "entry_not_found" };
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, code: "not_authenticated" };

  const { data: worker } = await supabase
    .from("workers")
    .select("id")
    .eq("profile_id", user.id)
    .maybeSingle();
  if (!worker?.id) return { ok: false, code: "no_worker_profile" };

  const { data: entry } = await supabase
    .from("journal_entries")
    .select(
      "id, worker_id, original_text, original_language, superseded_by, deleted_at",
    )
    .eq("id", entryId)
    .maybeSingle();
  if (!entry || entry.worker_id !== worker.id) {
    return { ok: false, code: "entry_not_found" };
  }
  if (entry.deleted_at) return { ok: false, code: "entry_deleted" };
  if (entry.superseded_by) return { ok: false, code: "entry_superseded" };

  // Locale for revalidation paths: current request locale, falling back to
  // the entry's own stored language, then LT.
  let locale = "lt";
  try {
    locale = await getLocale();
  } catch {
    locale = (entry.original_language as string | null) ?? "lt";
  }

  const result = await processJournalEntrySkills({
    entryId: entry.id,
    text: (entry.original_text as string | null) ?? "",
    locale,
  });
  return { ok: true, result };
}

// ─────────────────────────────────────────────────────────────────────────
// P1 recall repair — one-tap candidate confirm / reject (owner-scoped).
// ─────────────────────────────────────────────────────────────────────────

const SLUG_RE = /^[a-z0-9_-]{1,64}$/;

export type ConfirmCandidateResult =
  | { ok: true; added: boolean }
  | { ok: false; code: ConfirmCandidateErrorCode };

export type ConfirmCandidateErrorCode =
  | "not_authenticated"
  | "no_worker_profile"
  | "entry_not_found"
  | "skill_not_found"
  | "write_failed";

/** Shared owner check: caller's worker row + their own LIVE entry. */
async function ownEntryContext(entryId: string): Promise<
  | {
      ok: true;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      sb: any;
      userId: string;
      workerId: string;
    }
  | { ok: false; code: ConfirmCandidateErrorCode }
> {
  if (!entryId || typeof entryId !== "string") {
    return { ok: false, code: "entry_not_found" };
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, code: "not_authenticated" };

  const { data: worker } = await supabase
    .from("workers")
    .select("id")
    .eq("profile_id", user.id)
    .maybeSingle();
  if (!worker?.id) return { ok: false, code: "no_worker_profile" };

  const { data: entry } = await supabase
    .from("journal_entries")
    .select("id, worker_id, superseded_by, deleted_at")
    .eq("id", entryId)
    .maybeSingle();
  if (
    !entry ||
    entry.worker_id !== worker.id ||
    entry.deleted_at ||
    entry.superseded_by
  ) {
    return { ok: false, code: "entry_not_found" };
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { ok: true, sb: supabase as any, userId: user.id, workerId: worker.id };
}

/**
 * The worker CONFIRMS a pipeline candidate that resolves to a taxonomy slug
 * (kind `fuzzy_skill` or `ambiguous`). Creates the worker_skill honestly —
 * ALWAYS `verified:false`, `source:'self_declared'`, `confidence_bin:'yellow'`
 * (never verified, never the manager-confirmed source) — links it to the entry
 * as evidence and reconciles the evidence tier. For a confirmed AMBIGUOUS
 * candidate, the now-resolved clarification row (the worker's own, RLS-scoped)
 * is removed via `clarificationLabel`.
 */
export async function confirmJournalSkillCandidate(
  entryId: string,
  slug: string,
  opts?: { clarificationLabel?: string },
): Promise<ConfirmCandidateResult> {
  if (typeof slug !== "string" || !SLUG_RE.test(slug)) {
    return { ok: false, code: "skill_not_found" };
  }
  const ctx = await ownEntryContext(entryId);
  if (!ctx.ok) return { ok: false, code: ctx.code };
  const { sb, userId, workerId } = ctx;

  const { data: skill } = await sb
    .from("skills")
    .select("id, slug, is_active")
    .eq("slug", slug)
    .maybeSingle();
  if (!skill?.id || skill.is_active === false) {
    return { ok: false, code: "skill_not_found" };
  }

  const { data: owned } = await sb
    .from("worker_skills")
    .select("skill_id")
    .eq("worker_id", workerId)
    .eq("skill_id", skill.id)
    .maybeSingle();
  const alreadyOwned = Boolean(owned?.skill_id);

  if (!alreadyOwned) {
    const ins = await sb.from("worker_skills").upsert(
      [
        {
          worker_id: workerId,
          skill_id: skill.id,
          verified: false,
          source: "self_declared",
          confidence_bin: "yellow",
        },
      ],
      { onConflict: "worker_id,skill_id", ignoreDuplicates: true },
    );
    if (ins.error) return { ok: false, code: "write_failed" };
  }

  const link = await sb.from("journal_entry_skills").upsert(
    [
      {
        journal_entry_id: entryId,
        worker_id: workerId,
        skill_id: skill.id,
      },
    ],
    { onConflict: "journal_entry_id,skill_id", ignoreDuplicates: true },
  );
  if (link.error) return { ok: false, code: "write_failed" };

  if (opts?.clarificationLabel) {
    // The ambiguity is resolved by the worker's explicit answer — the pending
    // clarification row (their own; RLS-scoped) is no longer open.
    await sb
      .from("skill_candidate_clarifications")
      .delete()
      .eq("profile_id", userId)
      .eq("normalized_label", normalizeSkillLabel(opts.clarificationLabel));
  }

  await applyWorkerSkillSourceReconcile(sb, workerId);
  try {
    revalidatePath("/[locale]/dashboard/journal", "page");
    revalidatePath("/[locale]/dashboard/profile", "page");
  } catch {
    /* freshness hint only */
  }
  return { ok: true, added: !alreadyOwned };
}

export type RejectCandidateResult =
  | { ok: true }
  | { ok: false; code: ConfirmCandidateErrorCode };

/**
 * The worker REJECTS an ambiguous candidate: their own pending clarification
 * row is removed (RLS-scoped delete of the worker's own row — the lane's
 * grants allow it). Nothing was ever added to worker_skills, so there is
 * nothing else to undo.
 */
export async function rejectJournalAmbiguousCandidate(
  label: string,
): Promise<RejectCandidateResult> {
  const clean = typeof label === "string" ? label.trim() : "";
  if (!clean) return { ok: false, code: "write_failed" };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, code: "not_authenticated" };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const res = await (supabase as any)
    .from("skill_candidate_clarifications")
    .delete()
    .eq("profile_id", user.id)
    .eq("normalized_label", normalizeSkillLabel(clean));
  if (res.error) return { ok: false, code: "write_failed" };
  return { ok: true };
}

/**
 * The worker REJECTS a free-text claim candidate on their own entry. The
 * journal metric lane is APPEND-ONLY by design (doctrine §3 — the 0013 grants
 * deliberately exclude update/delete), so the rejection is recorded as an
 * append-only `skill_claim_rejected` marker row (`source:'worker_input'` —
 * it IS the worker's own decision). The pipeline and the Verified CV both
 * exclude labels with a rejection marker, so the claim disappears from every
 * candidate surface without rewriting history.
 */
export async function rejectJournalClaimCandidate(
  entryId: string,
  label: string,
): Promise<RejectCandidateResult> {
  const clean = typeof label === "string" ? label.trim() : "";
  if (!clean || clean.length > 200) return { ok: false, code: "write_failed" };
  const ctx = await ownEntryContext(entryId);
  if (!ctx.ok) return { ok: false, code: ctx.code };
  const { sb } = ctx;

  // Idempotent: an existing rejection marker for this label is a no-op.
  const { data: existing } = await sb
    .from("journal_entry_metrics")
    .select("id, value_text")
    .eq("entry_id", entryId)
    .eq("metric_slug", "skill_claim_rejected");
  const normalized = normalizeSkillLabel(clean);
  const already = ((existing ?? []) as { value_text: string | null }[]).some(
    (r) => normalizeSkillLabel(r.value_text ?? "") === normalized,
  );
  if (already) return { ok: true };

  const ins = await sb.from("journal_entry_metrics").insert([
    {
      entry_id: entryId,
      metric_slug: "skill_claim_rejected",
      source: "worker_input",
      value_text: clean,
    },
  ]);
  if (ins.error) return { ok: false, code: "write_failed" };
  try {
    revalidatePath("/[locale]/dashboard/journal", "page");
  } catch {
    /* freshness hint only */
  }
  return { ok: true };
}
