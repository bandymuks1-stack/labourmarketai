"use server";

import "server-only";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import {
  LIFECYCLE_EXTRA_ITEMS_MAX,
  LIFECYCLE_ITEM_TITLE_MAX,
  LIFECYCLE_ITEM_TITLE_MIN,
  LIFECYCLE_NOTE_MAX,
  LIFECYCLE_TEMPLATE_FORM_MAX_ITEMS,
  LIFECYCLE_TEMPLATE_NAME_MAX,
  LIFECYCLE_TEMPLATE_NAME_MIN,
  isLifecycleMigrationMissingCode,
  isLifecycleNotice,
  isValidDirectLifecycleStage,
  isValidEndedReason,
  isValidOnboardingItemKind,
  isValidRunItemStatus,
  type LifecycleNotice,
} from "@/lib/lifecycle/lifecycle-model";

/**
 * Employee Lifecycle write actions (EC-canonical lifecycle v1).
 *
 * The ONLY write paths are the twelve gated SECURITY DEFINER commands the
 * human-gated migration 20260817190000_employee_lifecycle_v1 proposes:
 *
 *   create_onboarding_template_v1 / start_onboarding_run_v1 /
 *   assign_onboarding_item_v1 / set_onboarding_item_status_v1 /
 *   complete_onboarding_run_v1 / cancel_onboarding_run_v1 /
 *   start_offboarding_run_v1 / set_offboarding_item_status_v1 /
 *   complete_offboarding_run_v1 / cancel_offboarding_run_v1 /
 *   set_engagement_lifecycle_stage_v1 / end_engagement_lifecycle_v1
 *
 * All twelve re-check authorization server-side (org-managing authority via
 * the sanctioned dual-arm `manages_organization`; worker self-confirmation
 * only for the honest kinds), validate every enum and bound, verify linked
 * references against the REAL rows (work_tasks / document_acknowledgements
 * / asset_assignments) and keep merged no-oracle outcomes. Ending an
 * engagement CALLS the canonical `end_org_membership_v1` inside the RPC —
 * its authority ladder and last-owner protection stay the single truth.
 * Direct table writes are REVOKEd — these actions never insert/update/
 * delete a row themselves.
 *
 * NATIVE-NAV forms: each action redirects back to its surface with an
 * honest `?lc=` outcome — feedback is the navigation itself, the
 * established bookings/tasks/approvals pattern. While the migration is
 * unapplied the RPC is missing (42883 / PGRST202 / 42P01) and the notice
 * says so honestly — nothing pretends to have saved.
 *
 * INTERNAL ONLY: nothing here sends anything to anyone — no email, no SMS,
 * no push, no webhook, no outbound call.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(c: SupabaseClient): any {
  return c;
}

const UUID_RX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RX = /^\d{4}-\d{2}-\d{2}$/;
const LOCALE_RX = /^[a-z]{2}$/;

type FormContext = { locale: string; back: "company" | "start" };

function readContext(formData: FormData): FormContext {
  const rawLocale = String(formData.get("locale") ?? "lt");
  const back = String(formData.get("back") ?? "company");
  return {
    locale: LOCALE_RX.test(rawLocale) ? rawLocale : "lt",
    back: back === "start" ? "start" : "company",
  };
}

const SUCCESS_NOTICES: readonly LifecycleNotice[] = [
  "created",
  "started",
  "updated",
  "completed",
  "cancelled",
  "ended",
];

function finish(ctx: FormContext, notice: LifecycleNotice): never {
  if ((SUCCESS_NOTICES as readonly string[]).includes(notice)) {
    revalidatePath("/", "layout");
  }
  const page = ctx.back === "start" ? "start" : "company";
  redirect(`/${ctx.locale}/dashboard/${page}?lc=${notice}#lifecycle`);
}

function noticeForRpcError(error: { code?: string }): LifecycleNotice {
  if (isLifecycleMigrationMissingCode(error.code)) return "needs_migration";
  if (error.code === "42501") return "not_authorized";
  return "error";
}

/** Map the RPC outcome vocabulary onto the notice vocabulary; a returned
 *  run id counts as the success it announces; everything unknown is an
 *  honest "error". */
function noticeForOutcome(
  outcome: string,
  uuidMeans: LifecycleNotice,
): LifecycleNotice {
  if (UUID_RX.test(outcome)) return uuidMeans;
  if (isLifecycleNotice(outcome)) return outcome;
  return "error";
}

async function callRpc(
  fn: string,
  args: Record<string, unknown>,
  uuidMeans: LifecycleNotice,
): Promise<LifecycleNotice> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return "not_authorized";
  const { data, error } = await asAny(supabase).rpc(fn, args);
  if (error) return noticeForRpcError(error);
  return noticeForOutcome(String(data ?? ""), uuidMeans);
}

