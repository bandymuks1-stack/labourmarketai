import "server-only";
import {
  ENTRY_MARKER_SLUGS,
  latestSkillDecisions,
  type EntryMarkerRow,
} from "@/lib/journal/entry-recognition-markers";
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
    const read = await readAllPages<{
      entry_id: string;
      metric_slug: string | null;
      value_text: string | null;
      value_numeric: number | null;
    }>(() =>
      sb
        .from("journal_entry_metrics")
        .select("entry_id, metric_slug, value_text, value_numeric, journal_entries!inner(worker_id)")
        .in("metric_slug", [ENTRY_MARKER_SLUGS.skillRejected, ENTRY_MARKER_SLUGS.skillReaffirmed])
        .eq("journal_entries.worker_id", workerId)
        .order("created_at", { ascending: true })
        .order("id", { ascending: true }),
    );
    if (read.error || read.truncated) return null;
    // The person's LATEST decision per (entry, slug) wins: a later explicit
    // re-link supersedes an earlier dispute (never recognition alone).
    const byEntry = new Map<string, EntryMarkerRow[]>();
    for (const m of read.rows) {
      if (typeof m.entry_id !== "string") continue;
      const list = byEntry.get(m.entry_id) ?? [];
      list.push({ metric_slug: m.metric_slug ?? ENTRY_MARKER_SLUGS.skillRejected, value_text: m.value_text, value_numeric: m.value_numeric ?? null });
      byEntry.set(m.entry_id, list);
    }
    // ...read across each entry's edit chain (readEntryPredecessors below):
    // an edit carries a rejection forward but not a later re-link.
    let preds = new Map<string, string[]>();
    if (byEntry.size > 0) {
      const chain = await readAllPages<{ id: string; superseded_by: string | null; correction_of: string | null }>(() =>
        sb
          .from("journal_entries")
          .select("id, superseded_by, correction_of")
          .eq("worker_id", workerId)
          .order("id", { ascending: true }),
      );
      if (!chain.error && !chain.truncated) {
        const walked = predecessorsByEntry(chain.rows);
        // An entry whose chain is longer than the bound is judged on its own
        // carried decisions only (the cautious reading) — the same entry on
        // which the decision writer refuses to append anything.
        preds = walked.preds;
        for (const id of walked.truncated) preds.set(id, []);
      }
    }
    const toJudge = new Set<string>(byEntry.keys());
    for (const [id, ps] of preds) if (ps.some((x) => byEntry.has(x))) toJudge.add(id);
    const rows: { entry_id: string; value_text: string }[] = [];
    for (const entryId of toJudge) {
      const list = [entryId, ...(preds.get(entryId) ?? [])].flatMap((id) => byEntry.get(id) ?? []);
      for (const [slug, decision] of latestSkillDecisions(list)) {
        if (decision === "rejected") rows.push({ entry_id: entryId, value_text: slug });
      }
    }
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

// ── The entry's EDIT CHAIN ─────────────────────────────────────────────────
// An edit supersedes an entry (old.superseded_by = new) and a correction of a
// confirmed entry points back at it (new.correction_of = old). The database
// carries an entry's `skill_rejected` markers onto its successor but not a
// later `skill_reaffirmed` (journal_entry_supersede_v2), so the person's
// decision is read across the WHOLE chain, latest decision winning — never
// from the newest entry's own copies alone.

const MAX_CHAIN = 50;

/** Every predecessor of `entryId` in its edit/correction chain (bounded).
 *  `null` = the chain could not be read completely (a failure, never a
 *  shorter history). */
