/**
 * Ambiguous journal phrases → confirmable CANDIDATES (P1 recall repair,
 * production incident 2026-07-19).
 *
 * Some real worker phrasings are genuinely two-faced: LT "tvarkiau namus" can
 * mean CLEANING the house or FIXING things around it. The recognizer must not
 * guess (a wrong signal is worse than none — owner rule), but it must not
 * silently DROP the signal either (that was the incident's loss stage). This
 * module names those phrasings deterministically so the pipeline can surface
 * each one as a confirmable candidate through the EXISTING clarification lane
 * (`skill_candidate_clarifications`, migration 20260609160000) — never as an
 * auto-added skill.
 *
 * Pure + deterministic, NOT AI (doctrine §7). Patterns run on FOLDED text
 * (see ./normalize) so diacritic-free spellings match too. Data-driven table:
 * a future ambiguous phrasing is a one-line row.
 */
import { foldText } from "./normalize";

export interface AmbiguousJournalCandidate {
  /** Canonical LT label stored in the clarification lane. */
  readonly label: string;
  /** Why this is a clarification, not a fact (shown to the worker). */
  readonly reason: string;
  /** The taxonomy slug the phrase MOST LIKELY means — used only when the
   *  worker explicitly confirms; never auto-added. */
  readonly possibleSlug: string;
}

type AmbiguousRow = AmbiguousJournalCandidate & {
  /** Folded-text pattern that triggers the candidate. */
  readonly pattern: RegExp;
};

/** Curated rows. Keep each pattern anchored on the worker's actual phrasing
 *  (folded, diacritic-free) so a row can never fire from an unrelated word. */
const AMBIGUOUS_ROWS: readonly AmbiguousRow[] = [
  {
    // LT "tvarkiau namus / butą" = cleaned OR repaired — worker must say which.
    pattern: /tvarkiau nam|tvarkiau but|sutvarkiau nam/,
    label: "Namų tvarkymas / valymas",
    reason: "»tvarkiau namus« gali reikšti valymą arba remontą",
    possibleSlug: "cleaning-services",
  },
];

/** Safety cap so an adversarial paste cannot flood the clarification lane. */
export const AMBIGUOUS_CANDIDATE_LIMIT = 4;

/**
 * Extract ambiguous-phrase candidates from a free-text journal entry.
 * Deterministic, at most one candidate per row, stable order.
 */
export function extractAmbiguousCandidates(
  text: string,
): AmbiguousJournalCandidate[] {
  if (!text || text.trim().length === 0) return [];
  const folded = foldText(text);
  const out: AmbiguousJournalCandidate[] = [];
  for (const row of AMBIGUOUS_ROWS) {
    if (out.length >= AMBIGUOUS_CANDIDATE_LIMIT) break;
    if (row.pattern.test(folded)) {
      out.push({
        label: row.label,
        reason: row.reason,
        possibleSlug: row.possibleSlug,
      });
    }
  }
  return out;
}
