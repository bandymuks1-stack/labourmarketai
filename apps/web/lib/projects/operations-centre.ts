import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import {
  getProjectOperations,
  type ProjectOperations,
} from "@/lib/projects/operations";
import {
  getHandoverPassport,
  type HandoverPassportData,
} from "@/lib/projects/handover-passport";
import { listProjectTasks, type MyTasksResult } from "@/lib/tasks/tasks";
import {
  getProjectGallerySummary,
  type ProjectGallerySummary,
} from "@/lib/journal/project-gallery";
import {
  OPS_CENTRE_BOOKING_READ_LIMIT,
  type WorkerAvailabilityBasics,
  type WorkerBookingRange,
} from "@/lib/projects/operations-centre-model";

/**
 * Project operations-centre composition (control room PR G, capability gap
 * map §6 + §7). ONE read that COMPOSES the existing RLS-scoped services and
 * duplicates no source record:
 *
 *  - operations  → getProjectOperations() (the pilot-ops board read — the
 *                  authorisation gate: null = not the caller's project).
 *  - handover    → getHandoverPassport() (committed draft; { applied:false }
 *                  while the owner-gated migration is unapplied).
 *  - tasks       → listProjectTasks() (PR D layer; "needs-migration" while
 *                  the owner-gated work_tasks migration is unapplied).
 *  - evidence    → getProjectGallerySummary() (head counts over the SAME
 *                  journal tables the WAGON 8 gallery reads).
 *  - housing     → projects.housing_provided (the ONLY applied accommodation
 *                  field — shown verbatim; the worker-side accommodation/
 *                  transport preference columns are an UNAPPLIED draft and
 *                  are deliberately NOT read).
 *  - availability→ workers.availability_status / available_from (applied
 *                  0001 columns on rows the assignment join already proves
 *                  readable under RLS).
 *  - bookings    → booking_requests rows the CALLER can already read (owner
 *                  or worker RLS — the same visibility the bookings page
 *                  has), narrowed to ACCEPTED rows of the assigned workers.
 *                  Overlap with the project band is computed in the pure
 *                  model with the planning-model's inclusive semantics.
 *
 * Deliberately ABSENT (skipped honestly, per gap map §6): linked demand
 * references — no lib reads job_demands anywhere today (the matching engine
 * is dormant), and this slice does not build new privileged queries; linked
 * conversation references — the only project↔conversation linkage is the
 * instruction count the operations read already carries. Milestones,
 * issues/risks, defects, equipment and resource tables do not exist and are
 * not simulated.
 *
 * Every extra source degrades independently — a failed or missing source
 * becomes an empty map / zero count / honest state flag, never a crash and
 * never fake rows. All reads are bounded.
 *
 * INTERNAL ONLY: this layer sends nothing anywhere — no email, no push, no
 * Telegram, no webhook, no outbound call of any kind. Read-only: no insert,
 * no update, no delete, no RPC.
 */

export interface OperationsCentre {
  readonly ops: ProjectOperations;
  readonly passport: HandoverPassportData;
  readonly tasks: MyTasksResult;
  readonly evidence: ProjectGallerySummary;
  /** projects.housing_provided verbatim; null = not readable/recorded. */
  readonly housingProvided: boolean | null;
  readonly availability: ReadonlyMap<string, WorkerAvailabilityBasics>;
  /** ACCEPTED booking date ranges of the assigned workers that the caller's
   *  session can already read (RLS) — bounded. */
  readonly bookings: readonly WorkerBookingRange[];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(c: SupabaseClient): any {
  return c;
}

/** projects.housing_provided for one project — same table, same RLS the
 *  operations read already passed. null on any error (honest unknown). */
async function readHousingProvided(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  projectId: string,
): Promise<boolean | null> {
  try {
    const res = await supabase
      .from("projects")
      .select("housing_provided")
      .eq("id", projectId)
      .maybeSingle();
    if (res.error || !res.data) return null;
    return typeof res.data.housing_provided === "boolean"
      ? res.data.housing_provided
      : null;
  } catch {
    return null;
  }
}

/** Applied availability basics for the assigned workers (rows the
 *  assignment join already proves readable). Empty map on any error. */
async function readAvailabilityBasics(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  workerIds: readonly string[],
): Promise<Map<string, WorkerAvailabilityBasics>> {
  const out = new Map<string, WorkerAvailabilityBasics>();
  if (workerIds.length === 0) return out;
  try {
    const res = await supabase
      .from("workers")
      .select("id, availability_status, available_from")
      .in("id", [...workerIds]);
    if (res.error) return out;
    type Row = {
      id: string;
      availability_status: string | null;
      available_from: string | null;
    };
    for (const r of (res.data ?? []) as Row[]) {
      if (!r.id) continue;
      out.set(r.id, {
        availabilityStatus: r.availability_status ?? null,
        availableFrom: r.available_from ?? null,
      });
    }
  } catch {
    /* graceful */
  }
  return out;
}

/** ACCEPTED booking ranges for the assigned workers that this session can
 *  read under the booking RLS the bookings page already relies on (owner or
 *  worker). Bounded; empty on any error / unapplied migration. */
async function readAcceptedBookingRanges(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  workerIds: readonly string[],
): Promise<WorkerBookingRange[]> {
  if (workerIds.length === 0) return [];
  try {
    const res = await supabase
      .from("booking_requests")
      .select("id, worker_id, status, start_date, expected_end_date")
      .in("worker_id", [...workerIds])
      .eq("status", "accepted")
      .limit(OPS_CENTRE_BOOKING_READ_LIMIT);
    if (res.error) return [];
    type Row = {
      id: string;
      worker_id: string | null;
      status: string;
      start_date: string | null;
      expected_end_date: string | null;
    };
    const out: WorkerBookingRange[] = [];
    for (const r of (res.data ?? []) as Row[]) {
      if (!r.id || !r.worker_id) continue;
      out.push({
        bookingId: r.id,
        workerId: r.worker_id,
        status: r.status,
        startDate: r.start_date ?? null,
        endDate: r.expected_end_date ?? null,
      });
    }
    return out;
  } catch {
    return [];
  }
}

/**
 * The full operations-centre view for one project, or null when the caller
 * cannot read the project (same authorisation surface as
 * getProjectOperations — RLS returns no row → not their project).
 */
export async function getOperationsCentre(
  projectId: string,
): Promise<OperationsCentre | null> {
  const ops = await getProjectOperations(projectId);
  if (!ops) return null;

  const supabase = await createClient();
  const workerIds = ops.workers.map((w) => w.workerId);

  const [passport, tasks, evidence, housingProvided, availability, bookings] =
    await Promise.all([
      getHandoverPassport(projectId),
      listProjectTasks(projectId),
      getProjectGallerySummary(projectId),
      readHousingProvided(asAny(supabase), projectId),
      readAvailabilityBasics(asAny(supabase), workerIds),
      readAcceptedBookingRanges(asAny(supabase), workerIds),
    ]);

  return {
    ops,
    passport,
    tasks,
    evidence,
    housingProvided,
    availability,
    bookings,
  };
}
