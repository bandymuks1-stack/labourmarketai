/**
 * Recognition tiers — the owner's 3-level "help the human choose" model.
 *
 * Owner correction (journal-real-world-recognition-audit-p0): BAD 0 and SAFE
 * EMPTY are not the only goals. When the recogniser is UNSURE it should not stay
 * silent by default — it should offer similar skills/capabilities for the worker
 * to CHOOSE, never auto-linking them as fact. The system does not have to know
 * everything; it must help the human decide.
 *
 * This pure, deterministic classifier maps a free-text entry to one of three
 * tiers (no DB, no AI, no IO):
 *
 *   1. auto_signal        — a confident signal exists; show the current signal.
 *   2. candidate_suggestion — not confidently recognised, but SIMILAR matches
 *                             exist; show "Panašūs įgūdžiai / Similar skills" for
 *                             the worker to choose. NOT auto-linked, NOT verified.
 *   3. manual_only        — truly unclear; fall back to "Add manually".
 *
 * It reuses the existing recognisers verbatim, so every honesty guard already in
 * them holds — including the cleaning-context flooring blocker, so a washed
 * floor ("ploviau grindis") is the cleaning AUTO signal, never floor-laying, and
 * never a flooring candidate (the candidate catalogue carries no flooring slug).
 */
import { extractJournalSuggestions } from "./extract-journal-suggestions";
import {
  recognizeNewSkillSuggestions,
  type NewSkillSuggestion,
} from "./new-skill-suggestions";

export type RecognitionTier =
  | "auto_signal"
  | "candidate_suggestion"
  | "manual_only";

export interface EntryRecognitionTier {
  readonly tier: RecognitionTier;
  /** Confident skill slugs already recognised (floor-guarded upstream). */
  readonly autoSignalSlugs: string[];
  /** Confident capability / activity labels (canonical LT; localise to display). */
  readonly autoCapabilityLabels: string[];
  /** Similar-skill candidates to OFFER (tier 2) — never auto-linked, never a
   *  fact until the worker picks one (which only creates a self-declared claim
   *  via the existing manual path). Empty for tier 1 and tier 3. */
  readonly candidates: NewSkillSuggestion[];
}

/**
 * Classify one entry into a recognition tier. `declaredSlugs` lets candidates
 * exclude skills the worker already holds (so we only ever OFFER something new).
 */
export function classifyEntryRecognition(
  text: string,
  declaredSlugs: ReadonlySet<string> = new Set(),
): EntryRecognitionTier {
  const trimmed = (text ?? "").trim();
  if (!trimmed) {
    return {
      tier: "manual_only",
      autoSignalSlugs: [],
      autoCapabilityLabels: [],
      candidates: [],
    };
  }

  const js = extractJournalSuggestions(trimmed);

  const autoSignalSlugs = [...js.skillSlugs];
  // Confident capability/activity labels: explicit named capabilities + any
  // fragment that resolved to a real activity (slug or label, not "unknown").
  const autoCapabilityLabels = [
    ...js.capabilitySuggestions.map((c) => c.label),
    ...js.fragments
      .filter((f) => !f.isUnknown && (f.activitySlug !== null || !!f.activityLabel))
      .map((f) => f.activityLabel ?? f.activitySlug ?? "")
      .filter((s): s is string => s.length > 0),
  ];
  const dedupedCapabilityLabels = [...new Set(autoCapabilityLabels)];

  const hasAuto =
    autoSignalSlugs.length > 0 || dedupedCapabilityLabels.length > 0;
  if (hasAuto) {
    return {
      tier: "auto_signal",
      autoSignalSlugs,
      autoCapabilityLabels: dedupedCapabilityLabels,
      candidates: [],
    };
  }

  // No confident signal — offer similar candidates if any close match exists.
  const candidates = recognizeNewSkillSuggestions(trimmed, declaredSlugs);
  if (candidates.length > 0) {
    return {
      tier: "candidate_suggestion",
      autoSignalSlugs: [],
      autoCapabilityLabels: [],
      candidates,
    };
  }

  // Truly unclear — manual fallback only.
  return {
    tier: "manual_only",
    autoSignalSlugs: [],
    autoCapabilityLabels: [],
    candidates: [],
  };
}
