import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import { callerCompanyId } from "@/lib/projects/projects";
import { isMigrationMissingCode } from "@/lib/tasks/task-model";
import { getTeamBrigadesData } from "@/lib/company/team-brigades";
import {
  composeFutureWork,
  readWorkforcePlanV1,
  type DemandWorkInput,
  type FutureWorkEntry,
  type ProjectWorkInput,
  type WorkforcePlanV1,
} from "@/lib/workforce/future-work-model";
import type {
  BrigadeInput,
  WorkerAssignmentInput,
  WorkerCapacityInput,
} from "@/lib/workforce/capacity-model";

/**
 * Workforce composition (Labour Market OS P1–P4 read service) — the server
 * read that feeds the workforce-planning surface. It COMPOSES the existing
 * RLS-scoped reads and duplicates no source record:
 *
 *  - demand      → the caller's OWN customer_requests rows (kind
 *                  company_request, profile_id = auth.uid() under the
 *                  existing owner RLS). The canonical intake — no new store.
 *  - projects    → the caller's company / owned-organization projects (the
 *                  same scope pattern lib/planning/planning.ts uses).
 *  - assignments → project_worker_assignments of those projects (RLS:
 *                  can_manage_project) — the REAL internal workforce axis.
 *  - workers     → the assigned workers' availability + preference columns.
 *  - skills / professions / certificates / claims → each worker's existing
 *    capability stores (worker_skills, worker_professions, worker_documents;
 *    confirmed profile_skill_claims are separate Living-CV claims and stay
 *    honest: only status='confirmed' rows join the skill set).
 *  - languages   → worker_languages (owner-gated DRAFT migration
 *                  20260711250000) — degrades to "needs-migration".
 *  - brigades    → organizations rows with organization_type='team' via the
 *                  existing getTeamBrigadesData() read (owner-gated DRAFT
 *                  20260705220000) — degrades to "needs-migration".
 *
 * Every source degrades independently — a failed or missing source becomes a
 * per-source state, never a crash and never fake rows. All reads are bounded.
 *
 * INTERNAL ONLY: read-only (no insert/update/delete/RPC-writes), sends
 * nothing anywhere, and uses ONLY the caller's RLS-scoped client — never a
 * privileged admin client (guard-pinned).
 */

/** Per-source honest state ("needs-migration" = owner-gated migration not
 *  applied yet; "managers-only" = no company/org scope for this caller). */
export type WorkforceSourceStatus =
  | "ok"
  | "needs-migration"
  | "managers-only"
  | "error";

export interface WorkforceSourceState {
  readonly status: WorkforceSourceStatus;
  readonly count: number;
}

export interface WorkforceSources {
  readonly demand: WorkforceSourceState;
  readonly project: WorkforceSourceState;
  readonly assignments: WorkforceSourceState;
  readonly workers: WorkforceSourceState;
  readonly skills: WorkforceSourceState;
  readonly professions: WorkforceSourceState;
  readonly languages: WorkforceSourceState;
  readonly certificates: WorkforceSourceState;
  readonly brigades: WorkforceSourceState;
}

export type WorkforceReadResult =
  | { readonly status: "not-authed" }
  | {
      readonly status: "ok";
      readonly entries: readonly FutureWorkEntry[];
      /** entryId (`demand:<id>`) → the stored HUMAN plan at
       *  payload.workforce_plan, where one validates. Read-only projection
       *  of the same owner-scoped demand rows — no extra query. */
      readonly plans: Readonly<Record<string, WorkforcePlanV1>>;
      readonly workers: readonly WorkerCapacityInput[];
      readonly assignments: readonly WorkerAssignmentInput[];
      readonly brigades: readonly BrigadeInput[];
      readonly sources: WorkforceSources;
    };

