"use server";

import "server-only";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import {
  EMPLOYEE_REQUEST_DEFAULT_DEFINITION_SLUG,
  EMPLOYEE_REQUEST_DETAILS_MAX,
  EMPLOYEE_REQUEST_TITLE_MAX,
  EMPLOYEE_REQUEST_TITLE_MIN,
  employeeRequestDefinitionSlug,
  isEmployeeRequestMigrationMissingCode,
  isValidEmployeeRequestType,
  type EmployeeRequestNotice,
} from "@/lib/requests/requests-model";
import { ABSENCE_TYPES } from "@/lib/leave/absences-model";
import { findConventionalTemplateVersion } from "@/lib/requests/requests";
import { emitWorkflowStepPendingNotifications } from "@/lib/notifications/event-emitters";

/**
 * Typed employee requests — write actions (v1).
 *
 * The ONLY write paths are gated SECURITY DEFINER commands:
 *   - this module's own three (human-gated migration 20260817180000):
 *     create_employee_request_v1 / withdraw_employee_request_v1 /
 *     sync_employee_request_status_v1 (the reader calls the third);
 *   - the ENGINE's existing commands for the seed helper
 *     (create_workflow_definition_v1 + publish_workflow_version_v1 — the
 *     engine consumption contract: templates are authored through the
 *     engine's own public commands, never by touching engine tables);
 *   - set_leave_balance_policy_v1 (human-gated migration 20260817181000)
 *     for the org leave numbers.
 *
 * All of them re-check authorization server-side. These actions never
 * insert/update/delete a row themselves.
 *
 * NATIVE-NAV forms: each action redirects back to the network page with an
 * honest `?req=` outcome — feedback is the navigation itself (the
 * bookings/tasks/approvals pattern). While a migration is unapplied the RPC
 * is missing and the notice says so honestly.
 *
 * INTERNAL ONLY: nothing here sends anything to anyone — no email, no SMS,
 * no push, no webhook. Durable in-app notification events reuse the
 * EXISTING engine emitters (no new notification types anywhere), emitted
 * AFTER a successful domain write, fire-and-forget.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(c: SupabaseClient): any {
  return c;
}

const UUID_RX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LOCALE_RX = /^[a-z]{2}$/;
const DATE_RX = /^\d{4}-\d{2}-\d{2}$/;
/** 0..366 with an optional single decimal (comma tolerated). */
const DAYS_RX = /^\d{1,3}(?:[.,]\d)?$/;

type FormContext = { locale: string };

function readContext(formData: FormData): FormContext {
  const rawLocale = String(formData.get("locale") ?? "lt");
  return { locale: LOCALE_RX.test(rawLocale) ? rawLocale : "lt" };
}

const SUCCESS_NOTICES: readonly EmployeeRequestNotice[] = [
  "created",
  "withdrawn",
  "template_ready",
  "policy_saved",
];

function finish(ctx: FormContext, notice: EmployeeRequestNotice): never {
  if ((SUCCESS_NOTICES as readonly string[]).includes(notice)) {
    revalidatePath("/", "layout");
  }
  redirect(`/${ctx.locale}/dashboard/network?req=${notice}#requests`);
}

function noticeForRpcError(error: { code?: string }): EmployeeRequestNotice {
  if (isEmployeeRequestMigrationMissingCode(error.code)) {
    return "needs_migration";
  }
  if (error.code === "42501") return "not_authorized";
  return "error";
}

/** Map RPC outcome strings onto the notice vocabulary — 1:1 where the words
 *  match; everything unknown is an honest "error". */
function noticeForOutcome(outcome: string): EmployeeRequestNotice {
  switch (outcome) {
    case "withdrawn":
    case "already_pending":
    case "no_definition":
    case "no_approvers":
    case "not_published":
    case "not_pending":
    case "invalid":
    case "not_authorized":
    case "not_found":
    case "limit_reached":
      return outcome;
    default:
      return "error";
  }
}

async function requireUser(
  ctx: FormContext,
): Promise<{ supabase: SupabaseClient; userId: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) finish(ctx, "not_authorized");
  return { supabase, userId: user.id };
}

