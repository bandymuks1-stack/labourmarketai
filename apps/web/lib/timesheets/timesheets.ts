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
  deriveEntryWorkTime,
  workTimeHoursByDay,
  type WorkTimeDayHours,
  type WorkTimeMetricRow,
} from "@/lib/journal/work-time";
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
  /** True iff the caller holds GOVERNANCE authority there — an active
   *  company_memberships row with role owner/admin (the exact truth
   *  `membership_actor_role_v1` re-checks inside the engine's authoring
   *  RPCs) or `organizations.owner_profile_id`. UI-shaping only: the
   *  template-install offer is rendered ONLY where the server would accept
   *  it, so a worker never meets a button that can only answer
   *  not_authorized. */
  readonly canGovern: boolean;
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
      .select(
        "organization_id, organizations(display_name, legal_name, owner_profile_id)",
      )
      .eq("profile_id", userId)
      .eq("status", "active")
      .limit(TIMESHEET_READ_LIMIT),
    asAny(supabase)
      .from("company_memberships")
      .select(
        "organization_id, role, organizations(display_name, legal_name, owner_profile_id)",
      )
      .eq("profile_id", userId)
      .eq("status", "active")
      .limit(TIMESHEET_READ_LIMIT),
  ]);
  type OrgJoin = {
    organization_id: string | null;
    role?: string | null;
    organizations: {
      display_name: string | null;
      legal_name: string | null;
      owner_profile_id: string | null;
    } | null;
  };
  const options = new Map<string, TimesheetOrgOption>();
  for (const row of [
    ...((ecRes.error ? [] : (ecRes.data ?? [])) as OrgJoin[]),
    ...((cmRes.error ? [] : (cmRes.data ?? [])) as OrgJoin[]),
  ]) {
    if (!row.organization_id) continue;
    // Governance mirrors `membership_actor_role_v1` (owner/admin membership),
    // widened by the org-owner column the seed migration mirrors into it.
    const governs =
      row.role === "owner" ||
      row.role === "admin" ||
      row.organizations?.owner_profile_id === userId;
    const existing = options.get(row.organization_id);
    if (existing) {
      // Presence rows never LOWER an authority already established — the
      // engagement arm carries no role and must not mask the membership arm.
      if (governs && !existing.canGovern) {
        options.set(row.organization_id, { ...existing, canGovern: true });
      }
      continue;
    }
    options.set(row.organization_id, {
      organizationId: row.organization_id,
      name:
        row.organizations?.display_name?.trim() ||
        row.organizations?.legal_name?.trim() ||
        null,
      canGovern: governs,
    });
  }
  return [...options.values()];
}

/** Timesheet approval templates for the caller's OWN organizations
 *  (definitions RLS = active org members), keyed by org id.
 *
 *  SAME MODEL AS THE SUBMIT PATH: submit accepts ANY active definition with
 *  a published version, so this read reports published=true iff ANY active
 *  definition for the org has one. (It used to answer from only the NEWEST
 *  active definition across an UNSCOPED 50-row window — an org whose newest
 *  definition was an unpublished draft, or which fell off the global window
 *  entirely, was shown "no template" while its submit would have worked.) */
