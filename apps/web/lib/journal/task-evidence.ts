import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import { isMigrationMissingCode } from "@/lib/tasks/task-model";
import { JOURNAL_ENTRY_METRICS_EMBED } from "@/lib/journal/journal-list-core";
import { deriveReviewResult, isConfirmedEntry, type ConfirmationRow } from "@/lib/journal/review-status";
import { deriveEntryWorkTime, type WorkTimeMetricRow } from "@/lib/journal/work-time";
import {
  NO_READABLE_NAME,
  resolveWorkerName,
  WORKER_NAME_FIELDS,
  type WorkerNameRow,
} from "@/lib/journal/worker-name";
import {
  LINKABLE_ENTRY_LIMIT,
  TASK_EVIDENCE_READ_LIMIT,
  ZERO_EVIDENCE_SUMMARY,
  deriveEvidenceSummary,
  type LinkableEntry,
  type TaskEvidenceItem,
  type TaskEvidenceResult,
} from "@/lib/journal/task-evidence-model";

/**
 * Task evidence read service (field-work audit v1, P0 train).
 *
 * Reads the `journal_entry_tasks` link with the caller's RLS-scoped client.
 * The link's own policy makes a row readable EXACTLY where the underlying
 * journal entry is readable — so this service can never widen journal
 * visibility, only mirror it. A project manager who cannot read an entry
 * cannot see that it was linked either.
 *
 * INTERNAL ONLY: no email, no SMS, no push, no webhook, no outbound call.
 *
 * Honest degradation: until the owner-gated migration
 * (20260819190000_journal_task_evidence_link_v1) is applied, the reads see
 * 42P01/42703/PGRST202 and report { status: "needs-migration" }. The task
 * surface then states plainly that evidence linking is not available yet.
 * Nothing is faked and nothing throws into the page.
 */

const UUID_RX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// The generated supabase-js types are built from the schema cache and do not
// include `journal_entry_tasks` until the migration is applied AND types are
// regenerated. The runtime calls are correct; the cast suppresses the static
// name check (the established work_tasks precedent).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(supabase: SupabaseClient): any {
  return supabase;
}

/** One journal entry as this reader embeds it - live or not (see `resolveCurrentEntries`). */
type EntryEmbed = {
  id: string;
  worker_id: string;
  project_id?: string | null;
  original_text: string;
  original_language: string;
  created_at: string;
  deleted_at?: string | null;
  superseded_by?: string | null;
  correction_of?: string | null;
  journal_entry_photos: { id: string }[] | null;
  journal_entry_confirmations: ConfirmationRow[] | null;
  journal_entry_metrics: WorkTimeMetricRow[] | null;
  workers: AuthorEmbed | AuthorEmbed[];
};

type AuthorEmbed = NonNullable<WorkerNameRow> & { profile_id?: string | null };

type LinkRow = {
  id: string;
  entry_id: string;
  linked_at: string;
  linked_by: string | null;
  journal_entries: EntryEmbed | null;
};

/** The entry columns, deleted / superseded / correction state INCLUDED: the
 *  link read must SEE a replaced entry to follow it to its current version. */
const ENTRY_SELECT =
  "id, worker_id, project_id, original_text, original_language, created_at, " +
  "deleted_at, superseded_by, correction_of, " +
  `journal_entry_photos(id), journal_entry_confirmations(confirmation_scope, created_at, confirmer_id), ` +
  `${JOURNAL_ENTRY_METRICS_EMBED}, workers(profile_id, ${WORKER_NAME_FIELDS})`;

const LINK_SELECT =
  "id, entry_id, linked_at, linked_by, " + `journal_entries!inner(${ENTRY_SELECT})`;

/** How many edit / correction hops are followed before the chain is treated
 *  as unreadable. A real chain is one or two long. */
const MAX_CHAIN_HOPS = 6;

