import "server-only";
import { ENTRY_MARKER_SLUGS } from "@/lib/journal/entry-recognition-markers";
import { readAllPages } from "@/lib/journal/journal-list-core";

/**
 * THE PERSON'S DISPUTE IS THE SOURCE OF TRUTH for what an entry evidences.
 *
 * A dispute is the append-only, entry-scoped `skill_rejected` marker. The
 * evidence link it withdraws is a second row, and two writes can come apart
 * (the marker lands, the link delete does not). Every reader that turns entry
 * links into evidence — the worker-side tier (and through it scouting and
 * the opportunity ranking), the Living CV, the journal page — therefore drops
 * a link whose skill the person disputed ON THAT ENTRY, so a leftover link can
 * never surface as evidence. The withdrawal itself is idempotent and is
 * finished by a retry of the dispute or by any recognition re-run.
 *
 * Read under the caller's own RLS (the person reads their own entries'
 * metrics). `null` = the read failed: callers keep their links as they are
 * (no invented absence) and the repair paths still converge.
 */

/** `${entryId}|${skillId}` for every disputed (entry, skill) pair. */
export type DisputedEntrySkills = ReadonlySet<string>;

export const disputeKey = (entryId: string, skillId: string): string => `${entryId}|${skillId}`;

export async function readDisputedEntrySkills(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sb: any,
  workerId: string,
): Promise<DisputedEntrySkills | null> {
  try {
    // PAGED under a total order (PostgREST caps an unbounded select at
    // max_rows without a word — a marker past it would let its link
    // resurface). A read that hit the page ceiling is UNKNOWN, not complete.
    const read = await readAllPages<{ entry_id: string; value_text: string | null }>(() =>
      sb
        .from("journal_entry_metrics")
        .select("entry_id, value_text, journal_entries!inner(worker_id)")
        .eq("metric_slug", ENTRY_MARKER_SLUGS.skillRejected)
        .eq("journal_entries.worker_id", workerId)
        .order("created_at", { ascending: true })
        .order("id", { ascending: true }),
    );
    if (read.error || read.truncated) return null;
    const rows = read.rows.filter(
      (m) => typeof m.entry_id === "string" && typeof m.value_text === "string" && m.value_text !== "",
    );
    if (rows.length === 0) return new Set();
    const slugs = [...new Set(rows.map((m) => m.value_text as string))];
    const { data: skills, error: skillErr } = await sb.from("skills").select("id, slug").in("slug", slugs);
    if (skillErr) return null;
    const idBySlug = new Map(
      ((skills ?? []) as { id: string; slug: string | null }[])
        .filter((s) => typeof s.slug === "string")
        .map((s) => [s.slug as string, s.id]),
    );
    const out = new Set<string>();
    for (const m of rows) {
      const id = idBySlug.get(m.value_text as string);
      if (id) out.add(disputeKey(m.entry_id, id));
    }
    return out;
  } catch {
    return null;
  }
}

/** Drop the links the person disputed on their entry (pure). */
export function withoutDisputedLinks<T extends { journal_entry_id: string; skill_id: string }>(
  links: readonly T[],
  disputed: DisputedEntrySkills | null,
): T[] {
  if (!disputed || disputed.size === 0) return [...links];
  return links.filter((l) => !disputed.has(disputeKey(l.journal_entry_id, l.skill_id)));
}
