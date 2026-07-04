"use server";

import { revalidatePath } from "next/cache";
import {
  confirmRecognizedNeed,
  closeDemand,
  reopenDemand,
  type DemandLifecycleResult,
} from "./demand-lifecycle";

/** Server actions for the company demand lifecycle (PR10). Own-row RLS is
 *  the authority; nothing is sent outside the platform. */

export async function confirmRecognizedNeedAction(
  locale: string,
  requestId: string,
): Promise<DemandLifecycleResult> {
  const r = await confirmRecognizedNeed(requestId);
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
  if (r.kind === "ok") revalidatePath(`/${locale}/dashboard/company/scouting`);
  return r;
}
