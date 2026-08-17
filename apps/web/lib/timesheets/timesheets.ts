import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import { getOwnWorkerId } from "@/lib/projects/worker-project-access";
import {
  TIMESHEET_READ_LIMIT,
  isTimesheetMigrationMissingCode,
  isValidTimesheetStatus,
  parseTimesheetSnapshot,
  type TimesheetRow,
} from "@/lib/timesheets/timesheets-model";
import {
  isValidWorkflowInstanceStatus,
  type WorkflowApproverSlotRow,
  type WorkflowInstanceStatus,
  type WorkflowInstanceStepRow,
  type WorkflowTransitionRow,
} from "@/lib/approvals/approvals-model";

/**
 * Timesheet read service (functional completion train V2). Reads ONLY with
 * the caller's RLS-scoped client:
 *   - `timesheets` RLS: the worker themselves, the org's managers (BOTH
 *     membership truths via manages_organization), or platform admin;
 *   - engine rows (`workflow_*`) under the engine's own RLS — this module
 *     never widens either scope.
 *
 * SELF-HEALING STATUS, NEVER SELF-DECIDING: when a SUBMITTED timesheet's
 * engine instance is already terminal, the read calls the gated
 * `sync_timesheet_decision_v1` RPC — which only COPIES the engine outcome —
 * and re-reads. No decision is ever made here.
 *
 * INTERNAL ONLY: no email, no push, no webhook, no outbound call of any kind.
 *
 * Honest degradation: while the human-gated timesheets migration is not
 * applied the reads see 42P01 and report { status: "needs-migration" } — the
 * planning section shows a calm "not available yet" state and nothing is
 * faked.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(c: SupabaseClient): any {
  return c;
}

const UUID_RX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const TIMESHEET_COLUMNS =
  "id, organization_id, worker_id, period_start, period_end, status, submitted_at, decided_at, created_at, lines_snapshot";

type RawRow = Record<string, unknown>;

function toTimesheet(r: RawRow): TimesheetRow | null {
  const status = String(r.status ?? "");
  if (!isValidTimesheetStatus(status)) return null;
  return {
    id: String(r.id),
    organizationId: String(r.organization_id),
    workerId: String(r.worker_id),
    periodStart: String(r.period_start),
    periodEnd: String(r.period_end),
    status,
    submittedAt: (r.submitted_at as string | null) ?? null,
    decidedAt: (r.decided_at as string | null) ?? null,
    createdAt: String(r.created_at),
    snapshot: parseTimesheetSnapshot(r.lines_snapshot),
  };
}

export type TimesheetWorkflowState = {
  readonly instanceId: string;
  readonly instanceStatus: WorkflowInstanceStatus;
  readonly steps: readonly WorkflowInstanceStepRow[];
  readonly slots: readonly WorkflowApproverSlotRow[];
  readonly transitions: readonly WorkflowTransitionRow[];
};

export type TimesheetOrgOption = {
  readonly organizationId: string;
  readonly name: string | null;
};

/** Per-org timesheet approval template state (the honest-degradation seam:
 *  submit is only offered where a PUBLISHED template exists). */
export type TimesheetTemplateState = {
  readonly definitionId: string | null;
  readonly published: boolean;
};

export type TimesheetsOverviewResult =
  | { readonly status: "not-authed" }
  | { readonly status: "needs-migration" }
  | {
      readonly status: "ok";
      /** The caller's OWN documents (worker side), newest period first. */
      readonly mine: readonly TimesheetRow[];
      /** Documents of workers in orgs the caller manages (RLS grants the
       *  read; own rows are excluded — presentation split only). */
      readonly org: readonly TimesheetRow[];
      /** Worker display names for the org list (bounded, RLS-scoped). */
      readonly workerNames: ReadonlyMap<string, string>;
      /** Engine state per timesheet id (only for started instances). */
      readonly workflows: ReadonlyMap<string, TimesheetWorkflowState>;
      /** Timesheet approval template state per organization id. */
      readonly templates: ReadonlyMap<string, TimesheetTemplateState>;
      /** Organizations the caller could open a timesheet for. */
      readonly orgOptions: readonly TimesheetOrgOption[];
      readonly error: string | null;
    };

