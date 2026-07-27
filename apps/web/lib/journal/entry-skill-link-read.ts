import "server-only";

import {
  parseEntrySkillProvenance,
  type EntrySkillProvenance,
} from "@/lib/journal/entry-skill-source";
import type { EntrySkillLinkRow } from "@/lib/journal/journal-entry-skills";

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
 */
export type WorkerEntrySkillLinksRead = {
  /** False when even the fallback read failed (page renders without links). */
  ok: boolean;
  rows: EntrySkillLinkRow[];
  /** entry id → (skill id → stored provenance | null). Empty pre-migration. */
  provenanceByEntry: Map<string, Map<string, EntrySkillProvenance | null>>;
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

  let res = await supabase
    .from("journal_entry_skills")
    .select("journal_entry_id, skill_id, provenance")
    .eq("worker_id", workerId);

  if (!res.error) {
    for (const r of (res.data ?? []) as {
      journal_entry_id: string;
      skill_id: string;
      provenance?: unknown;
    }[]) {
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
    res = await supabase
      .from("journal_entry_skills")
      .select("journal_entry_id, skill_id")
      .eq("worker_id", workerId);
  }

  if (res.error) return { ok: false, rows: [], provenanceByEntry: new Map() };
  return {
    ok: true,
    rows: (res.data ?? []) as EntrySkillLinkRow[],
    provenanceByEntry,
  };
}