/**
 * THE CURRENT VERSION OF EACH LINKED ENTRY (audit G-2).
 *
 * `journal_entry_tasks` links a task to the entry that existed when it was
 * attached. Afterwards the entry may be
 *   - DELETED (`journal_entry_soft_delete` does not touch links) - the task
 *     must stop listing its text and hours;
 *   - EDITED while unconfirmed (`journal_entry_supersede_v2` stamps
 *     `superseded_by` on the old row and does not carry the link) - the task
 *     must show the NEW text/hours, not the withdrawn ones;
 *   - CORRECTED after confirmation (the original keeps `superseded_by` NULL by
 *     design and the correction points back through `correction_of`) - one day
 *     of work, counted once (`counted-once.ts`), by its live correction.
 * Before this the reader filtered nothing: after an edit the task still showed
 * the old entry and the edited version was linked to nothing.
 *
 * Returns original-entry-id -> its current LIVE entry, or `null` for an entry
 * that is gone (deleted). A failed follow-up read returns "error" - an
 * unreadable chain is NOT "no evidence" (SEP-7).
 */
async function resolveCurrentEntries(
  supabase: SupabaseClient,
  linked: readonly EntryEmbed[],
): Promise<Map<string, EntryEmbed | null> | "error"> {
  const result = new Map<string, EntryEmbed | null>();
  // frontier: original id -> the entry we currently stand on for it
  let frontier = new Map<string, EntryEmbed>();
  for (const e of linked) frontier.set(e.id, e);

  for (let hop = 0; hop < MAX_CHAIN_HOPS && frontier.size > 0; hop++) {
    const needSuccessorById = new Map<string, string>(); // origId -> superseded_by id
    const needCorrectionCheck = new Map<string, EntryEmbed>(); // origId -> live entry
    for (const [orig, e] of frontier) {
      if (e.deleted_at) result.set(orig, null);
      else if (e.superseded_by) needSuccessorById.set(orig, e.superseded_by);
      else needCorrectionCheck.set(orig, e);
    }
    const next = new Map<string, EntryEmbed>();

    // superseded -> fetch the replacing row
    if (needSuccessorById.size > 0) {
      const ids = [...new Set(needSuccessorById.values())];
      const res = await asAny(supabase).from("journal_entries").select(ENTRY_SELECT).in("id", ids);
      if (res.error) return "error";
      const byId = new Map(((res.data ?? []) as EntryEmbed[]).map((e) => [e.id, e]));
      for (const [orig, succId] of needSuccessorById) {
        const succ = byId.get(succId);
        // A replacing row the caller cannot read cannot be shown, and the old
        // text must not stand in for it.
        if (succ) next.set(orig, succ);
        else result.set(orig, null);
      }
    }

    // live -> is there a live correction of it?
    if (needCorrectionCheck.size > 0) {
      const ids = [...new Set([...needCorrectionCheck.values()].map((e) => e.id))];
      const res = await asAny(supabase)
        .from("journal_entries")
        .select(ENTRY_SELECT)
        .in("correction_of", ids)
        .is("deleted_at", null)
        .is("superseded_by", null);
      if (res.error) return "error";
      const successorOf = new Map<string, EntryEmbed>();
      for (const c of (res.data ?? []) as EntryEmbed[]) {
        if (c.correction_of) successorOf.set(c.correction_of, c);
      }
      for (const [orig, e] of needCorrectionCheck) {
        const corr = successorOf.get(e.id);
        if (corr) next.set(orig, corr);
        else result.set(orig, e);
      }
    }
    frontier = next;
  }
  // A chain longer than the hop budget cannot be shown honestly.
  if (frontier.size > 0) return "error";
  return result;
}

/** Link rows -> items on the CURRENT version of each entry, each entry once. */
async function toCurrentItems(
  supabase: SupabaseClient,
  rows: readonly LinkRow[],
): Promise<
  { ok: true; items: { taskId?: string; item: TaskEvidenceItem }[] } | { ok: false }
> {
  const linked = rows.map((r) => r.journal_entries).filter((e): e is EntryEmbed => e !== null);
  const current = await resolveCurrentEntries(supabase, linked);
  if (current === "error") return { ok: false };
  const out: { taskId?: string; item: TaskEvidenceItem }[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const orig = row.journal_entries;
    if (!orig) continue;
    const cur = current.get(orig.id);
    if (!cur) continue; // deleted / unreadable replacement: not evidence
    const taskId = (row as LinkRow & { task_id?: string }).task_id;
    const dedupe = `${taskId ?? ""}|${cur.id}`;
    if (seen.has(dedupe)) continue;
    seen.add(dedupe);
    const item = toItem({ ...row, journal_entries: cur });
    if (item) out.push({ taskId, item });
  }
  return { ok: true, items: out };
}