/** Bounded reads everywhere — workforce never streams unbounded rows. */
const DEMAND_READ_LIMIT = 100;
const PROJECT_READ_LIMIT = 100;
const ASSIGNMENT_READ_LIMIT = 500;
const WORKER_DETAIL_READ_LIMIT = 1000;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(c: SupabaseClient): any {
  return c;
}

const PLANNED_PROJECT_STATUSES = ["draft", "live", "paused"] as const;

/* ------------------------------------------------------------------ */
/* Demand + projects → future work entries                              */
/* ------------------------------------------------------------------ */

async function readDemandInputs(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ state: WorkforceSourceState; rows: DemandWorkInput[] }> {
  const res = await asAny(supabase)
    .from("customer_requests")
    .select("id, title, status, payload")
    .eq("profile_id", userId)
    .eq("kind", "company_request")
    .neq("status", "closed")
    .order("created_at", { ascending: false })
    .limit(DEMAND_READ_LIMIT);
  if (res.error) {
    if (isMigrationMissingCode(res.error.code)) {
      return { state: { status: "needs-migration", count: 0 }, rows: [] };
    }
    return { state: { status: "error", count: 0 }, rows: [] };
  }
  type Row = {
    id: string;
    title: string | null;
    status: string;
    payload: unknown;
  };
  const rows: DemandWorkInput[] = ((res.data ?? []) as Row[]).map((r) => ({
    id: r.id,
    title: r.title ?? null,
    status: r.status,
    payload: r.payload ?? null,
  }));
  return { state: { status: "ok", count: rows.length }, rows };
}

