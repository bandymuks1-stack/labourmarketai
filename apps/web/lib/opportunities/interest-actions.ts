"use server";

import { revalidatePath } from "next/cache";
import {
  expressInterest,
  withdrawInterest,
  type InterestWriteResult,
} from "@/lib/opportunities/interest";

/**
 * Server actions for the worker express-interest signal. Thin wrappers over
 * the RLS-scoped lib flows — INTERNAL signal only, nothing is sent outside
 * the platform (no email, no messaging, no webhook; guard-pinned).
 */

export async function expressInterestAction(
  locale: string,
  requestId: string,
  note?: string | null,
): Promise<InterestWriteResult> {
  const result = await expressInterest({ requestId, note });
  if (result.kind === "ok") {
    revalidatePath(`/${locale}/dashboard/opportunities`);
  }
  return result;
}

export async function withdrawInterestAction(
  locale: string,
  requestId: string,
): Promise<InterestWriteResult> {
  const result = await withdrawInterest({ requestId });
  if (result.kind === "ok") {
    revalidatePath(`/${locale}/dashboard/opportunities`);
  }
  return result;
}