/** Read the engine rows behind a set of timesheet ids (engine RLS applies). */
async function readWorkflowStates(
  supabase: SupabaseClient,
  timesheetIds: readonly string[],
): Promise<Map<string, TimesheetWorkflowState>> {
  const out = new Map<string, TimesheetWorkflowState>();
  if (timesheetIds.length === 0) return out;
  const instRes = await asAny(supabase)
    .from("workflow_instances")
    .select("id, context_entity_id, status")
    .eq("context_entity_type", "timesheet")
    .in("context_entity_id", timesheetIds)
    .order("created_at", { ascending: true })
    .limit(TIMESHEET_READ_LIMIT * 2);
  if (instRes.error) return out;
  type InstRow = { id: string; context_entity_id: string; status: string };
  const instances = ((instRes.data ?? []) as InstRow[]).filter((i) =>
    isValidWorkflowInstanceStatus(i.status),
  );
  if (instances.length === 0) return out;

  const instanceIds = instances.map((i) => i.id);
  const [stepRes, slotRes, trRes] = await Promise.all([
    asAny(supabase)
      .from("workflow_instance_steps")
      .select(
        "id, instance_id, step_order, name, approval_mode, status, deadline_at, activated_at, completed_at",
      )
      .in("instance_id", instanceIds)
      .order("step_order", { ascending: true })
      .limit(TIMESHEET_READ_LIMIT * 5),
    asAny(supabase)
      .from("workflow_instance_approvers")
      .select(
        "id, instance_step_id, instance_id, approver_profile_id, delegated_to_profile_id, decision, decided_at, reason",
      )
      .in("instance_id", instanceIds)
      .limit(TIMESHEET_READ_LIMIT * 10),
    asAny(supabase)
      .from("workflow_transitions")
      .select("id, instance_id, actor_profile_id, action, step_order, reason, created_at")
      .in("instance_id", instanceIds)
      .order("created_at", { ascending: true })
      .limit(TIMESHEET_READ_LIMIT * 10),
  ]);

  const steps = (stepRes.error ? [] : (stepRes.data ?? [])) as RawRow[];
  const slots = (slotRes.error ? [] : (slotRes.data ?? [])) as RawRow[];
  const transitions = (trRes.error ? [] : (trRes.data ?? [])) as RawRow[];

  for (const inst of instances) {
    // The LAST instance for a context wins (resubmit after reopen starts a
    // new instance; ascending order means later assignments overwrite).
    out.set(inst.context_entity_id, {
      instanceId: inst.id,
      instanceStatus: inst.status as WorkflowInstanceStatus,
      steps: steps
        .filter((s) => String(s.instance_id) === inst.id)
        .map((s) => ({
          id: String(s.id),
          instanceId: String(s.instance_id),
          stepOrder: Number(s.step_order),
          name: String(s.name ?? ""),
          approvalMode: String(
            s.approval_mode ?? "single",
          ) as WorkflowInstanceStepRow["approvalMode"],
          status: String(
            s.status ?? "waiting",
          ) as WorkflowInstanceStepRow["status"],
          deadlineAt: (s.deadline_at as string | null) ?? null,
          activatedAt: (s.activated_at as string | null) ?? null,
          completedAt: (s.completed_at as string | null) ?? null,
        })),
      slots: slots
        .filter((s) => String(s.instance_id) === inst.id)
        .map((s) => ({
          id: String(s.id),
          instanceStepId: String(s.instance_step_id),
          instanceId: String(s.instance_id),
          approverProfileId: String(s.approver_profile_id),
          delegatedToProfileId:
            (s.delegated_to_profile_id as string | null) ?? null,
          decision:
            s.decision === "approved" || s.decision === "rejected"
              ? s.decision
              : null,
          decidedAt: (s.decided_at as string | null) ?? null,
          reason: (s.reason as string | null) ?? null,
        })),
      transitions: transitions
        .filter((t) => String(t.instance_id) === inst.id)
        .map((t) => ({
          id: String(t.id),
          instanceId: String(t.instance_id),
          actorProfileId: (t.actor_profile_id as string | null) ?? null,
          action: String(t.action ?? "") as WorkflowTransitionRow["action"],
          stepOrder:
            t.step_order === null || t.step_order === undefined
              ? null
              : Number(t.step_order),
          reason: (t.reason as string | null) ?? null,
          createdAt: String(t.created_at),
        })),
    });
  }
  return out;
}

