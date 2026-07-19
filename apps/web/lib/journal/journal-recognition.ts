/**
 * Canonical journal-recognition DERIVATION (Universal Journal Recall, P0).
 *
 * THE one source of truth for what a journal entry's text means. Pure — no
 * IO, no auth, no supabase — so the SAME function runs in:
 *   • the server pipeline (persistence),
 *   • the confirm/reject server actions (trust boundary: every submitted
 *     candidate is re-derived from the STORED text and verified by
 *     membership — no client-supplied field is ever trusted),
 *   • tests (coverage invariants, dedup, cross-sector corpus).
 *
 * Per MEANINGFUL fragment (see ../structuring/journal-fragmenter) the lanes
 * run IN ORDER, each collecting outcomes:
 *   1. taxonomy recognition (exact/synonym → recognized; fuzzy of an
 *      UNDECLARED slug → fuzzy candidate; fuzzy of a DECLARED slug counts
 *      as recognized-declared);
 *   2. curated ambiguity table → choice candidates (worker picks a reading);
 *   3. capability claims (deterministic lexicon — NOT AI, doctrine §7);
 *   4. per-entry worker rejections → outcomes stay VISIBLE as `rejected`;
 *   5. zero-outcome meaningful fragment → `unresolved` (fragment text as the
 *      label). Silent loss is structurally impossible: every meaningful
 *      fragment lands in exactly one of covered / unresolved.
 *
 * Semantic dedup (the ONLY silent path — a suppressed item is a duplicate
 * represented by the surviving item, never a dropped signal):
 *   • a claim whose `claimAffinity` slug is recognised in the SAME fragment
 *     is suppressed unless one of its `contextNeedles` matches the fragment;
 *   • rows with `requireContextNeedles` emit only in matching context;
 *   • a slug present as `recognized` suppresses the same slug as a fuzzy or
 *     ambiguous-choice candidate (provenance merges into the survivor);
 *   • a claim whose normalized label equals a recognised slug's
 *     slug-derived label is suppressed;
 *   • one slug / one normalized claim label appears ONCE globally (strongest
 *     evidence wins; fragment provenance merges).
 */
import {
  fragmentJournalText,
  type JournalFragment,
} from "@/lib/structuring/journal-fragmenter";
import {
  recognizeSkills,
  type SkillConfidence,
  type SkillMatchVia,
} from "@/lib/structuring/skill-recognition";
import { extractAmbiguousCandidates } from "@/lib/structuring/ambiguous-journal-candidates";
import {
  extractProfileSkillClaims,
  getJournalClaimRowMeta,
  normalizeClaimLabel,
} from "@/lib/profile/skill-claim-extractor";
import { foldText } from "@/lib/structuring/normalize";

/** Bumped whenever derivation semantics change — stamped per entry as a
 *  `pipeline_version` metric and required from every confirm/reject call. */
export const JOURNAL_PIPELINE_VERSION = 2;

export type JournalOutcomeKind =
  | "recognized"
  | "fuzzy_candidate"
  | "ambiguous"
  | "claim"
  | "rejected"
  | "unresolved";

/** Reference from a fragment to the derived item it produced:
 *  slug (skills), normalized label (claims/ambiguous) or fragment id. */
export type OutcomeRef = { kind: JournalOutcomeKind; ref: string };

export type JournalRecognizedSkill = {
  slug: string;
  via: SkillMatchVia;
  confidence: SkillConfidence;
  fragmentIds: string[];
};

export type JournalRecognitionCandidate = {
  kind: "fuzzy_skill" | "ambiguous";
  slug?: string;
  label: string;
  reason?: string;
  choices?: { slug: string; label: string }[];
  fragmentIds: string[];
};

export type JournalRecognitionClaim = {
  label: string;
  normalizedLabel: string;
  fragmentIds: string[];
};

export type JournalUnresolvedFragment = {
  fragmentId: string;
  text: string;
  normalized: string;
};

export type JournalRejectedOutcome = {
  kind: "skill" | "claim";
  label: string;
  slug?: string;
  /** user_rejected comes from derivation; inactive_skill is added by the
   *  pipeline when a recognised slug fails the active-taxonomy check. */
  reason: "user_rejected" | "inactive_skill";
  fragmentIds: string[];
};

export type JournalRecognitionCoverage = {
  fragmentCount: number;
  meaningfulFragmentCount: number;
  coveredFragmentCount: number;
  unresolvedFragmentCount: number;
  /** MUST be 0 by construction (unresolved fallback); asserted. */
  silentlyLostFragmentCount: number;
};

export type JournalRecognitionFragment = JournalFragment & {
  outcomes: OutcomeRef[];
};

