import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import { listMyBookings } from "@/lib/booking/booking-actions";
import { callerCompanyId } from "@/lib/projects/projects";
import { listMyTasks } from "@/lib/tasks/tasks";
import { isOpen } from "@/lib/tasks/task-model";
import { listMyFinanceRecords } from "@/lib/finance/finance";
import {
  listInvitationsForMe,
  listMySentInvitations,
} from "@/lib/invitations/network";
import { getMyAbsences } from "@/lib/leave/absences";
import { getOwnWorkerId } from "@/lib/projects/worker-project-access";
import { TIME_UNIT_SLUGS } from "@/lib/journal/edit-entry";
import {
  PLANNING_PROJECT_READ_LIMIT,
  clockTime,
  combineInvitationItems,
  daySpanDays,
  hrefForSource,
  journalStartDay,
  planningMeta,
  projectAbsenceItem,
  projectFinanceItem,
  projectIncomingInvitationItem,
  projectSentInvitationItem,
  projectStageItem,
  statusKeyForSource,
  toIsoDay,
  type PlanningItem,
} from "@/lib/planning/planning-model";

/**
 * Planning composition (control room PR E, capability gap map §4) — the
 * server read that feeds /dashboard/planning. It COMPOSES the existing
 * RLS-scoped reads and duplicates no source record:
 *
 *  - bookings  → listMyBookings() (both directions; the RLS the bookings
 *                page already relies on). Proposed + accepted rows are part
 *                of a plan; declined/withdrawn/expired are history and stay
 *                on the bookings page.
 *  - projects  → the caller's own company's projects (callerCompanyId() +
 *                the `projects` RLS the project pages already read).
 *                MANAGERS ONLY, honestly: no worker-side "my assigned
 *                projects" read exists in lib/projects today, and this
 *                slice does not build new privileged queries — workers see
 *                an honest per-source note instead of an invented schedule.
 *  - tasks     → listMyTasks() (PR D layer): OPEN tasks WITH a due date.
 *                Degrades to the honest "not available yet" note while the
 *                owner-gated work_tasks migration is unapplied.
 *
 * Every source degrades independently — a failed or missing source becomes
 * a per-source note, never a crash and never fake rows. All reads are
 * bounded (the source libs bound theirs; the project read is bounded here).
 *
 * INTERNAL ONLY: this layer sends nothing anywhere — no email, no push, no
 * Telegram, no webhook, no outbound call of any kind. Read-only: no insert,
 * no update, no delete, no RPC.
 */

/** Per-source honest state. `managers-only` = the source exists but only a
 *  manager-side read exists today (workers get the note, not fake data);
 *  `workers-only` mirrors it for the journal (fact source of a worker). */
export type PlanningSourceStatus =
  | "ok"
  | "unavailable" /* owner-gated migration not applied yet */
  | "managers-only"
  | "workers-only"
  | "error";

export interface PlanningSourceState {
  readonly status: PlanningSourceStatus;
  readonly count: number;
}

export interface PlanningSources {
  readonly booking: PlanningSourceState;
  readonly project: PlanningSourceState;
  readonly task: PlanningSourceState;
  readonly journal: PlanningSourceState;
  readonly finance: PlanningSourceState;
  /** ONE combined state for both invitation directions (sent + incoming) —
   *  the projection dedupes overlapping scopes into single items. */
  readonly invitation: PlanningSourceState;
  /** Time Engine W2: the caller's own leave/absence bands (W7 model). */
  readonly absence: PlanningSourceState;
  /** Time Engine W2: dated stages of visible projects (W6 model). */
  readonly stage: PlanningSourceState;
}

export type PlanningReadResult =
  | { readonly status: "not-authed" }
  | {
      readonly status: "ok";
      readonly items: readonly PlanningItem[];
      readonly sources: PlanningSources;
    };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(c: SupabaseClient): any {
  return c;
}

/** Booking statuses that belong on a forward plan. */
const PLANNED_BOOKING_STATUSES = new Set(["proposed", "accepted"]);

