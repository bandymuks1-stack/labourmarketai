import { extractJournalSuggestions } from "./extract-journal-suggestions";
import { SKILL_HINTS_LT } from "./keywords";

/**
 * Journal recognition depth (v2) — a DISPLAY model built on top of the
 * deterministic `extractJournalSuggestions` parser. It adds nothing the parser
 * doesn't already compute; it only frames the same signals honestly for the
 * reviewer inbox:
 *
 *   - recognized work items (the parser's skill slugs) + the evidence phrase
 *     each one was matched on;
 *   - the single detected total time, flagged as uncertain when the entry
 *     mentions MORE than one time fragment (we never guess which work each
 *     hour belongs to — that would be a fabricated per-task split);
 *   - a coarse certainty band (clear / partial / unclear) so the UI can ask
 *     for clarification instead of pretending the text was fully understood.
 *
 * Pure + computed-only. No storage, no schema, no AI. The reviewer still
 * confirms everything by hand through the existing review/confirm RPCs.
 */

export type RecognizedWork = {
  /** Canonical skill slug (maps to messages/<locale>/skill-names.json). */
  slug: string;
  /** Short snippet from the original text that triggered the match, so the
   *  reviewer can see WHY the work was suggested (null if not locatable). */
  evidence: string | null;
};

export type RecognizedHours = {
  value: number;
  unit: "hours" | "days" | "minutes";
  /** False when the entry carries more than one time fragment — the total is
   *  shown but the reviewer is told the hours need clarification. */
  certain: boolean;
};

export type EntryRecognition = {
  works: RecognizedWork[];
  hours: RecognizedHours | null;
  /** How many explicit time fragments the text mentions (digit + unit). */
  timeMentions: number;
  /** clear  → at least one work + at most one time fragment.
   *  partial → works recognized but the hours are ambiguous (>1 time).
   *  unclear → no work recognized at all. */
  certainty: "clear" | "partial" | "unclear";
  needsClarification: boolean;
};

/** Explicit time fragments: a number immediately followed by an hour/day/
 *  minute unit (LT or short forms). Word-number durations are intentionally
 *  ignored here — this count only governs the hours-certainty flag, and a
 *  conservative count keeps us from over-flagging. */
const TIME_FRAGMENT_RE =
  /\d+(?:[.,]\d+)?\s*(?:h\b|val(?:and[\p{L}]*)?|min(?:u[\p{L}]*)?|d\b|dien[\p{L}]*|hours?\b)/giu;

function countTimeMentions(text: string): number {
  const m = text.match(TIME_FRAGMENT_RE);
  return m ? m.length : 0;
}

/** Locate the phrase that matched `slug` and return a trimmed window around it
 *  so the reviewer sees the evidence in the worker's own words. */
function evidenceFor(slug: string, lower: string, original: string): string | null {
  const row = SKILL_HINTS_LT.find((r) => r.slug === slug);
  if (!row) return null;
  for (const needle of row.needles) {
    if (!needle) continue;
    const idx = lower.indexOf(needle);
    if (idx < 0) continue;
    const start = Math.max(0, idx - 12);
    const end = Math.min(original.length, idx + needle.length + 18);
    const snippet = original.slice(start, end).trim();
    return `${start > 0 ? "…" : ""}${snippet}${end < original.length ? "…" : ""}`;
  }
  return null;
}

export function recognizeEntryDepth(text: string): EntryRecognition {
  const trimmed = (text ?? "").trim();
  const lower = trimmed.toLowerCase();
  const sug = extractJournalSuggestions(trimmed);

  const works: RecognizedWork[] = sug.skillSlugs.map((slug) => ({
    slug,
    evidence: evidenceFor(slug, lower, trimmed),
  }));

  const timeMentions = countTimeMentions(trimmed);
  const hours: RecognizedHours | null = sug.time
    ? { value: sug.time.value, unit: sug.time.unitSlug, certain: timeMentions <= 1 }
    : null;

  let certainty: EntryRecognition["certainty"];
  if (works.length === 0) certainty = "unclear";
  else if (timeMentions > 1) certainty = "partial";
  else certainty = "clear";

  return {
    works,
    hours,
    timeMentions,
    certainty,
    needsClarification: certainty !== "clear",
  };
}
