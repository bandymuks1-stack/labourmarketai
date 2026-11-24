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

export interface AmbiguousChoice {
  /** Real taxonomy slug this reading resolves to when the worker picks it. */
  readonly slug: string;
  /** Human wording of the reading (canonical LT — UI may localize). */
  readonly label: string;
}

export interface AmbiguousJournalCandidate {
  /** Canonical LT label stored in the clarification lane. */
  readonly label: string;
  /** Why this is a clarification, not a fact (shown to the worker). */
  readonly reason: string;
  /** The taxonomy slug the phrase MOST LIKELY means — used only when the
   *  worker explicitly confirms; never auto-added. Kept as the first
   *  `choices` entry for backward compatibility. */
  readonly possibleSlug: string;
  /** ALL curated readings of the phrase (universal pipeline v2): the worker
   *  picks ONE — plus the implicit "Kita veikla" rename handled by the UI.
   *  Every slug must exist in the taxonomy; never auto-added. */
  readonly choices: readonly AmbiguousChoice[];
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
    choices: [
      // Both slugs verified against the taxonomy (keywords.ts):
      // cleaning-services (cleaning_facility) + appliance-repair
      // (repair_maintenance, wave-2 catalogue).
      { slug: "cleaning-services", label: "Namų valymas" },
      { slug: "appliance-repair", label: "Namų remontas / priežiūra" },
    ],
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
        choices: row.choices,
      });
    }
  }
  return out;
}