/**
 * Project lifecycle states with a forward date band.
 *
 * W11 pins the semantics rather than changing the behaviour: the TERMINAL
 * status is excluded, so a finished project can never produce a FUTURE
 * conflict — it stays history on the projects surface. `paused` remains
 * readable (the person still sees the project) but W11's shared model is the
 * authority on whether it counts as ACTIVE work: `isActivePlanningStatus` is
 * true for `live` only, because a paused project is precisely the case where
 * nobody's time is claimed, and flagging it as a clash would invent a problem
 * no record proves.
 *
 * The list previously named `closed`, a value nothing ever wrote; the
 * canonical terminal status is now `completed` (owner decision D1). W12's
 * booking-overlap invariant is untouched by any of this.
 */
const PLANNED_PROJECT_STATUSES = ["draft", "live", "paused"] as const;

async function readBookingItems(): Promise<{
  state: PlanningSourceState;
  items: PlanningItem[];
}> {
  const result = await listMyBookings();
  if (result.kind === "needs-migration") {
    return { state: { status: "unavailable", count: 0 }, items: [] };
  }
  if (result.kind !== "ok") {
    return { state: { status: "error", count: 0 }, items: [] };
  }
  const items: PlanningItem[] = [];
  for (const [rows, roleContext] of [
    [result.incoming, "incoming"],
    [result.outgoing, "outgoing"],
  ] as const) {
    for (const row of rows) {
      if (!PLANNED_BOOKING_STATUSES.has(row.status)) continue;
      items.push({
        id: `booking:${row.id}`,
        sourceType: "booking",
        sourceId: row.id,
        label: row.roleText?.trim() ? row.roleText : null,
        detail: row.locationCountry?.trim() ? row.locationCountry : null,
        startDate: toIsoDay(row.startDate),
        endDate: toIsoDay(row.expectedEndDate),
        status: row.status,
        statusKey: statusKeyForSource("booking", row.status),
        href: hrefForSource("booking", row.id),
        roleContext,
        // §7.1: a booking states its place (country) and its day span; the
        // counterpart name is NOT read here — contact identity stays behind
        // the platform's own disclosure flow (§20).
        ...planningMeta({
          place: row.locationCountry,
          duration: daySpanDays(toIsoDay(row.startDate), toIsoDay(row.expectedEndDate)),
        }),
      });
    }
  }
  return { state: { status: "ok", count: items.length }, items };
}

/**
 * The caller's OWN assigned-project date bands (Time Engine W2) — the
 * worker-side dated read the calendar contract listed as a blocker. Own
 * assignments only (`project_worker_assignments.worker_id = own worker`),
 * project rows under the projects RLS the worker pages already read. These
 * items carry roleContext "assigned", which makes the ALREADY-SHIPPED
 * conflict branch in isConflictEligible reachable for the first time.
 */
