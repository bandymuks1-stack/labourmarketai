"use server";

import "server-only";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import {
  TIMESHEET_REOPEN_NOTE_MAX,
  TIMESHEET_REOPEN_NOTE_MIN,
  isTimesheetMigrationMissingCode,
  timesheetNoticeForOutcome,
  timesheetPeriodDays,
  type TimesheetNotice,
} from "@/lib/timesheets/timesheets-model";
import { emitWorkflowStepPendingNotifications } from "@/lib/notifications/event-emitters";

/**
 * Timesheet write actions (functional completion train V2).
 *
 * The ONLY timesheet write paths are the five gated SECURITY DEFINER
 * commands the human-gated migration 20260817170000_timesheets_v1 proposes:
 *   create_timesheet_v1 / refresh_timesheet_lines_v1 / submit_timesheet_v1 /
 *   reopen_timesheet_v1 / sync_timesheet_decision_v1
 * All five re-check authorization server-side; direct table writes are
 * REVOKEd — these actions never insert/update/delete a row themselves.
 *
 * ENGINE INTEGRATION, NOT RE-IMPLEMENTATION: submitting starts an approval
 * instance through the EXISTING Workflow & Approval Engine's own
 * `start_workflow_instance_v1` (context_entity_type='timesheet',
 * context_entity_id = timesheet id). Decisions happen in the engine's
 * approvals UI; `sync_timesheet_decision_v1` only copies the terminal
 * outcome back. If the org has NO published timesheet template, submit
 * degrades honestly (`?ts=no_template`) and org admins are offered a
 * one-click standard template (create + publish through the engine's own
 * commands — again, nothing re-implemented).
 *
 * NATIVE-NAV forms: each action redirects back to the planning page with an
 * honest `?ts=` outcome — feedback is the navigation itself (the established
 * bookings/tasks/approvals pattern). While a migration is unapplied the RPC
 * is missing (42883 / PGRST202 / 42P01) and the notice says so honestly.
 *
 * INTERNAL ONLY: nothing here sends anything to anyone — no email, no SMS,
 * no push, no webhook. Durable in-app notification events ride the EXISTING
 * engine types (workflow_step_pending), emitted AFTER a successful submit,
 * fire-and-forget. No new notification types are introduced.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(c: SupabaseClient): any {
  return c;
}

const UUID_RX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LOCALE_RX = /^[a-z]{2}$/;
const DAY_RX = /^\d{4}-\d{2}-\d{2}$/;

type FormContext = { locale: string };

function readContext(formData: FormData): FormContext {
  const rawLocale = String(formData.get("locale") ?? "lt");
  return { locale: LOCALE_RX.test(rawLocale) ? rawLocale : "lt" };
}

const SUCCESS_NOTICES: readonly TimesheetNotice[] = [
  "created",
  "refreshed",
  "submitted",
  "reopened",
  "approved",
  "rejected",
  "template_created",
];

function finish(ctx: FormContext, notice: TimesheetNotice): never {
  if ((SUCCESS_NOTICES as readonly string[]).includes(notice)) {
    revalidatePath("/", "layout");
  }
  redirect(`/${ctx.locale}/dashboard/planning?ts=${notice}#timesheets`);
}

function noticeForRpcError(error: { code?: string }): TimesheetNotice {
  if (isTimesheetMigrationMissingCode(error.code)) return "needs_migration";
  if (error.code === "42501") return "not_authorized";
  return "error";
}

async function requireUser(
  ctx: FormContext,
): Promise<{ supabase: SupabaseClient }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) finish(ctx, "not_authorized");
  return { supabase };
}

/** Open a period document through create_timesheet_v1 (the RPC re-checks
 *  the org boundary, the 31-day bound and the no-overlap rule). */
export async function createTimesheetAction(formData: FormData): Promise<void> {
  const ctx = readContext(formData);
  const { supabase } = await requireUser(ctx);

  const organizationId = String(formData.get("organizationId") ?? "").trim();
  if (!UUID_RX.test(organizationId)) finish(ctx, "invalid");
  const periodStart = String(formData.get("periodStart") ?? "").trim();
  const periodEnd = String(formData.get("periodEnd") ?? "").trim();
  if (timesheetPeriodDays(periodStart, periodEnd) === null) {
    finish(ctx, "invalid_period");
  }

  const { data, error } = await asAny(supabase).rpc("create_timesheet_v1", {
    p_organization_id: organizationId,
    p_period_start: periodStart,
    p_period_end: periodEnd,
  });
  if (error) finish(ctx, noticeForRpcError(error));
  const outcome = String(data ?? "");
  finish(ctx, UUID_RX.test(outcome) ? "created" : timesheetNoticeForOutcome(outcome));
}

