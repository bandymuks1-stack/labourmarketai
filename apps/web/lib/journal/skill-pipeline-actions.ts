"use server";

import "server-only";
import { getLocale, getTranslations } from "next-intl/server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  processJournalEntrySkills,
  loadEntryRecognitionInputs,
  ENTRY_MARKER_SLUGS,
  type JournalSkillPipelineResult,
} from "@/lib/journal/skill-pipeline";
import {
  deriveJournalRecognition,
  JOURNAL_PIPELINE_VERSION,
  type JournalRecognitionResult,
} from "@/lib/journal/journal-recognition";
import { applyWorkerSkillSourceReconcile } from "@/lib/journal/skill-source-apply";
import { normalizeSkillLabel } from "@/lib/skills/candidate-skills";
import { normalizeClaimLabel } from "@/lib/profile/skill-claim-extractor";
import { foldText } from "@/lib/structuring/normalize";

/**
 * Universal Journal Recall pipeline (v2) — SERVER TRUST BOUNDARY.
 *
 * Every confirm/reject/name action here:
 *   1. authenticates + verifies the caller OWNS the live entry;
 *   2. RE-DERIVES `deriveJournalRecognition` from the STORED entry text
 *      (never the client's copy);
 *   3. verifies the submitted candidate by MEMBERSHIP in that derivation
 *      AND that the submitted `pipelineVersion` equals
 *      `JOURNAL_PIPELINE_VERSION` — otherwise `candidate_not_found` with
 *      ZERO writes.
 * No client-supplied confidence/kind/slug is ever trusted on its own.
 *
 * Honesty: a confirmed skill is ALWAYS `verified:false`,
 * `source:'self_declared'`, `confidence_bin:'yellow'` — never verified,
 * never the manager-confirmed source. Rejections are entry-scoped
 * append-only markers (`skill_rejected` / `skill_claim_rejected` /
 * `unresolved_dismissed`) — the metric lane is never updated or deleted.
 */

// ─────────────────────────────────────────────────────────────────────────
// Reprocess (idempotent recovery path) — behavior unchanged from Track B.
// ─────────────────────────────────────────────────────────────────────────

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

/**
 * Bounded batch reprocess of the caller's OWN journal history — heals
 * historical entries to the current pipeline version explicitly (the lazy
 * per-page-load heal covers the rest progressively). Never more than 25
 * entries per call; failures are per-entry and never abort the batch.
 */
export type ReprocessHistoryResult =
  | {
      ok: true;
      scanned: number;
      processed: number;
      failed: number;
    }
  | { ok: false; code: "not_authenticated" | "no_worker_profile" };

