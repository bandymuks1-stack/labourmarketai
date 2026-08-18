"use server";

import "server-only";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import {
  TRIP_DESTINATION_MAX,
  TRIP_DESTINATION_MIN,
  TRIP_PURPOSE_MAX,
  TRIP_PURPOSE_MIN,
  isTripMigrationMissingCode,
  tripNoticeForOutcome,
  tripSpanDays,
  type TripNotice,
} from "@/lib/trips/trips-model";
import { parseAmountInputToCents } from "@/lib/finance/finance-model";
import { emitWorkflowStepPendingNotifications } from "@/lib/notifications/event-emitters";

/**
 * Business-trip write actions (functional completion train V2).
 *
 * The ONLY trip write paths are the seven gated SECURITY DEFINER commands
 * the human-gated migration 20260817222000_business_trips_v1 proposes:
 *   create_business_trip_v1 / update_business_trip_v1 /
 *   submit_business_trip_v1 / sync_business_trip_decision_v1 /
 *   complete_business_trip_v1 / cancel_business_trip_v1 /
 *   set_finance_record_trip_v1
 * All re-check authorization server-side; direct table writes are REVOKEd —
 * these actions never insert/update/delete a row themselves.
 *
 * ENGINE INTEGRATION, NOT RE-IMPLEMENTATION: submitting starts an approval
 * instance through the EXISTING Workflow & Approval Engine's own
 * `start_workflow_instance_v1` (context_entity_type='business_trip',
 * context_entity_id = trip id). Decisions happen in the engine's approvals
 * UI; `sync_business_trip_decision_v1` only copies the terminal outcome
 * back. If the org has NO published business-trip template, submit degrades
 * honestly (`no_template`) and org admins are offered a one-click standard
 * template (created + published through the engine's own commands — again,
 * nothing re-implemented).
 *
 * NATIVE-NAV forms: each action redirects back to the finance page's trips
 * section with an honest `?trip=` outcome. While a migration is unapplied
 * the RPC is missing and the notice says so honestly.
 *
 * INTERNAL ONLY: nothing here books travel, pays an advance or contacts
 * anyone — no email, no SMS, no webhook, no outbound call of any kind.
 * Durable in-app notifications ride the EXISTING engine types.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(c: SupabaseClient): any {
  return c;
}

const UUID_RX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LOCALE_RX = /^[a-z]{2}$/;

type FormContext = { locale: string };

function readContext(formData: FormData): FormContext {
  const rawLocale = String(formData.get("locale") ?? "lt");
  return { locale: LOCALE_RX.test(rawLocale) ? rawLocale : "lt" };
}

const SUCCESS_NOTICES: readonly TripNotice[] = [
  "created",
  "updated",
  "submitted",
  "approved",
  "rejected",
  "reopened",
  "completed",
  "cancelled",
  "linked",
  "unlinked",
  "template_created",
];

function finish(ctx: FormContext, notice: TripNotice): never {
  if ((SUCCESS_NOTICES as readonly string[]).includes(notice)) {
    revalidatePath("/", "layout");
  }
  redirect(`/${ctx.locale}/dashboard/finance?trip=${notice}#trips`);
}

function noticeForRpcError(error: { code?: string }): TripNotice {
  if (isTripMigrationMissingCode(error.code)) return "needs_migration";
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

/** Shared bounded-field validation for create + update forms. */
function readTripFields(formData: FormData): {
  destination: string;
  dateFrom: string;
  dateTo: string;
  purpose: string;
  advanceCents: string;
} | null {
  const destination = String(formData.get("destination") ?? "").trim();
  if (
    destination.length < TRIP_DESTINATION_MIN ||
    destination.length > TRIP_DESTINATION_MAX
  ) {
    return null;
  }
  const dateFrom = String(formData.get("dateFrom") ?? "").trim();
  const dateTo = String(formData.get("dateTo") ?? "").trim();
  if (tripSpanDays(dateFrom, dateTo) === null) return null;
  const purpose = String(formData.get("purpose") ?? "").trim();
  if (purpose.length < TRIP_PURPOSE_MIN || purpose.length > TRIP_PURPOSE_MAX) {
    return null;
  }
  const advanceInput = String(formData.get("advanceAmount") ?? "").trim();
  let advanceCents = "";
  if (advanceInput) {
    const parsed = parseAmountInputToCents(advanceInput);
    if (parsed === null) return null;
    advanceCents = String(parsed);
  }
  return { destination, dateFrom, dateTo, purpose, advanceCents };
}

