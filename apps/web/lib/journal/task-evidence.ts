import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import { isMigrationMissingCode } from "@/lib/tasks/task-model";
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

type LinkRow = {
  id: string;
  entry_id: string;
  linked_at: string;
  linked_by: string | null;
  journal_entries: {
    id: string;
    worker_id: string;
    original_text: string;
    original_language: string;
    created_at: string;
    journal_entry_photos: { id: string }[] | null;
    journal_entry_confirmations: { created_at: string }[] | null;
  } | null;
};

const LINK_SELECT =
  "id, entry_id, linked_at, linked_by, " +
  "journal_entries!inner(id, worker_id, original_text, original_language, created_at, " +
  "journal_entry_photos(id), journal_entry_confirmations(created_at))";

function toItem(row: LinkRow): TaskEvidenceItem | null {
  const e = row.journal_entries;
  if (!e) return null;
  const confirmations = e.journal_entry_confirmations ?? [];
  // Earliest confirmation is the moment the work became manager-confirmed.
  const confirmedAt =
    confirmations.length > 0
      ? confirmations
          .map((c) => c.created_at)
          .sort()[0]
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
  };
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
    // Any other read failure degrades to "no evidence shown" rather than
    // throwing into the task page. Never invent an item.
    return { status: "ok", items: [], summary: ZERO_EVIDENCE_SUMMARY };
  }

  const items = ((res.data ?? []) as LinkRow[])
    .map(toItem)
    .filter((i): i is TaskEvidenceItem => i !== null);

  return { status: "ok", items, summary: deriveEvidenceSummary(items) };
}

export type TaskEvidenceBatch = {
  /** "needs-migration" once, for the whole page — never per card. */
  readonly status: "ok" | "needs-migration";
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
    return EMPTY_EVIDENCE_BATCH;
  }

  const itemsByTask: Record<string, TaskEvidenceItem[]> = {};
  for (const row of (res.data ?? []) as (LinkRow & { task_id: string })[]) {
    const item = toItem(row);
    if (!item) continue;
    (itemsByTask[row.task_id] ??= []).push(item);
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

  const res = await asAny(supabase)
    .from("journal_entries")
    .select("id, original_text, created_at, journal_entry_photos(id)")
    .eq("worker_id", worker.id)
    .is("deleted_at", null)
    .is("superseded_by", null)
    .order("created_at", { ascending: false })
    .limit(LINKABLE_ENTRY_LIMIT);
  if (res.error) return [];

  type EntryRow = {
    id: string;
    original_text: string;
    created_at: string;
    journal_entry_photos: { id: string }[] | null;
  };

  return ((res.data ?? []) as EntryRow[]).map((e) => ({
    entryId: e.id,
    originalText: e.original_text,
    createdAt: e.created_at,
    photoCount: (e.journal_entry_photos ?? []).length,
    // Resolved by the caller against the evidence batch it already holds.
    alreadyLinked: false,
  }));
}