/** Organizations the caller belongs to over EITHER membership truth —
 *  the set a timesheet can be opened against. Bounded; RLS-scoped. */
async function readOrgOptions(
  supabase: SupabaseClient,
  userId: string,
): Promise<TimesheetOrgOption[]> {
  const [ecRes, cmRes] = await Promise.all([
    asAny(supabase)
      .from("engagement_contexts")
      .select("organization_id, organizations(display_name, legal_name)")
      .eq("profile_id", userId)
      .eq("status", "active")
      .limit(TIMESHEET_READ_LIMIT),
    asAny(supabase)
      .from("company_memberships")
      .select("organization_id, organizations(display_name, legal_name)")
      .eq("profile_id", userId)
      .eq("status", "active")
      .limit(TIMESHEET_READ_LIMIT),
  ]);
  type OrgJoin = {
    organization_id: string | null;
    organizations: {
      display_name: string | null;
      legal_name: string | null;
    } | null;
  };
  const options = new Map<string, TimesheetOrgOption>();
  for (const row of [
    ...((ecRes.error ? [] : (ecRes.data ?? [])) as OrgJoin[]),
    ...((cmRes.error ? [] : (cmRes.data ?? [])) as OrgJoin[]),
  ]) {
    if (!row.organization_id) continue;
    if (options.has(row.organization_id)) continue;
    options.set(row.organization_id, {
      organizationId: row.organization_id,
      name:
        row.organizations?.display_name?.trim() ||
        row.organizations?.legal_name?.trim() ||
        null,
    });
  }
  return [...options.values()];
}

/** Timesheet approval templates visible to the caller (definitions RLS =
 *  active org members), keyed by org id. */
async function readTemplateStates(
  supabase: SupabaseClient,
): Promise<Map<string, TimesheetTemplateState>> {
  const out = new Map<string, TimesheetTemplateState>();
  const defRes = await asAny(supabase)
    .from("workflow_definitions")
    .select("id, organization_id, is_active, context_entity_type, created_at")
    .eq("context_entity_type", "timesheet")
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(TIMESHEET_READ_LIMIT);
  if (defRes.error) return out;
  type DefRow = { id: string; organization_id: string };
  const defs = (defRes.data ?? []) as DefRow[];
  if (defs.length === 0) return out;
  const verRes = await asAny(supabase)
    .from("workflow_definition_versions")
    .select("definition_id, published_at")
    .in(
      "definition_id",
      defs.map((d) => d.id),
    )
    .limit(TIMESHEET_READ_LIMIT * 3);
  const publishedDefs = new Set<string>();
  if (!verRes.error) {
    for (const v of (verRes.data ?? []) as RawRow[]) {
      if (v.published_at !== null && v.published_at !== undefined) {
        publishedDefs.add(String(v.definition_id));
      }
    }
  }
  for (const d of defs) {
    // Newest active definition per org wins (list is newest-first).
    if (out.has(d.organization_id)) continue;
    out.set(d.organization_id, {
      definitionId: d.id,
      published: publishedDefs.has(d.id),
    });
  }
  return out;
}

/**
 * One bounded, RLS-scoped pass building everything the timesheets section
 * renders. Never throws; never fabricates.
 */
