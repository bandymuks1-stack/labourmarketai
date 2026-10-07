"use server";

import { revalidatePath } from "next/cache";
import {
  confirmRecognizedNeed,
  closeDemand,
  reopenDemand,
  type DemandLifecycleResult,
} from "./demand-lifecycle";
import { createClient } from "@/lib/supabase/server";
import { requireEmployerCompany } from "@/lib/company/employer-company-context";
import { runAutoMatchForDemand, type AutoMatchTrigger } from "@/lib/scouting/auto-match";

/** Best-effort internal matching after a need becomes active again / its
 *  requirement set changes. Never throws, never changes the action result. */
async function autoMatchBestEffort(requestId: string, trigger: AutoMatchTrigger): Promise<void> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    const employer = await requireEmployerCompany();
    if (!employer.ok) return;
    await runAutoMatchForDemand({ supabase, userId: user.id }, employer, requestId, trigger);
  } catch {
    /* lifecycle result is unaffected */
  }
}

/** Server actions for the company demand lifecycle (PR10). Own-row RLS is
 *  the authority; nothing is sent outside the platform. */

export async function confirmRecognizedNeedAction(
  locale: string,
  requestId: string,
): Promise<DemandLifecycleResult> {
  const r = await confirmRecognizedNeed(requestId);
  if (r.kind === "ok") await autoMatchBestEffort(requestId, "confirm");
  if (r.kind === "ok") revalidatePath(`/${locale}/dashboard/company/scouting`);
  return r;
}

export async function closeDemandAction(
  locale: string,
  requestId: string,
): Promise<DemandLifecycleResult> {
  const r = await closeDemand(requestId);
  if (r.kind === "ok") revalidatePath(`/${locale}/dashboard/company/scouting`);
  return r;
}

export async function reopenDemandAction(
  locale: string,
  requestId: string,
): Promise<DemandLifecycleResult> {
  const r = await reopenDemand(requestId);
  if (r.kind === "ok") await autoMatchBestEffort(requestId, "reopen");
  if (r.kind === "ok") revalidatePath(`/${locale}/dashboard/company/scouting`);
  return r;
}