/** File a trip request through create_business_trip_v1. */
export async function createTripAction(formData: FormData): Promise<void> {
  const ctx = readContext(formData);
  const { supabase } = await requireUser(ctx);

  const organizationId = String(formData.get("organizationId") ?? "").trim();
  if (!UUID_RX.test(organizationId)) finish(ctx, "invalid");
  const fields = readTripFields(formData);
  if (!fields) finish(ctx, "invalid");
  const projectId = String(formData.get("projectId") ?? "").trim();
  if (projectId && !UUID_RX.test(projectId)) finish(ctx, "invalid");

  const { data, error } = await asAny(supabase).rpc("create_business_trip_v1", {
    p_organization_id: organizationId,
    p_destination: fields.destination,
    p_date_from: fields.dateFrom,
    p_date_to: fields.dateTo,
    p_purpose: fields.purpose,
    p_project_id: projectId,
    p_advance_amount_cents: fields.advanceCents,
  });
  if (error) finish(ctx, noticeForRpcError(error));
  const outcome = String(data ?? "");
  finish(ctx, UUID_RX.test(outcome) ? "created" : tripNoticeForOutcome(outcome));
}

/** Edit the traveler's own DRAFT through update_business_trip_v1. */
export async function updateTripAction(formData: FormData): Promise<void> {
  const ctx = readContext(formData);
  const { supabase } = await requireUser(ctx);

  const tripId = String(formData.get("tripId") ?? "").trim();
  if (!UUID_RX.test(tripId)) finish(ctx, "invalid");
  const fields = readTripFields(formData);
  if (!fields) finish(ctx, "invalid");

  const { data, error } = await asAny(supabase).rpc("update_business_trip_v1", {
    p_trip_id: tripId,
    p_destination: fields.destination,
    p_date_from: fields.dateFrom,
    p_date_to: fields.dateTo,
    p_purpose: fields.purpose,
    p_advance_amount_cents: fields.advanceCents,
  });
  if (error) finish(ctx, noticeForRpcError(error));
  finish(ctx, tripNoticeForOutcome(String(data ?? "")));
}

/**
 * Submit: start the approval instance through the ENGINE's own start RPC
 * first, then flip the trip through submit_business_trip_v1. If the flip
 * fails after the instance started, the instance is withdrawn again
 * (compensation). If the org has no PUBLISHED business-trip template the
 * action stops honestly BEFORE any write.
 */
