import { recognizeSkills } from "@/lib/structuring/skill-recognition";

/**
 * EVIDENCE → COMPETENCY, the derivation step.
 *
 * An imported evidence record says what a person DID. This turns the words of
 * that record into competency SIGNALS: observations that a canonical skill was
 * named in real recorded work. It closes the link the capability graph calls
 * REAL WORK → EVIDENCE → CAPABILITY, whose table
 * (`organization_evidence_competency_signals`) shipped with the import schema
 * and, until now, had no producer at all.
 *
 * ── WHAT A SIGNAL IS, AND WHAT IT IS NOT ──────────────────────────────────
 *
 * A signal is DERIVED. It is never a FACT about the person and never a
 * VERIFIED competency (SEP-1 and SEP-3, which the product constitution forbids
 * collapsing). The evidence record is the fact; this is a reading of it. That
 * separation is structural, not a matter of copy:
 *
 *   · the signals table has no verified/attested column, and no path from a
 *     signal to one. Verification lives in `organization_evidence_events` and
 *     is written by a human actor, never by this function;
 *   · every signal keeps the `term` that produced it, so a person can always
 *     see WHY a skill was read out of their history and disagree with it;
 *   · `confidence` is carried, never rounded away to a claim.
 *
 * ── NO AI, DELIBERATELY ───────────────────────────────────────────────────
 *
 * This composes the existing deterministic recognizer
 * (`lib/structuring/skill-recognition`) rather than adding a second one. That
 * recognizer is a lexicon + regex pass with no external model, so a signal is
 * reproducible from the same text forever. An AI-derived competency would have
 * to be a different, clearly-labelled method — and the database will not even
 * store one: `method` is a closed set of two values.
 *
 * ── WHY FUZZY MATCHES ARE DROPPED ─────────────────────────────────────────
 *
 * The recognizer has three tiers: exact, synonym and light-fuzzy. The table's
 * `method` check accepts only `exact_term_match` and `synonym_term_match`, so
 * fuzzy matches are dropped here rather than mangled into one of those. That
 * agrees with the recognizer's own owner rule — a wrong signal is worse than
 * none — and it matters more here than in the journal: a journal suggestion is
 * shown to its author for confirmation, while these are derived from an
 * organization's account of somebody else's work.
 *
 * PURE. No IO, no clock, no copy. The caller persists.
 */

/** The two methods the database accepts. Fuzzy is deliberately absent. */
export type CompetencySignalMethod = "exact_term_match" | "synonym_term_match";

export interface CompetencySignal {
  /** The phrase as it appears in the evidence text (original casing). */
  readonly term: string;
  /** The canonical skill it corresponds to. */
  readonly skillSlug: string;
  readonly method: CompetencySignalMethod;
  /** 0..1, matching the numeric(4,3) column. */
  readonly confidence: number;
}

/**
 * Tier → stored confidence. Two values, because there are two accepted
 * methods: an exact term is the strongest evidence the recognizer produces, a
 * curated synonym is a step below it. Neither is 1.0 — a term appearing in a
 * description is evidence that work was described that way, not proof the
 * person holds the skill, and a stored 1.0 would invite exactly that reading.
 */
const CONFIDENCE_BY_METHOD: Record<CompetencySignalMethod, number> = {
  exact_term_match: 0.9,
  synonym_term_match: 0.6,
};

/**
 * Cap per record. The recognizer's own default (4) is tuned for one journal
 * entry; an imported row is the same shape of text, so the same ceiling holds.
 * A cap is not a quality judgement — it keeps one verbose description from
 * flooding a person's profile with weak readings.
 */
export const SIGNALS_PER_RECORD_LIMIT = 4;

/**
 * Derive the competency signals for ONE evidence record's text.
 *
 * Deterministic and stable: the same text yields the same signals in the same
 * order. Empty text, or text naming nothing canonical, yields `[]` — an honest
 * empty, never a guess (SEP-7: unknown is not zero, and this returning nothing
 * means "no canonical term was named", which the caller must not render as
 * "this person has no skills").
 */
export function deriveCompetencySignals(
  text: string | null | undefined,
  limit: number = SIGNALS_PER_RECORD_LIMIT,
): CompetencySignal[] {
  if (!text || text.trim().length === 0) return [];

  const out: CompetencySignal[] = [];
  const seenTerms = new Set<string>();

  for (const recognized of recognizeSkills(text, limit)) {
    // `via: "fuzzy"` has no accepted method — drop it rather than promote it.
    const method: CompetencySignalMethod | null =
      recognized.via === "exact"
        ? "exact_term_match"
        : recognized.via === "synonym"
          ? "synonym_term_match"
          : null;
    if (!method) continue;

    const term = recognized.matchedText.trim();
    // The table is unique on (record_id, term): two skills matched by the SAME
    // word would collide on insert, so the collision is resolved here where the
    // reason is visible, keeping the first (strongest — the recognizer orders
    // by evidence) rather than letting the database silently pick.
    const key = term.toLowerCase();
    if (term.length < 2 || term.length > 120) continue;
    if (seenTerms.has(key)) continue;
    seenTerms.add(key);

    out.push({
      term,
      skillSlug: recognized.slug,
      method,
      confidence: CONFIDENCE_BY_METHOD[method],
    });
    if (out.length >= limit) break;
  }

  return out;
}

/**
 * Shape the signals for one record into database rows.
 *
 * Separate from the derivation so the derivation stays testable without any
 * database vocabulary, and so a caller can inspect what would be written
 * before writing it.
 */
export function competencySignalRows(
  organizationId: string,
  recordId: string,
  signals: readonly CompetencySignal[],
): Array<{
  organization_id: string;
  record_id: string;
  term: string;
  skill_slug: string;
  method: CompetencySignalMethod;
  confidence: number;
}> {
  return signals.map((s) => ({
    organization_id: organizationId,
    record_id: recordId,
    term: s.term,
    skill_slug: s.skillSlug,
    method: s.method,
    confidence: s.confidence,
  }));
}
