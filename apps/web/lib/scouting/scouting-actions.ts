"use server";

import { revalidatePath } from "next/cache";
import {
  setShortlist,
  type ShortlistStatus,
  type ShortlistWriteResult,
} from "@/lib/scouting/scouting";

/**
 * Server action: set a shortlist decision for a company's own demand. Thin
 * wrapper over the owner-scoped `setShortlist` (RLS is the authority). No new
 * permissions — the lib verifies the demand is the caller's own.
 *
 * Extension B: optional internal note (undefined preserves the stored one);
 * `not_fit` without any reason returns `reason-required` — enforced in the
 * lib, never trusted to the client.
 */
export async function setShortlistAction(
  locale: string,
  requestId: string,
  workerId: string,
  status: ShortlistStatus,
  note?: string | null,
): Promise<ShortlistWriteResult> {
  const result = await setShortlist({ requestId, workerId, status, note });
  if (result.kind === "ok") {
    revalidatePath(`/${locale}/dashboard/company/scouting`);
  }
  return result;
}
