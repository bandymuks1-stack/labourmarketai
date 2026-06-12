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
 */
export async function setShortlistAction(
  locale: string,
  requestId: string,
  workerId: string,
  status: ShortlistStatus,
): Promise<ShortlistWriteResult> {
  const result = await setShortlist({ requestId, workerId, status });
  if (result.kind === "ok") {
    revalidatePath(`/${locale}/dashboard/company/scouting`);
  }
  return result;
}
