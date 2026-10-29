import "server-only";

import {
  parseEntrySkillProvenance,
  type EntrySkillProvenance,
} from "@/lib/journal/entry-skill-source";
import type { EntrySkillLinkRow } from "@/lib/journal/journal-entry-skills";
import { readAllPages } from "@/lib/journal/journal-list-core";
import { readDisputedEntrySkills, withoutDisputedLinks } from "@/lib/journal/entry-skill-disputes";

/**
 * Read side of the journal entry ↔ skill link table (PR-C).
 *
 * Reads the worker's OWN link rows TOGETHER with the stored write-time
 * `provenance` column (migration 20260727180000). Environments where that
 * migration is not applied yet fail the extended select with
 * undefined_column — then the read falls back to the pre-provenance
 * projection, so the page keeps rendering and the source derivation covers
 * every row (exactly the pre-PR-C behavior). Honest degradation: nothing is
 * guessed, the provenance map is simply empty.
 *
 * BOUNDED READ, SAID SO (issue #1689, SEP-7): PostgREST caps an unbounded
 * select at `max_rows` (1000) without a word, and a worker with more link
 * rows than that silently lost the oldest links — entries then read as
 * "linked to no skill" and their hours as unattributed. The read now pages
 * with `.range()` (the same helper the journal list uses) under a total
 * order, and `truncated` says when the ceiling was hit.
 */
export type WorkerEntrySkillLinksRead = {
  /** False when even the fallback read failed (page renders without links). */
  ok: boolean;
  rows: EntrySkillLinkRow[];
  /** entry id → (skill id → stored provenance | null). Empty pre-migration. */
  provenanceByEntry: Map<string, Map<string, EntrySkillProvenance | null>>;
  /** True when the page ceiling was hit with a full last page — older links
   *  MAY exist and are not in `rows`. */
  truncated: boolean;
};

export async function readWorkerEntrySkillLinks(
  // The link table is not in the generated Supabase types yet — same `any`
  // routing as the write path (RLS still scopes rows to the caller).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  workerId: string,
): Promise<WorkerEntrySkillLinksRead> {
  const provenanceByEntry = new Map<
    string,
    Map<string, EntrySkillProvenance | null>
  >();

  type LinkRow = { journal_entry_id: string; skill_id: string; provenance?: unknown };
  // A total order (entry id, then skill id — the table's own key) so the
  // pages never repeat or skip a row.
  const build = (select: string) => () =>
    supabase
      .from("journal_entry_skills")
      .select(select)
      .eq("worker_id", workerId)
      .order("journal_entry_id", { ascending: true })
      .order("skill_id", { ascending: true });

  let res = await readAllPages<LinkRow>(build("journal_entry_id, skill_id, provenance"));

  if (!res.error) {
    for (const r of res.rows) {
      let m = provenanceByEntry.get(r.journal_entry_id);
      if (!m) {
        m = new Map();
        provenanceByEntry.set(r.journal_entry_id, m);
      }
      m.set(r.skill_id, parseEntrySkillProvenance(r.provenance));
    }
  } else {
    // Pre-migration environment (or any select failure on the extended
    // projection): retry the exact pre-PR-C read.
    res = await readAllPages<LinkRow>(build("journal_entry_id, skill_id"));
  }

  if (res.error) {
    return { ok: false, rows: [], provenanceByEntry: new Map(), truncated: false };
  }
  // A disputed link is never shown as the entry's evidence, even while its
  // row still exists (entry-skill-disputes.ts).
  const disputed = await readDisputedEntrySkills(supabase, workerId);
  return {
    ok: true,
    rows: withoutDisputedLinks(
      res.rows.map((r) => ({ journal_entry_id: r.journal_entry_id, skill_id: r.skill_id })),
      disputed,
    ),
    provenanceByEntry,
    truncated: res.truncated,
  };
}

/** Most entries one slug-link read may ask about — a bounded window, never a
 *  whole history (callers pass their own recent page). */
export const ENTRY_SKILL_SLUGS_MAX_ENTRIES = 100;

/**
 * The linked skill SLUGS of a few known entries — for a consumer that holds a
 * recent page of the person's entries (the consequence trace) and must not
 * page the whole link table to name what those entries show.
 *
 * Same table, same RLS (the caller's own client); bounded by the entry ids
 * given. `null` = the read failed (UNKNOWN) — never an empty map that would
 * read as "linked to no skill". An entry with no link is simply absent.
 */
export async function readEntrySkillSlugs(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  entryIds: readonly string[],
): Promise<Map<string, string[]> | null> {
  const ids = [...new Set(entryIds)].slice(0, ENTRY_SKILL_SLUGS_MAX_ENTRIES);
  const out = new Map<string, string[]>();
  if (ids.length === 0) return out;
  try {
    const res = await supabase
      .from("journal_entry_skills")
      .select("journal_entry_id, skills(slug)")
      .in("journal_entry_id", ids);
    if (res.error) return null;
    for (const row of (res.data ?? []) as {
      journal_entry_id: string;
      skills: { slug: string | null } | null;
    }[]) {
      const slug = row.skills?.slug;
      if (!slug) continue;
      const list = out.get(row.journal_entry_id) ?? [];
      if (!list.includes(slug)) list.push(slug);
      out.set(row.journal_entry_id, list);
    }
    return out;
  } catch {
    return null;
  }
}