export async function getTimesheetsOverview(): Promise<TimesheetsOverviewResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: "not-authed" };

  const listRes = await asAny(supabase)
    .from("timesheets")
    .select(TIMESHEET_COLUMNS)
    .order("period_start", { ascending: false })
    .limit(TIMESHEET_READ_LIMIT);
  if (listRes.error) {
    if (isTimesheetMigrationMissingCode(listRes.error.code)) {
      return { status: "needs-migration" };
    }
    return {
      status: "ok",
      mine: [],
      org: [],
      workerNames: new Map(),
      workflows: new Map(),
      templates: new Map(),
      orgOptions: [],
      error: String(listRes.error.message ?? "read failed"),
    };
  }

  let sheets = ((listRes.data ?? []) as RawRow[])
    .map(toTimesheet)
    .filter((t): t is TimesheetRow => t !== null);

  // Engine state for every visible document (engine RLS re-checks).
  let workflows = await readWorkflowStates(
    supabase,
    sheets.map((s) => s.id),
  );

  // SELF-HEALING: a SUBMITTED document whose engine instance is terminal is
  // synced through the gated RPC (which only copies the engine outcome) and
  // re-read. Bounded to the visible page; failures degrade silently — the
  // UI still shows the engine timeline, so nothing is hidden.
  const stale = sheets.filter((s) => {
    if (s.status !== "submitted") return false;
    const wf = workflows.get(s.id);
    return wf !== undefined && wf.instanceStatus !== "pending";
  });
  if (stale.length > 0) {
    await Promise.all(
      stale.map((s) =>
        asAny(supabase)
          .rpc("sync_timesheet_decision_v1", { p_timesheet_id: s.id })
          .then(() => undefined)
          .catch(() => undefined),
      ),
    );
    const reRes = await asAny(supabase)
      .from("timesheets")
      .select(TIMESHEET_COLUMNS)
      .in(
        "id",
        stale.map((s) => s.id),
      )
      .limit(TIMESHEET_READ_LIMIT);
    if (!reRes.error) {
      const refreshed = new Map(
        ((reRes.data ?? []) as RawRow[])
          .map(toTimesheet)
          .filter((t): t is TimesheetRow => t !== null)
          .map((t) => [t.id, t] as const),
      );
      sheets = sheets.map((s) => refreshed.get(s.id) ?? s);
    }
  }

  const ownWorkerId = await getOwnWorkerId();
  const mine = sheets.filter((s) => s.workerId === ownWorkerId);
  const org = sheets.filter((s) => s.workerId !== ownWorkerId);

  // Worker display names for the org list (workers RLS re-checks; a failed
  // read degrades to no names, never to invented ones).
  const workerNames = new Map<string, string>();
  const orgWorkerIds = [...new Set(org.map((s) => s.workerId))].filter((id) =>
    UUID_RX.test(id),
  );
  if (orgWorkerIds.length > 0) {
    const wRes = await asAny(supabase)
      .from("workers")
      .select("id, display_name")
      .in("id", orgWorkerIds)
      .limit(TIMESHEET_READ_LIMIT);
    if (!wRes.error) {
      for (const w of (wRes.data ?? []) as RawRow[]) {
        const name = typeof w.display_name === "string" ? w.display_name.trim() : "";
        if (name) workerNames.set(String(w.id), name);
      }
    }
  }

  const [templates, orgOptions] = await Promise.all([
    readTemplateStates(supabase),
    readOrgOptions(supabase, user.id),
  ]);

  // Re-read engine state only if a stale sync changed nothing structural —
  // the map built above already covers every visible instance.
  if (stale.length > 0) {
    workflows = await readWorkflowStates(
      supabase,
      sheets.map((s) => s.id),
    );
  }

  return {
    status: "ok",
    mine,
    org,
    workerNames,
    workflows,
    templates,
    orgOptions,
    error: null,
  };
}

export type TimesheetExportResult =
  | { readonly status: "not-authed" }
  | { readonly status: "needs-migration" }
  | { readonly status: "not-found" }
  | { readonly status: "ok"; readonly sheet: TimesheetRow };

/** One document for the CSV route — the SAME RLS-scoped read the section
 *  uses; whoever may view the document may export it. */
export async function getTimesheetForExport(
  id: string,
): Promise<TimesheetExportResult> {
  if (!UUID_RX.test(id)) return { status: "not-found" };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: "not-authed" };

  const res = await asAny(supabase)
    .from("timesheets")
    .select(TIMESHEET_COLUMNS)
    .eq("id", id)
    .maybeSingle();
  if (res.error) {
    if (isTimesheetMigrationMissingCode(res.error.code)) {
      return { status: "needs-migration" };
    }
    return { status: "not-found" };
  }
  if (!res.data) return { status: "not-found" };
  const sheet = toTimesheet(res.data as RawRow);
  if (!sheet) return { status: "not-found" };
  return { status: "ok", sheet };
}

