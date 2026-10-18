import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import { PLANNED_TRIP_STATUSES } from "@/lib/planning/planning-model";

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
  readonly kind: "project" | "booking" | "trip" | "plan";
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

  // ACTIVE TEAM ASSIGNMENTS (WRK-6, 20261003150600). A team assignment is ONE
  // relationship and writes NO per-person row above, so the members it
  // resolves to are read HERE, from the one source, and join the very same
  // lists: a project-level team assignment commits each member over the
  // project band exactly like a person assignment (kind "project", the same
  // source id, so every consumer — capacity, the reservation verdict, the
  // `exclude` of a just-made assignment — treats the two identically); a task-
  // or object-level one holds the member for a window nobody dated, so it is
  // reported as an UNDATED commitment, never invented into a band.
  //
  // Before the migration is applied the relation does not exist: that is "no
  // team assignments", not a failure of the whole read. Any OTHER failure is
  // unavailable — an unread source must never look like an empty one.
  const wanted = new Set(ids);
  const teamPairs: { workerId: string; projectId: string; scope: "project" | "narrow" }[] = [];
  const teamRes = await asAny(supabase)
    .from("team_assignments")
    .select("id, project_id, work_object_id, task_id")
    .is("ended_at", null)
    .limit(READ_LIMIT);
  if (teamRes.error) {
    if (!MISSING_OBJECT_CODES.has(teamRes.error.code ?? "")) return { status: "unavailable" };
  } else {
    const teamRows = (teamRes.data ?? []) as {
      id: string;
      project_id: string;
      work_object_id: string | null;
      task_id: string | null;
    }[];
    if (teamRows.length > 0) {
      const memRes = await asAny(supabase).rpc("list_team_assignment_members_v1", {
        p_assignment_ids: teamRows.map((r) => r.id),
      });
      if (memRes.error) {
        if (!MISSING_OBJECT_CODES.has(memRes.error.code ?? "")) return { status: "unavailable" };
      } else {
        const rowById = new Map(teamRows.map((r) => [r.id, r]));
        for (const m of (memRes.data ?? []) as { assignment_id: string; worker_id: string | null }[]) {
          const row = rowById.get(m.assignment_id);
          if (!row || !m.worker_id || !wanted.has(m.worker_id)) continue;
          teamPairs.push({
            workerId: m.worker_id,
            projectId: row.project_id,
            scope: row.work_object_id || row.task_id ? "narrow" : "project",
          });
        }
      }
    }
  }
  // A person who is ALSO assigned directly is one commitment, not two.
  const directKey = new Set(assignments.map((a) => `${a.worker_id as string}:${a.project_id as string}`));
  const seenTeamKey = new Set<string>();
  const teamProjectLevel: Record<string, unknown>[] = [];
  const teamNarrow: { workerId: string; projectId: string }[] = [];
  for (const t of teamPairs) {
    const key = `${t.workerId}:${t.projectId}`;
    if (t.scope === "project") {
      if (directKey.has(key) || seenTeamKey.has(key)) continue;
      seenTeamKey.add(key);
      teamProjectLevel.push({ worker_id: t.workerId, project_id: t.projectId });
    } else {
      teamNarrow.push({ workerId: t.workerId, projectId: t.projectId });
    }
  }
  assignments.push(...teamProjectLevel);
  const projectIds = [
    ...new Set([
      ...assignments.map((a) => a.project_id as string),
      ...teamNarrow.map((t) => t.projectId),
    ]),
  ];
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
  // WHICH STATUSES COUNT is decided in ONE place, `PLANNED_TRIP_STATUSES` in
  // `planning-model.ts`, and imported by every consumer. The employer's
  // capacity read, the reservation verdict, the utilisation window and the
  // person's own calendar therefore cannot come to different conclusions
  // about whether a trip occupies time — which is the failure mode this
  // product has hit before with hours, where three computations gave 0 h, 5 h
  // and 9 h for the same entry.
  //
  // `approved` is a commitment somebody authorized; `completed` demonstrably
  // happened and occupied those days. `draft` and `submitted` are intentions,
  // and treating a pending request as unavailability would block scheduling
  // on something nobody approved — the exact rule the absence read follows.
  // `rejected` and `cancelled` are not commitments at all.
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
      .in("status", [...PLANNED_TRIP_STATUSES])
      .limit(READ_LIMIT);
    if (tripsRes.error) {
      return MISSING_OBJECT_CODES.has(tripsRes.error.code ?? "")
        ? { status: "needs-migration" }
        : { status: "unavailable" };
    }
    tripRows = (tripsRes.data ?? []) as TripRow[];
  }

  // PLANNED WORK WINDOWS (CAL-8, `work_plan_entries`). The organization's own
  // one-off plan for its own people: a commitment somebody with authority made,
  // so it holds the person's days exactly like an accepted booking does.
  //
  // NO NEW AUTHORITY: `work_plan_entries_select` admits the planning
  // organization's managers and the planned worker — a manager reads the
  // windows of the organizations they manage and nobody else's.
  //
  // WHEN THE STORE IS NOT PROVISIONED the table simply does not exist, so no
  // window can exist either: that is a true "nothing planned", not an unread
  // source, and it must not turn every capacity answer into "needs-migration".
  // Any OTHER failure is a real failed read and is reported as `unavailable` —
  // UNKNOWN is never read as zero.
  const planRes = await asAny(supabase)
    .from("work_plan_entries")
    .select("id, worker_id, start_date, end_date")
    .in("worker_id", ids)
    .eq("status", "planned")
    .limit(READ_LIMIT);
  let planRows: Record<string, unknown>[] = [];
  if (planRes.error) {
    if (!MISSING_OBJECT_CODES.has(planRes.error.code ?? "")) {
      return { status: "unavailable" };
    }
  } else {
    planRows = (planRes.data ?? []) as Record<string, unknown>[];
  }

  const commitments: WorkerCommitment[] = [];
  const undatedProjects: UndatedProjectCommitment[] = [];
  for (const p of planRows) {
    commitments.push({
      workerId: p.worker_id as string,
      kind: "plan",
      sourceId: p.id as string,
      // The window is the fact; a note is free text and is not read.
      label: null,
      startDate: (p.start_date as string | null) ?? null,
      endDate: (p.end_date as string | null) ?? null,
    });
  }
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
  // Task- / object-level team assignments: a real commitment, window unknown.
  // One entry per (member, project) — and none when the member already holds
  // that project through a dated commitment or an undated one above.
  const heldKey = new Set([
    ...commitments.filter((c) => c.kind === "project").map((c) => `${c.workerId}:${c.sourceId}`),
    ...undatedProjects.map((u) => `${u.workerId}:${u.projectId}`),
  ]);
  for (const t of teamNarrow) {
    const key = `${t.workerId}:${t.projectId}`;
    if (heldKey.has(key)) continue;
    heldKey.add(key);
    undatedProjects.push({
      workerId: t.workerId,
      projectId: t.projectId,
      label: projectById.get(t.projectId)?.title ?? null,
    });
  }
  return { status: "ok", commitments, undatedProjects };
}