async function readAssignedProjectItems(): Promise<{
  state: PlanningSourceState;
  items: PlanningItem[];
  projectRefs: { id: string; title: string | null }[];
}> {
  const workerId = await getOwnWorkerId();
  if (!workerId) {
    return { state: { status: "ok", count: 0 }, items: [], projectRefs: [] };
  }
  const supabase = await createClient();
  const assignRes = await asAny(supabase)
    .from("project_worker_assignments")
    .select("project_id, status")
    .eq("worker_id", workerId)
    .eq("status", "active")
    .limit(PLANNING_PROJECT_READ_LIMIT);
  if (assignRes.error) {
    return { state: { status: "error", count: 0 }, items: [], projectRefs: [] };
  }
  const ids = [
    ...new Set(
      ((assignRes.data ?? []) as { project_id: string }[]).map(
        (a) => a.project_id,
      ),
    ),
  ];
  if (ids.length === 0) {
    return { state: { status: "ok", count: 0 }, items: [], projectRefs: [] };
  }
  const res = await asAny(supabase)
    .from("projects")
    .select("id, title, city, start_date, end_date, status")
    .in("id", ids)
    .in("status", [...PLANNED_PROJECT_STATUSES])
    .limit(PLANNING_PROJECT_READ_LIMIT);
  if (res.error) {
    return { state: { status: "error", count: 0 }, items: [], projectRefs: [] };
  }
  type Row = {
    id: string;
    title: string | null;
    city: string | null;
    start_date: string | null;
    end_date: string | null;
    status: string;
  };
  const rows = (res.data ?? []) as Row[];
  const items: PlanningItem[] = rows.map((p) => ({
    id: `project:${p.id}`,
    sourceType: "project" as const,
    sourceId: p.id,
    label: p.title?.trim() ? p.title : null,
    detail: p.city?.trim() ? p.city : null,
    startDate: toIsoDay(p.start_date),
    endDate: toIsoDay(p.end_date),
    status: p.status,
    statusKey: statusKeyForSource("project", p.status),
    href: hrefForSource("project", p.id),
    roleContext: "assigned" as const,
    // §7.1: the project IS the project context; its city is the place and
    // the band is the duration.
    ...planningMeta({
      project: p.title,
      place: p.city,
      duration: daySpanDays(toIsoDay(p.start_date), toIsoDay(p.end_date)),
    }),
  }));
  return {
    state: { status: "ok", count: items.length },
    items,
    projectRefs: rows.map((p) => ({ id: p.id, title: p.title })),
  };
}

