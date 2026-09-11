import "server-only";

import { readWorkerCoreRow } from "@/lib/data/worker-core";
import type { DomainCaller } from "@/lib/domain/caller";
import { createClient } from "@/lib/supabase/server";
import { readWorkerEntrySkillLinks } from "@/lib/journal/entry-skill-link-read";
import type { EntrySkillProvenance } from "@/lib/journal/entry-skill-source";
import {
  listJournalEntries,
  type JournalEntryListRow,
} from "@/lib/journal/journal-list-core";
import { deriveReviewResult } from "@/lib/journal/review-status";
import {
  deriveWorkIntelligence,
  type WorkIntelligence,
  type WorkIntelligenceEntry,
  type WorkIntelligenceSkillRow,
  type WorkPeriodKey,
} from "@/lib/journal/work-intelligence";

/**
 * Read side of work intelligence — ONE assembly over the canonical reads.
 *
 * Reuses, never re-implements: the entries come from THE journal-list core
 * (the same read the page, the MCP `journal.list` capability and the export
 * use), the skill links from the one link reader, the declared skills from
 * `worker_skills`. RLS scopes every read to the caller; no admin client.
 *
 * Two entry points:
 *  · `assembleWorkIntelligence` — for a caller that has ALREADY loaded the
 *    rows (the journal page), so the figures are derived from exactly the
 *    entries it renders and no second read can disagree with the diary;
 *  · `loadWorkIntelligence` — for consumers that hold only the caller (the
 *    Living CV, the conversation), issuing the same three reads.
 *
 * Honest degradation: a failed read returns `null`, and the consumer renders
 * NOTHING for the figures rather than a zero that reads as "no work" (SEP-7:
 * UNKNOWN ≠ ZERO).
 */

/** A `worker_skills` row as the page and the CV already select it. */
export type WorkerSkillSourceRow = {
  skill_id: string | null;
  verified?: boolean | null;
  source?: string | null;
  skills: { slug: string | null } | null;
};

export function assembleWorkIntelligence(input: {
  entries: readonly JournalEntryListRow[];
  linksByEntry: ReadonlyMap<string, readonly string[]>;
  provenanceByEntry: ReadonlyMap<string, ReadonlyMap<string, EntrySkillProvenance | null>>;
  skillRows: readonly WorkerSkillSourceRow[];
  todayIso: string;
  focus?: WorkPeriodKey;
  /** Uploaded photos per entry id (from `readPhotoCountsByEntry`); omitted
   *  when the caller did not read photos. */
  photoCountByEntry?: ReadonlyMap<string, number>;
}): WorkIntelligence {
  const entries: WorkIntelligenceEntry[] = input.entries.map((e) => ({
    entryId: e.id,
    createdAt: e.created_at,
    originalText: e.original_text,
    metrics: e.journal_entry_metrics ?? [],
    engagementContextId: e.engagement_context_id ?? null,
    reviewResult: deriveReviewResult(e.journal_entry_confirmations),
    linkedSkillIds: input.linksByEntry.get(e.id) ?? [],
    linkProvenance: input.provenanceByEntry.get(e.id),
    photoCount: input.photoCountByEntry?.get(e.id) ?? 0,
  }));
  const skills: WorkIntelligenceSkillRow[] = [];
  for (const r of input.skillRows) {
    const slug = r.skills?.slug ?? null;
    if (!r.skill_id || !slug) continue;
    skills.push({
      skillId: r.skill_id,
      slug,
      verified: r.verified ?? null,
      source: r.source ?? null,
    });
  }
  return deriveWorkIntelligence({
    entries,
    skills,
    todayIso: input.todayIso,
    focus: input.focus,
  });
}

/**
 * Uploaded photos per entry — ONE bounded read over the caller's own live
 * entry ids (`journal_entry_photos` RLS scopes it to the owner). A failed
 * read yields an EMPTY map: the evidence-strength count then under-states
 * photos rather than inventing them, and the section still renders.
 */
export async function readPhotoCountsByEntry(
  // The photos table is outside the generated types (same routing as the
  // personal gallery); RLS still scopes rows to the caller.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  entryIds: readonly string[],
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (entryIds.length === 0) return out;
  const { data, error } = await supabase
    .from("journal_entry_photos")
    .select("entry_id")
    .in("entry_id", entryIds.slice(0, 500))
    .eq("upload_status", "uploaded");
  if (error || !Array.isArray(data)) return out;
  for (const r of data as { entry_id: string | null }[]) {
    if (!r.entry_id) continue;
    out.set(r.entry_id, (out.get(r.entry_id) ?? 0) + 1);
  }
  return out;
}

/** Today as the UTC calendar day — the same day key the journal groups by. */
export function workIntelligenceToday(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function loadWorkIntelligence(
  caller: DomainCaller,
  workerId: string,
): Promise<WorkIntelligence | null> {
  const [entriesRead, linkRead, skillsRead] = await Promise.all([
    listJournalEntries(caller, { workerId }),
    readWorkerEntrySkillLinks(caller.supabase, workerId),
    caller.supabase
      .from("worker_skills")
      .select("skill_id, verified, source, skills(slug)")
      .eq("worker_id", workerId),
  ]);
  if (!entriesRead.ok || !linkRead.ok || skillsRead.error) return null;
  const photoCountByEntry = await readPhotoCountsByEntry(
    caller.supabase,
    entriesRead.entries.map((e) => e.id),
  );

  const linksByEntry = new Map<string, string[]>();
  for (const r of linkRead.rows) {
    const list = linksByEntry.get(r.journal_entry_id) ?? [];
    if (!list.includes(r.skill_id)) list.push(r.skill_id);
    linksByEntry.set(r.journal_entry_id, list);
  }
  return assembleWorkIntelligence({
    entries: entriesRead.entries,
    linksByEntry,
    provenanceByEntry: linkRead.provenanceByEntry,
    skillRows: (skillsRead.data ?? []) as unknown as WorkerSkillSourceRow[],
    todayIso: workIntelligenceToday(),
    photoCountByEntry,
  });
}

/**
 * The signed-in person's own work intelligence — for consumers that hold no
 * caller yet (the conversation's answers). Resolves the worker through the
 * one core worker read; a person without a worker profile, or any failed
 * read, yields `null` (UNKNOWN), never an empty model that reads as "no work".
 */
export async function loadOwnWorkIntelligence(): Promise<WorkIntelligence | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const caller: DomainCaller = { supabase, userId: user.id };
  const worker = await readWorkerCoreRow(caller);
  if (!worker.ok || !worker.value) return null;
  return loadWorkIntelligence(caller, worker.value.id);
}