export async function reprocessOwnJournalHistory(
  limit: number,
): Promise<ReprocessHistoryResult> {
  const cap = Math.max(1, Math.min(25, Math.floor(Number(limit) || 0) || 5));
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any;
  const { data: entries } = await sb
    .from("journal_entries")
    .select(
      "id, original_text, deleted_at, superseded_by, journal_entry_metrics(metric_slug, value_numeric)",
    )
    .eq("worker_id", worker.id)
    .order("created_at", { ascending: false })
    .limit(100);

  const stale = ((entries ?? []) as {
    id: string;
    original_text: string | null;
    deleted_at: string | null;
    superseded_by: string | null;
    journal_entry_metrics:
      | { metric_slug: string; value_numeric: number | null }[]
      | null;
  }[])
    .filter((e) => !e.deleted_at && !e.superseded_by)
    .filter((e) => {
      const latest = Math.max(
        0,
        ...(e.journal_entry_metrics ?? [])
          .filter((m) => m.metric_slug === ENTRY_MARKER_SLUGS.pipelineVersion)
          .map((m) => m.value_numeric ?? 0),
      );
      return latest < JOURNAL_PIPELINE_VERSION;
    })
    .slice(0, cap);

  let processed = 0;
  let failed = 0;
  for (const e of stale) {
    try {
      const res = await processJournalEntrySkills({
        entryId: e.id,
        text: e.original_text ?? "",
        locale: "lt",
        revalidate: false,
      });
      if (res.status === "failed") failed += 1;
      else processed += 1;
    } catch {
      failed += 1;
    }
  }
  return {
    ok: true,
    scanned: (entries ?? []).length,
    processed,
    failed,
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Shared owner + re-derivation context (the trust boundary core).
// ─────────────────────────────────────────────────────────────────────────

const SLUG_RE = /^[a-z0-9_-]{1,64}$/;
const MAX_CLAIM_LABEL = 120;

export type ConfirmCandidateResult =
  | { ok: true; added: boolean }
  | { ok: false; code: ConfirmCandidateErrorCode };

export type ConfirmCandidateErrorCode =
  | "not_authenticated"
  | "no_worker_profile"
  | "entry_not_found"
  | "skill_not_found"
  | "candidate_not_found"
  | "write_failed";

type OwnEntryDerivation = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sb: any;
  userId: string;
  workerId: string;
  entryId: string;
  recognition: JournalRecognitionResult;
};

/** Auth + own-LIVE-entry + server-side re-derivation from the STORED text.
 *  Returns candidate_not_found when the submitted pipelineVersion is stale —
 *  a stale client must re-read before it may act. */
async function ownEntryDerivation(
  entryId: string,
  pipelineVersion: unknown,
): Promise<
  | ({ ok: true } & OwnEntryDerivation)
  | { ok: false; code: ConfirmCandidateErrorCode }
> {
  if (!entryId || typeof entryId !== "string") {
    return { ok: false, code: "entry_not_found" };
  }
  if (pipelineVersion !== JOURNAL_PIPELINE_VERSION) {
    return { ok: false, code: "candidate_not_found" };
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
    .select("id, worker_id, original_text, superseded_by, deleted_at")
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
  const sb = supabase as any;
  const inputs = await loadEntryRecognitionInputs(sb, worker.id, entryId);
  const recognition = deriveJournalRecognition(
    (entry.original_text as string | null) ?? "",
    {
      declaredSlugs: inputs.declaredSlugs,
      entryRejections: inputs.entryRejections,
    },
  );

  return {
    ok: true,
    sb,
    userId: user.id,
    workerId: worker.id,
    entryId,
    recognition,
  };
}

/** The honest self-declared add + evidence link (shared by every confirm). */
async function addSkillAndLink(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sb: any,
  workerId: string,
  entryId: string,
  slug: string,
): Promise<{ ok: true; added: boolean } | { ok: false; code: "skill_not_found" | "write_failed" }> {
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

  await applyWorkerSkillSourceReconcile(sb, workerId);
  try {
    revalidatePath("/[locale]/dashboard/journal", "page");
    revalidatePath("/[locale]/dashboard/profile", "page");
  } catch {
    /* freshness hint only */
  }
  return { ok: true, added: !alreadyOwned };
}

/** Append-only entry marker (idempotent by value). */
async function appendEntryMarker(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sb: any,
  entryId: string,
  metricSlug: string,
  valueText: string,
  valueNumeric?: number,
): Promise<boolean> {
  const { data: existing } = await sb
    .from("journal_entry_metrics")
    .select("id, value_text")
    .eq("entry_id", entryId)
    .eq("metric_slug", metricSlug);
  const normalized = normalizeClaimLabel(valueText);
  const already = ((existing ?? []) as { value_text: string | null }[]).some(
    (r) => normalizeClaimLabel(r.value_text ?? "") === normalized,
  );
  if (already) return true;
  const ins = await sb.from("journal_entry_metrics").insert([
    {
      entry_id: entryId,
      metric_slug: metricSlug,
      source: "worker_input",
      value_text: valueText,
      ...(typeof valueNumeric === "number"
        ? { value_numeric: valueNumeric }
        : {}),
    },
  ]);
  return !ins.error;
}

// ─────────────────────────────────────────────────────────────────────────
// Confirm actions.
// ─────────────────────────────────────────────────────────────────────────

/**
 * The worker CONFIRMS a FUZZY skill candidate. Membership: `slug` must be a
 * `fuzzy_skill` candidate of THIS entry's server-side derivation.
 */
export async function confirmJournalSkillCandidate(
  entryId: string,
  slug: string,
  pipelineVersion: number,
): Promise<ConfirmCandidateResult> {
  if (typeof slug !== "string" || !SLUG_RE.test(slug)) {
    return { ok: false, code: "skill_not_found" };
  }
  const ctx = await ownEntryDerivation(entryId, pipelineVersion);
  if (!ctx.ok) return { ok: false, code: ctx.code };

  const member = ctx.recognition.candidates.some(
    (c) => c.kind === "fuzzy_skill" && c.slug === slug,
  );
  if (!member) return { ok: false, code: "candidate_not_found" };

  return addSkillAndLink(ctx.sb, ctx.workerId, ctx.entryId, slug);
}

/**
 * The worker RESOLVES an ambiguous candidate by picking ONE of its curated
 * choices. Membership: the candidate label must be an `ambiguous` candidate
 * of THIS entry AND `chosenSlug` must be one of ITS `choices`.
 */
export async function confirmJournalAmbiguousChoice(
  entryId: string,
  candidateLabel: string,
  chosenSlug: string,
  pipelineVersion: number,
): Promise<ConfirmCandidateResult> {
  const label = typeof candidateLabel === "string" ? candidateLabel.trim() : "";
  if (!label || typeof chosenSlug !== "string" || !SLUG_RE.test(chosenSlug)) {
    return { ok: false, code: "candidate_not_found" };
  }
  const ctx = await ownEntryDerivation(entryId, pipelineVersion);
  if (!ctx.ok) return { ok: false, code: ctx.code };

  const candidate = ctx.recognition.candidates.find(
    (c) =>
      c.kind === "ambiguous" &&
      normalizeClaimLabel(c.label) === normalizeClaimLabel(label),
  );
  if (!candidate || !candidate.choices?.some((ch) => ch.slug === chosenSlug)) {
    return { ok: false, code: "candidate_not_found" };
  }

  const res = await addSkillAndLink(
    ctx.sb,
    ctx.workerId,
    ctx.entryId,
    chosenSlug,
  );
  if (!res.ok) return res;

  // P2 integrity fix: persist the worker's DECISION as an entry-scoped
  // append-only marker so reprocess / restore / pipeline upgrades never
  // re-offer the same ambiguity on THIS entry. value = normalized
  // candidate label => chosen slug; value_numeric = pipeline version at
  // decision time (provenance: worker_input on their own entry). A
  // decision here can never affect another entry — the marker lives in
  // this entry's metrics only. Idempotent: skip when already recorded.
  const normalizedCandidate = normalizeClaimLabel(candidate.label);
  const already = ctx.recognition.recognizedSkills.some(
    (r) => r.via === "resolved" && r.slug === chosenSlug,
  );
  if (!already) {
    const marked = await appendEntryMarker(
      ctx.sb,
      ctx.entryId,
      ENTRY_MARKER_SLUGS.ambiguousResolved,
      `${normalizedCandidate}=>${chosenSlug}`,
      JOURNAL_PIPELINE_VERSION,
    );
    if (!marked) return { ok: false, code: "write_failed" };
  }

  // The ambiguity is resolved by the worker's explicit answer — the pending
  // clarification row (their own; RLS-scoped) is no longer open.
  await ctx.sb
    .from("skill_candidate_clarifications")
    .delete()
    .eq("profile_id", ctx.userId)
    .eq("normalized_label", normalizeSkillLabel(candidate.label));

  return res;
}

// ─────────────────────────────────────────────────────────────────────────
// Reject actions — entry-scoped append-only markers, still visible.
// ─────────────────────────────────────────────────────────────────────────

export type RejectCandidateResult =
  | { ok: true }
  | { ok: false; code: ConfirmCandidateErrorCode };

/**
 * The worker REJECTS a taxonomy-slug signal (fuzzy candidate, recognised
 * skill or an ambiguous choice) on THIS entry. Recorded as an append-only
 * `skill_rejected` marker — derivation keeps showing it as rejected (visible,
 * never silently gone) and the pipeline leaves no further trace for it.
 */
export async function rejectJournalSkillCandidate(
  entryId: string,
  slug: string,
  pipelineVersion: number,
): Promise<RejectCandidateResult> {
  if (typeof slug !== "string" || !SLUG_RE.test(slug)) {
    return { ok: false, code: "candidate_not_found" };
  }
  const ctx = await ownEntryDerivation(entryId, pipelineVersion);
  if (!ctx.ok) return { ok: false, code: ctx.code };

  const member =
    ctx.recognition.recognizedSkills.some((r) => r.slug === slug) ||
    ctx.recognition.candidates.some(
      (c) =>
        (c.kind === "fuzzy_skill" && c.slug === slug) ||
        (c.kind === "ambiguous" &&
          (c.choices ?? []).some((ch) => ch.slug === slug)),
    );
  if (!member) return { ok: false, code: "candidate_not_found" };

  const ok = await appendEntryMarker(
    ctx.sb,
    ctx.entryId,
    ENTRY_MARKER_SLUGS.skillRejected,
    slug,
  );
  if (!ok) return { ok: false, code: "write_failed" };
  try {
    revalidatePath("/[locale]/dashboard/journal", "page");
  } catch {
    /* freshness hint only */
  }
  return { ok: true };
}

/**
 * The worker REJECTS an ambiguous candidate outright ("nė viena reikšmė").
 * Entry-scoped `skill_claim_rejected` marker (append-only) + the pending
 * clarification row (their own) is removed. Nothing was ever added to
 * worker_skills, so there is nothing else to undo.
 */
export async function rejectJournalAmbiguousCandidate(
  entryId: string,
  label: string,
  pipelineVersion: number,
): Promise<RejectCandidateResult> {
  const clean = typeof label === "string" ? label.trim() : "";
  if (!clean) return { ok: false, code: "candidate_not_found" };
  const ctx = await ownEntryDerivation(entryId, pipelineVersion);
  if (!ctx.ok) return { ok: false, code: ctx.code };

  const candidate = ctx.recognition.candidates.find(
    (c) =>
      c.kind === "ambiguous" &&
      normalizeClaimLabel(c.label) === normalizeClaimLabel(clean),
  );
  if (!candidate) return { ok: false, code: "candidate_not_found" };

  const ok = await appendEntryMarker(
    ctx.sb,
    ctx.entryId,
    ENTRY_MARKER_SLUGS.claimRejected,
    candidate.label,
  );
  if (!ok) return { ok: false, code: "write_failed" };

  await ctx.sb
    .from("skill_candidate_clarifications")
    .delete()
    .eq("profile_id", ctx.userId)
    .eq("normalized_label", normalizeSkillLabel(candidate.label));
  return { ok: true };
}

/**
 * The worker REJECTS a free-text claim candidate on their own entry. The
 * journal metric lane is APPEND-ONLY by design (doctrine §3 — the 0013 grants
 * deliberately exclude update/delete), so the rejection is recorded as an
 * append-only `skill_claim_rejected` marker row (`source:'worker_input'` —
 * it IS the worker's own decision). Rejections are ENTRY-scoped: the same
 * label claimed on another entry still surfaces there and on the CV.
 */
export async function rejectJournalClaimCandidate(
  entryId: string,
  label: string,
  pipelineVersion: number,
): Promise<RejectCandidateResult> {
  const clean = typeof label === "string" ? label.trim() : "";
  if (!clean || clean.length > 200) {
    return { ok: false, code: "candidate_not_found" };
  }
  const ctx = await ownEntryDerivation(entryId, pipelineVersion);
  if (!ctx.ok) return { ok: false, code: ctx.code };

  const member = ctx.recognition.claims.some(
    (c) => c.normalizedLabel === normalizeClaimLabel(clean),
  );
  if (!member) return { ok: false, code: "candidate_not_found" };

  const ok = await appendEntryMarker(
    ctx.sb,
    ctx.entryId,
    ENTRY_MARKER_SLUGS.claimRejected,
    clean,
  );
  if (!ok) return { ok: false, code: "write_failed" };
  try {
    revalidatePath("/[locale]/dashboard/journal", "page");
  } catch {
    /* freshness hint only */
  }
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────────
// Unresolved-fragment actions — the worker names what the lexicon missed.
// ─────────────────────────────────────────────────────────────────────────

export type NameUnresolvedChoice =
  | { type: "skill"; slug: string }
  | { type: "claim"; label: string };

/**
 * The worker NAMES an unresolved fragment: either as an existing taxonomy
 * skill (validated active) or as a free-text capability claim (≤120 chars,
 * saved to profile claims + a provenance `skill_claim` metric on the entry).
 * Membership: the fragment (by normalized text) must be an unresolved
 * fragment of THIS entry's derivation.
 */
export async function nameUnresolvedFragment(
  entryId: string,
  fragmentNormalized: string,
  chosen: NameUnresolvedChoice,
  pipelineVersion: number,
): Promise<ConfirmCandidateResult> {
  const norm =
    typeof fragmentNormalized === "string" ? fragmentNormalized.trim() : "";
  if (!norm) return { ok: false, code: "candidate_not_found" };
  const ctx = await ownEntryDerivation(entryId, pipelineVersion);
  if (!ctx.ok) return { ok: false, code: ctx.code };

  const fragment = ctx.recognition.unresolvedFragments.find(
    (u) => normalizeClaimLabel(u.normalized) === normalizeClaimLabel(norm),
  );
  if (!fragment) return { ok: false, code: "candidate_not_found" };

  if (chosen?.type === "skill") {
    if (typeof chosen.slug !== "string" || !SLUG_RE.test(chosen.slug)) {
      return { ok: false, code: "skill_not_found" };
    }
    const res = await addSkillAndLink(
      ctx.sb,
      ctx.workerId,
      ctx.entryId,
      chosen.slug,
    );
    if (!res.ok) return res;
    // Naming resolves the fragment — record that (append-only) so reprocess
    // stops re-inserting an unresolved row for it.
    await appendEntryMarker(
      ctx.sb,
      ctx.entryId,
      ENTRY_MARKER_SLUGS.unresolvedDismissed,
      fragment.normalized,
    );
    return res;
  }

  if (chosen?.type === "claim") {
    const label = typeof chosen.label === "string" ? chosen.label.trim() : "";
    if (!label || label.length > MAX_CLAIM_LABEL) {
      return { ok: false, code: "candidate_not_found" };
    }
    // Profile claim (self-declared lane; UNIQUE(profile_id, normalized_label)).
    const claimIns = await ctx.sb.from("profile_skill_claims").upsert(
      [
        {
          profile_id: ctx.userId,
          label,
          normalized_label: normalizeClaimLabel(label),
        },
      ],
      { onConflict: "profile_id,normalized_label", ignoreDuplicates: true },
    );
    if (claimIns.error) return { ok: false, code: "write_failed" };
    // Provenance on the entry itself (append-only skill_claim metric).
    const marked = await appendEntryMarker(
      ctx.sb,
      ctx.entryId,
      ENTRY_MARKER_SLUGS.claim,
      label,
    );
    if (!marked) return { ok: false, code: "write_failed" };
    await appendEntryMarker(
      ctx.sb,
      ctx.entryId,
      ENTRY_MARKER_SLUGS.unresolvedDismissed,
      fragment.normalized,
    );
    try {
      revalidatePath("/[locale]/dashboard/journal", "page");
      revalidatePath("/[locale]/dashboard/profile", "page");
    } catch {
      /* freshness hint only */
    }
    return { ok: true, added: true };
  }

  return { ok: false, code: "candidate_not_found" };
}

/**
 * The worker DISMISSES an unresolved fragment ("Praleisti"). Append-only
 * `unresolved_dismissed` marker — the fragment stays in the derivation
 * result (honest), but the pipeline stops re-inserting rows for it.
 */
export async function dismissUnresolvedFragment(
  entryId: string,
  fragmentNormalized: string,
  pipelineVersion: number,
): Promise<RejectCandidateResult> {
  const norm =
    typeof fragmentNormalized === "string" ? fragmentNormalized.trim() : "";
  if (!norm) return { ok: false, code: "candidate_not_found" };
  const ctx = await ownEntryDerivation(entryId, pipelineVersion);
  if (!ctx.ok) return { ok: false, code: ctx.code };

  const fragment = ctx.recognition.unresolvedFragments.find(
    (u) => normalizeClaimLabel(u.normalized) === normalizeClaimLabel(norm),
  );
  if (!fragment) return { ok: false, code: "candidate_not_found" };

  const ok = await appendEntryMarker(
    ctx.sb,
    ctx.entryId,
    ENTRY_MARKER_SLUGS.unresolvedDismissed,
    fragment.normalized,
  );
  if (!ok) return { ok: false, code: "write_failed" };
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────────
// Minimal taxonomy quick-search for the unresolved-fragment naming UI.
// ─────────────────────────────────────────────────────────────────────────

export type TaxonomySkillHit = { slug: string; label: string };

/**
 * Top-10 active taxonomy skills matching `q` (folded substring over the
 * locale's skill names + slugs). Read-only; auth-gated like every action.
 */
export async function searchTaxonomySkills(
  q: string,
): Promise<TaxonomySkillHit[]> {
  const query = typeof q === "string" ? foldText(q.trim()) : "";
  if (query.length < 2) return [];
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data: rows } = await supabase
    .from("skills")
    .select("slug, is_active")
    .limit(1000);
  const slugs = (rows ?? [])
    .filter((r) => r.is_active !== false && typeof r.slug === "string")
    .map((r) => r.slug as string);

  let tSkill: ((slug: string) => string) | null = null;
  try {
    const t = await getTranslations("skillNames");
    tSkill = (slug: string) => {
      try {
        const v = t(slug);
        return v && v !== `skillNames.${slug}` ? v : slug;
      } catch {
        return slug;
      }
    };
  } catch {
    tSkill = (slug: string) => slug;
  }

  const hits: TaxonomySkillHit[] = [];
  for (const slug of slugs) {
    const label = tSkill(slug);
    if (
      foldText(label).includes(query) ||
      foldText(slug.replace(/[-_]+/g, " ")).includes(query)
    ) {
      hits.push({ slug, label });
    }
  }
  hits.sort((a, b) => a.label.localeCompare(b.label));
  return hits.slice(0, 10);
}
