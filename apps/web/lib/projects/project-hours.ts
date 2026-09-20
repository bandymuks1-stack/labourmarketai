import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import { countedOnce } from "@/lib/journal/counted-once";
import {
  JOURNAL_ENTRY_CONFIRMATIONS_EMBED,
  JOURNAL_ENTRY_METRICS_EMBED,
  liveJournalEntriesOnly,
} from "@/lib/journal/journal-list-core";
import {
  deriveWindowWorkTime,
  type JournalWindowEntryRow,
} from "@/lib/journal/journal-window-report";
import { listWorkObjectIdsForProject } from "@/lib/objects/objects";
import { getAllocationsForObjects } from "@/lib/work-hours/allocations";
import { sumHours } from "@/lib/work-hours/allocations-model";

/**
 * ONE PROJECT, TWO LEDGERS, SIDE BY SIDE — allocated vs journaled hours.
 *
 * The organization keeps its own hour records (`work_hour_allocations`,
 * keyed on the project's work objects) and the people keep their journal
 * (`journal_entries.project_id`, hours through the one work-time rule,
 * confirmed = APPROVED review). The two are BRIDGED, never merged (owner
 * §19 / canonical seams): this module reads each through its existing
 * reader and hands both back as separate figures. Nothing here adds an
 * allocated hour to a journaled one, and no figure is derived twice.
 *
 * Three states per ledger, kept apart (SEP-7):
 *   measured  — read, figures are the ledger's own (0 h is a measured 0)
 *   none      — the ledger is not installed in this database (no store)
 *   unknown   — a read failed; the surface says "could not be read"
 */

/** Bounded like every project read — the report's own entry ceiling. */
const JOURNAL_READ_LIMIT = 1000;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(c: SupabaseClient): any {
  return c;
}

export type ProjectAllocatedHours =
  | {
      readonly state: "measured";
      /** Hours on live rows the organization has not rejected. */
      readonly hours: number;
      readonly rows: number;
      /** Rows a timesheet rejected — visible, counted nowhere. */
      readonly rejectedHours: number;
      /** Objects the figure rests on (0 = the project has no work object
       *  yet, so the ledger cannot hold hours for it). */
      readonly objects: number;
    }
  | { readonly state: "none" }
  | { readonly state: "unknown" };

export type ProjectJournaledHours =
  | {
      readonly state: "measured";
      readonly hours: number;
      /** Of `hours`: entries whose current review result is APPROVED. */
      readonly confirmedHours: number;
      readonly entries: number;
      /** The read stopped at its ceiling — figures rest on the first N. */
      readonly truncated: boolean;
    }
  | { readonly state: "unknown" };

export interface ProjectHoursSideBySide {
  readonly allocated: ProjectAllocatedHours;
  readonly journaled: ProjectJournaledHours;
}

async function readAllocated(projectId: string): Promise<ProjectAllocatedHours> {
  const objects = await listWorkObjectIdsForProject(projectId);
  if (objects.kind === "needs-migration") return { state: "none" };
  if (objects.kind !== "ok") return { state: "unknown" };
  if (objects.ids.length === 0) {
    return { state: "measured", hours: 0, rows: 0, rejectedHours: 0, objects: 0 };
  }
  const read = await getAllocationsForObjects(objects.ids);
  if (read.kind === "needs-migration") return { state: "none" };
  if (read.kind !== "ok") return { state: "unknown" };
  const live = read.rows.filter((r) => r.status !== "rejected");
  const rejected = read.rows.filter((r) => r.status === "rejected");
  return {
    state: "measured",
    hours: sumHours(live.map((r) => r.hours)),
    rows: live.length,
    rejectedHours: sumHours(rejected.map((r) => r.hours)),
    objects: objects.ids.length,
  };
}

async function readJournaled(
  supabase: SupabaseClient,
  projectId: string,
  todayIso: string,
): Promise<ProjectJournaledHours> {
  // The report's own minimised projection — ids, timestamps, the review
  // rows and the metric rows. Never the entry text.
  const select = [
    "id, worker_id, created_at, correction_of, engagement_context_id",
    JOURNAL_ENTRY_CONFIRMATIONS_EMBED,
    JOURNAL_ENTRY_METRICS_EMBED,
  ].join(", ");
  const res = (await liveJournalEntriesOnly(
    asAny(supabase).from("journal_entries").select(select).eq("project_id", projectId),
  )
    .order("created_at", { ascending: true })
    .limit(JOURNAL_READ_LIMIT)) as {
    data: JournalWindowEntryRow[] | null;
    error: { code?: string } | null;
  };
  if (res.error) {
    console.error("[project-hours] journal read failed:", res.error.code);
    return { state: "unknown" };
  }
  const rows = res.data ?? [];
  // A confirmed entry the member corrected is one day of work, not two.
  const counted = countedOnce(rows);
  const work = deriveWindowWorkTime(counted, todayIso);
  return {
    state: "measured",
    hours: work.hours,
    confirmedHours: work.confirmedHours,
    entries: counted.length,
    truncated: rows.length >= JOURNAL_READ_LIMIT,
  };
}

/**
 * Both ledgers for one project, each through its own existing reader, each
 * under the caller's RLS. Returned side by side; never summed.
 */
export async function getProjectHoursSideBySide(
  projectId: string,
  todayIso: string = new Date().toISOString().slice(0, 10),
): Promise<ProjectHoursSideBySide> {
  const supabase = await createClient();
  const [allocated, journaled] = await Promise.all([
    readAllocated(projectId),
    readJournaled(supabase, projectId, todayIso),
  ]);
  return { allocated, journaled };
}