async function readProjectItems(): Promise<{
  state: PlanningSourceState;
  items: PlanningItem[];
  projectRefs: { id: string; title: string | null }[];
}> {
  // Manager-side date bands. (The worker-side assigned read now exists too —
  // readAssignedProjectItems above; getPlanning merges both, assigned wins.)
  // Scope = the caller's legacy company channel PLUS the organizations the
  // caller owns — both reads stay under the projects RLS (fail-closed).
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const companyId = await callerCompanyId();

  const ownedOrgsRes = user
    ? await asAny(supabase)
        .from("organizations")
        .select("id")
        .eq("owner_profile_id", user.id)
        .limit(50)
    : { data: null, error: null };
  const ownedOrgIds: string[] = ((ownedOrgsRes.data ?? []) as { id: string }[]).map(
    (o) => o.id,
  );

  if (!companyId && ownedOrgIds.length === 0) {
    return {
      state: { status: "managers-only", count: 0 },
      items: [],
      projectRefs: [],
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
    .select("id, title, city, start_date, end_date, status")
    .or(orFilter)
    .in("status", [...PLANNED_PROJECT_STATUSES])
    .order("start_date", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(PLANNING_PROJECT_READ_LIMIT);
  if (res.error) {
    return { state: { status: "error", count: 0 }, items: [], projectRefs: [] };
  }

  type Row = {
    id: string;
    title: string | null;
    city: string | null;
    start_date: string | null;
    end_date: string | null;
    status: string;
  };
  const seen = new Set<string>();
  const rows = ((res.data ?? []) as Row[]).filter((p) => {
    if (seen.has(p.id)) return false;
    seen.add(p.id);
    return (PLANNED_PROJECT_STATUSES as readonly string[]).includes(p.status);
  });
  const items: PlanningItem[] = rows.map((p) => ({
    id: `project:${p.id}`,
    sourceType: "project" as const,
    sourceId: p.id,
    label: p.title?.trim() ? p.title : null,
    detail: p.city?.trim() ? p.city : null,
    startDate: toIsoDay(p.start_date),
    endDate: toIsoDay(p.end_date),
    status: p.status,
    statusKey: statusKeyForSource("project", p.status),
    href: hrefForSource("project", p.id),
    roleContext: "managed" as const,
    ...planningMeta({
      project: p.title,
      place: p.city,
      duration: daySpanDays(toIsoDay(p.start_date), toIsoDay(p.end_date)),
    }),
  }));
  return {
    state: { status: "ok", count: items.length },
    items,
    projectRefs: rows.map((p) => ({ id: p.id, title: p.title })),
  };
}

/**
 * The caller's own leave/absence bands (Time Engine W2). Reuses the W7
 * surface's OWN read (`getMyAbsences` — worker-scoped RLS) and the pure
 * `projectAbsenceItem` mapper. Approved absences join conflict detection —
 * approved leave overlapping an accepted booking is a real impossible plan.
 */
async function readAbsenceItems(): Promise<{
  state: PlanningSourceState;
  items: PlanningItem[];
}> {
  const result = await getMyAbsences();
  if (!result.applied) {
    return { state: { status: "unavailable", count: 0 }, items: [] };
  }
  const items: PlanningItem[] = [];
  for (const absence of result.absences) {
    const item = projectAbsenceItem({
      id: absence.id,
      startDate: absence.startDate,
      endDate: absence.endDate,
      status: absence.status,
    });
    if (item) items.push(item);
  }
  return { state: { status: "ok", count: items.length }, items };
}

/** Bounded stage read across the visible projects (managed + assigned). */
const PLANNING_STAGE_READ_LIMIT = 300;

/**
 * Dated stages of the projects the caller can already see (Time Engine W2).
 * Scope = the SAME project ids the project sources returned — no wider read,
 * `project_stages` RLS (manager or actively assigned worker) still applies
 * row-level. Date semantics come from the pure `projectStageItem` mapper
 * (actual overrides planned — identical to the stage gantt).
 */
async function readStageItems(
  projectRefs: readonly { id: string; title: string | null }[],
): Promise<{ state: PlanningSourceState; items: PlanningItem[] }> {
  if (projectRefs.length === 0) {
    return { state: { status: "ok", count: 0 }, items: [] };
  }
  const supabase = await createClient();
  const titleById = new Map(projectRefs.map((p) => [p.id, p.title] as const));
  const res = await asAny(supabase)
    .from("project_stages")
    .select(
      "id, project_id, name, status, planned_start, planned_end, actual_start, actual_end",
    )
    .in("project_id", [...titleById.keys()])
    .limit(PLANNING_STAGE_READ_LIMIT);
  if (res.error) {
    const code = (res.error as { code?: string }).code;
    if (code === "42P01" || code === "42703") {
      return { state: { status: "unavailable", count: 0 }, items: [] };
    }
    return { state: { status: "error", count: 0 }, items: [] };
  }
  type Row = {
    id: string;
    project_id: string;
    name: string;
    status: string;
    planned_start: string | null;
    planned_end: string | null;
    actual_start: string | null;
    actual_end: string | null;
  };
  const items: PlanningItem[] = [];
  for (const row of (res.data ?? []) as Row[]) {
    const item = projectStageItem({
      id: row.id,
      projectId: row.project_id,
      projectTitle: titleById.get(row.project_id) ?? null,
      name: row.name,
      status: row.status,
      plannedStart: row.planned_start,
      plannedEnd: row.planned_end,
      actualStart: row.actual_start,
      actualEnd: row.actual_end,
    });
    if (item) items.push(item);
  }
  return { state: { status: "ok", count: items.length }, items };
}

async function readTaskItems(): Promise<{
  state: PlanningSourceState;
  items: PlanningItem[];
}> {
  const result = await listMyTasks();
  if (result.status === "needs-migration") {
    return { state: { status: "unavailable", count: 0 }, items: [] };
  }
  if (result.status !== "ok") {
    return { state: { status: "error", count: 0 }, items: [] };
  }
  // Only OPEN, DUE-DATED tasks join the plan — a finished task is history
  // and an undated task has no calendar meaning (it stays on /tasks).
  const items: PlanningItem[] = [];
  for (const task of result.tasks) {
    if (!isOpen(task.status)) continue;
    const due = toIsoDay(task.dueAt);
    if (!due) continue;
    items.push({
      id: `task:${task.id}`,
      sourceType: "task",
      sourceId: task.id,
      label: task.title,
      detail: null,
      startDate: due,
      endDate: null,
      status: task.status,
      statusKey: statusKeyForSource("task", task.status),
      href: hrefForSource("task", task.id),
      roleContext: "mine",
      // A due-dated task carries its real clock time when one was set.
      ...planningMeta({ startTime: clockTime(task.dueAt) }),
    });
  }
  const state: PlanningSourceState = result.error
    ? { status: "error", count: items.length }
    : { status: "ok", count: items.length };
  return { state, items };
}

/** Bounded read cap for journal facts inside the visible range. */
const PLANNING_JOURNAL_READ_LIMIT = 200;

async function readJournalItems(
  userId: string,
  rangeStart: string,
  rangeEnd: string,
): Promise<{ state: PlanningSourceState; items: PlanningItem[] }> {
  // The journal is FACT (calendar = plan; journal = what really happened):
  // the caller's OWN entries only, shown at their real recorded day and
  // deep-linked to the entry itself. Managers keep reading team journals on
  // the journal/review surfaces — the personal calendar never widens reads.
  const supabase = await createClient();
  const workerRes = await asAny(supabase)
    .from("workers")
    .select("id")
    .eq("profile_id", userId)
    .maybeSingle();
  if (workerRes.error) {
    return { state: { status: "error", count: 0 }, items: [] };
  }
  if (!workerRes.data) {
    return { state: { status: "workers-only", count: 0 }, items: [] };
  }

  const ENTRY_COLUMNS =
    "id, original_text, created_at, deleted_at, superseded_by, correction_of, engagement_context_id";
  const liveEntries = () =>
    asAny(supabase)
      .from("journal_entries")
      .select(ENTRY_COLUMNS)
      .eq("worker_id", workerRes.data.id)
      .is("deleted_at", null)
      .is("superseded_by", null);

  // WHICH ENTRIES THE VISIBLE RANGE CONTAINS — asked of the day the work
  // HAPPENED, not the day the row was typed.
  //
  // THE DEFECT THIS EXISTS FOR (D-13). The projection places an entry on its
  // own `work_date` (journalStartDay), but this read bounded the query by
  // `created_at`. The two columns disagree by design — logging Monday's shift
  // on Friday is the normal case, and "I am filling in last month now" is the
  // exact behaviour the Work Journal invites. So an entry worked in June and
  // typed in August was never READ while looking at June: the day rendered
  // empty, and a worker asking "which days did I fill?" was told "none".
  // Nothing errored and no test failed — the row simply was not in the result
  // set. A worker can only trust "this day is empty" if the query asked about
  // that day.
  //
  // Two bounded, RLS-scoped reads instead of one, merged by id:
  //   A. entries whose stated work_date falls in the range (the metrics table
  //      is the only place that day lives), and
  //   B. entries CREATED in the range — which keeps every entry that never
  //      carried a work_date at all, exactly where `created_at` still puts it.
  // Neither read can widen scope: both are filtered to this worker's own live
  // entries, and the metrics table's own SELECT policy re-checks the parent.
  const workDateIdsRes = await asAny(supabase)
    .from("journal_entry_metrics")
    .select("entry_id")
    .eq("metric_slug", "work_date")
    .gte("value_text", rangeStart)
    .lte("value_text", rangeEnd)
    .limit(PLANNING_JOURNAL_READ_LIMIT);
  const workDateIds = [
    ...new Set(
      ((workDateIdsRes.data ?? []) as { entry_id: string }[]).map(
        (m) => m.entry_id,
      ),
    ),
  ];

  const [createdRes, workedRes] = await Promise.all([
    liveEntries()
      .gte("created_at", `${rangeStart}T00:00:00Z`)
      .lte("created_at", `${rangeEnd}T23:59:59.999Z`)
      .order("created_at", { ascending: true })
      .limit(PLANNING_JOURNAL_READ_LIMIT),
    workDateIds.length > 0
      ? liveEntries().in("id", workDateIds).limit(PLANNING_JOURNAL_READ_LIMIT)
      : Promise.resolve({ data: [], error: null }),
  ]);
  // A failed work_date lookup must not silently shrink the answer back to the
  // defect above, so it is a real error rather than a quiet fallback.
  if (createdRes.error || workedRes.error || workDateIdsRes.error) {
    return { state: { status: "error", count: 0 }, items: [] };
  }

  type Row = {
    id: string;
    original_text: string | null;
    created_at: string;
    correction_of: string | null;
    engagement_context_id: string | null;
  };
  const byId = new Map<string, Row>();
  for (const row of [
    ...((createdRes.data ?? []) as Row[]),
    ...((workedRes.data ?? []) as Row[]),
  ]) {
    if (!byId.has(row.id)) byId.set(row.id, row);
  }
  const res = {
    data: [...byId.values()].sort((a, b) =>
      a.created_at.localeCompare(b.created_at),
    ),
    error: null,
  };
  // ONE ACTIVE ENTRY PER CHAIN (owner audit P0.7). Editing a CONFIRMED entry
  // creates a correction row whose `correction_of` points at the original —
  // the original deliberately stays visible in the journal's audit trail,
  // but the CALENDAR is a projection of what happened, and showing both made
  // one edited entry appear as several similar rows. An entry that a live
  // correction points at is therefore replaced by that correction here.
  const rows = (res.data ?? []) as Row[];
  const correctedIds = new Set(
    rows.map((r) => r.correction_of).filter((v): v is string => Boolean(v)),
  );
  // §7.1 THE FULL FIELD SET for the source the owner reads most. Two
  // bounded, RLS-scoped follow-up reads over the SAME entry ids: the entry's
  // own metrics (real hours + site name, written by the save action) and the
  // entry's engagement context (the workspace/organization it was logged
  // against). A failed follow-up degrades to null meta — the entry still
  // renders, it just says less (never something invented).
  const liveRows = rows.filter((e) => !correctedIds.has(e.id));
  const entryIds = liveRows.map((e) => e.id);
  const metricsByEntry = new Map<
    string,
    { hours: string | null; site: string | null; workDate: string | null }
  >();
  const orgByEngagement = new Map<string, string | null>();
  if (entryIds.length > 0) {
    const [metricsRes, ecRes] = await Promise.all([
      asAny(supabase)
        .from("journal_entry_metrics")
        // The FK column is `entry_id`. This read asked for `journal_entry_id`,
        // which does not exist — so the request errored on every call, the
        // "degrades to null meta" branch swallowed it, and the hours and site
        // this block exists to show were silently never rendered. An honest
        // degradation path hides a typo forever; the column name is pinned by
        // a test now.
        .select("entry_id, metric_slug, value_text, value_numeric, unit_slug")
        .in("entry_id", entryIds)
        .limit(PLANNING_JOURNAL_READ_LIMIT * 8),
      (async () => {
        const ecIds = [
          ...new Set(
            liveRows
              .map((e) => e.engagement_context_id)
              .filter((v): v is string => Boolean(v)),
          ),
        ];
        if (ecIds.length === 0) return { data: [], error: null };
        return asAny(supabase)
          .from("engagement_contexts")
          .select("id, organizations(display_name, legal_name)")
          .in("id", ecIds);
      })(),
    ]);
    if (!metricsRes.error) {
      type MetricRow = {
        entry_id: string;
        metric_slug: string;
        value_text: string | null;
        value_numeric: number | null;
        unit_slug: string | null;
      };
      for (const m of (metricsRes.data ?? []) as MetricRow[]) {
        const cur = metricsByEntry.get(m.entry_id) ?? {
          hours: null,
          site: null,
          workDate: null,
        };
        if (m.metric_slug === "site_name" && m.value_text?.trim()) {
          cur.site = m.value_text.trim();
        }
        // THE DAY THE WORK HAPPENED, as the worker stated it. Already stored
        // by the save action (`work_date`, source `worker_input`) — it was
        // simply never read here, so "įrašyk vakarykštį darbą" landed on the
        // day the row was TYPED. A plain ISO day needs no timezone conversion
        // (W12: one UTC-pinned formatter, and this value never enters it);
        // anything not exactly YYYY-MM-DD is ignored rather than guessed at.
        if (m.metric_slug === "work_date" && m.value_text?.trim()) {
          cur.workDate = m.value_text.trim();
        }
        // A TIME unit on the quantity metric means the number IS a duration.
        if (
          m.metric_slug === "quantity" &&
          m.unit_slug !== null &&
          TIME_UNIT_SLUGS.has(m.unit_slug) &&
          typeof m.value_numeric === "number"
        ) {
          cur.hours = `${m.value_numeric}|${m.unit_slug}`;
        }
        metricsByEntry.set(m.entry_id, cur);
      }
    }
    if (!ecRes.error) {
      type EcRow = {
        id: string;
        organizations: { display_name: string | null; legal_name: string | null } | null;
      };
      for (const ec of (ecRes.data ?? []) as EcRow[]) {
        orgByEngagement.set(
          ec.id,
          ec.organizations?.display_name?.trim() ||
            ec.organizations?.legal_name?.trim() ||
            null,
        );
      }
    }
  }

  const items: PlanningItem[] = liveRows
    .map((e) => {
    const firstLine = (e.original_text ?? "").trim().split(/\r?\n/, 1)[0] ?? "";
    const metrics = metricsByEntry.get(e.id);
    return {
      id: `journal:${e.id}`,
      sourceType: "journal" as const,
      sourceId: e.id,
      label: firstLine ? (firstLine.length > 80 ? `${firstLine.slice(0, 79)}…` : firstLine) : null,
      detail: null,
      // THE DAY WORKED, not the day typed. `created_at` is when the row was
      // written, so an entry logged in the evening for yesterday's shift —
      // "įrašyk vakarykštį darbą į žurnalą", a first-class journal phrase —
      // appeared on the wrong calendar day, and a worker checking which days
      // they had filled was reading fiction. The worker's own `work_date` wins
      // when present; `created_at` stays the fallback for entries that never
      // carried one.
      startDate: journalStartDay(metrics?.workDate, e.created_at),
      endDate: null,
      status: "recorded",
      ...(() => {
        const m = metrics;
        const org = e.engagement_context_id
          ? (orgByEngagement.get(e.engagement_context_id) ?? null)
          : null;
        return planningMeta({
          startTime: clockTime(e.created_at),
          duration: m?.hours ?? null,
          workspace: org,
          organization: org,
          place: m?.site ?? null,
        });
      })(),
      statusKey: statusKeyForSource("journal", "recorded"),
      href: hrefForSource("journal", e.id),
      roleContext: "mine" as const,
    };
  });
  return { state: { status: "ok", count: items.length }, items };
}

/**
 * Finance records as calendar items (Timeline Source Expansion v1). Reuses
 * the finance surface's OWN RLS-scoped read (`listMyFinanceRecords` —
 * creator / admin / company owner; bounded, deterministically ordered) and
 * projects each record through the pure `projectFinanceItem` mapper. The
 * projection deliberately drops every money field and third-party name —
 * the calendar shows only safe operational facts (title, status, day) and
 * links to /dashboard/finance where the full record lives under its
 * existing permissions.
 */
async function readFinanceItems(todayIso: string): Promise<{
  state: PlanningSourceState;
  items: PlanningItem[];
}> {
  const result = await listMyFinanceRecords();
  if (result.status === "not-authed") {
    return { state: { status: "error", count: 0 }, items: [] };
  }
  if (result.status === "needs-migration") {
    return { state: { status: "unavailable", count: 0 }, items: [] };
  }
  const items: PlanningItem[] = [];
  for (const record of result.records) {
    const item = projectFinanceItem(
      {
        id: record.id,
        title: record.title,
        status: record.status,
        dueDate: record.dueDate,
        paidAt: record.paidAt,
      },
      todayIso,
    );
    if (item) items.push(item);
  }
  const state: PlanningSourceState = result.error
    ? { status: "error", count: items.length }
    : { status: "ok", count: items.length };
  return { state, items };
}

/**
 * Invitations as calendar items — BOTH directions through their existing
 * reads (`listMySentInvitations`: inviter-scoped RLS; `listInvitationsForMe`:
 * the pending-for-my-verified-email RPC the dashboard invitations card
 * already uses). Lifecycle days come from real timestamps only (expiry /
 * accepted_at / declined_at / revoked_at); creation time is never presented
 * as a scheduled event. Overlapping scopes (self-invitation) dedupe to one
 * item via `combineInvitationItems`.
 */
async function readInvitationItems(): Promise<{
  state: PlanningSourceState;
  items: PlanningItem[];
}> {
  const [sent, incoming] = await Promise.all([
    listMySentInvitations(),
    listInvitationsForMe(),
  ]);
  if (sent.status === "needs-migration" && incoming.status === "needs-migration") {
    return { state: { status: "unavailable", count: 0 }, items: [] };
  }
  const outgoingItems =
    sent.status === "ok" ? sent.items.map(projectSentInvitationItem) : [];
  const incomingItems =
    incoming.status === "ok"
      ? incoming.items.map(projectIncomingInvitationItem)
      : [];
  const items = combineInvitationItems(outgoingItems, incomingItems);
  const failed = sent.status === "error" || incoming.status === "error";
  return {
    state: { status: failed ? "error" : "ok", count: items.length },
    items,
  };
}

export interface PlanningRange {
  /** Inclusive "YYYY-MM-DD" bounds of the visible view — drives the
   *  bounded journal-fact read (plan sources stay bounded on their own). */
  readonly rangeStart: string;
  readonly rangeEnd: string;
}

/**
 * The caller's combined planning read — one auth check, eight RLS-scoped
 * sources, each degrading on its own. Project bands merge BOTH directions:
 * the manager-side scope and the caller's own assignments — when the same
 * project appears in both, the ASSIGNED item wins (it is the personal
 * commitment that participates in conflict detection). Stages read over the
 * union of visible project ids (chained — never a wider scope).
 */
export async function getPlanning(
  range?: PlanningRange,
): Promise<PlanningReadResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: "not-authed" };

  const today = new Date().toISOString().slice(0, 10);
  const rangeStart = range?.rangeStart ?? today;
  const rangeEnd =
    range && range.rangeEnd >= rangeStart ? range.rangeEnd : rangeStart;

  const managedPromise = readProjectItems();
  const assignedPromise = readAssignedProjectItems();
  const stagePromise = Promise.all([managedPromise, assignedPromise]).then(
    ([managed, assigned]) => {
      const refs = new Map<string, { id: string; title: string | null }>();
      for (const p of [...managed.projectRefs, ...assigned.projectRefs]) {
        if (!refs.has(p.id)) refs.set(p.id, p);
      }
      return readStageItems([...refs.values()]);
    },
  );

  const [booking, managed, assigned, stage, task, journal, finance, invitation, absence] =
    await Promise.all([
      readBookingItems(),
      managedPromise,
      assignedPromise,
      stagePromise,
      readTaskItems(),
      readJournalItems(user.id, rangeStart, rangeEnd),
      readFinanceItems(today),
      readInvitationItems(),
      readAbsenceItems(),
    ]);

  // Merge project directions — assigned (personal commitment) wins on id
  // collision, so conflict detection sees the caller's own band exactly once.
  const assignedIds = new Set(assigned.items.map((i) => i.id));
  const projectItems = [
    ...assigned.items,
    ...managed.items.filter((i) => !assignedIds.has(i.id)),
  ];
  const projectState: PlanningSourceState =
    managed.state.status === "managers-only" &&
    (assigned.state.status !== "ok" || assigned.items.length === 0)
      ? managed.state
      : {
          status:
            managed.state.status === "error" || assigned.state.status === "error"
              ? "error"
              : "ok",
          count: projectItems.length,
        };

  return {
    status: "ok",
    items: [
      ...booking.items,
      ...projectItems,
      ...stage.items,
      ...task.items,
      ...journal.items,
      ...finance.items,
      ...invitation.items,
      ...absence.items,
    ],
    sources: {
      booking: booking.state,
      project: projectState,
      task: task.state,
      journal: journal.state,
      finance: finance.state,
      invitation: invitation.state,
      absence: absence.state,
      stage: stage.state,
    },
  };
}
