"use server";

import { revalidatePath } from "next/cache";
import {
  confirmRecognizedNeed,
  closeDemand,
  discardDemandDraft,
  reopenDemand,
  type DemandLifecycleResult,
} from "./demand-lifecycle";
import type { EntryAction } from "@/lib/market-lifecycle/contract";
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

/**
 * A lifecycle contract action from the own-needs list (lib/market-lifecycle):
 * complete / withdraw close the need with that outcome, resume reopens it,
 * withdraw on a draft discards it. Each goes through the SAME close / reopen /
 * discard functions the scouting page and the MCP tools use — the contract
 * checks live there, not here.
 */
export async function applyDemandAction(
  locale: string,
  requestId: string,
  action: EntryAction,
  currentStatus: string,
): Promise<DemandLifecycleResult> {
  let r: DemandLifecycleResult;
  if (action === "complete" || (action === "withdraw" && currentStatus !== "draft")) {
    r = await closeDemand(requestId, undefined, action === "complete" ? "completed" : "withdrawn");
  } else if (action === "withdraw") {
    r = await discardDemandDraft(requestId);
  } else if (action === "resume") {
    r = await reopenDemand(requestId);
    if (r.kind === "ok") await autoMatchBestEffort(requestId, "reopen");
  } else {
    return { kind: "invalid" };
  }
  if (r.kind === "ok") {
    revalidatePath(`/${locale}/dashboard/company/needs`);
    revalidatePath(`/${locale}/dashboard/company/scouting`);
  }
  return r;
}
