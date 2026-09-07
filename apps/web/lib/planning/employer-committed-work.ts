import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";

/**
 * WHAT THE ROSTER IS ALREADY COMMITTED TO — the other half of "who is free?".
 *
 * ── THE DEFECT THIS FIXES, MEASURED ────────────────────────────────────────
 * `loadWhoIsAvailableForChat` answered "who is available this week?" from ONE
 * signal: approved absences. Read from production on 2026-09-07:
 *
 *   worker_absences            0 rows   ← the only signal capacity read
 *   booking_requests accepted  1 row    ← ignored
 *   project_worker_assignments 3 active ← ignored
 *
 * So the one input was empty and the only real commitments that exist were
 * invisible. Every worker read as FREE, always — including the one with an
 * accepted booking. An employer planning next week was being told the exact
 * opposite of what the calendar showed them on the same screen, which is how
 * `/dashboard/company/planning` came to contradict itself.
 *
 * ── THREE STATES, NOT TWO ──────────────────────────────────────────────────
 * "Not free" is not one thing. A person on approved leave and a person already
 * working on your project are both unavailable and are not the same fact: one
 * you cannot plan around, the other you may reprioritise. Collapsing them
 * would replace a false "free" with a vague "busy", which is a smaller lie
 * rather than none.
 *
 * ── PRIVACY ────────────────────────────────────────────────────────────────
 * `employer-availability.ts` deliberately never fetches an absence's `note` or
 * `absence_type`, because WHY someone is away can be health information. That
 * reasoning does NOT extend here: a project assignment and an accepted booking
 * are the employer's own commitments, made with them, and a manager who cannot
 * see them cannot plan at all. This read still asks for nothing beyond the
 * dates and a title the caller already has access to.
 *
 * ── AUTHORIZATION IS THE DATABASE'S ────────────────────────────────────────
 * No check here. `pwa_select` is `owns_worker(worker_id) OR
 * can_manage_project(project_id)`, and `booking_requests_select` is the owner,
 * the worker themselves, an admin, or `has_org_demand_access(organization_id)`.
 * A manager therefore sees exactly their own organization's commitments and a
 * stranger's read returns nothing — this module never widens that.
 */

/** One dated commitment, reduced to what a capacity answer needs. */
export interface WorkerCommitment {
  readonly workerId: string;
  /** `project` or `booking` — the two canonical committed-work sources. */
  readonly kind: "project" | "booking";
  /** The source row, so a caller can link to the real object. */
  readonly sourceId: string;
  /** Real title from the source; null renders an i18n noun, never invented
   *  copy. */
  readonly label: string | null;
  readonly startDate: string | null;
  /** Null means open-ended — `effectiveEndDay` resolves that, not this. */
  readonly endDate: string | null;
}

export type EmployerCommittedWorkResult =
  | { readonly status: "ok"; readonly commitments: readonly WorkerCommitment[] }
  /** A store is not provisioned here. NOT "nobody is committed to anything". */
  | { readonly status: "needs-migration" }
  /** A real read failure. NEVER rendered as an empty schedule. */
  | { readonly status: "unavailable" };

const MISSING_OBJECT_CODES = new Set(["42P01", "42703", "PGRST205"]);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(c: SupabaseClient): any {
  return c;
}

/** Bounded like every other planning read — a roster this large is a data
 *  problem, not a page to render. */
const READ_LIMIT = 500;

/**
 * Every dated commitment the caller may see, for the workers they manage.
 *
 * `workerIds` narrows the read to the roster the caller is asking about. It is
 * a filter, never a grant: RLS decides what comes back regardless of what is
 * asked for, so a fabricated id simply returns nothing.
 */
export async function getEmployerWorkerCommitments(
  workerIds: readonly string[],
): Promise<EmployerCommittedWorkResult> {
  if (workerIds.length === 0) return { status: "ok", commitments: [] };
  const supabase = await createClient();
  const ids = workerIds.slice(0, READ_LIMIT);

  // ACCEPTED BOOKINGS. `accepted` is the canonical committed status — the same
  // one `indicatesExpectedWork` requires before a booking counts as expected
  // work on the calendar, so the two surfaces cannot disagree about what a
  // commitment is.
  const bookingsRes = await asAny(supabase)
    .from("booking_requests")
    .select("id, worker_id, start_date, expected_end_date, status")
    .in("worker_id", ids)
    .eq("status", "accepted")
    .limit(READ_LIMIT);
  if (bookingsRes.error) {
    return MISSING_OBJECT_CODES.has(bookingsRes.error.code ?? "")
      ? { status: "needs-migration" }
      : { status: "unavailable" };
  }

  // ACTIVE PROJECT ASSIGNMENTS. The dates live on the project, not the
  // assignment row, so the project band is the commitment window — the same
  // band the worker's own calendar draws.
  const assignRes = await asAny(supabase)
    .from("project_worker_assignments")
    .select("id, worker_id, project_id, status")
    .in("worker_id", ids)
    .eq("status", "active")
    .limit(READ_LIMIT);
  if (assignRes.error) {
    return MISSING_OBJECT_CODES.has(assignRes.error.code ?? "")
      ? { status: "needs-migration" }
      : { status: "unavailable" };
  }

  const assignments = (assignRes.data ?? []) as Record<string, unknown>[];
  const projectIds = [...new Set(assignments.map((a) => a.project_id as string))];
  const projectById = new Map<
    string,
    { title: string | null; startDate: string | null; endDate: string | null }
  >();
  if (projectIds.length > 0) {
    const projRes = await asAny(supabase)
      .from("projects")
      .select("id, title, start_date, end_date")
      .in("id", projectIds)
      .limit(READ_LIMIT);
    if (projRes.error) {
      return MISSING_OBJECT_CODES.has(projRes.error.code ?? "")
        ? { status: "needs-migration" }
        : { status: "unavailable" };
    }
    for (const p of (projRes.data ?? []) as Record<string, unknown>[]) {
      projectById.set(p.id as string, {
        title: (p.title as string | null) ?? null,
        startDate: (p.start_date as string | null) ?? null,
        endDate: (p.end_date as string | null) ?? null,
      });
    }
  }

  const commitments: WorkerCommitment[] = [];
  for (const b of (bookingsRes.data ?? []) as Record<string, unknown>[]) {
    commitments.push({
      workerId: b.worker_id as string,
      kind: "booking",
      sourceId: b.id as string,
      label: null,
      startDate: (b.start_date as string | null) ?? null,
      endDate: (b.expected_end_date as string | null) ?? null,
    });
  }
  for (const a of assignments) {
    // An assignment to a project with no dates is a real assignment to an
    // undated band. It is DROPPED from capacity rather than assumed to cover
    // today: assuming would make a worker unavailable on evidence nobody
    // recorded, which is the same class of invention this fix exists to end.
    const project = projectById.get(a.project_id as string);
    if (!project?.startDate) continue;
    commitments.push({
      workerId: a.worker_id as string,
      kind: "project",
      sourceId: a.project_id as string,
      label: project.title,
      startDate: project.startDate,
      endDate: project.endDate,
    });
  }
  return { status: "ok", commitments };
}