/** Recompute a draft/reopened snapshot from the live journal. */
export async function refreshTimesheetAction(formData: FormData): Promise<void> {
  const ctx = readContext(formData);
  const { supabase } = await requireUser(ctx);

  const timesheetId = String(formData.get("timesheetId") ?? "").trim();
  if (!UUID_RX.test(timesheetId)) finish(ctx, "invalid");

  const { data, error } = await asAny(supabase).rpc(
    "refresh_timesheet_lines_v1",
    { p_timesheet_id: timesheetId },
  );
  if (error) finish(ctx, noticeForRpcError(error));
  finish(ctx, timesheetNoticeForOutcome(String(data ?? "")));
}

/**
 * Submit: start the approval instance through the ENGINE's own start RPC
 * first, then freeze the document through submit_timesheet_v1. If the freeze
 * fails after the instance started, the instance is withdrawn again
 * (compensation) so no orphaned approval request lingers. If the org has no
 * PUBLISHED timesheet template the action stops honestly BEFORE any write.
 */
export async function submitTimesheetAction(formData: FormData): Promise<void> {
  const ctx = readContext(formData);
  const { supabase } = await requireUser(ctx);

  const timesheetId = String(formData.get("timesheetId") ?? "").trim();
  if (!UUID_RX.test(timesheetId)) finish(ctx, "invalid");

  // The document (RLS-scoped read — own rows only reach the submit button,
  // and the RPCs re-check everything anyway).
  const sheetRes = await asAny(supabase)
    .from("timesheets")
    .select("id, organization_id, period_start, period_end, status")
    .eq("id", timesheetId)
    .maybeSingle();
  if (sheetRes.error) {
    finish(
      ctx,
      isTimesheetMigrationMissingCode(sheetRes.error.code)
        ? "needs_migration"
        : "error",
    );
  }
  if (!sheetRes.data) finish(ctx, "not_found");
  const sheet = sheetRes.data as {
    organization_id: string;
    period_start: string;
    period_end: string;
  };

  // The org's ACTIVE timesheet template with a PUBLISHED version — the
  // honest-degradation seam. No template → no submit, clearly said.
  const defRes = await asAny(supabase)
    .from("workflow_definitions")
    .select("id, workflow_definition_versions(id, published_at)")
    .eq("organization_id", sheet.organization_id)
    .eq("context_entity_type", "timesheet")
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(5);
  if (defRes.error) {
    finish(
      ctx,
      isTimesheetMigrationMissingCode(defRes.error.code)
        ? "needs_migration"
        : "error",
    );
  }
  type DefRow = {
    id: string;
    workflow_definition_versions:
      | { id: string; published_at: string | null }[]
      | null;
  };
  const defs = (defRes.data ?? []) as DefRow[];
  const published = defs.find((d) =>
    (d.workflow_definition_versions ?? []).some((v) => v.published_at !== null),
  );
  if (!published) finish(ctx, "no_template");

  const start = String(sheet.period_start ?? "").slice(0, 10);
  const end = String(sheet.period_end ?? "").slice(0, 10);
  const title = `Timesheet ${DAY_RX.test(start) ? start : "?"} – ${DAY_RX.test(end) ? end : "?"}`;

  // 1. Start the approval instance THROUGH THE ENGINE (idempotent on the
  //    context entity: a lingering pending instance answers already_pending
  //    and the submit below simply proceeds against it).
  const startRes = await asAny(supabase).rpc("start_workflow_instance_v1", {
    p_definition_id: published!.id,
    p_title: title,
    p_payload: { periodStart: start, periodEnd: end },
    p_context_entity_id: timesheetId,
  });
  if (startRes.error) finish(ctx, noticeForRpcError(startRes.error));
  const startOutcome = String(startRes.data ?? "");
  const instanceId = UUID_RX.test(startOutcome) ? startOutcome : null;
  if (!instanceId && startOutcome !== "already_pending") {
    if (startOutcome === "no_approvers") finish(ctx, "no_approvers");
    if (startOutcome === "not_published") finish(ctx, "not_published");
    finish(ctx, timesheetNoticeForOutcome(startOutcome));
  }

  // 2. Freeze the document.
  const submitRes = await asAny(supabase).rpc("submit_timesheet_v1", {
    p_timesheet_id: timesheetId,
  });
  const submitOutcome = submitRes.error
    ? null
    : String(submitRes.data ?? "");
  if (submitOutcome !== "submitted" && submitOutcome !== "already_submitted") {
    // Compensation: the freeze failed — withdraw the instance this call
    // just started so no orphaned approval request lingers. (A pre-existing
    // already_pending instance is left alone: it belongs to a prior submit.)
    if (instanceId) {
      await asAny(supabase)
        .rpc("withdraw_workflow_instance_v1", {
          p_instance_id: instanceId,
          p_reason: "timesheet submit failed",
        })
        .catch(() => undefined);
    }
    if (submitRes.error) finish(ctx, noticeForRpcError(submitRes.error));
    finish(ctx, timesheetNoticeForOutcome(String(submitOutcome ?? "error")));
  }

  // 3. The step-1 approvers durably hear a request awaits them (EXISTING
  //    engine notification type; fire-and-forget).
  if (instanceId) {
    await emitWorkflowStepPendingNotifications(instanceId);
  }
  finish(ctx, "submitted");
}

