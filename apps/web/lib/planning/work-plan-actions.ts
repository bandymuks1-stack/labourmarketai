"use server";

import "server-only";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  validateWorkPlanInput,
  type WorkPlanOutcome,
} from "@/lib/planning/work-plan-model";
import { createClient } from "@/lib/supabase/server";

/**
 * Work plan — the two writes (FINAL COMPLETION Train F1). Both go through
 * SECURITY DEFINER RPCs that re-check `manages_organization` and that the
 * worker is on the organization's roster; direct table writes are revoked.
 * Outcomes travel back as the bounded `?plan=` vocabulary defined in the
 * pure model (WORK_PLAN_OUTCOMES), never raw errors.
 */

function back(locale: string, outcome: WorkPlanOutcome): never {
  redirect(`/${locale}/dashboard/company/planning?plan=${outcome}#work-plan`);
}

function classify(message: string, code?: string): WorkPlanOutcome {
  if (code === "42P01" || code === "PGRST202" || code === "PGRST205") return "unavailable";
  if (/worker_not_in_scope/.test(message)) return "worker_not_in_scope";
  if (/project_not_in_organization/.test(message)) return "project_not_in_organization";
  if (/work_object_not_in_organization/.test(message)) return "work_object_not_in_organization";
  if (/not_allowed|not_authenticated/.test(message) || code === "42501") return "not_allowed";
  return "error";
}

export async function createWorkPlanEntryAction(formData: FormData): Promise<void> {
  const locale = String(formData.get("locale") ?? "lt").slice(0, 5);
  const v = validateWorkPlanInput({
    organizationId: formData.get("organization_id"),
    workerId: formData.get("worker_id"),
    startDate: formData.get("start_date"),
    endDate: formData.get("end_date"),
    projectId: formData.get("project_id"),
    workObjectId: formData.get("work_object_id"),
    startTime: formData.get("start_time"),
    endTime: formData.get("end_time"),
    note: formData.get("note"),
  });
  if (!v.ok) back(locale, "invalid");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale}/auth/login?next=${encodeURIComponent(`/${locale}/dashboard/company/planning`)}`);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any).rpc("create_work_plan_entry_v1", {
    p_organization_id: v.value.organizationId,
    p_worker_id: v.value.workerId,
    p_start_date: v.value.startDate,
    p_end_date: v.value.endDate,
    p_project_id: v.value.projectId,
    p_work_object_id: v.value.workObjectId,
    p_start_time: v.value.startTime,
    p_end_time: v.value.endTime,
    p_note: v.value.note,
  });
  if (error) {
    const outcome = classify(error.message ?? "", error.code);
    console.error("[work-plan] create failed", { code: error.code, outcome });
    back(locale, outcome);
  }
  revalidatePath(`/${locale}/dashboard/company/planning`);
  revalidatePath(`/${locale}/dashboard/planning`);
  back(locale, "planned");
}

export async function cancelWorkPlanEntryAction(formData: FormData): Promise<void> {
  const locale = String(formData.get("locale") ?? "lt").slice(0, 5);
  const entryId = String(formData.get("entry_id") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(entryId)) back(locale, "invalid");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale}/auth/login?next=${encodeURIComponent(`/${locale}/dashboard/company/planning`)}`);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any).rpc("cancel_work_plan_entry_v1", { p_entry_id: entryId });
  if (error) {
    const outcome = classify(error.message ?? "", error.code);
    console.error("[work-plan] cancel failed", { code: error.code, outcome });
    back(locale, outcome);
  }
  revalidatePath(`/${locale}/dashboard/company/planning`);
  revalidatePath(`/${locale}/dashboard/planning`);
  back(locale, "cancelled");
}