function toItem(row: LinkRow): TaskEvidenceItem | null {
  const e = row.journal_entries;
  if (!e) return null;
  // ONE definition of "confirmed" (lib/journal/review-status.ts): the latest
  // decision is an approval by someone other than the author. The old test -
  // "any decision row exists" - read a rejection and the author's own approval
  // as manager-confirmed.
  const author = Array.isArray(e.workers) ? (e.workers[0] ?? null) : e.workers;
  const confirmations = e.journal_entry_confirmations ?? [];
  const confirmedAt = isConfirmedEntry(confirmations, author?.profile_id ?? null)
    ? (confirmations
        .filter((c) => deriveReviewResult([c]) === "approved")
        .map((c) => c.created_at ?? "")
        .sort()[0] ?? null)
    : null;
  return {
    linkId: row.id,
    entryId: e.id,
    workerId: e.worker_id,
    originalText: e.original_text,
    originalLanguage: e.original_language,
    entryCreatedAt: e.created_at,
    linkedAt: row.linked_at,
    linkedBy: row.linked_by,
    photoCount: (e.journal_entry_photos ?? []).length,
    confirmedAt,
    entryHours: entryHoursOf(e),
    authorName: authorNameOf(e.workers),
    entryProjectId: e.project_id ?? null,
  };
}

/** Hours from the ONE canonical derivation — no second hours computation. A
 *  figure only when it is a real positive hour total; otherwise null. */
function entryHoursOf(e: EntryEmbed): number | null {
  const metrics = e.journal_entry_metrics ?? [];
  if (metrics.length === 0) return null;
  const hours = deriveEntryWorkTime({
    entryId: e.id,
    createdAt: e.created_at,
    originalText: e.original_text,
    metrics,
  }).totalHours;
  return hours > 0 ? hours : null;
}

/** The author's name where the VIEWER may read it (existing journal name
 *  resolution); an unreadable name is omitted, not shown as a dash. */
function authorNameOf(workers: WorkerNameRow | WorkerNameRow[]): string | null {
  const row = Array.isArray(workers) ? (workers[0] ?? null) : workers;
  const name = resolveWorkerName(row ?? null);
  return name === NO_READABLE_NAME ? null : name;
}

/**
 * The evidence currently attached to one task, newest link first.
 * Withdrawn links (unlinked_at set) are excluded — a withdrawn claim is not
 * evidence — but they remain in the table forever (§4.3).
 */
export async function getTaskEvidence(
  taskId: string,
): Promise<TaskEvidenceResult> {
  if (!UUID_RX.test(taskId)) {
    return { status: "ok", items: [], summary: ZERO_EVIDENCE_SUMMARY };
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: "not-authed" };

  const res = await asAny(supabase)
    .from("journal_entry_tasks")
    .select(LINK_SELECT)
    .eq("task_id", taskId)
    .is("unlinked_at", null)
    .order("linked_at", { ascending: false })
    .limit(TASK_EVIDENCE_READ_LIMIT);

  if (res.error) {
    if (isMigrationMissingCode(res.error.code)) {
      return { status: "needs-migration" };
    }
    // FAILED IS NOT EMPTY (SEP-7): a failed read used to come back as "ok,
    // no evidence", which the task page rendered as "nothing is attached".
    return { status: "unreadable" };
  }

  const current = await toCurrentItems(supabase, (res.data ?? []) as LinkRow[]);
  if (!current.ok) return { status: "unreadable" };
  const items = current.items.map((i) => i.item);

  return { status: "ok", items, summary: deriveEvidenceSummary(items) };
}

export type TaskEvidenceBatch = {
  /** "needs-migration" once, for the whole page — never per card. */
  readonly status: "ok" | "needs-migration" | "unreadable";
  readonly itemsByTask: Readonly<Record<string, readonly TaskEvidenceItem[]>>;
};