export async function submitTripAction(formData: FormData): Promise<void> {
  const ctx = readContext(formData);
  const { supabase } = await requireUser(ctx);

  const tripId = String(formData.get("tripId") ?? "").trim();
  if (!UUID_RX.test(tripId)) finish(ctx, "invalid");

  // The trip (RLS-scoped read; the RPCs re-check everything anyway).
  const tripRes = await asAny(supabase)
    .from("business_trips")
    .select("id, organization_id, destination, date_from, date_to, status")
    .eq("id", tripId)
    .maybeSingle();
  if (tripRes.error) {
    finish(
      ctx,
      isTripMigrationMissingCode(tripRes.error.code)
        ? "needs_migration"
        : "error",
    );
  }
  if (!tripRes.data) finish(ctx, "not_found");
  const trip = tripRes.data as {
    organization_id: string;
    destination: string;
    date_from: string;
    date_to: string;
  };

  // The org's ACTIVE business-trip template with a PUBLISHED version —
  // the honest-degradation seam. No template → no submit, clearly said.
  const defRes = await asAny(supabase)
    .from("workflow_definitions")
    .select("id, workflow_definition_versions(id, published_at)")
    .eq("organization_id", trip.organization_id)
    .eq("context_entity_type", "business_trip")
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(5);
  if (defRes.error) {
    finish(
      ctx,
      isTripMigrationMissingCode(defRes.error.code)
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
  const published = ((defRes.data ?? []) as DefRow[]).find((d) =>
    (d.workflow_definition_versions ?? []).some((v) => v.published_at !== null),
  );
  if (!published) finish(ctx, "no_template");

  const from = String(trip.date_from ?? "").slice(0, 10);
  const to = String(trip.date_to ?? "").slice(0, 10);
  const title = `Trip ${trip.destination}`.slice(0, 160);

  // 1. Start the approval instance THROUGH THE ENGINE (idempotent on the
  //    context entity).
  const startRes = await asAny(supabase).rpc("start_workflow_instance_v1", {
    p_definition_id: published!.id,
    p_title: title.length >= 3 ? title : `Trip ${tripId.slice(0, 8)}`,
    p_payload: { tripId, dateFrom: from, dateTo: to },
    p_context_entity_id: tripId,
  });
  if (startRes.error) finish(ctx, noticeForRpcError(startRes.error));
  const startOutcome = String(startRes.data ?? "");
  const instanceId = UUID_RX.test(startOutcome) ? startOutcome : null;
  if (!instanceId && startOutcome !== "already_pending") {
    if (startOutcome === "no_approvers") finish(ctx, "no_approvers");
    if (startOutcome === "not_published") finish(ctx, "no_template");
    finish(ctx, tripNoticeForOutcome(startOutcome));
  }

  // 2. Flip the trip to submitted.
  const submitRes = await asAny(supabase).rpc("submit_business_trip_v1", {
    p_trip_id: tripId,
  });
  const submitOutcome = submitRes.error ? null : String(submitRes.data ?? "");
  if (submitOutcome !== "submitted" && submitOutcome !== "already_submitted") {
    // Compensation: withdraw the instance this call just started so no
    // orphaned approval request lingers.
    if (instanceId) {
      await asAny(supabase)
        .rpc("withdraw_workflow_instance_v1", {
          p_instance_id: instanceId,
          p_reason: "trip submit failed",
        })
        .catch(() => undefined);
    }
    if (submitRes.error) finish(ctx, noticeForRpcError(submitRes.error));
    finish(ctx, tripNoticeForOutcome(String(submitOutcome ?? "error")));
  }

  // 3. The step-1 approvers durably hear a request awaits them (EXISTING
  //    engine notification type; fire-and-forget).
  if (instanceId) {
    await emitWorkflowStepPendingNotifications(instanceId);
  }
  finish(ctx, "submitted");
}

/** Copy the engine's terminal outcome onto a submitted trip (the RPC never
 *  decides anything — see the migration header). */
export async function syncTripDecisionAction(
  formData: FormData,
): Promise<void> {
  const ctx = readContext(formData);
  const { supabase } = await requireUser(ctx);

  const tripId = String(formData.get("tripId") ?? "").trim();
  if (!UUID_RX.test(tripId)) finish(ctx, "invalid");

  const { data, error } = await asAny(supabase).rpc(
    "sync_business_trip_decision_v1",
    { p_trip_id: tripId },
  );
  if (error) finish(ctx, noticeForRpcError(error));
  finish(ctx, tripNoticeForOutcome(String(data ?? "")));
}

/** Mark an approved trip completed (traveler or org manager). */
export async function completeTripAction(formData: FormData): Promise<void> {
  const ctx = readContext(formData);
  const { supabase } = await requireUser(ctx);

  const tripId = String(formData.get("tripId") ?? "").trim();
  if (!UUID_RX.test(tripId)) finish(ctx, "invalid");

  const { data, error } = await asAny(supabase).rpc(
    "complete_business_trip_v1",
    { p_trip_id: tripId },
  );
  if (error) finish(ctx, noticeForRpcError(error));
  finish(ctx, tripNoticeForOutcome(String(data ?? "")));
}

/**
 * Cancel a live trip. A pending engine instance is withdrawn FIRST through
 * the engine's own withdraw RPC (only the requester's own instance can be
 * withdrawn there; a manager cancelling leaves the instance to the engine's
 * own cancel authority) — the trip RPC itself never touches engine rows.
 */
export async function cancelTripAction(formData: FormData): Promise<void> {
  const ctx = readContext(formData);
  const { supabase } = await requireUser(ctx);

  const tripId = String(formData.get("tripId") ?? "").trim();
  if (!UUID_RX.test(tripId)) finish(ctx, "invalid");

  // Best-effort: withdraw a pending engine instance for this trip (the
  // engine re-checks that the caller is the requester; failures are fine —
  // the engine instance then ends through the engine's own paths).
  const wfRes = await asAny(supabase)
    .from("workflow_instances")
    .select("id, status")
    .eq("context_entity_type", "business_trip")
    .eq("context_entity_id", tripId)
    .eq("status", "pending")
    .limit(1)
    .maybeSingle();
  if (!wfRes.error && wfRes.data) {
    await asAny(supabase)
      .rpc("withdraw_workflow_instance_v1", {
        p_instance_id: String((wfRes.data as { id: string }).id),
        p_reason: "trip cancelled",
      })
      .catch(() => undefined);
  }

  const { data, error } = await asAny(supabase).rpc(
    "cancel_business_trip_v1",
    { p_trip_id: tripId },
  );
  if (error) finish(ctx, noticeForRpcError(error));
  finish(ctx, tripNoticeForOutcome(String(data ?? "")));
}

/** Link/unlink a finance record to a trip through set_finance_record_trip_v1
 *  (the ONLY writer of finance_records.trip_id). */
export async function setFinanceRecordTripAction(
  formData: FormData,
): Promise<void> {
  const ctx = readContext(formData);
  const { supabase } = await requireUser(ctx);

  const recordId = String(formData.get("recordId") ?? "").trim();
  if (!UUID_RX.test(recordId)) finish(ctx, "invalid");
  // Empty = unlink (the RPC treats blank as null).
  const tripId = String(formData.get("tripId") ?? "").trim();
  if (tripId && !UUID_RX.test(tripId)) finish(ctx, "invalid");

  const { data, error } = await asAny(supabase).rpc(
    "set_finance_record_trip_v1",
    {
      p_record_id: recordId,
      p_trip_id: tripId,
    },
  );
  if (error) finish(ctx, noticeForRpcError(error));
  finish(ctx, tripNoticeForOutcome(String(data ?? "")));
}

/**
 * One-click STANDARD approval template for org admins whose org has none:
 * a single 'single'-mode step decided by the org's owners/admins — created
 * and published through the ENGINE's own commands (create + publish); the
 * engine re-checks governance authority server-side. (The timesheets
 * pattern, context 'business_trip'.)
 */
export async function createStandardTripTemplateAction(
  formData: FormData,
): Promise<void> {
  const ctx = readContext(formData);
  const { supabase } = await requireUser(ctx);

  const organizationId = String(formData.get("organizationId") ?? "").trim();
  if (!UUID_RX.test(organizationId)) finish(ctx, "invalid");

  const SLUG = "business_trip_approval_standard";
  const createRes = await asAny(supabase).rpc("create_workflow_definition_v1", {
    p_organization_id: organizationId,
    p_name: "Business trip approval",
    p_slug: SLUG,
    p_context_entity_type: "business_trip",
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
    finish(ctx, tripNoticeForOutcome(createOutcome));
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
  const versions = ((defRes.data as {
    workflow_definition_versions: VerRow[] | null;
  }).workflow_definition_versions ?? []) as VerRow[];
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
