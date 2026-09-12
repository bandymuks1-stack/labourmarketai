/**
 * PENDING skill candidates of a SAVED journal entry, at render time (issue
 * #1689, observed 2026-09-12: a candidate was decidable only in the minute
 * after the save — on the composer's result card and the chat's done card.
 * A worker who logged the day and closed the chat, or whose entry was saved
 * before a lexicon learned a word, had no place to say "yes, that was
 * testing" — the journal card showed the recognized labels as display-only
 * text and the candidate was silently gone).
 *
 * This is the ONE derivation the pipeline and the confirm / reject trust
 * boundary run (`deriveJournalRecognition`), over the entry's saved text and
 * its own append-only markers (`readEntryRecognitionMarkers`) — the same
 * inputs `loadEntryRecognitionInputs` assembles server-side — read here
 * without IO for the page that already holds the rows. What comes out is
 * exactly the `fuzzy_skill` candidates `confirmJournalSkillCandidate` /
 * `rejectJournalSkillCandidate` will accept for this entry: the server
 * re-derives and membership-checks on every decision, so nothing here is
 * trusted; it only shows the worker what they may decide.
 *
 * Pure, deterministic, no DB write, no auto-attach. An ambiguous candidate
 * (several curated readings) keeps its composer-only choice flow for now —
 * the card offers the yes / no decisions only.
 */
import {
  deriveJournalRecognition,
  type JournalRecognitionCandidate,
} from "@/lib/journal/journal-recognition";
import {
  readEntryRecognitionMarkers,
  type EntryMarkerRow,
} from "@/lib/journal/entry-recognition-markers";
import { ENTRY_RECOGNITION_TEXT_CAP } from "@/lib/journal/entry-detected-signals";

export type EntryPendingCandidate = {
  /** Canonical taxonomy slug — the value the decision actions take. */
  slug: string;
  /** Localized taxonomy name for the card (never a raw slug). */
  name: string;
};

export function pendingEntryCandidates(input: {
  /** The entry's saved original text. */
  text: string;
  /** The entry's metric rows (markers are read from them). */
  metrics: readonly EntryMarkerRow[] | null | undefined;
  /** Slugs of the worker's declared profile skills (the derivation's
   *  declared-slug rule: a declared slug lane 1 reads is recognized, not a
   *  candidate; lane 4b's catalogue offer stays an offer even for a declared
   *  slug — the worker links it to THESE hours by their word). */
  declaredSlugs: ReadonlySet<string>;
  /** Slugs already linked to THIS entry — an offer for one of them is moot. */
  linkedSlugs: ReadonlySet<string>;
  /** Localized taxonomy name for a slug; null → the candidate is not shown
   *  (a raw slug must never reach the UI). */
  skillNameOf: (slug: string) => string | null;
}): EntryPendingCandidate[] {
  const text = (input.text ?? "").slice(0, ENTRY_RECOGNITION_TEXT_CAP);
  if (text.trim().length === 0) return [];
  const markers = readEntryRecognitionMarkers(input.metrics ?? []);
  const derived = deriveJournalRecognition(text, {
    declaredSlugs: input.declaredSlugs,
    entryRejections: {
      slugs: markers.rejectedSlugs,
      claimLabels: markers.rejectedClaims,
    },
    entryResolutions: markers.entryResolutions,
  });
  return fuzzyCandidatesOf(derived.candidates, input.linkedSlugs, input.skillNameOf);
}

/** The decidable subset of a derivation's candidates: `fuzzy_skill` rows with
 *  a slug not already linked to the entry, each carrying a localized name. */
export function fuzzyCandidatesOf(
  candidates: readonly JournalRecognitionCandidate[],
  linkedSlugs: ReadonlySet<string>,
  skillNameOf: (slug: string) => string | null,
): EntryPendingCandidate[] {
  const out: EntryPendingCandidate[] = [];
  const seen = new Set<string>();
  for (const c of candidates) {
    if (c.kind !== "fuzzy_skill" || !c.slug) continue;
    if (linkedSlugs.has(c.slug) || seen.has(c.slug)) continue;
    const name = skillNameOf(c.slug);
    if (!name) continue;
    seen.add(c.slug);
    out.push({ slug: c.slug, name });
  }
  return out;
}