export const EMPTY_EVIDENCE_BATCH: TaskEvidenceBatch = {
  status: "ok",
  itemsByTask: {},
};

/**
 * Evidence for MANY tasks in ONE bounded read (the getTaskCollaboration
 * precedent) — the tasks page renders a list, so a per-card read would be an
 * N+1 against the journal.
 */
export async function getTaskEvidenceByTask(
  taskIds: readonly string[],
): Promise<TaskEvidenceBatch> {
  const ids = [...new Set(taskIds.filter((id) => UUID_RX.test(id)))];
  if (ids.length === 0) return EMPTY_EVIDENCE_BATCH;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return EMPTY_EVIDENCE_BATCH;

  const res = await asAny(supabase)
    .from("journal_entry_tasks")
    .select(`task_id, ${LINK_SELECT}`)
    .in("task_id", ids)
    .is("unlinked_at", null)
    .order("linked_at", { ascending: false })
    .limit(TASK_EVIDENCE_READ_LIMIT);

  if (res.error) {
    if (isMigrationMissingCode(res.error.code)) {
      return { status: "needs-migration", itemsByTask: {} };
    }
    // FAILED IS NOT EMPTY (SEP-7): never "no evidence" for an unread link set.
    return { status: "unreadable", itemsByTask: {} };
  }

  const rows = (res.data ?? []) as (LinkRow & { task_id: string })[];
  const current = await toCurrentItems(supabase, rows);
  if (!current.ok) return { status: "unreadable", itemsByTask: {} };
  const itemsByTask: Record<string, TaskEvidenceItem[]> = {};
  for (const { taskId, item } of current.items) {
    if (!taskId) continue;
    (itemsByTask[taskId] ??= []).push(item);
  }
  return { status: "ok", itemsByTask };
}

/**
 * The caller's OWN recent journal entries, offered as attachable evidence.
 *
 * Deliberately scoped to the caller's own worker record: attaching somebody
 * else's work record to a task is a claim about another person's work, and
 * the honest path for that is the manager review chain, not a picker. RLS
 * would permit a manager to read those entries — the product does not offer
 * it here.
 *
 * Task-independent by design: the page already holds the evidence batch, so
 * `alreadyLinked` is derived there rather than re-queried per task (no N+1).
 */
export async function listWorkerLinkableEntries(): Promise<
  readonly LinkableEntry[]
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data: worker } = await asAny(supabase)
    .from("workers")
    .select("id")
    .eq("profile_id", user.id)
    .maybeSingle();
  if (!worker?.id) return [];

  const runEntries = (columns: string) =>
    asAny(supabase)
      .from("journal_entries")
      .select(columns)
      .eq("worker_id", worker.id)
      .is("deleted_at", null)
      .is("superseded_by", null)
      .order("created_at", { ascending: false })
      .limit(LINKABLE_ENTRY_LIMIT);
  // Project + organization let the picker mirror the server's consistency
  // check; if the embed is unavailable fall back to the original columns.
  let res = await runEntries(
    "id, original_text, created_at, project_id, engagement_contexts(organization_id), journal_entry_photos(id)",
  );
  if (res.error) {
    res = await runEntries("id, original_text, created_at, journal_entry_photos(id)");
  }
  if (res.error) return [];

  type EntryRow = {
    id: string;
    original_text: string;
    created_at: string;
    project_id?: string | null;
    engagement_contexts?: { organization_id: string | null } | { organization_id: string | null }[] | null;
    journal_entry_photos: { id: string }[] | null;
  };

  return ((res.data ?? []) as EntryRow[]).map((e) => ({
    entryId: e.id,
    originalText: e.original_text,
    createdAt: e.created_at,
    photoCount: (e.journal_entry_photos ?? []).length,
    // Resolved by the caller against the evidence batch it already holds.
    alreadyLinked: false,
    projectId: e.project_id ?? null,
    organizationId: Array.isArray(e.engagement_contexts)
      ? (e.engagement_contexts[0]?.organization_id ?? null)
      : (e.engagement_contexts?.organization_id ?? null),
  }));
}
