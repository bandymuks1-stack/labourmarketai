/**
 * Journal entry skill-chip SOURCE (stale-skill review state, PR B).
 *
 * Old journal entries can carry wrong/stale skill links (e.g. construction
 * chips on a dog-walking entry from an earlier biased recognizer). The UI must
 * NOT present an unsupported link as clean current evidence. This module derives
 * an HONEST source for each per-entry skill chip from REAL signals.
 *
 * Since migration 20260727180000_journal_entry_skill_provenance_v1 the link
 * table carries a nullable `provenance` column stamped on NEW rows
 * ('recognized' | 'confirmed' | 'manual'). When a stored provenance is
 * present it is PREFERRED — it is a write-time fact, not a render-time guess.
 * Historic rows (provenance NULL — "derived, pre-provenance") and
 * environments where the migration is not applied yet keep today's
 * derivation:
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

/** Write-time provenance stored on `journal_entry_skills.provenance`
 *  (nullable — NULL on historic rows = "derived, pre-provenance"). */
export type EntrySkillProvenance = "recognized" | "confirmed" | "manual";

/** Runtime validator for DB-read provenance values (defensive: an unknown
 *  string from an older/newer schema is treated as absent, never trusted). */
export function parseEntrySkillProvenance(
  value: unknown,
): EntrySkillProvenance | null {
  return value === "recognized" || value === "confirmed" || value === "manual"
    ? value
    : null;
}

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
  /** Stored write-time provenance of the link row (NULL/undefined on historic
   *  rows and while the column is unapplied — then derivation decides). */
  readonly storedProvenance?: EntrySkillProvenance | null;
}

/** Classify one entry/skill pair into its honest source state. */
export function classifyEntrySkillSource(s: EntrySkillSignals): EntrySkillSource {
  if (!s.linked) return "profile_skill_available_to_link";
  // A real manager/client confirmation always outranks link provenance.
  if (s.verified) return "confirmed_by_person";
  // Stored write-time provenance is a FACT about how the link was created —
  // prefer it over the render-time re-derivation:
  //  - 'recognized': the pipeline linked it from this entry's text.
  //  - 'confirmed' / 'manual': the WORKER's own explicit decision on this
  //    entry (one-tap candidate confirm / manual link). Shown plainly as a
  //    deliberate link — never re-flagged as "stale" by a recognizer that
  //    cannot see the decision. (No separate UI bucket exists for the
  //    worker's confirm; "manually linked" is the honest existing framing —
  //    it claims deliberate human action, not recognition.)
  if (s.storedProvenance === "recognized") return "recognized_from_text";
  if (s.storedProvenance === "confirmed" || s.storedProvenance === "manual") {
    return "manually_linked_to_entry";
  }
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
 * @param provenanceBySkillId stored `provenance` per linked skill id (optional;
 *                            absent while the column is unapplied / historic)
 */
export function buildEntrySkillSources(input: {
  readonly linkedSkillIds: readonly string[];
  readonly idToSlug: ReadonlyMap<string, string>;
  readonly verifiedSkillIds: ReadonlySet<string>;
  readonly recognizedSlugs: ReadonlySet<string>;
  readonly recognizableSlugs: ReadonlySet<string>;
  readonly provenanceBySkillId?: ReadonlyMap<string, EntrySkillProvenance | null>;
}): Record<string, EntrySkillSource> {
  const out: Record<string, EntrySkillSource> = {};
  for (const id of input.linkedSkillIds) {
    const slug = input.idToSlug.get(id);
    out[id] = classifyEntrySkillSource({
      linked: true,
      verified: input.verifiedSkillIds.has(id),
      recognizedFromText: slug != null && input.recognizedSlugs.has(slug),
      recognizable: slug != null && input.recognizableSlugs.has(slug),
      storedProvenance: input.provenanceBySkillId?.get(id) ?? null,
    });
  }
  return out;
}
