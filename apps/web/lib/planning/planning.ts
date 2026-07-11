import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import { listMyBookings } from "@/lib/booking/booking-actions";
import { callerCompanyId } from "@/lib/projects/projects";
import { listMyTasks } from "@/lib/tasks/tasks";
import { isOpen } from "@/lib/tasks/task-model";
import {
  PLANNING_PROJECT_READ_LIMIT,
  hrefForSource,
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
 *  manager-side read exists today (workers get the note, not fake data). */
export type PlanningSourceStatus =
  | "ok"
  | "unavailable" /* owner-gated migration not applied yet */
  | "managers-only"
  | "error";

export interface PlanningSourceState {
  readonly status: PlanningSourceStatus;
  readonly count: number;
}

export interface PlanningSources {
  readonly booking: PlanningSourceState;
  readonly project: PlanningSourceState;
  readonly task: PlanningSourceState;
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

/** Project lifecycle states with a live date band. Closed projects are
 *  history — they stay on the projects surface. */
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
      });
    }
  }
  return { state: { status: "ok", count: items.length }, items };
}

async function readProjectItems(): Promise<{
  state: PlanningSourceState;
  items: PlanningItem[];
}> {
  // Managers only, honestly: the manager-side `projects` read (owns_company
  // RLS) is the only project read that exists. No company → the source is
  // not available for this caller (workers get the note, never fake bands).
  const companyId = await callerCompanyId();
  if (!companyId) {
    return { state: { status: "managers-only", count: 0 }, items: [] };
  }

  const supabase = await createClient();
  const res = await asAny(supabase)
    .from("projects")
    .select("id, title, city, start_date, end_date, status")
    .eq("company_id", companyId)
    .in("status", [...PLANNED_PROJECT_STATUSES])
    .order("start_date", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(PLANNING_PROJECT_READ_LIMIT);
  if (res.error) {
    return { state: { status: "error", count: 0 }, items: [] };
  }

  type Row = {
    id: string;
    title: string | null;
    city: string | null;
    start_date: string | null;
    end_date: string | null;
    status: string;
  };
  const items: PlanningItem[] = ((res.data ?? []) as Row[])
    .filter((p) =>
      (PLANNED_PROJECT_STATUSES as readonly string[]).includes(p.status),
    )
    .map((p) => ({
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
    }));
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
    });
  }
  const state: PlanningSourceState = result.error
    ? { status: "error", count: items.length }
    : { status: "ok", count: items.length };
  return { state, items };
}

/**
 * The caller's combined planning read — one auth check, three independent
 * RLS-scoped sources in parallel, each degrading on its own.
 */
export async function getPlanning(): Promise<PlanningReadResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: "not-authed" };

  const [booking, project, task] = await Promise.all([
    readBookingItems(),
    readProjectItems(),
    readTaskItems(),
  ]);

  return {
    status: "ok",
    items: [...booking.items, ...project.items, ...task.items],
    sources: {
      booking: booking.state,
      project: project.state,
      task: task.state,
    },
  };
}
