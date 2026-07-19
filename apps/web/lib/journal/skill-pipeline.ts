import "server-only";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  deriveJournalRecognition,
  emptyJournalRecognition,
  summarizeJournalPipelineResult,
  JOURNAL_PIPELINE_VERSION,
  type JournalRecognitionResult,
  type JournalEntryRejections,
} from "@/lib/journal/journal-recognition";
import { normalizeClaimLabel } from "@/lib/profile/skill-claim-extractor";
import { normalizeSkillLabel } from "@/lib/skills/candidate-skills";
import { applyWorkerSkillSourceReconcile } from "@/lib/journal/skill-source-apply";

/**
 * Canonical server-side journal → skill pipeline (Universal Journal Recall,
 * pipeline v2).
 *
 * The UNIVERSAL fragment-based flow: the entry text is derived ONCE through
 * `deriveJournalRecognition` (pure, fragment-per-fragment, zero silent loss)
 * and this module ONLY persists what the derivation object says — it invents
 * nothing of its own. All writes run under the CALLER'S OWN RLS (never the
 * admin client):
 *   1. loads the entry's per-worker declared skills + per-entry rejection
 *      markers (append-only journal_entry_metrics rows);
 *   2. derives the recognition result (fragments → recognized / candidates /
 *      claims / unresolved / rejected + coverage);
 *   3. ADDS worker_skills rows for recognised UNDECLARED active skills —
 *      always `verified:false`, `source:'self_declared'`,
 *      `confidence_bin:'yellow'`;
 *   4. links recognised skills to the entry as evidence (idempotent);
 *   5. persists ambiguous candidates via the EXISTING clarification lane
 *      (`skill_candidate_clarifications`) — NEVER worker_skills;
 *   6. persists claims as `skill_claim` metric rows with provenance;
 *   7. persists unresolved fragments as `unresolved_fragment` metric rows
 *      (append-only, deduped by normalized text; dismissal = an
 *      `unresolved_dismissed` marker) — no meaningful fragment can vanish;
 *   8. stamps the entry with a `pipeline_version` metric (latest-wins read);
 *   9. recomputes the worker-side evidence tier;
 *  10. returns the FULL recognition object + persisted deltas; every legacy
 *      count is DERIVED from the lists via `summarizeJournalPipelineResult`.
 *
 * Honesty rules (hard, guarded by lib/guards/journal-pipeline-canonical.test.ts):
 *   • NEVER marks a skill verified and NEVER writes the manager-confirmed
 *     source — verification stays the separate owner-gated manager-confirm flow;
 *   • fuzzy recognitions of UNDECLARED skills are never auto-added — they are
 *     visible confirmable candidates;
 *   • server logs carry counts + a trace id ONLY — never the entry text or
 *     claim labels.
 */

/** A recognition that needs the WORKER's word before it becomes anything —
 *  visible and confirmable, never silently dropped. */
export type JournalPipelineCandidate = {
  kind: "fuzzy_skill" | "ambiguous" | "claim";
  /** Canonical label (slug for fuzzy_skill — the UI localizes via `slug`). */
  label: string;
  /** Taxonomy slug the candidate resolves to when the worker confirms it. */
  slug?: string;
  /** Why it is only a candidate (matched word / ambiguity explanation). */
  reason?: string;
  /** Ambiguous candidates: the curated readings the worker picks from. */
  choices?: { slug: string; label: string }[];
  /** Fragment provenance (ids from the recognition result). */
  fragmentIds?: string[];
};

export type JournalPipelineRejected = {
  label: string;
  reason: "user_rejected" | "inactive_skill";
};