/* ------------------------------------------------------------------ */
/* Workload actuals — the caller's own journal-derived hours by day.   */
/* SAME truth the timesheet snapshot derives from                      */
/* (journal_entry_work_items), so the strip and the sheet can never    */
/* disagree about the same day.                                        */
/* ------------------------------------------------------------------ */

export type DayHours = { readonly day: string; readonly hours: number };

const DAY_RX = /^\d{4}-\d{2}-\d{2}$/;
const WORKLOAD_READ_LIMIT = 500;

/**
 * The caller's OWN recorded work-item hours inside [rangeStart, rangeEnd],
 * grouped by the day the work happened (the entry's own work_date metric,
 * falling back to the created UTC day — the same rule as the SQL derivation
 * and the calendar projection). 'days'-unit items are excluded here (the
 * strip states hours only; day-unit totals live on the timesheet).
 */
export async function getMyWorkItemHours(
  rangeStart: string,
  rangeEnd: string,
): Promise<
  | { readonly status: "unavailable" }
  | { readonly status: "ok"; readonly days: readonly DayHours[] }
> {
  if (!DAY_RX.test(rangeStart) || !DAY_RX.test(rangeEnd)) {
    return { status: "unavailable" };
  }
  const workerId = await getOwnWorkerId();
  if (!workerId) return { status: "unavailable" };
  const supabase = await createClient();

  const itemsRes = await asAny(supabase)
    .from("journal_entry_work_items")
    .select("journal_entry_id, hours_numeric, unit")
    .eq("worker_id", workerId)
    .not("hours_numeric", "is", null)
    .neq("status", "rejected")
    .limit(WORKLOAD_READ_LIMIT);
  if (itemsRes.error) return { status: "unavailable" };
  type ItemRow = {
    journal_entry_id: string;
    hours_numeric: number | null;
    unit: string | null;
  };
  const items = (itemsRes.data ?? []) as ItemRow[];
  if (items.length === 0) return { status: "ok", days: [] };

  const entryIds = [...new Set(items.map((i) => i.journal_entry_id))];
  const [entryRes, metricRes] = await Promise.all([
    asAny(supabase)
      .from("journal_entries")
      .select("id, created_at, deleted_at, superseded_by")
      .in("id", entryIds)
      .is("deleted_at", null)
      .is("superseded_by", null)
      .limit(WORKLOAD_READ_LIMIT),
    asAny(supabase)
      .from("journal_entry_metrics")
      .select("entry_id, value_text")
      .eq("metric_slug", "work_date")
      .in("entry_id", entryIds)
      .limit(WORKLOAD_READ_LIMIT),
  ]);
  if (entryRes.error) return { status: "unavailable" };

  const workDateByEntry = new Map<string, string>();
  if (!metricRes.error) {
    for (const m of (metricRes.data ?? []) as RawRow[]) {
      const v = typeof m.value_text === "string" ? m.value_text.trim() : "";
      if (DAY_RX.test(v)) workDateByEntry.set(String(m.entry_id), v);
    }
  }
  const dayByEntry = new Map<string, string>();
  for (const e of (entryRes.data ?? []) as RawRow[]) {
    const id = String(e.id);
    const day =
      workDateByEntry.get(id) ?? String(e.created_at ?? "").slice(0, 10);
    if (DAY_RX.test(day)) dayByEntry.set(id, day);
  }

  const hoursByDay = new Map<string, number>();
  for (const item of items) {
    const day = dayByEntry.get(item.journal_entry_id);
    if (!day || day < rangeStart || day > rangeEnd) continue;
    const value = typeof item.hours_numeric === "number" ? item.hours_numeric : 0;
    const unit = item.unit ?? "hours";
    const hours =
      unit === "hours" ? value : unit === "minutes" ? value / 60 : 0;
    if (hours <= 0) continue;
    hoursByDay.set(day, (hoursByDay.get(day) ?? 0) + hours);
  }
  return {
    status: "ok",
    days: [...hoursByDay.entries()]
      .map(([day, hours]) => ({ day, hours: Math.round(hours * 100) / 100 }))
      .sort((a, b) => a.day.localeCompare(b.day)),
  };
}
