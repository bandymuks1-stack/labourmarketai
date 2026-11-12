"use server";

import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { isActiveLocale } from "@/lib/i18n/config";
import { createClient } from "@/lib/supabase/server";
import {
  parseCancelResult,
  parseDeletionStatus,
  type CancelDeletionResult,
  type DeletionStatusView,
} from "@/lib/privacy/deletion-cancel-model";

/**
 * Account-deletion status read + self-service cancel (owner P0 2026-11-09).
 *
 * Both call SECURITY DEFINER functions bound to auth.uid() through the same
 * server Supabase client the other privacy actions use. Until the RED
 * migration that creates them is applied, the functions are absent and both
 * report `unavailable` (see `deletion-cancel-model.ts`) — the page then stays
 * exactly as it is today.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const asAny = (c: SupabaseClient<any>) => c as unknown as SupabaseClient;

/** The signed-in person's own account-deletion status. A signed-out caller
 *  gets `none` — there is nothing of theirs to show. */
export async function getMyAccountDeletionStatus(): Promise<DeletionStatusView> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { kind: "none" };
    const { data, error } = await asAny(supabase).rpc("privacy_account_deletion_status_v1");
    return parseDeletionStatus(data, error);
  } catch {
    return { kind: "error" };
  }
}

/** Withdraws the signed-in person's own pending account-deletion request. */
export async function cancelMyAccountDeletion(input: {
  locale: string;
}): Promise<CancelDeletionResult> {
  let result: CancelDeletionResult;
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { kind: "not-signed-in" };
    const { data, error } = await asAny(supabase).rpc("privacy_cancel_account_deletion_v1");
    result = parseCancelResult(data, error);
  } catch {
    return { kind: "error" };
  }
  const locale = isActiveLocale(input.locale) ? input.locale : "lt";
  revalidatePath(`/${locale}/dashboard/privacy`);
  return result;
}