async function readProjectInputs(
  supabase: SupabaseClient,
  userId: string,
): Promise<{
  state: WorkforceSourceState;
  rows: ProjectWorkInput[];
  projectIds: string[];
}> {
  // Managers scope, honestly: the caller's legacy company channel PLUS the
  // organizations they own — both reads stay under the projects RLS.
  const companyId = await callerCompanyId();
  const ownedOrgsRes = await asAny(supabase)
    .from("organizations")
    .select("id")
    .eq("owner_profile_id", userId)
    .limit(50);
  const ownedOrgIds: string[] = ((ownedOrgsRes.data ?? []) as { id: string }[]).map(
    (o) => o.id,
  );

  if (!companyId && ownedOrgIds.length === 0) {
    return {
      state: { status: "managers-only", count: 0 },
      rows: [],
      projectIds: [],
    };
  }

  const orFilter = [
    ...(companyId ? [`company_id.eq.${companyId}`] : []),
    ...(ownedOrgIds.length > 0
      ? [`organization_id.in.(${ownedOrgIds.join(",")})`]
      : []),
  ].join(",");

  const res = await asAny(supabase)
    .from("projects")
    .select("id, title, status, country, city, start_date, end_date")
    .or(orFilter)
    .in("status", [...PLANNED_PROJECT_STATUSES])
    .order("start_date", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(PROJECT_READ_LIMIT);
  if (res.error) {
    return { state: { status: "error", count: 0 }, rows: [], projectIds: [] };
  }

  type Row = {
    id: string;
    title: string | null;
    status: string;
    country: string | null;
    city: string | null;
    start_date: string | null;
    end_date: string | null;
  };
  const seen = new Set<string>();
  const rows: ProjectWorkInput[] = [];
  for (const p of (res.data ?? []) as Row[]) {
    if (seen.has(p.id)) continue;
    seen.add(p.id);
    rows.push({
      id: p.id,
      title: p.title ?? null,
      status: p.status,
      country: p.country ?? null,
      city: p.city ?? null,
      startDate: p.start_date ?? null,
      endDate: p.end_date ?? null,
    });
  }
  return {
    state: { status: "ok", count: rows.length },
    rows,
    projectIds: rows.map((r) => r.id),
  };
}

/* ------------------------------------------------------------------ */
/* Assignments + worker capacity                                        */
/* ------------------------------------------------------------------ */

type AssignmentRow = { worker_id: string; project_id: string };

async function readAssignments(
  supabase: SupabaseClient,
  projectIds: readonly string[],
  projectDates: ReadonlyMap<string, { start: string | null; end: string | null }>,
): Promise<{
  state: WorkforceSourceState;
  assignments: WorkerAssignmentInput[];
  workerIds: string[];
}> {
  if (projectIds.length === 0) {
    return { state: { status: "ok", count: 0 }, assignments: [], workerIds: [] };
  }
  const res = await asAny(supabase)
    .from("project_worker_assignments")
    .select("worker_id, project_id")
    .in("project_id", [...projectIds])
    .eq("status", "active")
    .limit(ASSIGNMENT_READ_LIMIT);
  if (res.error) {
    if (isMigrationMissingCode(res.error.code)) {
      return {
        state: { status: "needs-migration", count: 0 },
        assignments: [],
        workerIds: [],
      };
    }
    return { state: { status: "error", count: 0 }, assignments: [], workerIds: [] };
  }
  const assignments: WorkerAssignmentInput[] = [];
  const workerIds = new Set<string>();
  for (const r of (res.data ?? []) as AssignmentRow[]) {
    if (!r.worker_id) continue;
    workerIds.add(r.worker_id);
    const dates = projectDates.get(r.project_id);
    assignments.push({
      workerId: r.worker_id,
      startDate: dates?.start ?? null,
      endDate: dates?.end ?? null,
    });
  }
  return {
    state: { status: "ok", count: assignments.length },
    assignments,
    workerIds: [...workerIds],
  };
}

type WorkerRow = {
  id: string;
  profile_id: string | null;
  availability_status: string | null;
  available_from: string | null;
  willing_to_relocate: boolean | null;
  needs_accommodation: boolean | null;
  has_transport: boolean | null;
  max_trip_days: number | null;
  team_available: boolean | null;
  solo_available: boolean | null;
  current_location_country: string | null;
};

async function readWorkers(
  supabase: SupabaseClient,
  workerIds: readonly string[],
): Promise<{ state: WorkforceSourceState; rows: WorkerRow[] }> {
  if (workerIds.length === 0) {
    return { state: { status: "ok", count: 0 }, rows: [] };
  }
  const res = await asAny(supabase)
    .from("workers")
    .select(
      "id, profile_id, availability_status, available_from, willing_to_relocate, needs_accommodation, has_transport, max_trip_days, team_available, solo_available, current_location_country",
    )
    .in("id", [...workerIds])
    .limit(WORKER_DETAIL_READ_LIMIT);
  if (res.error) {
    if (isMigrationMissingCode(res.error.code)) {
      return { state: { status: "needs-migration", count: 0 }, rows: [] };
    }
    return { state: { status: "error", count: 0 }, rows: [] };
  }
  return {
    state: { status: "ok", count: (res.data ?? []).length },
    rows: (res.data ?? []) as WorkerRow[],
  };
}

async function readWorkerSkills(
  supabase: SupabaseClient,
  workerIds: readonly string[],
): Promise<{ state: WorkforceSourceState; byWorker: Map<string, string[]> }> {
  const byWorker = new Map<string, string[]>();
  if (workerIds.length === 0) return { state: { status: "ok", count: 0 }, byWorker };
  const res = await asAny(supabase)
    .from("worker_skills")
    .select("worker_id, skills(slug)")
    .in("worker_id", [...workerIds])
    .limit(WORKER_DETAIL_READ_LIMIT);
  if (res.error) {
    if (isMigrationMissingCode(res.error.code)) {
      return { state: { status: "needs-migration", count: 0 }, byWorker };
    }
    return { state: { status: "error", count: 0 }, byWorker };
  }
  type Row = { worker_id: string | null; skills: { slug: string | null } | null };
  let count = 0;
  for (const r of (res.data ?? []) as Row[]) {
    const slugRaw = Array.isArray(r.skills) ? r.skills[0]?.slug : r.skills?.slug;
    if (!r.worker_id || !slugRaw) continue;
    const list = byWorker.get(r.worker_id) ?? [];
    list.push(slugRaw);
    byWorker.set(r.worker_id, list);
    count += 1;
  }
  return { state: { status: "ok", count }, byWorker };
}

async function readWorkerProfessions(
  supabase: SupabaseClient,
  workerIds: readonly string[],
): Promise<{ state: WorkforceSourceState; byWorker: Map<string, string[]> }> {
  const byWorker = new Map<string, string[]>();
  if (workerIds.length === 0) return { state: { status: "ok", count: 0 }, byWorker };
  const res = await asAny(supabase)
    .from("worker_professions")
    .select("worker_id, professions(slug)")
    .in("worker_id", [...workerIds])
    .limit(WORKER_DETAIL_READ_LIMIT);
  if (res.error) {
    if (isMigrationMissingCode(res.error.code)) {
      return { state: { status: "needs-migration", count: 0 }, byWorker };
    }
    return { state: { status: "error", count: 0 }, byWorker };
  }
  type Row = {
    worker_id: string | null;
    professions: { slug: string | null } | null;
  };
  let count = 0;
  for (const r of (res.data ?? []) as Row[]) {
    const slugRaw = Array.isArray(r.professions)
      ? r.professions[0]?.slug
      : r.professions?.slug;
    if (!r.worker_id || !slugRaw) continue;
    const list = byWorker.get(r.worker_id) ?? [];
    list.push(slugRaw);
    byWorker.set(r.worker_id, list);
    count += 1;
  }
  return { state: { status: "ok", count }, byWorker };
}

async function readWorkerLanguages(
  supabase: SupabaseClient,
  workerIds: readonly string[],
): Promise<{
  state: WorkforceSourceState;
  byWorker: Map<string, { lang: string; level: string }[]>;
}> {
  const byWorker = new Map<string, { lang: string; level: string }[]>();
  if (workerIds.length === 0) return { state: { status: "ok", count: 0 }, byWorker };
  const res = await asAny(supabase)
    .from("worker_languages")
    .select("worker_id, lang, level")
    .in("worker_id", [...workerIds])
    .limit(WORKER_DETAIL_READ_LIMIT);
  if (res.error) {
    // Owner-gated DRAFT migration 20260711250000 — honest degradation.
    if (isMigrationMissingCode(res.error.code)) {
      return { state: { status: "needs-migration", count: 0 }, byWorker };
    }
    return { state: { status: "error", count: 0 }, byWorker };
  }
  type Row = { worker_id: string | null; lang: string | null; level: string | null };
  let count = 0;
  for (const r of (res.data ?? []) as Row[]) {
    if (!r.worker_id || !r.lang || !r.level) continue;
    const list = byWorker.get(r.worker_id) ?? [];
    list.push({ lang: r.lang, level: r.level });
    byWorker.set(r.worker_id, list);
    count += 1;
  }
  return { state: { status: "ok", count }, byWorker };
}

async function readWorkerCertificates(
  supabase: SupabaseClient,
  workerIds: readonly string[],
): Promise<{ state: WorkforceSourceState; byWorker: Map<string, string[]> }> {
  const byWorker = new Map<string, string[]>();
  if (workerIds.length === 0) return { state: { status: "ok", count: 0 }, byWorker };
  // RLS may show the manager only a subset of worker documents — the count
  // is honest about what THIS caller can actually see.
  const res = await asAny(supabase)
    .from("worker_documents")
    .select("worker_id, document_type_slug, status")
    .in("worker_id", [...workerIds])
    .limit(WORKER_DETAIL_READ_LIMIT);
  if (res.error) {
    if (isMigrationMissingCode(res.error.code)) {
      return { state: { status: "needs-migration", count: 0 }, byWorker };
    }
    return { state: { status: "error", count: 0 }, byWorker };
  }
  type Row = {
    worker_id: string | null;
    document_type_slug: string | null;
    status: string | null;
  };
  let count = 0;
  for (const r of (res.data ?? []) as Row[]) {
    if (!r.worker_id || !r.document_type_slug) continue;
    const list = byWorker.get(r.worker_id) ?? [];
    list.push(r.document_type_slug);
    byWorker.set(r.worker_id, list);
    count += 1;
  }
  return { state: { status: "ok", count }, byWorker };
}

async function readConfirmedClaims(
  supabase: SupabaseClient,
  profileIds: readonly string[],
): Promise<{ byProfile: Map<string, string[]>; counts: Map<string, number> }> {
  const byProfile = new Map<string, string[]>();
  const counts = new Map<string, number>();
  if (profileIds.length === 0) return { byProfile, counts };
  const res = await asAny(supabase)
    .from("profile_skill_claims")
    .select("profile_id, normalized_label, status")
    .in("profile_id", [...profileIds])
    .eq("status", "confirmed")
    .limit(WORKER_DETAIL_READ_LIMIT);
  if (res.error) return { byProfile, counts }; // claims are additive — degrade silently into fewer skills
  type Row = { profile_id: string | null; normalized_label: string | null };
  for (const r of (res.data ?? []) as Row[]) {
    if (!r.profile_id) continue;
    counts.set(r.profile_id, (counts.get(r.profile_id) ?? 0) + 1);
    if (!r.normalized_label) continue;
    const list = byProfile.get(r.profile_id) ?? [];
    list.push(r.normalized_label);
    byProfile.set(r.profile_id, list);
  }
  return { byProfile, counts };
}

/* ------------------------------------------------------------------ */
/* Brigades                                                             */
/* ------------------------------------------------------------------ */

async function readBrigades(
  supabase: SupabaseClient,
): Promise<{ state: WorkforceSourceState; brigades: BrigadeInput[] }> {
  // Reuse the existing team/brigade read (organizations rows with
  // organization_type='team' + engagement_contexts membership). Members are
  // profile-keyed there; map to worker ids with one bounded workers read.
  const data = await getTeamBrigadesData();
  if (!data.applied) {
    return { state: { status: "needs-migration", count: 0 }, brigades: [] };
  }
  if (data.error) {
    return { state: { status: "error", count: 0 }, brigades: [] };
  }
  const profileIds = [
    ...new Set(data.teams.flatMap((t) => t.members.map((m) => m.profileId))),
  ];
  const profileToWorker = new Map<string, string>();
  if (profileIds.length > 0) {
    const res = await asAny(supabase)
      .from("workers")
      .select("id, profile_id")
      .in("profile_id", profileIds)
      .limit(WORKER_DETAIL_READ_LIMIT);
    if (!res.error) {
      for (const r of (res.data ?? []) as { id: string; profile_id: string | null }[]) {
        if (r.profile_id) profileToWorker.set(r.profile_id, r.id);
      }
    }
  }
  const brigades: BrigadeInput[] = data.teams.map((t) => ({
    brigadeId: t.id,
    memberWorkerIds: t.members
      .map((m) => profileToWorker.get(m.profileId))
      .filter((id): id is string => id !== undefined),
  }));
  return { state: { status: "ok", count: brigades.length }, brigades };
}

/* ------------------------------------------------------------------ */
/* Combined read                                                        */
/* ------------------------------------------------------------------ */

/**
 * The caller's combined workforce read — one auth check; the demand,
 * project and brigade sources run independently, then the worker capacity
 * detail sources fan out over the assigned workers. Every source degrades
 * on its own; a missing draft migration is a per-source "needs-migration",
 * never a crash and never fabricated capacity.
 */
export async function getWorkforce(): Promise<WorkforceReadResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: "not-authed" };

  const [demand, project, brigadeRead] = await Promise.all([
    readDemandInputs(supabase, user.id),
    readProjectInputs(supabase, user.id),
    readBrigades(supabase),
  ]);

  const projectDates = new Map(
    project.rows.map((p) => [p.id, { start: p.startDate, end: p.endDate }]),
  );
  const assignmentRead = await readAssignments(
    supabase,
    project.projectIds,
    projectDates,
  );

  const workerIds = assignmentRead.workerIds;
  const [workersRead, skillsRead, professionsRead, languagesRead, certificatesRead] =
    await Promise.all([
      readWorkers(supabase, workerIds),
      readWorkerSkills(supabase, workerIds),
      readWorkerProfessions(supabase, workerIds),
      readWorkerLanguages(supabase, workerIds),
      readWorkerCertificates(supabase, workerIds),
    ]);

  const profileIds = workersRead.rows
    .map((w) => w.profile_id)
    .filter((p): p is string => p !== null);
  const claims = await readConfirmedClaims(supabase, profileIds);

  const brigadesByWorker = new Map<string, string[]>();
  for (const b of brigadeRead.brigades) {
    for (const wid of b.memberWorkerIds) {
      const list = brigadesByWorker.get(wid) ?? [];
      list.push(b.brigadeId);
      brigadesByWorker.set(wid, list);
    }
  }

  const commitmentsByWorker = new Map<
    string,
    { startDate: string; endDate: string | null }[]
  >();
  for (const a of assignmentRead.assignments) {
    if (!a.startDate) continue;
    const list = commitmentsByWorker.get(a.workerId) ?? [];
    list.push({ startDate: a.startDate, endDate: a.endDate });
    commitmentsByWorker.set(a.workerId, list);
  }

  const workers: WorkerCapacityInput[] = workersRead.rows.map((w) => {
    const claimSkills = w.profile_id
      ? claims.byProfile.get(w.profile_id) ?? []
      : [];
    return {
      workerId: w.id,
      availabilityStatus: w.availability_status ?? null,
      availableFrom: w.available_from ?? null,
      plannedCommitments: commitmentsByWorker.get(w.id) ?? [],
      skills: [...new Set([...(skillsRead.byWorker.get(w.id) ?? []), ...claimSkills])],
      professions: professionsRead.byWorker.get(w.id) ?? [],
      certificates: certificatesRead.byWorker.get(w.id) ?? [],
      languages: languagesRead.byWorker.get(w.id) ?? [],
      locationCountry: w.current_location_country ?? null,
      preferences: {
        willingToRelocate: w.willing_to_relocate ?? null,
        needsAccommodation: w.needs_accommodation ?? null,
        hasTransport: w.has_transport ?? null,
        maxTripDays: w.max_trip_days ?? null,
        teamAvailable: w.team_available ?? null,
        soloAvailable: w.solo_available ?? null,
      },
      brigadeIds: brigadesByWorker.get(w.id) ?? [],
      confirmedWorkHistoryCount: w.profile_id
        ? claims.counts.get(w.profile_id) ?? 0
        : 0,
    };
  });

  const entries = composeFutureWork({
    demands: demand.rows,
    projects: project.rows,
  });

  // Stored human plans (payload.workforce_plan) — tolerant read of the same
  // demand rows; an invalid/absent plan is an honest miss, never a default.
  const plans: Record<string, WorkforcePlanV1> = {};
  for (const row of demand.rows) {
    const plan = readWorkforcePlanV1(row.payload);
    if (plan) plans[`demand:${row.id}`] = plan;
  }

  return {
    status: "ok",
    entries,
    plans,
    workers,
    assignments: assignmentRead.assignments,
    brigades: brigadeRead.brigades,
    sources: {
      demand: demand.state,
      project: project.state,
      assignments: assignmentRead.state,
      workers: workersRead.state,
      skills: skillsRead.state,
      professions: professionsRead.state,
      languages: languagesRead.state,
      certificates: certificatesRead.state,
      brigades: brigadeRead.state,
    },
  };
}