async function readTemplateStates(
  supabase: SupabaseClient,
  organizationIds: readonly string[],
): Promise<Map<string, TimesheetTemplateState>> {
  const out = new Map<string, TimesheetTemplateState>();
  if (organizationIds.length === 0) return out;
  const defRes = await asAny(supabase)
    .from("workflow_definitions")
    .select("id, organization_id, is_active, context_entity_type, created_at")
    .eq("context_entity_type", "timesheet")
    .eq("is_active", true)
    .in("organization_id", organizationIds)
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
    // Newest-first: the FIRST published definition per org is the one the
    // submit path would start against; a draft is only reported while no
    // published sibling exists.
    const prev = out.get(d.organization_id);
    if (prev?.published) continue;
    const isPublished = publishedDefs.has(d.id);
    if (!prev || isPublished) {
      out.set(d.organization_id, { definitionId: d.id, published: isPublished });
    }
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

  const orgOptions = await readOrgOptions(supabase, user.id);
  // Template states are asked ONLY for the orgs on this page (the caller's
  // options plus every visible document's org) — never a global window.
  const templateOrgIds = [
    ...new Set([
      ...orgOptions.map((o) => o.organizationId),
      ...sheets.map((s) => s.organizationId),
    ]),
  ];
  const templates = await readTemplateStates(supabase, templateOrgIds);

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
/* SAME canonical truth the timesheet snapshot derives from            */
/* (journal_entry_metrics, via lib/journal/work-time), so the strip and */
/* the sheet can never disagree about the same day.                    */
/* ------------------------------------------------------------------ */

export type DayHours = WorkTimeDayHours;

const DAY_RX = /^\d{4}-\d{2}-\d{2}$/;
const WORKLOAD_READ_LIMIT = 500;
/** Metric rows per entry are small (a handful); this bound keeps the second
 *  read proportional to the first without truncating a real worker's day. */
const WORKLOAD_METRIC_READ_LIMIT = WORKLOAD_READ_LIMIT * 8;

/**
 * The caller's OWN recorded work hours inside [rangeStart, rangeEnd], grouped
 * by the day the work HAPPENED (the entry's own `work_date` metric, falling
 * back to the created UTC day — the same rule the SQL derivation and the
 * calendar projection use).
 *
 * OWNER RULING 2026-08-18: the hours come from `journal_entry_metrics`, the
 * canonical persisted work-time source. This read previously asked
 * `journal_entry_work_items` — a table with zero lifetime inserts and no
 * writer — so the workload strip reported 0 h for every worker who had in
 * fact recorded hours. `days`-unit work is excluded here (the strip states
 * hours only; day-unit totals live on the timesheet).
 */
export async function getMyJournalWorkHours(
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

  // The caller's own LIVE entries. Deleted and superseded rows are excluded
  // here; entries replaced by a live correction are dropped below, so an
  // edited entry is counted once — never twice.
  const entriesRes = await asAny(supabase)
    .from("journal_entries")
    .select("id, created_at, original_text, correction_of")
    .eq("worker_id", workerId)
    .is("deleted_at", null)
    .is("superseded_by", null)
    .limit(WORKLOAD_READ_LIMIT);
  if (entriesRes.error) return { status: "unavailable" };

  type EntryRow = {
    id: string;
    created_at: string;
    original_text: string | null;
    correction_of: string | null;
  };
  const rows = (entriesRes.data ?? []) as EntryRow[];
  if (rows.length === 0) return { status: "ok", days: [] };
  const correctedIds = new Set(
    rows.map((r) => r.correction_of).filter((v): v is string => Boolean(v)),
  );
  const liveRows = rows.filter((r) => !correctedIds.has(r.id));
  const entryIds = liveRows.map((r) => r.id);
  if (entryIds.length === 0) return { status: "ok", days: [] };

  const metricsRes = await asAny(supabase)
    .from("journal_entry_metrics")
    .select("id, entry_id, metric_slug, value_text, value_numeric, unit_slug, source, created_at")
    .in("entry_id", entryIds)
    .limit(WORKLOAD_METRIC_READ_LIMIT);
  // A failed metric read must NOT degrade to a confident "0 hours" — that is
  // exactly the shape of the defect this function was fixed for.
  if (metricsRes.error) return { status: "unavailable" };

  type MetricRow = WorkTimeMetricRow & { entry_id: string };
  const metricsByEntry = new Map<string, WorkTimeMetricRow[]>();
  for (const m of (metricsRes.data ?? []) as MetricRow[]) {
    const list = metricsByEntry.get(m.entry_id);
    if (list) list.push(m);
    else metricsByEntry.set(m.entry_id, [m]);
  }

  const derived = liveRows.map((row) =>
    deriveEntryWorkTime({
      entryId: row.id,
      createdAt: row.created_at,
      originalText: row.original_text,
      metrics: metricsByEntry.get(row.id) ?? [],
    }),
  );

  return { status: "ok", days: workTimeHoursByDay(derived, rangeStart, rangeEnd) };
}