/** Send a DECIDED document back to the worker (org managers; note required). */
export async function reopenTimesheetAction(formData: FormData): Promise<void> {
  const ctx = readContext(formData);
  const { supabase } = await requireUser(ctx);

  const timesheetId = String(formData.get("timesheetId") ?? "").trim();
  if (!UUID_RX.test(timesheetId)) finish(ctx, "invalid");
  const note = String(formData.get("note") ?? "").trim();
  if (
    note.length < TIMESHEET_REOPEN_NOTE_MIN ||
    note.length > TIMESHEET_REOPEN_NOTE_MAX
  ) {
    finish(ctx, "invalid");
  }

  const { data, error } = await asAny(supabase).rpc("reopen_timesheet_v1", {
    p_timesheet_id: timesheetId,
    p_note: note,
  });
  if (error) finish(ctx, noticeForRpcError(error));
  finish(ctx, timesheetNoticeForOutcome(String(data ?? "")));
}

/** Copy the engine's terminal outcome onto a submitted document (the RPC
 *  never decides anything — see the migration header). */
export async function syncTimesheetDecisionAction(
  formData: FormData,
): Promise<void> {
  const ctx = readContext(formData);
  const { supabase } = await requireUser(ctx);

  const timesheetId = String(formData.get("timesheetId") ?? "").trim();
  if (!UUID_RX.test(timesheetId)) finish(ctx, "invalid");

  const { data, error } = await asAny(supabase).rpc(
    "sync_timesheet_decision_v1",
    { p_timesheet_id: timesheetId },
  );
  if (error) finish(ctx, noticeForRpcError(error));
  finish(ctx, timesheetNoticeForOutcome(String(data ?? "")));
}

/**
 * One-click STANDARD approval template for org admins whose org has none:
 * a single 'single'-mode step decided by the org's owners/admins — created
 * and published through the ENGINE's own commands (create + publish); the
 * engine re-checks governance authority server-side.
 */
export async function createStandardTimesheetTemplateAction(
  formData: FormData,
): Promise<void> {
  const ctx = readContext(formData);
  const { supabase } = await requireUser(ctx);

  const organizationId = String(formData.get("organizationId") ?? "").trim();
  if (!UUID_RX.test(organizationId)) finish(ctx, "invalid");

  const SLUG = "timesheet_approval_standard";
  const createRes = await asAny(supabase).rpc("create_workflow_definition_v1", {
    p_organization_id: organizationId,
    p_name: "Timesheet approval",
    p_slug: SLUG,
    p_context_entity_type: "timesheet",
    p_steps: [
      {
        name: "Approval",
        approval_mode: "single",
        approver_rule: { kind: "org_role", roles: ["owner", "admin"] },
      },
    ],
  });
  if (createRes.error) finish(ctx, noticeForRpcError(createRes.error));
  const createOutcome = String(createRes.data ?? "");
  if (createOutcome !== "created" && createOutcome !== "already_exists") {
    if (createOutcome === "not_authorized") finish(ctx, "not_authorized");
    finish(ctx, timesheetNoticeForOutcome(createOutcome));
  }

  // Read the version back (RLS: active org members) and publish it.
  const defRes = await asAny(supabase)
    .from("workflow_definitions")
    .select("id, workflow_definition_versions(id, version, published_at)")
    .eq("organization_id", organizationId)
    .eq("slug", SLUG)
    .maybeSingle();
  if (defRes.error || !defRes.data) finish(ctx, "error");
  type VerRow = { id: string; version: number; published_at: string | null };
  const versions = ((defRes.data as { workflow_definition_versions: VerRow[] | null })
    .workflow_definition_versions ?? []) as VerRow[];
  const latest = [...versions].sort((a, b) => b.version - a.version)[0];
  if (!latest) finish(ctx, "error");
  if (latest!.published_at === null) {
    const pubRes = await asAny(supabase).rpc("publish_workflow_version_v1", {
      p_version_id: latest!.id,
    });
    if (pubRes.error) finish(ctx, noticeForRpcError(pubRes.error));
    const pubOutcome = String(pubRes.data ?? "");
    if (pubOutcome !== "published" && pubOutcome !== "already_published") {
      finish(ctx, "error");
    }
  }
  finish(ctx, "template_created");
}