export async function readEntryPredecessors(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sb: any,
  entryId: string,
): Promise<string[] | null> {
  const seen = new Set<string>([entryId]);
  const out: string[] = [];
  let frontier = [entryId];
  try {
    // One probe hop past the bound: a chain of exactly MAX_CHAIN
    // predecessors is complete; only one that keeps going is not.
    for (let hop = 0; hop <= MAX_CHAIN && frontier.length > 0; hop += 1) {
      const [byEdit, self] = await Promise.all([
        sb.from("journal_entries").select("id").in("superseded_by", frontier),
        sb.from("journal_entries").select("correction_of").in("id", frontier),
      ]);
      if (byEdit?.error || self?.error) return null;
      const next: string[] = [];
      for (const r of (byEdit?.data ?? []) as { id?: unknown }[]) {
        if (typeof r.id === "string" && !seen.has(r.id)) next.push(r.id);
      }
      for (const r of (self?.data ?? []) as { correction_of?: unknown }[]) {
        if (typeof r.correction_of === "string" && !seen.has(r.correction_of)) next.push(r.correction_of);
      }
      frontier = [...new Set(next)];
      if (hop === MAX_CHAIN) break; // the probe hop: record nothing past the bound
      for (const id of frontier) {
        seen.add(id);
        out.push(id);
      }
    }
    if (frontier.length > 0) return null; // longer than the bound: incomplete
  } catch {
    return null;
  }
  return out;
}

/** The person's skill decisions on `entryId` AND its predecessors. */
export async function readEntryChainDecisionRows(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sb: any,
  entryId: string,
): Promise<EntryMarkerRow[] | null> {
  try {
    return await readChainDecisions(sb, entryId);
  } catch {
    return null;
  }
}

async function readChainDecisions(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sb: any,
  entryId: string,
): Promise<EntryMarkerRow[] | null> {
  const preds = await readEntryPredecessors(sb, entryId);
  if (preds === null) return null;
  const chain = [entryId, ...preds];
  // PAGED under a total order; an incomplete read is a FAILURE (null): no
  // decision is applied from it and no reversal is appended on it.
  const read = await readAllPages<EntryMarkerRow & { entry_id?: string }>(() =>
    sb
      .from("journal_entry_metrics")
      .select("entry_id, metric_slug, value_text, value_numeric")
      .in("entry_id", chain)
      .in("metric_slug", [ENTRY_MARKER_SLUGS.skillRejected, ENTRY_MARKER_SLUGS.skillReaffirmed])
      .order("created_at", { ascending: true })
      .order("id", { ascending: true }),
  );
  if (read.error || read.truncated) return null;
  return read.rows.filter(
    (r) =>
      (r.entry_id === undefined || chain.includes(r.entry_id)) &&
      (r.metric_slug === ENTRY_MARKER_SLUGS.skillRejected ||
        r.metric_slug === ENTRY_MARKER_SLUGS.skillReaffirmed),
  );
}

/** Pure: each entry's predecessors from (id, superseded_by, correction_of)
 *  rows, with the SAME bound as `readEntryPredecessors`: up to MAX_CHAIN
 *  predecessors are complete; an entry whose chain goes on past that is
 *  listed in `truncated` (incomplete), exactly where the writer refuses. */
export function predecessorsByEntry(
  rows: readonly { id: string; superseded_by: string | null; correction_of: string | null }[],
): { preds: Map<string, string[]>; truncated: Set<string> } {
  const direct = new Map<string, string[]>();
  const add = (child: string, parent: string) => {
    const list = direct.get(child) ?? [];
    if (!list.includes(parent)) list.push(parent);
    direct.set(child, list);
  };
  for (const r of rows) {
    if (r.superseded_by) add(r.superseded_by, r.id);
    if (r.correction_of) add(r.id, r.correction_of);
  }
  const preds = new Map<string, string[]>();
  const truncated = new Set<string>();
  for (const id of new Set(rows.map((r) => r.id))) {
    const seen = new Set<string>([id]);
    const out: string[] = [];
    let frontier = [id];
    for (let hop = 0; hop <= MAX_CHAIN && frontier.length > 0; hop += 1) {
      const next: string[] = [];
      for (const f of frontier) {
        for (const p of direct.get(f) ?? []) {
          if (seen.has(p) || next.includes(p)) continue;
          next.push(p);
        }
      }
      frontier = next;
      if (hop === MAX_CHAIN) break; // the probe hop
      for (const p of next) {
        seen.add(p);
        out.push(p);
      }
    }
    if (frontier.length > 0) truncated.add(id);
    preds.set(id, out);
  }
  return { preds, truncated };
}