export type JournalSkillPipelineResult = {
  status: "completed" | "partial" | "failed";
  /** Recognised taxonomy skills that resolved to active rows (derived). */
  detected: number;
  /** NEW worker_skills rows created this run (derived from addedSkills). */
  added: number;
  /** Previously-declared skills that gained a NEW link (derived). */
  strengthened: number;
  /** Links that already existed — idempotent retry (derived). */
  alreadyLinked: number;
  /** Candidates + unresolved fragments awaiting the worker (derived). */
  reviewNeeded: number;
  /** Free-text capability labels persisted with provenance (derived). */
  claimsSaved: number;
  /** added + strengthened + claimsSaved > 0 (derived). */
  cvUpdated: boolean;
  /** Non-secret hex id, also stamped on server logs. */
  trace: string;
  // ── Lists — the source of truth the counts above are derived from ──────
  /** Slugs of the NEW worker_skills rows created this run. */
  addedSkills: { slug: string }[];
  /** Slugs of already-declared skills that gained a new evidence link. */
  strengthenedSkills: { slug: string }[];
  /** Slugs whose evidence link already existed (idempotent retry). */
  alreadyLinkedSkills: { slug: string }[];
  /** Claim labels persisted as skill_claim metrics THIS run. */
  claimsSavedLabels: string[];
  /** Confirmable candidates (fuzzy / ambiguous / claim) — visible, one-tap. */
  candidates: JournalPipelineCandidate[];
  /** Signals that did NOT land, with the honest reason. */
  rejected: JournalPipelineRejected[];
  /** The FULL canonical derivation (fragments, outcomes, coverage). */
  recognition: JournalRecognitionResult;
};

/** Slug-shaped guard for exclusion lists coming from the client. */
const SLUG_RE = /^[a-z0-9_-]{1,64}$/i;
/** Safety cap on skill_claim rows persisted per run (mirrors profile claims). */
const MAX_CLAIMS_PER_RUN = 12;
/** Safety cap on unresolved_fragment rows persisted per run. */
const MAX_UNRESOLVED_PER_RUN = 12;

/** Entry-scoped marker/metric slugs the pipeline reads and appends. */
export const ENTRY_MARKER_SLUGS = {
  skillRejected: "skill_rejected",
  claimRejected: "skill_claim_rejected",
  claim: "skill_claim",
  unresolvedFragment: "unresolved_fragment",
  unresolvedDismissed: "unresolved_dismissed",
  pipelineVersion: "pipeline_version",
  /** Worker's ambiguity decision (P2 integrity fix): entry-scoped,
   *  append-only. value_text = `<normalized candidate label>=><chosen slug>`,
   *  value_numeric = pipeline version at decision time, source =
   *  worker_input (the worker's own decision on their own entry). The
   *  derivation reads it so a resolved ambiguity is never re-offered on
   *  reprocess/restore/upgrade — and a decision on one entry can never
   *  leak into another (it lives in that entry's metrics only). */
  ambiguousResolved: "ambiguous_resolved",
} as const;

/** Parse an ambiguous_resolved marker value into [normalizedLabel, slug]. */
export function parseAmbiguousResolvedMarker(
  valueText: string,
): { normalizedLabel: string; slug: string } | null {
  const idx = valueText.indexOf("=>");
  if (idx <= 0) return null;
  const normalizedLabel = valueText.slice(0, idx).trim();
  const slug = valueText.slice(idx + 2).trim();
  if (!normalizedLabel || !slug) return null;
  return { normalizedLabel, slug };
}

function newTrace(): string {
  return randomBytes(6).toString("hex");
}

function zeroResult(
  trace: string,
  status: JournalSkillPipelineResult["status"],
): JournalSkillPipelineResult {
  return {
    status,
    detected: 0,
    added: 0,
    strengthened: 0,
    alreadyLinked: 0,
    reviewNeeded: 0,
    claimsSaved: 0,
    cvUpdated: false,
    trace,
    addedSkills: [],
    strengthenedSkills: [],
    alreadyLinkedSkills: [],
    claimsSavedLabels: [],
    candidates: [],
    rejected: [],
    recognition: emptyJournalRecognition(),
  };
}

/** Shared fallback for callers that must return a result even when the
 *  pipeline itself threw before producing one (a throw must never fail the
 *  underlying journal save). */
export function failedPipelineResult(): JournalSkillPipelineResult {
  return zeroResult(newTrace(), "failed");
}

function logError(trace: string, step: string, error: unknown): void {
  // Counts + codes only — NEVER the entry text or claim labels (§4 privacy).
  const e = error as { code?: string; message?: string } | null;
  console.error("[journal-pipeline] step failed", {
    trace,
    step,
    code: e?.code ?? null,
    message: e?.message ?? String(error ?? "unknown"),
  });
}

