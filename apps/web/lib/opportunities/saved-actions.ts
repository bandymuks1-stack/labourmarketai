"use server";

import { revalidatePath } from "next/cache";
import {
  saveOpportunity,
  unsaveOpportunity,
  type SavedWriteResult,
} from "@/lib/opportunities/saved-opportunities";

/**
 * Server actions for the worker's PRIVATE opportunity bookmarks (P2-PR5,
 * #723-compat). Thin wrappers over the gated RPC flows — a save is a private
 * marker on the worker's own account: nothing is sent anywhere, the company
 * never sees who saved. When the owner-gated migration is not applied the
 * flows return "feature-absent" and the UI never offered the action anyway.
 */

export async function saveOpportunityAction(
  locale: string,
  requestId: string,
): Promise<SavedWriteResult> {
  const result = await saveOpportunity({ requestId });
  if (result.kind === "ok") {
    revalidatePath(`/${locale}/dashboard/opportunities`);
  }
  return result;
}

export async function unsaveOpportunityAction(
  locale: string,
  requestId: string,
): Promise<SavedWriteResult> {
  const result = await unsaveOpportunity({ requestId });
  if (result.kind === "ok") {
    revalidatePath(`/${locale}/dashboard/opportunities`);
  }
  return result;
}
