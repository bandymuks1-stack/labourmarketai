/**
 * Rule-based extractor for SELF-DECLARED profile skill claims (NOT verified).
 *
 * Input: free-text narrative the user typed into the profile composer
 *   (`profiles.profile_text`, owner-only, migration 0014).
 *
 * Output: a small set of editable, owner-only claim suggestions the user
 *   can confirm before they are persisted into `profile_skill_claims`
 *   (migration 0015). Nothing here is asserted as a verified fact — the
 *   downstream UI must always show the "not verified" disclaimer.
 *
 * Why a SECOND extractor (not the existing `extract-profile-suggestions`):
 *   The existing extractor maps to `skill_id`/`profession_slug` rows that
 *   the user already holds in their worker catalogue. Suggestions that
 *   don't match a catalogued skill_id are silently filtered out — e.g.
 *   "Moku programuoti" produces no chip if the user signed up as a
 *   builder. This extractor proposes the user's OWN WORDS as claim
 *   labels, regardless of whether a canonical skill row exists yet.
 *
 * Vocabulary is intentionally small. v1 covers the LT/EN examples named
 * in the slice goal; future PRs can extend `DICTIONARY` row-by-row.
 */

export type SkillClaimSuggestion = {
  /** Display label shown to the user (canonical form, localised LT). */
  label: string;
  /** Lowercased/trimmed form used for dedupe; matches DB `normalized_label`. */
  normalizedLabel: string;
};

type DictionaryRow = {
  /** Lowercased substrings; ANY match in the user's lowercased text counts. */
  needles: readonly string[];
  /** Canonical LT display label (UI-visible). */
  label: string;
};

/**
 * Lithuanian (and a few English) needles → canonical label. Kept inline,
 * not in a separate JSON, so adding a row is a one-PR change with a guard
 * test alongside. Match is case-insensitive substring against the
 * lowercased input — cheap, deterministic, and easy to reason about.
 *
 * Adding a needle: prefer the morphological STEM (e.g. "programuot"
 * matches "programuoti", "programuotojas", "programuotum"). If the stem
 * is ambiguous with an unrelated word, use a longer fragment.
 */
const DICTIONARY: readonly DictionaryRow[] = [
  {
    label: "Programavimas",
    needles: [
      "programuot",
      "programavim",
      "programuoj",
      "coding",
      "software",
      "frontend",
      "backend",
      "developer",
    ],
  },
  {
    label: "Namų statyba",
    needles: [
      "statyti nam",
      "namų staty",
      "namu staty",
      "house build",
      "home build",
    ],
  },
  {
    label: "Statybos darbai",
    needles: [
      "statyb",
      "construction",
      "renovation",
      "renovacij",
    ],
  },
  {
    label: "Mūrijimas",
    needles: ["mūryt", "muryt", "masonry", "bricklay"],
  },
  {
    label: "Dažymas",
    needles: ["dažyt", "dazyt", "painting", "painter"],
  },
  {
    label: "Elektros darbai",
    needles: ["elektros darb", "elektrik", "electrical", "electrician"],
  },
  {
    label: "Santechnika",
    needles: ["santechnik", "vandentiek", "plumbing", "plumber"],
  },
  {
    // Renamed from "Stogo darbai" → "Stogų dengimas" to mirror the
    // active-verb form the owner's narrative used ("dengti stogus") and
    // to match the owner-preferred wording in the PR #46 follow-up
    // hotfix spec. "stog" stays as the broad needle so anything
    // roof-related still surfaces.
    label: "Stogų dengimas",
    needles: ["dengti stog", "stogdeng", "stog", "roofing", "roofer"],
  },
  {
    // New row — owner's narrative was "...gaminti lietuviškos virtuvės
    // patiekalus" which previously produced 0 self-declared chips. Stems
    // are picked to match the morphology of LT verbs ("gaminti" → "gamin",
    // "virėjas" → "virėj") + the obvious EN equivalents.
    label: "Maisto gamyba",
    needles: [
      "gaminti patiekal",
      "gaminti maist",
      "virtuvės patiek",
      "virtuvės darb",
      "lietuvišk virtuv",
      "lietuviškos virtuv",
      "maisto gamy",
      "maisto ruoš",
      "virėj",
      "virim",
      "cooking",
      "chef",
      "kitchen work",
    ],
  },
  {
    label: "Vadovavimas komandai",
    needles: [
      "vadovauj",
      "vadovavim",
      "vadovavau",
      "team lead",
      "foreman",
      "brigad",
    ],
  },
];

const MAX_SUGGESTIONS = 12;
const MAX_INPUT_CHARS = 4000;

/**
 * Extract candidate claim suggestions from free-text profile narrative.
 *
 * Pure function — no IO, no auth. The caller is responsible for showing
 * the result behind a confirm step before persistence (Rule 3 of the
 * slice spec).
 */
export function extractProfileSkillClaims(
  rawText: string | null | undefined,
): SkillClaimSuggestion[] {
  if (typeof rawText !== "string") return [];
  const text = rawText.trim();
  if (text.length === 0) return [];

  const haystack = text.slice(0, MAX_INPUT_CHARS).toLowerCase();
  const found = new Map<string, SkillClaimSuggestion>();

  for (const row of DICTIONARY) {
    for (const needle of row.needles) {
      if (needle && haystack.includes(needle)) {
        const normalized = row.label.toLowerCase();
        if (!found.has(normalized)) {
          found.set(normalized, {
            label: row.label,
            normalizedLabel: normalized,
          });
        }
        break;
      }
    }
    if (found.size >= MAX_SUGGESTIONS) break;
  }

  return [...found.values()];
}

/**
 * Normalize a label the user typed/edited before it goes into
 * `profile_skill_claims.normalized_label` (the UNIQUE key column).
 *
 * Lowercase + collapse internal whitespace. Kept here so the UI and the
 * server action use the same rule and dedupes line up.
 */
export function normalizeClaimLabel(label: string): string {
  return label.trim().toLowerCase().replace(/\s+/g, " ");
}