/** File a typed request through create_employee_request_v1. On success the
 *  RPC returns the STARTED ENGINE INSTANCE id (uuid shape) — the step-1
 *  approvers then durably hear a request awaits them, through the existing
 *  engine notification emitter. */
export async function createEmployeeRequestAction(
  formData: FormData,
): Promise<void> {
  const ctx = readContext(formData);
  const { supabase } = await requireUser(ctx);

  const organizationId = String(formData.get("organizationId") ?? "").trim();
  if (!UUID_RX.test(organizationId)) finish(ctx, "invalid");

  const requestType = String(formData.get("requestType") ?? "").trim();
  if (!isValidEmployeeRequestType(requestType)) finish(ctx, "invalid");

  const title = String(formData.get("title") ?? "").trim();
  if (
    title.length < EMPLOYEE_REQUEST_TITLE_MIN ||
    title.length > EMPLOYEE_REQUEST_TITLE_MAX
  ) {
    finish(ctx, "invalid");
  }
  const details = String(formData.get("details") ?? "").trim();
  if (details.length > EMPLOYEE_REQUEST_DETAILS_MAX) finish(ctx, "invalid");

  const dateFrom = String(formData.get("dateFrom") ?? "").trim();
  const dateTo = String(formData.get("dateTo") ?? "").trim();
  if (dateFrom.length > 0 && !DATE_RX.test(dateFrom)) finish(ctx, "invalid");
  if (dateTo.length > 0 && !DATE_RX.test(dateTo)) finish(ctx, "invalid");
  if (dateTo.length > 0 && dateFrom.length === 0) finish(ctx, "invalid");
  if (dateFrom.length > 0 && dateTo.length > 0 && dateTo < dateFrom) {
    finish(ctx, "invalid");
  }

  const { data, error } = await asAny(supabase).rpc(
    "create_employee_request_v1",
    {
      p_organization_id: organizationId,
      p_request_type: requestType,
      p_title: title,
      p_details: details.length > 0 ? details : null,
      p_date_from: dateFrom.length > 0 ? dateFrom : null,
      p_date_to: dateTo.length > 0 ? dateTo : null,
    },
  );
  if (error) finish(ctx, noticeForRpcError(error));

  const outcome = String(data ?? "");
  if (UUID_RX.test(outcome)) {
    // Success — outcome IS the engine instance id; reuse the engine's
    // existing durable notification (no new notification types).
    await emitWorkflowStepPendingNotifications(outcome);
    finish(ctx, "created");
  }
  finish(ctx, noticeForOutcome(outcome));
}

/** Withdraw an own pending request through withdraw_employee_request_v1
 *  (engine withdraw + mirror update in one transaction). */
export async function withdrawEmployeeRequestAction(
  formData: FormData,
): Promise<void> {
  const ctx = readContext(formData);
  const { supabase } = await requireUser(ctx);

  const requestId = String(formData.get("requestId") ?? "").trim();
  if (!UUID_RX.test(requestId)) finish(ctx, "invalid");

  const { data, error } = await asAny(supabase).rpc(
    "withdraw_employee_request_v1",
    { p_request_id: requestId, p_reason: null },
  );
  if (error) finish(ctx, noticeForRpcError(error));
  finish(ctx, noticeForOutcome(String(data ?? "")));
}

/**
 * Seed helper: "create standard request approval template" — an org
 * owner/admin mints the conventional default definition (single step,
 * org_role owner/admin) for all request types or for ONE type, THROUGH THE
 * EXISTING ENGINE COMMANDS (create + publish). Idempotent-honest: an
 * existing unpublished conventional template is published; an existing
 * published one answers template_ready without a second write.
 */