export type JournalRecognitionResult = {
  pipelineVersion: number;
  fragments: JournalRecognitionFragment[];
  recognizedSkills: JournalRecognizedSkill[];
  candidates: JournalRecognitionCandidate[];
  claims: JournalRecognitionClaim[];
  unresolvedFragments: JournalUnresolvedFragment[];
  rejected: JournalRejectedOutcome[];
  coverage: JournalRecognitionCoverage;
};

export type JournalEntryRejections = {
  /** Taxonomy slugs the worker rejected ON THIS ENTRY (skill_rejected
   *  markers + the save-time exclusion list). */
  slugs: ReadonlySet<string>;
  /** Normalized claim labels rejected ON THIS ENTRY (skill_claim_rejected
   *  markers). Entry-scoped by design: a label rejected on entry A still
   *  surfaces from entry B. */
  claimLabels: ReadonlySet<string>;
};

export type DeriveJournalRecognitionOptions = {
  declaredSlugs: ReadonlySet<string>;
  entryRejections: JournalEntryRejections;
};

const VIA_RANK: Record<SkillMatchVia, number> = {
  exact: 3,
  synonym: 2,
  fuzzy: 1,
};

/** Normalized label a taxonomy slug reads as (for claim-vs-slug dedup). */
function slugAsClaimLabel(slug: string): string {
  return normalizeClaimLabel(slug.replace(/[_-]+/g, " "));
}

/** Empty result (used by the pipeline's fail-closed paths). */
export function emptyJournalRecognition(): JournalRecognitionResult {
  return {
    pipelineVersion: JOURNAL_PIPELINE_VERSION,
    fragments: [],
    recognizedSkills: [],
    candidates: [],
    claims: [],
    unresolvedFragments: [],
    rejected: [],
    coverage: {
      fragmentCount: 0,
      meaningfulFragmentCount: 0,
      coveredFragmentCount: 0,
      unresolvedFragmentCount: 0,
      silentlyLostFragmentCount: 0,
    },
  };
}

