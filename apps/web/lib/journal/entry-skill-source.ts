/**
 * Journal entry skill-chip SOURCE (stale-skill review state, PR B).
 *
 * Old journal entries can carry wrong/stale skill links (e.g. construction
 * chips on a dog-walking entry from an earlier biased recognizer). The UI must
 * NOT present an unsupported link as clean current evidence. This module derives
 * an HONEST source for each per-entry skill chip from REAL signals only — there
 * is NO provenance column on `journal_entry_skills` (and migrations are out of
 * scope), so the source is computed, not stored:
 *
 *   - confirmed_by_person       → the skill is manager/client confirmed
 *                                 (worker_skills.verified = true). Real bridge.
 *   - recognized_from_text      → the current recognizer recognizes this skill
 *                                 from THIS entry's text. Grounded.
 *   - stale_needs_review        → linked, not confirmed, NOT recognized from the
 *                                 text, but the recognizer DOES know this skill
 *                                 (it is in the recognizable vocabulary). So the
 *                                 text does not support it → review it. This is
 *                                 exactly the old-construction-chip case.
 *   - manually_linked_to_entry  → linked, not confirmed, not recognized, and the
 *                                 recognizer cannot judge it (skill outside the
 *                                 recognizable vocabulary). An honest manual link
 *                                 we have no signal to doubt — shown plainly.
 *   - profile_skill_available_to_link → a profile skill NOT linked to this entry
 *                                 (offered behind the "link more" disclosure).
 *
 * Pure + deterministic + no IO, so it is unit-tested and both the journal page
 * and any guard read the SAME logic.
 */

export type EntrySkillSource =
  | "recognized_from_text"
  | "manually_linked_to_entry"
  | "confirmed_by_person"
  | "stale_needs_review"
  | "profile_skill_available_to_link";

/** A chip source that should read as clean current evidence (shown normally). */
export const CLEAN_EVIDENCE_SOURCES: ReadonlySet<EntrySkillSource> = new Set([
  "recognized_from_text",
  "confirmed_by_person",
  "manually_linked_to_entry",
]);

/** True when the source must NOT be presented as clean current evidence. */
export function needsReview(source: EntrySkillSource): boolean {
  return source === "stale_needs_review";
}

export interface EntrySkillSignals {
  /** Is there a journal_entry_skills row linking this skill to this entry? */
  readonly linked: boolean;
  /** worker_skills.verified — a real manager/client confirmation. */
  readonly verified: boolean;
  /** Does the current recognizer recognize this skill from this entry's text? */
  readonly recognizedFromText: boolean;
  /** Is this skill within the recognizer's known vocabulary at all? When false,
   *  the recognizer has no opinion, so an unsupported link is NOT flagged. */
  readonly recognizable: boolean;
}

/** Classify one entry/skill pair into its honest source state. */
export function classifyEntrySkillSource(s: EntrySkillSignals): EntrySkillSource {
  if (!s.linked) return "profile_skill_available_to_link";
  if (s.verified) return "confirmed_by_person";
  if (s.recognizedFromText) return "recognized_from_text";
  // Linked, not confirmed, not grounded in the text:
  //  - recognizer KNOWS this skill but the text doesn't support it → review.
  //  - recognizer can't judge it → honest manual link (don't over-flag).
  if (s.recognizable) return "stale_needs_review";
  return "manually_linked_to_entry";
}

/**
 * Build the source map for one entry's LINKED skills.
 *
 * @param linkedSkillIds   skill ids linked to this entry (journal_entry_skills)
 * @param idToSlug         worker skill id → slug
 * @param verifiedSkillIds skill ids with worker_skills.verified = true
 * @param recognizedSlugs  slugs the recognizer found in THIS entry's text
 * @param recognizableSlugs the recognizer's full known-skill vocabulary
 */
export function buildEntrySkillSources(input: {
  readonly linkedSkillIds: readonly string[];
  readonly idToSlug: ReadonlyMap<string, string>;
  readonly verifiedSkillIds: ReadonlySet<string>;
  readonly recognizedSlugs: ReadonlySet<string>;
  readonly recognizableSlugs: ReadonlySet<string>;
}): Record<string, EntrySkillSource> {
  const out: Record<string, EntrySkillSource> = {};
  for (const id of input.linkedSkillIds) {
    const slug = input.idToSlug.get(id);
    out[id] = classifyEntrySkillSource({
      linked: true,
      verified: input.verifiedSkillIds.has(id),
      recognizedFromText: slug != null && input.recognizedSlugs.has(slug),
      recognizable: slug != null && input.recognizableSlugs.has(slug),
    });
  }
  return out;
}
