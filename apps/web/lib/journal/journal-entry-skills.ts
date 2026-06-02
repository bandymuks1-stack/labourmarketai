/**
 * Journal Entry ↔ Skill links v1 — pure derivation helpers.
 *
 * These operate on the durable `journal_entry_skills` rows (one row per
 * (entry, skill) the worker has marked as evidence-support). They are pure so
 * both the journal page (input surface) and the profile hub (output surface)
 * read the SAME shape, and so the relation logic is unit-tested without a DB.
 *
 * This is evidence-SUPPORT, never verification: a link means "the worker says
 * this work entry supports this declared skill", not that anyone verified it.
 */

export type EntrySkillLinkRow = {
  journal_entry_id: string;
  skill_id: string;
};

/** entry_id → the skill ids that entry supports (for pre-selecting toggles). */
export function groupLinkedSkillIdsByEntry(
  rows: ReadonlyArray<EntrySkillLinkRow>,
): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const r of rows) {
    const list = out.get(r.journal_entry_id) ?? [];
    if (!list.includes(r.skill_id)) list.push(r.skill_id);
    out.set(r.journal_entry_id, list);
  }
  return out;
}

/** skill_id → number of DISTINCT journal entries that support it. */
export function countEntriesBySkill(
  rows: ReadonlyArray<EntrySkillLinkRow>,
): Map<string, number> {
  const seen = new Map<string, Set<string>>();
  for (const r of rows) {
    const set = seen.get(r.skill_id) ?? new Set<string>();
    set.add(r.journal_entry_id);
    seen.set(r.skill_id, set);
  }
  const out = new Map<string, number>();
  for (const [skillId, entries] of seen) out.set(skillId, entries.size);
  return out;
}

/** The set of skill ids backed by at least one journal entry (durable support). */
export function supportedSkillIds(
  rows: ReadonlyArray<EntrySkillLinkRow>,
): Set<string> {
  return new Set(rows.map((r) => r.skill_id));
}