export async function seedRequestTemplateAction(
  formData: FormData,
): Promise<void> {
  const ctx = readContext(formData);
  const { supabase } = await requireUser(ctx);

  const organizationId = String(formData.get("organizationId") ?? "").trim();
  if (!UUID_RX.test(organizationId)) finish(ctx, "invalid");

  const targetType = String(formData.get("targetType") ?? "").trim();
  if (targetType.length > 0 && !isValidEmployeeRequestType(targetType)) {
    finish(ctx, "invalid");
  }
  const slug =
    targetType.length > 0 && isValidEmployeeRequestType(targetType)
      ? employeeRequestDefinitionSlug(targetType)
      : EMPLOYEE_REQUEST_DEFAULT_DEFINITION_SLUG;

  const name = String(formData.get("name") ?? "").trim();
  if (name.length < 3 || name.length > 120) finish(ctx, "invalid");

  const createRes = await asAny(supabase).rpc(
    "create_workflow_definition_v1",
    {
      p_organization_id: organizationId,
      p_name: name,
      p_slug: slug,
      p_context_entity_type: "generic_request",
      p_steps: [
        {
          name,
          approval_mode: "single",
          approver_rule: { kind: "org_role", roles: ["owner", "admin"] },
        },
      ],
    },
  );
  if (createRes.error) finish(ctx, noticeForRpcError(createRes.error));
  const created = String(createRes.data ?? "");
  if (created !== "created" && created !== "already_exists") {
    finish(ctx, noticeForOutcome(created));
  }

  // Publish the latest version of the conventional template (RLS-scoped
  // lookup via the read service; the engine's publish command re-checks
  // authority server-side).
  const version = await findConventionalTemplateVersion(organizationId, slug);
  if (!version) finish(ctx, "error");

  if (!version.published) {
    const pubRes = await asAny(supabase).rpc("publish_workflow_version_v1", {
      p_version_id: version.versionId,
    });
    if (pubRes.error) finish(ctx, noticeForRpcError(pubRes.error));
    const published = String(pubRes.data ?? "");
    if (published !== "published" && published !== "already_published") {
      finish(ctx, noticeForOutcome(published));
    }
  }
  finish(ctx, "template_ready");
}

/** Configure one org leave number through set_leave_balance_policy_v1
 *  (org owner/admin; upsert on org×type; advisory numbers, never law). */
export async function setLeaveBalancePolicyAction(
  formData: FormData,
): Promise<void> {
  const ctx = readContext(formData);
  const { supabase } = await requireUser(ctx);

  const organizationId = String(formData.get("organizationId") ?? "").trim();
  if (!UUID_RX.test(organizationId)) finish(ctx, "invalid");

  const absenceType = String(formData.get("absenceType") ?? "").trim();
  if (!(ABSENCE_TYPES as readonly string[]).includes(absenceType)) {
    finish(ctx, "invalid");
  }

  const entitlementRaw = String(
    formData.get("entitlementDays") ?? "",
  ).trim();
  if (!DAYS_RX.test(entitlementRaw)) finish(ctx, "invalid");
  const entitlementDays = Number(entitlementRaw.replace(",", "."));
  if (!Number.isFinite(entitlementDays) || entitlementDays > 366) {
    finish(ctx, "invalid");
  }

  const carryoverRaw = String(formData.get("carryoverDays") ?? "0").trim();
  const carryoverNormalized = carryoverRaw.length === 0 ? "0" : carryoverRaw;
  if (!DAYS_RX.test(carryoverNormalized)) finish(ctx, "invalid");
  const carryoverDays = Number(carryoverNormalized.replace(",", "."));
  if (!Number.isFinite(carryoverDays) || carryoverDays > 366) {
    finish(ctx, "invalid");
  }

  // Checkbox semantics: present ("true") when checked, absent when not.
  const isActive = String(formData.get("isActive") ?? "") === "true";

  const { data, error } = await asAny(supabase).rpc(
    "set_leave_balance_policy_v1",
    {
      p_organization_id: organizationId,
      p_absence_type: absenceType,
      p_annual_entitlement_days: entitlementDays,
      p_carryover_days: carryoverDays,
      p_is_active: isActive,
    },
  );
  if (error) finish(ctx, noticeForRpcError(error));
  const outcome = String(data ?? "");
  if (outcome === "saved") finish(ctx, "policy_saved");
  finish(ctx, noticeForOutcome(outcome));
}
