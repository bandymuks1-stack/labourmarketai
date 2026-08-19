"use server";

import { revalidatePath } from "next/cache";

import {
  savePublicVacancy,
  unsavePublicVacancy,
  type SavedWriteResult,
} from "@/lib/opportunities/saved-opportunities";

/**
 * Save / unsave a PUBLIC VACANCY — a PRIVATE BOOKMARK, nothing more.
 *
 * Owner decision 2026-08-19: this may never be read as an application, a
 * shortlisting, employer interest, or candidate disclosure. Nothing here
 * notifies anyone, writes to any employer-visible surface, or changes what the
 * publisher can see. The DB enforces that independently of this file: the only
 * policy on `worker_saved_opportunities` is an own-rows SELECT, there is no
 * insert/update/delete policy at all, and `anon` holds no privilege on the
 * table or the RPCs.
 *
 * The write itself goes through the gated SECURITY DEFINER RPCs under the
 * CALLER's own client, so the worker identity comes from `auth.uid()` inside
 * the function — this action cannot save on someone else's behalf even if it
 * were called with a forged id.
 */
export async function saveVacancyAction(
  vacancyId: string,
): Promise<SavedWriteResult> {
  const result = await savePublicVacancy({ vacancyId });
  // Re-render the vacancy page so the control reflects stored truth rather than
  // optimistic local state. The page is force-dynamic, so this is cheap.
  if (result.kind === "ok") revalidatePath("/[locale]/jobs/[id]", "page");
  return result;
}

export async function unsaveVacancyAction(
  vacancyId: string,
): Promise<SavedWriteResult> {
  const result = await unsavePublicVacancy({ vacancyId });
  if (result.kind === "ok") revalidatePath("/[locale]/jobs/[id]", "page");
  return result;
}