export type EntryRecognitionInputs = {
  declaredSlugs: ReadonlySet<string>;
  /** slug → worker's declared skill row id (for links). */
  declaredIdBySlug: ReadonlyMap<string, string>;
  entryRejections: JournalEntryRejections;
  /** Normalized labels already saved as skill_claim metrics on this entry. */
  existingClaimSet: ReadonlySet<string>;
  /** Normalized texts already saved as unresolved_fragment rows. */
  existingUnresolvedSet: ReadonlySet<string>;
  /** Normalized texts the worker dismissed (unresolved_dismissed markers). */
  dismissedUnresolvedSet: ReadonlySet<string>;
  /** Worker ambiguity decisions on THIS entry: normalized candidate label →
   *  chosen slug (ambiguous_resolved markers, P2 integrity fix). */
  entryResolutions: ReadonlyMap<string, string>;
  /** Latest pipeline_version metric on the entry (0 when absent). */
  latestPipelineVersion: number;
};

/**
 * Shared server-side reads BEHIND the derivation: the worker's declared
 * skills + this entry's append-only markers. Used by the pipeline AND by the
 * confirm/reject trust boundary (both must consult the SAME entry-scoped
 * rejections — doctrine: entry-scoped, never global).
 */
export async function loadEntryRecognitionInputs(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sb: any,
  workerId: string,
  entryId: string,
): Promise<EntryRecognitionInputs | null> {
  // P1 integrity (independent-review should-fix): a FAILED input read is
  // fatal, never silently-empty. Empty rejections/claims/resolutions would
  // resurrect rejected skills, duplicate append-only rows and stamp the
  // version over a run that never saw the entry's real markers — so both
  // consumers treat `null` as pipeline failure (entry stays stale).
  const [declaredRes, metricsRes] = await Promise.all([
    sb
      .from("worker_skills")
      .select("skill_id, skills(slug)")
      .eq("worker_id", workerId),
    sb
      .from("journal_entry_metrics")
      .select("metric_slug, value_text, value_numeric")
      .eq("entry_id", entryId)
      .in("metric_slug", [
        ENTRY_MARKER_SLUGS.skillRejected,
        ENTRY_MARKER_SLUGS.claimRejected,
        ENTRY_MARKER_SLUGS.claim,
        ENTRY_MARKER_SLUGS.unresolvedFragment,
        ENTRY_MARKER_SLUGS.unresolvedDismissed,
        ENTRY_MARKER_SLUGS.ambiguousResolved,
        ENTRY_MARKER_SLUGS.pipelineVersion,
      ]),
  ]);
  if (declaredRes.error || metricsRes.error) return null;

  const declaredSlugs = new Set<string>();
  const declaredIdBySlug = new Map<string, string>();
  for (const r of (declaredRes.data ?? []) as {
    skill_id: string | null;
    skills: { slug: string | null } | null;
  }[]) {
    const slug = r.skills?.slug;
    if (slug && r.skill_id) {
      declaredSlugs.add(slug);
      declaredIdBySlug.set(slug, r.skill_id);
    }
  }

  const rejectedSlugs = new Set<string>();
  const rejectedClaims = new Set<string>();
  const existingClaimSet = new Set<string>();
  const existingUnresolvedSet = new Set<string>();
  const dismissedUnresolvedSet = new Set<string>();
  const entryResolutions = new Map<string, string>();
  let latestPipelineVersion = 0;
  for (const r of (metricsRes.data ?? []) as {
    metric_slug: string | null;
    value_text: string | null;
    value_numeric: number | null;
  }[]) {
    switch (r.metric_slug) {
      case ENTRY_MARKER_SLUGS.skillRejected:
        if (r.value_text) rejectedSlugs.add(r.value_text.trim());
        break;
      case ENTRY_MARKER_SLUGS.claimRejected:
        if (r.value_text) rejectedClaims.add(normalizeClaimLabel(r.value_text));
        break;
      case ENTRY_MARKER_SLUGS.claim:
        if (r.value_text) existingClaimSet.add(normalizeClaimLabel(r.value_text));
        break;
      case ENTRY_MARKER_SLUGS.unresolvedFragment:
        if (r.value_text)
          existingUnresolvedSet.add(normalizeClaimLabel(r.value_text));
        break;
      case ENTRY_MARKER_SLUGS.unresolvedDismissed:
        if (r.value_text)
          dismissedUnresolvedSet.add(normalizeClaimLabel(r.value_text));
        break;
      case ENTRY_MARKER_SLUGS.ambiguousResolved: {
        const parsed = r.value_text
          ? parseAmbiguousResolvedMarker(r.value_text)
          : null;
        if (parsed) {
          entryResolutions.set(
            normalizeClaimLabel(parsed.normalizedLabel),
            parsed.slug,
          );
        }
        break;
      }
      case ENTRY_MARKER_SLUGS.pipelineVersion:
        if (
          typeof r.value_numeric === "number" &&
          r.value_numeric > latestPipelineVersion
        ) {
          latestPipelineVersion = r.value_numeric;
        }
        break;
    }
  }

  return {
    declaredSlugs,
    declaredIdBySlug,
    entryRejections: { slugs: rejectedSlugs, claimLabels: rejectedClaims },
    existingClaimSet,
    existingUnresolvedSet,
    dismissedUnresolvedSet,
    entryResolutions,
    latestPipelineVersion,
  };
}