/** Create an onboarding template from the bounded authoring form
 *  (item-1..N field groups; blank rows are skipped). */
export async function createOnboardingTemplateAction(
  formData: FormData,
): Promise<void> {
  const ctx = readContext(formData);
  const orgId = String(formData.get("organizationId") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  if (!UUID_RX.test(orgId)) finish(ctx, "invalid");
  if (
    name.length < LIFECYCLE_TEMPLATE_NAME_MIN ||
    name.length > LIFECYCLE_TEMPLATE_NAME_MAX
  ) {
    finish(ctx, "invalid");
  }

  const items: Record<string, unknown>[] = [];
  for (let i = 1; i <= LIFECYCLE_TEMPLATE_FORM_MAX_ITEMS; i += 1) {
    const title = String(formData.get(`item-${i}-title`) ?? "").trim();
    if (title.length === 0) continue;
    const kind = String(formData.get(`item-${i}-kind`) ?? "custom");
    const required = String(formData.get(`item-${i}-required`) ?? "on") !== "";
    if (
      title.length < LIFECYCLE_ITEM_TITLE_MIN ||
      title.length > LIFECYCLE_ITEM_TITLE_MAX ||
      !isValidOnboardingItemKind(kind)
    ) {
      finish(ctx, "invalid");
    }
    items.push({ kind, title, required });
  }
  if (items.length === 0) finish(ctx, "invalid");

  finish(
    ctx,
    await callRpc(
      "create_onboarding_template_v1",
      {
        p_organization_id: orgId,
        p_name: name,
        p_description: null,
        p_items: items,
      },
      "created",
    ),
  );
}

export async function startOnboardingRunAction(
  formData: FormData,
): Promise<void> {
  const ctx = readContext(formData);
  const engagementId = String(formData.get("engagementId") ?? "");
  const templateId = String(formData.get("templateId") ?? "");
  if (!UUID_RX.test(engagementId) || !UUID_RX.test(templateId)) {
    finish(ctx, "invalid");
  }
  finish(
    ctx,
    await callRpc(
      "start_onboarding_run_v1",
      { p_engagement_context_id: engagementId, p_template_id: templateId },
      "started",
    ),
  );
}

/** Name (or clear) the person responsible for one onboarding item. The RPC
 *  re-checks that the target belongs to the org via either membership truth
 *  or is the run's own worker. */
export async function assignOnboardingItemAction(
  formData: FormData,
): Promise<void> {
  const ctx = readContext(formData);
  const itemId = String(formData.get("itemId") ?? "");
  const responsible = String(formData.get("responsibleProfileId") ?? "").trim();
  if (!UUID_RX.test(itemId)) finish(ctx, "invalid");
  if (responsible.length > 0 && !UUID_RX.test(responsible)) {
    finish(ctx, "invalid");
  }
  finish(
    ctx,
    await callRpc(
      "assign_onboarding_item_v1",
      {
        p_item_id: itemId,
        p_responsible_profile_id: responsible.length > 0 ? responsible : null,
      },
      "updated",
    ),
  );
}

export async function setOnboardingItemStatusAction(
  formData: FormData,
): Promise<void> {
  const ctx = readContext(formData);
  const itemId = String(formData.get("itemId") ?? "");
  const status = String(formData.get("status") ?? "");
  const note = String(formData.get("note") ?? "").trim();
  if (!UUID_RX.test(itemId) || !isValidRunItemStatus(status)) {
    finish(ctx, "invalid");
  }
  if (note.length > LIFECYCLE_NOTE_MAX) finish(ctx, "invalid");
  finish(
    ctx,
    await callRpc(
      "set_onboarding_item_status_v1",
      {
        p_item_id: itemId,
        p_status: status,
        p_note: note.length > 0 ? note : null,
        p_linked_entity_type: null,
        p_linked_entity_id: null,
      },
      "updated",
    ),
  );
}

export async function completeOnboardingRunAction(
  formData: FormData,
): Promise<void> {
  const ctx = readContext(formData);
  const runId = String(formData.get("runId") ?? "");
  if (!UUID_RX.test(runId)) finish(ctx, "invalid");
  finish(
    ctx,
    await callRpc("complete_onboarding_run_v1", { p_run_id: runId }, "completed"),
  );
}

export async function cancelOnboardingRunAction(
  formData: FormData,
): Promise<void> {
  const ctx = readContext(formData);
  const runId = String(formData.get("runId") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  if (!UUID_RX.test(runId) || reason.length > LIFECYCLE_NOTE_MAX) {
    finish(ctx, "invalid");
  }
  finish(
    ctx,
    await callRpc(
      "cancel_onboarding_run_v1",
      { p_run_id: runId, p_reason: reason.length > 0 ? reason : null },
      "cancelled",
    ),
  );
}

export async function startOffboardingRunAction(
  formData: FormData,
): Promise<void> {
  const ctx = readContext(formData);
  const engagementId = String(formData.get("engagementId") ?? "");
  if (!UUID_RX.test(engagementId)) finish(ctx, "invalid");

  // Optional bounded custom items ("one per line" textarea).
  const extraRaw = String(formData.get("extraItems") ?? "").trim();
  let extra: Record<string, unknown>[] | null = null;
  if (extraRaw.length > 0) {
    const lines = extraRaw
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length >= LIFECYCLE_ITEM_TITLE_MIN)
      .slice(0, LIFECYCLE_EXTRA_ITEMS_MAX);
    extra = lines.map((title) => ({
      kind: "custom",
      title: title.slice(0, LIFECYCLE_ITEM_TITLE_MAX),
      required: true,
    }));
    if (extra.length === 0) extra = null;
  }

  finish(
    ctx,
    await callRpc(
      "start_offboarding_run_v1",
      { p_engagement_context_id: engagementId, p_extra_items: extra },
      "started",
    ),
  );
}

export async function setOffboardingItemStatusAction(
  formData: FormData,
): Promise<void> {
  const ctx = readContext(formData);
  const itemId = String(formData.get("itemId") ?? "");
  const status = String(formData.get("status") ?? "");
  const note = String(formData.get("note") ?? "").trim();
  if (!UUID_RX.test(itemId) || !isValidRunItemStatus(status)) {
    finish(ctx, "invalid");
  }
  if (note.length > LIFECYCLE_NOTE_MAX) finish(ctx, "invalid");
  finish(
    ctx,
    await callRpc(
      "set_offboarding_item_status_v1",
      {
        p_item_id: itemId,
        p_status: status,
        p_note: note.length > 0 ? note : null,
      },
      "updated",
    ),
  );
}

export async function completeOffboardingRunAction(
  formData: FormData,
): Promise<void> {
  const ctx = readContext(formData);
  const runId = String(formData.get("runId") ?? "");
  if (!UUID_RX.test(runId)) finish(ctx, "invalid");
  finish(
    ctx,
    await callRpc(
      "complete_offboarding_run_v1",
      { p_run_id: runId },
      "completed",
    ),
  );
}

export async function cancelOffboardingRunAction(
  formData: FormData,
): Promise<void> {
  const ctx = readContext(formData);
  const runId = String(formData.get("runId") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  if (!UUID_RX.test(runId) || reason.length > LIFECYCLE_NOTE_MAX) {
    finish(ctx, "invalid");
  }
  finish(
    ctx,
    await callRpc(
      "cancel_offboarding_run_v1",
      { p_run_id: runId, p_reason: reason.length > 0 ? reason : null },
      "cancelled",
    ),
  );
}

/** Probation (stage + date only) / change_pending (stage + note only) /
 *  back to active — the binding v1 scope. */
export async function setLifecycleStageAction(
  formData: FormData,
): Promise<void> {
  const ctx = readContext(formData);
  const engagementId = String(formData.get("engagementId") ?? "");
  const stage = String(formData.get("stage") ?? "");
  const probationUntil = String(formData.get("probationUntil") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim();
  if (!UUID_RX.test(engagementId) || !isValidDirectLifecycleStage(stage)) {
    finish(ctx, "invalid");
  }
  if (stage === "probation" && !DATE_RX.test(probationUntil)) {
    finish(ctx, "invalid");
  }
  if (note.length > LIFECYCLE_NOTE_MAX) finish(ctx, "invalid");
  finish(
    ctx,
    await callRpc(
      "set_engagement_lifecycle_stage_v1",
      {
        p_engagement_context_id: engagementId,
        p_stage: stage,
        p_probation_until: stage === "probation" ? probationUntil : null,
        p_note: note.length > 0 ? note : null,
      },
      "updated",
    ),
  );
}

/** Reason/type/note capture AROUND the canonical end path — the RPC calls
 *  end_org_membership_v1 internally; nothing is forked. */
export async function endEngagementLifecycleAction(
  formData: FormData,
): Promise<void> {
  const ctx = readContext(formData);
  const engagementId = String(formData.get("engagementId") ?? "");
  const reason = String(formData.get("reason") ?? "");
  const note = String(formData.get("note") ?? "").trim();
  if (!UUID_RX.test(engagementId) || !isValidEndedReason(reason)) {
    finish(ctx, "invalid");
  }
  if (note.length > LIFECYCLE_NOTE_MAX) finish(ctx, "invalid");
  finish(
    ctx,
    await callRpc(
      "end_engagement_lifecycle_v1",
      {
        p_engagement_context_id: engagementId,
        p_reason: reason,
        p_note: note.length > 0 ? note : null,
      },
      "ended",
    ),
  );
}
