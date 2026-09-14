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
  /** The canonical committed-work sources. `trip` joined them on 2026-09-14:
   *  an APPROVED business trip is a person working somewhere else, which is a
   *  commitment by any reading, and it was the one dated commitment nothing
   *  on the employer side counted. */
  readonly kind: "project" | "booking" | "trip";
  /** The source row, so a caller can link to the real object. */
  readonly sourceId: string;
  /** Real title from the source; null renders an i18n noun, never invented
   *  copy. */
  readonly label: string | null;
  readonly startDate: string | null;
  /** Null means open-ended — `effectiveEndDay` resolves that, not this. */
  readonly endDate: string | null;
}

/**
 * An active assignment to a project NOBODY DATED. It is a real commitment
 * whose window is unknown, so it is reported SEPARATELY rather than folded
 * into `commitments` — a capacity view must not invent a band for it, and a
 * reservation verdict must not call the person clear while it exists
 * (SEP-7, `lib/workforce/commitment-reservation.ts`).
 */
export interface UndatedProjectCommitment {
  readonly workerId: string;
  readonly projectId: string;
  readonly label: string | null;
}

export type EmployerCommittedWorkResult =
  | {
      readonly status: "ok";
      readonly commitments: readonly WorkerCommitment[];
      readonly undatedProjects: readonly UndatedProjectCommitment[];
    }
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
  /** OPTIONAL explicit caller (G4 bridge) — absent = the cookie session. */
  caller?: { readonly supabase: SupabaseClient },
): Promise<EmployerCommittedWorkResult> {
  if (workerIds.length === 0) return { status: "ok", commitments: [], undatedProjects: [] };
  const supabase = caller?.supabase ?? (await createClient());
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

  // APPROVED AND COMPLETED BUSINESS TRIPS.
  //
  // NO NEW AUTHORITY: `business_trips_select` (20260817222000) already admits
  // `profile_id = auth.uid() OR manages_organization(organization_id) OR
  // is_admin()` — the same shape as every other source here, so a manager
  // reads their own organization's trips and a stranger reads none.
  //
  // WHICH STATUSES COUNT, and why not the others. `approved` is a commitment
  // somebody authorized; `completed` is one that demonstrably happened, and it
  // occupied those days whether or not the window is in the past. `draft` and
  // `submitted` are intentions — treating a pending request as unavailability
  // would block scheduling on something nobody approved, which is the exact
  // rule the absence read already follows. `rejected` and `cancelled` are not
  // commitments at all.
  //
  // `purpose` IS DELIBERATELY NOT READ. It is free text up to 1000 characters
  // and it is not needed to answer "is this person committed"; the destination
  // is, and it is the useful half. The select list is the boundary, the way
  // `employer-availability.ts` makes it one — a column that never enters this
  // process cannot leak from a later refactor.
  //
  // Trips are keyed by PROFILE, not by worker, so the ids are mapped through
  // one bounded read rather than by assuming the two are interchangeable.
  const profileByWorker = new Map<string, string>();
  const workerByProfile = new Map<string, string>();
  const workerRes = await asAny(supabase)
    .from("workers")
    .select("id, profile_id")
    .in("id", ids)
    .limit(READ_LIMIT);
  if (workerRes.error) {
    return MISSING_OBJECT_CODES.has(workerRes.error.code ?? "")
      ? { status: "needs-migration" }
      : { status: "unavailable" };
  }
  for (const w of (workerRes.data ?? []) as Record<string, unknown>[]) {
    const workerId = w.id as string;
    const profileId = (w.profile_id as string | null) ?? null;
    if (!profileId) continue;
    profileByWorker.set(workerId, profileId);
    workerByProfile.set(profileId, workerId);
  }

  type TripRow = {
    id: string;
    profile_id: string;
    destination: string | null;
    date_from: string | null;
    date_to: string | null;
  };
  let tripRows: TripRow[] = [];
  const profileIds = [...workerByProfile.keys()];
  if (profileIds.length > 0) {
    const tripsRes = await asAny(supabase)
      .from("business_trips")
      .select("id, profile_id, destination, date_from, date_to")
      .in("profile_id", profileIds)
      .in("status", ["approved", "completed"])
      .limit(READ_LIMIT);
    if (tripsRes.error) {
      return MISSING_OBJECT_CODES.has(tripsRes.error.code ?? "")
        ? { status: "needs-migration" }
        : { status: "unavailable" };
    }
    tripRows = (tripsRes.data ?? []) as TripRow[];
  }

  const commitments: WorkerCommitment[] = [];
  const undatedProjects: UndatedProjectCommitment[] = [];
  for (const t of tripRows) {
    const workerId = workerByProfile.get(t.profile_id);
    if (!workerId) continue;
    commitments.push({
      workerId,
      kind: "trip",
      sourceId: t.id,
      // The place, which is the useful fact. Never the purpose.
      label: t.destination,
      startDate: t.date_from,
      endDate: t.date_to,
    });
  }
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
    // undated band. It is kept OUT of `commitments` rather than assumed to
    // cover today: assuming would make a worker unavailable on evidence
    // nobody recorded, which is the same class of invention this fix exists
    // to end. It is not thrown away either — it is reported as an undated
    // commitment, so a caller that needs a COMPLETE answer (the reservation
    // verdict) can say "I could not account for this" instead of "clear".
    const project = projectById.get(a.project_id as string);
    if (!project?.startDate) {
      undatedProjects.push({
        workerId: a.worker_id as string,
        projectId: a.project_id as string,
        label: project?.title ?? null,
      });
      continue;
    }
    commitments.push({
      workerId: a.worker_id as string,
      kind: "project",
      sourceId: a.project_id as string,
      label: project.title,
      startDate: project.startDate,
      endDate: project.endDate,
    });
  }
  return { status: "ok", commitments, undatedProjects };
}