export function deriveJournalRecognition(
  text: string,
  opts: DeriveJournalRecognitionOptions,
): JournalRecognitionResult {
  const fragments = fragmentJournalText(text ?? "");
  const { declaredSlugs } = opts;
  const rejectedSlugSet = opts.entryRejections.slugs;
  const rejectedClaimSet = opts.entryRejections.claimLabels;

  const recognizedMap = new Map<
    string,
    { via: SkillMatchVia; confidence: SkillConfidence; fragmentIds: Set<string> }
  >();
  const fuzzyMap = new Map<
    string,
    { reason?: string; fragmentIds: Set<string> }
  >();
  const ambiguousMap = new Map<
    string,
    {
      label: string;
      reason?: string;
      choices: { slug: string; label: string }[];
      fragmentIds: Set<string>;
    }
  >();
  const claimMap = new Map<
    string,
    { label: string; fragmentIds: Set<string> }
  >();
  const rejectedMap = new Map<
    string,
    JournalRejectedOutcome & { fragmentIdSet: Set<string> }
  >();
  const unresolved: JournalUnresolvedFragment[] = [];
  const fragmentsOut: JournalRecognitionFragment[] = [];

  const pushRejected = (
    kind: "skill" | "claim",
    label: string,
    slug: string | undefined,
    reason: "user_rejected" | "inactive_skill",
    fragmentId: string,
  ): void => {
    const key = `${kind}:${slug ?? normalizeClaimLabel(label)}`;
    const prior = rejectedMap.get(key);
    if (prior) {
      prior.fragmentIdSet.add(fragmentId);
    } else {
      rejectedMap.set(key, {
        kind,
        label,
        slug,
        reason,
        fragmentIds: [],
        fragmentIdSet: new Set([fragmentId]),
      });
    }
  };

  for (const f of fragments) {
    const outcomes: OutcomeRef[] = [];
    if (f.meaningful) {
      const folded = foldText(f.text);

      // ── Lane 1: taxonomy recognition ────────────────────────────────────
      const recognizedInFragment = new Set<string>();
      for (const r of recognizeSkills(f.text, 8)) {
        if (rejectedSlugSet.has(r.slug)) {
          pushRejected("skill", r.slug, r.slug, "user_rejected", f.id);
          outcomes.push({ kind: "rejected", ref: r.slug });
          continue;
        }
        const strong = r.via === "exact" || r.via === "synonym";
        if (strong || declaredSlugs.has(r.slug)) {
          recognizedInFragment.add(r.slug);
          const prior = recognizedMap.get(r.slug);
          if (!prior) {
            recognizedMap.set(r.slug, {
              via: r.via,
              confidence: r.confidence,
              fragmentIds: new Set([f.id]),
            });
          } else {
            prior.fragmentIds.add(f.id);
            if (VIA_RANK[r.via] > VIA_RANK[prior.via]) {
              prior.via = r.via;
              prior.confidence = r.confidence;
            }
          }
          outcomes.push({ kind: "recognized", ref: r.slug });
        } else {
          const prior = fuzzyMap.get(r.slug);
          if (!prior) {
            fuzzyMap.set(r.slug, {
              reason: r.matchedText,
              fragmentIds: new Set([f.id]),
            });
          } else {
            prior.fragmentIds.add(f.id);
          }
          outcomes.push({ kind: "fuzzy_candidate", ref: r.slug });
        }
      }

      // ── Lane 2: curated ambiguity → choice candidates ───────────────────
      for (const a of extractAmbiguousCandidates(f.text)) {
        const choiceSlugs = a.choices.map((c) => c.slug);
        // Duplicate suppression: an EXPLICIT reading in the same fragment
        // resolves the ambiguity (the recognized slug represents it). A
        // merely-DECLARED choice does NOT suppress — the worker's answer
        // still decides which reading this entry evidences.
        if (choiceSlugs.some((s) => recognizedInFragment.has(s))) continue;
        const norm = normalizeClaimLabel(a.label);
        if (rejectedClaimSet.has(norm)) {
          pushRejected("claim", a.label, undefined, "user_rejected", f.id);
          outcomes.push({ kind: "rejected", ref: norm });
          continue;
        }
        const prior = ambiguousMap.get(norm);
        if (!prior) {
          ambiguousMap.set(norm, {
            label: a.label,
            reason: a.reason,
            choices: a.choices.map((c) => ({ slug: c.slug, label: c.label })),
            fragmentIds: new Set([f.id]),
          });
        } else {
          prior.fragmentIds.add(f.id);
        }
        outcomes.push({ kind: "ambiguous", ref: norm });
      }

      // ── Lane 3: capability claims (deterministic lexicon) ───────────────
      for (const c of extractProfileSkillClaims(f.text)) {
        if (c.ambiguous === true) continue; // clarification-only reading
        const meta = getJournalClaimRowMeta(c.label);
        if (
          meta?.requireContextNeedles &&
          !meta.requireContextNeedles.some((n) => folded.includes(foldText(n)))
        ) {
          continue; // hard context gate (e.g. AI integrations)
        }
        if (
          meta?.claimAffinity &&
          recognizedInFragment.has(meta.claimAffinity)
        ) {
          const rescued = meta.contextNeedles?.some((n) =>
            folded.includes(foldText(n)),
          );
          if (!rescued) continue; // duplicate of the recognised slug
        }
        if (rejectedClaimSet.has(c.normalizedLabel)) {
          pushRejected("claim", c.label, undefined, "user_rejected", f.id);
          outcomes.push({ kind: "rejected", ref: c.normalizedLabel });
          continue;
        }
        const prior = claimMap.get(c.normalizedLabel);
        if (!prior) {
          claimMap.set(c.normalizedLabel, {
            label: c.label,
            fragmentIds: new Set([f.id]),
          });
        } else {
          prior.fragmentIds.add(f.id);
        }
        outcomes.push({ kind: "claim", ref: c.normalizedLabel });
      }

      // ── Lane 5: unresolved fallback — silent loss is impossible ─────────
      if (outcomes.length === 0) {
        unresolved.push({
          fragmentId: f.id,
          text: f.text,
          normalized: f.normalized,
        });
        outcomes.push({ kind: "unresolved", ref: f.id });
      }
    }
    fragmentsOut.push({ ...f, outcomes });
  }

  // ── Global cross-lane dedup ──────────────────────────────────────────────
  // recognized slug beats its own fuzzy candidate (provenance merges).
  for (const [slug, fuzzy] of [...fuzzyMap]) {
    const rec = recognizedMap.get(slug);
    if (rec) {
      for (const id of fuzzy.fragmentIds) rec.fragmentIds.add(id);
      fuzzyMap.delete(slug);
    }
  }
  // recognized slug resolves an ambiguity whose choices include it.
  for (const [norm, amb] of [...ambiguousMap]) {
    const winner = amb.choices.find((c) => recognizedMap.has(c.slug));
    if (winner) {
      const rec = recognizedMap.get(winner.slug)!;
      for (const id of amb.fragmentIds) rec.fragmentIds.add(id);
      ambiguousMap.delete(norm);
    }
  }
  // claim that spells a recognised slug is a duplicate of it.
  const recognizedAsLabels = new Map<string, string>(); // normalized label → slug
  for (const slug of recognizedMap.keys()) {
    recognizedAsLabels.set(slugAsClaimLabel(slug), slug);
  }
  for (const [norm, claim] of [...claimMap]) {
    const slug = recognizedAsLabels.get(norm);
    if (slug) {
      const rec = recognizedMap.get(slug)!;
      for (const id of claim.fragmentIds) rec.fragmentIds.add(id);
      claimMap.delete(norm);
    }
  }

  // ── Assemble ─────────────────────────────────────────────────────────────
  const recognizedSkills: JournalRecognizedSkill[] = [...recognizedMap]
    .map(([slug, r]) => ({
      slug,
      via: r.via,
      confidence: r.confidence,
      fragmentIds: [...r.fragmentIds],
    }))
    .sort(
      (a, b) => VIA_RANK[b.via] - VIA_RANK[a.via] || a.slug.localeCompare(b.slug),
    );

  const candidates: JournalRecognitionCandidate[] = [
    ...[...fuzzyMap].map(([slug, c]) => ({
      kind: "fuzzy_skill" as const,
      slug,
      label: slug,
      reason: c.reason,
      fragmentIds: [...c.fragmentIds],
    })),
    ...[...ambiguousMap.values()].map((a) => ({
      kind: "ambiguous" as const,
      slug: a.choices[0]?.slug,
      label: a.label,
      reason: a.reason,
      choices: a.choices,
      fragmentIds: [...a.fragmentIds],
    })),
  ];

  const claims: JournalRecognitionClaim[] = [...claimMap].map(
    ([normalizedLabel, c]) => ({
      label: c.label,
      normalizedLabel,
      fragmentIds: [...c.fragmentIds],
    }),
  );

  const rejected: JournalRejectedOutcome[] = [...rejectedMap.values()].map(
    ({ fragmentIdSet, ...r }) => ({ ...r, fragmentIds: [...fragmentIdSet] }),
  );

  const meaningful = fragmentsOut.filter((f) => f.meaningful);
  const unresolvedIds = new Set(unresolved.map((u) => u.fragmentId));
  const covered = meaningful.filter(
    (f) => f.outcomes.length > 0 && !unresolvedIds.has(f.id),
  ).length;
  const silentlyLost = meaningful.filter((f) => f.outcomes.length === 0).length;
  if (silentlyLost > 0) {
    // Structurally impossible (unresolved fallback) — if it EVER fires the
    // invariant is broken and must be loud. Counts only, never entry text.
    console.error("[journal-recognition] coverage invariant broken", {
      silentlyLost,
      fragmentCount: fragments.length,
    });
  }

  return {
    pipelineVersion: JOURNAL_PIPELINE_VERSION,
    fragments: fragmentsOut,
    recognizedSkills,
    candidates,
    claims,
    unresolvedFragments: unresolved,
    rejected,
    coverage: {
      fragmentCount: fragments.length,
      meaningfulFragmentCount: meaningful.length,
      coveredFragmentCount: covered,
      unresolvedFragmentCount: unresolved.length,
      silentlyLostFragmentCount: silentlyLost,
    },
  };
}