export async function processJournalEntrySkills(opts: {
  entryId: string;
  text: string;
  locale: string;
  excludeSlugs?: readonly string[];
  /** default true */
  revalidate?: boolean;
}): Promise<JournalSkillPipelineResult> {
  const trace = newTrace();
  const started = Date.now();
  const { entryId, text } = opts;
  const locale = /^[a-z]{2}(-[a-zA-Z]{2})?$/.test(opts.locale)
    ? opts.locale
    : "lt";

  let writeFailures = 0;
  let writeSuccesses = 0;

  let addedSkills: { slug: string }[] = [];
  let strengthenedSkills: { slug: string }[] = [];
  let alreadyLinkedSkills: { slug: string }[] = [];
  let claimsSavedLabels: string[] = [];

  try {
    // ── 1. Auth + ownership ──────────────────────────────────────────────
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return zeroResult(trace, "failed");

    const { data: worker } = await supabase
      .from("workers")
      .select("id")
      .eq("profile_id", user.id)
      .maybeSingle();
    if (!worker?.id) return zeroResult(trace, "failed");

    const { data: entry } = await supabase
      .from("journal_entries")
      .select("id, worker_id")
      .eq("id", entryId)
      .maybeSingle();
    if (!entry || entry.worker_id !== worker.id) {
      return zeroResult(trace, "failed");
    }

    // The link/claim tables are not in the generated Supabase types yet —
    // route through `any` (RLS still enforces ownership at the DB layer).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = supabase as any;

    // ── 2. Declared skills + entry-scoped markers (append-only lane) ─────
    const inputs = await loadEntryRecognitionInputs(sb, worker.id, entryId);
    if (!inputs) {
      // Failed input read = failed run (no stamp, entry stays stale) —
      // never proceed on silently-empty markers.
      logError(trace, "load_inputs", { code: "input_read_failed" });
      return zeroResult(trace, "failed");
    }

    // Save-time exclusions (client review step) become durable entry-scoped
    // skill_rejected markers, so a reprocess keeps honouring them.
    const excluded = [
      ...new Set(
        (opts.excludeSlugs ?? []).filter(
          (s) => typeof s === "string" && SLUG_RE.test(s),
        ),
      ),
    ];
    const rejectedSlugUnion = new Set<string>([
      ...inputs.entryRejections.slugs,
      ...excluded,
    ]);
    const newRejectionMarkers = excluded.filter(
      (s) => !inputs.entryRejections.slugs.has(s),
    );
    if (newRejectionMarkers.length > 0) {
      const ins = await sb.from("journal_entry_metrics").insert(
        newRejectionMarkers.map((slug) => ({
          entry_id: entryId,
          metric_slug: ENTRY_MARKER_SLUGS.skillRejected,
          source: "worker_input",
          value_text: slug,
        })),
      );
      if (ins.error) {
        logError(trace, "save_rejection_markers", ins.error);
        writeFailures += 1;
      } else {
        writeSuccesses += 1;
      }
    }

    // ── 3. THE canonical derivation (pure, fragment-based, zero loss) ────
    const derived = deriveJournalRecognition(text, {
      declaredSlugs: inputs.declaredSlugs,
      entryRejections: {
        slugs: rejectedSlugUnion,
        claimLabels: inputs.entryRejections.claimLabels,
      },
      // P2 integrity: the worker's persisted ambiguity decisions — a
      // resolved card is emitted as the chosen reading and never
      // re-offered (this wiring is seam-tested through the pipeline,
      // not only through the pure function).
      entryResolutions: inputs.entryResolutions,
    });

    // ── 4. Resolve recognised slugs → active taxonomy rows ───────────────
    const recognizedSlugs = derived.recognizedSkills.map((r) => r.slug);
    const activeBySlug = new Map<string, { id: string; slug: string }>();
    let resolveFailed = false;
    if (recognizedSlugs.length > 0) {
      const { data: skillRows, error } = await supabase
        .from("skills")
        .select("id, slug, is_active")
        .in("slug", recognizedSlugs);
      if (error) {
        logError(trace, "resolve_skills", error);
        writeFailures += 1; // recognition cannot land anywhere — count once
        resolveFailed = true;
      }
      for (const r of skillRows ?? []) {
        if (r.is_active !== false && typeof r.slug === "string") {
          activeBySlug.set(r.slug, { id: r.id as string, slug: r.slug });
        }
      }
    }
    // Recognitions that did NOT resolve to an active skill row surface as
    // rejected/inactive — nothing silently dropped.
    const recognition: JournalRecognitionResult = { ...derived };
    if (!resolveFailed) {
      const inactive = derived.recognizedSkills.filter(
        (r) => !activeBySlug.has(r.slug),
      );
      if (inactive.length > 0) {
        recognition.recognizedSkills = derived.recognizedSkills.filter((r) =>
          activeBySlug.has(r.slug),
        );
        recognition.rejected = [
          ...derived.rejected,
          ...inactive.map((r) => ({
            kind: "skill" as const,
            label: r.slug,
            slug: r.slug,
            reason: "inactive_skill" as const,
            fragmentIds: r.fragmentIds,
          })),
        ];
      }
    }

    // ── 5. NEW-skill honesty rule: add ONLY recognised active skills the
    // worker has not declared. verified:false + source:'self_declared'
    // always; confidence_bin 'yellow' is the honest neutral bin for a
    // journal-derived self-declared skill. Never verified, never the
    // manager-confirmed source (that is the separate owner-gated flow).
    const resolved = recognition.recognizedSkills
      .map((r) => activeBySlug.get(r.slug))
      .filter((r): r is { id: string; slug: string } => !!r);
    const toAdd = resolved.filter((r) => !inputs.declaredSlugs.has(r.slug));
    let justAdded = new Set<string>();
    if (toAdd.length > 0) {
      const rows = toAdd.map((r) => ({
        worker_id: worker.id,
        skill_id: r.id,
        verified: false,
        source: "self_declared",
        confidence_bin: "yellow",
      }));
      // UNIQUE(worker_id, skill_id) exists on worker_skills (0001/0010) —
      // ignoreDuplicates makes a concurrent/duplicate insert a no-op.
      const ins = await sb.from("worker_skills").upsert(rows, {
        onConflict: "worker_id,skill_id",
        ignoreDuplicates: true,
      });
      if (ins.error) {
        logError(trace, "add_worker_skills", ins.error);
        writeFailures += 1;
      } else {
        justAdded = new Set(toAdd.map((r) => r.id));
        addedSkills = toAdd.map((r) => ({ slug: r.slug }));
        writeSuccesses += 1;
      }
    }

    // ── 6. Evidence links for this entry (idempotent) ────────────────────
    const linkTargets = resolved.filter(
      (r) => inputs.declaredSlugs.has(r.slug) || justAdded.has(r.id),
    );
    if (linkTargets.length > 0) {
      const existingLinkSet = new Set<string>();
      const { data: links, error: linkReadErr } = await sb
        .from("journal_entry_skills")
        .select("skill_id")
        .eq("journal_entry_id", entryId);
      if (linkReadErr) {
        logError(trace, "read_links", linkReadErr);
        writeFailures += 1;
      } else {
        for (const r of (links ?? []) as { skill_id: string }[]) {
          existingLinkSet.add(r.skill_id);
        }
        alreadyLinkedSkills = linkTargets
          .filter((r) => existingLinkSet.has(r.id))
          .map((r) => ({ slug: r.slug }));
        const newLinks = linkTargets.filter((r) => !existingLinkSet.has(r.id));
        if (newLinks.length > 0) {
          const rows = newLinks.map((r) => ({
            journal_entry_id: entryId,
            worker_id: worker.id,
            skill_id: r.id,
          }));
          const ins = await sb.from("journal_entry_skills").upsert(rows, {
            onConflict: "journal_entry_id,skill_id",
            ignoreDuplicates: true,
          });
          if (ins.error) {
            logError(trace, "link_entry_skills", ins.error);
            writeFailures += 1;
          } else {
            strengthenedSkills = newLinks
              .filter((r) => inputs.declaredSlugs.has(r.slug))
              .map((r) => ({ slug: r.slug }));
            writeSuccesses += 1;
          }
        }
      }
    }

    // ── 6b. Ambiguous phrasings → the EXISTING clarification lane ────────
    // Persisted as skill_candidate_clarifications rows (owner-scoped RLS,
    // upsert dedupes by normalized label — migration 20260609160000). NEVER
    // inserted into worker_skills here: only the worker's explicit choice
    // (confirmJournalAmbiguousChoice) may resolve an ambiguity into a skill.
    const ambiguousCandidates = recognition.candidates.filter(
      (c) => c.kind === "ambiguous",
    );
    if (ambiguousCandidates.length > 0) {
      const rows = ambiguousCandidates.map((a) => ({
        profile_id: user.id,
        label: a.label,
        normalized_label: normalizeSkillLabel(a.label),
      }));
      const ins = await sb.from("skill_candidate_clarifications").upsert(rows, {
        onConflict: "profile_id,normalized_label",
        ignoreDuplicates: true,
      });
      if (ins.error) {
        logError(trace, "save_ambiguous_candidates", ins.error);
        writeFailures += 1;
      } else {
        writeSuccesses += 1;
      }
      // The candidates stay in the result either way — the ambiguity in the
      // TEXT is real even if the clarification row already existed.
    }

    // ── 7. Free-text capability claims with provenance ───────────────────
    // Derivation already excluded entry-rejected labels; here we dedupe
    // against the worker's existing profile claims + this entry's own
    // skill_claim metrics (idempotent retry) before persisting.
    try {
      const candidateClaims = recognition.claims.slice(0, MAX_CLAIMS_PER_RUN);
      if (candidateClaims.length > 0) {
        const claimSet = new Set<string>();
        const { data: claimRows, error: claimErr } = await sb
          .from("profile_skill_claims")
          .select("normalized_label")
          .eq("profile_id", user.id);
        if (claimErr) logError(trace, "read_profile_claims", claimErr);
        for (const r of (claimRows ?? []) as { normalized_label: string }[]) {
          claimSet.add(r.normalized_label);
        }

        const toSave = candidateClaims.filter(
          (c) =>
            !claimSet.has(c.normalizedLabel) &&
            !inputs.existingClaimSet.has(c.normalizedLabel),
        );
        if (toSave.length > 0) {
          // source:'worker_input' — the label is derived from the worker's
          // own words by a deterministic lexicon pass; that is NOT AI, so
          // an AI-sourced label would be dishonest (doctrine §7).
          const rows = toSave.map((c) => ({
            entry_id: entryId,
            metric_slug: ENTRY_MARKER_SLUGS.claim,
            source: "worker_input",
            value_text: c.label,
          }));
          const ins = await sb.from("journal_entry_metrics").insert(rows);
          if (ins.error) {
            logError(trace, "save_claims", ins.error);
            writeFailures += 1;
          } else {
            claimsSavedLabels = toSave.map((c) => c.label);
            writeSuccesses += 1;
          }
        }
      }
    } catch (e) {
      logError(trace, "claims_phase", e);
      writeFailures += 1;
    }

    // ── 8. Unresolved fragments — the entry's OWN words, kept visible ────
    // Append-only unresolved_fragment metric rows deduped by normalized
    // text; a worker dismissal (unresolved_dismissed marker) stops the
    // re-insert but the derivation keeps the fragment honest in the result.
    const unresolvedToSave = recognition.unresolvedFragments
      .filter((u) => {
        const norm = normalizeClaimLabel(u.normalized);
        return (
          !inputs.existingUnresolvedSet.has(norm) &&
          !inputs.dismissedUnresolvedSet.has(norm)
        );
      })
      .slice(0, MAX_UNRESOLVED_PER_RUN);
    if (unresolvedToSave.length > 0) {
      const ins = await sb.from("journal_entry_metrics").insert(
        unresolvedToSave.map((u) => ({
          entry_id: entryId,
          metric_slug: ENTRY_MARKER_SLUGS.unresolvedFragment,
          source: "worker_input",
          value_text: u.text.slice(0, 300),
        })),
      );
      if (ins.error) {
        logError(trace, "save_unresolved", ins.error);
        writeFailures += 1;
      } else {
        writeSuccesses += 1;
      }
    }

    // ── 9. Evidence-tier recompute — a REQUIRED phase (P1 integrity fix):
    // a half-applied tier must keep the entry stale so lazy-heal /
    // history-reprocess retries it, so a reconcile failure counts as a
    // write failure and blocks the version stamp below.
    const reconcileOk = await applyWorkerSkillSourceReconcile(
      supabase,
      worker.id,
    );
    if (!reconcileOk) {
      logError(trace, "reconcile", { code: "reconcile_failed" });
      writeFailures += 1;
    }

    // ── 10. Pipeline version stamp — ONLY after a fully successful run
    // (P1 integrity fix): any failed persist phase (worker_skills, links,
    // claims, unresolved fragments, reconcile) leaves the entry UNSTAMPED,
    // so it is automatically re-selected by the lazy heal and by
    // reprocessOwnJournalHistory until a clean pass completes the missing
    // writes idempotently.
    if (
      writeFailures === 0 &&
      inputs.latestPipelineVersion !== JOURNAL_PIPELINE_VERSION
    ) {
      const ins = await sb.from("journal_entry_metrics").insert([
        {
          entry_id: entryId,
          metric_slug: ENTRY_MARKER_SLUGS.pipelineVersion,
          source: "worker_input",
          value_numeric: JOURNAL_PIPELINE_VERSION,
        },
      ]);
      if (ins.error) {
        logError(trace, "stamp_pipeline_version", ins.error);
        writeFailures += 1;
      } else {
        writeSuccesses += 1;
      }
    }

    // ── 11. Surface freshness ────────────────────────────────────────────
    if (opts.revalidate !== false) {
      try {
        revalidatePath(`/${locale}/dashboard/journal`, "page");
        revalidatePath(`/${locale}/dashboard/profile`, "page");
        revalidatePath(`/${locale}/cv`, "page");
      } catch (e) {
        // Revalidation is a freshness hint, never a pipeline failure.
        logError(trace, "revalidate", e);
      }
    }

    const status: JournalSkillPipelineResult["status"] =
      writeFailures === 0
        ? "completed"
        : writeSuccesses > 0
          ? "partial"
          : "failed";

    // Legacy candidate/rejected lists — derived 1:1 from the recognition
    // object (one source of truth; nothing invented here).
    const candidates: JournalPipelineCandidate[] = [
      ...recognition.candidates.map((c) => ({
        kind: c.kind,
        label: c.label,
        slug: c.slug,
        reason: c.reason,
        choices: c.choices,
        fragmentIds: c.fragmentIds,
      })),
      ...recognition.claims.map((c) => ({
        kind: "claim" as const,
        label: c.label,
        fragmentIds: c.fragmentIds,
      })),
    ];
    const rejected: JournalPipelineRejected[] = recognition.rejected.map(
      (r) => ({ label: r.slug ?? r.label, reason: r.reason }),
    );

    const partial = {
      addedSkills,
      strengthenedSkills,
      alreadyLinkedSkills,
      claimsSavedLabels,
      candidates,
      rejected,
      recognition,
    };
    const summary = summarizeJournalPipelineResult(partial);
    const result: JournalSkillPipelineResult = {
      status,
      ...summary,
      trace,
      ...partial,
    };
    console.info("[journal-pipeline]", {
      trace,
      status,
      version: JOURNAL_PIPELINE_VERSION,
      fragments: recognition.coverage.fragmentCount,
      meaningful: recognition.coverage.meaningfulFragmentCount,
      covered: recognition.coverage.coveredFragmentCount,
      unresolved: recognition.coverage.unresolvedFragmentCount,
      silentlyLost: recognition.coverage.silentlyLostFragmentCount,
      detected: summary.detected,
      added: summary.added,
      strengthened: summary.strengthened,
      reviewNeeded: summary.reviewNeeded,
      candidates: candidates.length,
      rejected: rejected.length,
      ms: Date.now() - started,
    });
    return result;
  } catch (e) {
    logError(trace, "pipeline", e);
    return zeroResult(trace, "failed");
  }
}