/**
 * ONE pure summary rule: every legacy count the UI renders is DERIVED from
 * the result lists — counts can never drift from what is actually shown.
 * (Client-safe: lives here, not in the server-only pipeline module.)
 */
export function summarizeJournalPipelineResult(result: {
  addedSkills: { slug: string }[];
  strengthenedSkills: { slug: string }[];
  alreadyLinkedSkills: { slug: string }[];
  claimsSavedLabels: string[];
  candidates: { kind: string }[];
  recognition: Pick<JournalRecognitionResult, "unresolvedFragments">;
}): {
  detected: number;
  added: number;
  strengthened: number;
  alreadyLinked: number;
  reviewNeeded: number;
  claimsSaved: number;
  cvUpdated: boolean;
} {
  const added = result.addedSkills.length;
  const strengthened = result.strengthenedSkills.length;
  const alreadyLinked = result.alreadyLinkedSkills.length;
  const claimsSaved = result.claimsSavedLabels.length;
  const detected = new Set(
    [
      ...result.addedSkills,
      ...result.strengthenedSkills,
      ...result.alreadyLinkedSkills,
    ].map((s) => s.slug),
  ).size;
  const reviewNeeded =
    result.candidates.length + result.recognition.unresolvedFragments.length;
  return {
    detected,
    added,
    strengthened,
    alreadyLinked,
    reviewNeeded,
    claimsSaved,
    cvUpdated: added + strengthened + claimsSaved > 0,
  };
}
