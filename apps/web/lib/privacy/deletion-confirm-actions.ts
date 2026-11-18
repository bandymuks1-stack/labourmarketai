"use server";

import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

/**
 * The account holder's go-ahead for an open account-deletion request.
 *
 * `privacy_confirm_account_deletion_v1` (SECURITY DEFINER, auth.uid() only)
 * accepts the confirmation only when the person signed in within the last
 * 15 minutes — a stolen, long-lived session cannot delete an account. When
 * the sign-in is older, `startDeletionReauth` ends this session and sends the
 * person through the normal sign-in, back to the privacy page. After the
 * confirmation the system runner erases the account on its own schedule.
 */
export type DeletionConfirmResult =
  | { kind: "confirmed" }
  | { kind: "reauth-required" }
  | { kind: "no-open-request" }
  | { kind: "not-authed" }
  | { kind: "unavailable" }
  | { kind: "error" };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const asAny = (c: SupabaseClient<any>) => c as unknown as SupabaseClient;
const ABSENT = new Set(["42883", "PGRST202"]);

export async function confirmAccountDeletion(): Promise<DeletionConfirmResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { kind: "not-authed" };
  const { data, error } = await asAny(supabase).rpc("privacy_confirm_account_deletion_v1");
  if (error) {
    if (error.code && ABSENT.has(error.code)) return { kind: "unavailable" };
    return { kind: "error" };
  }
  const res = (data ?? {}) as { ok?: boolean; error?: string };
  if (res.ok) return { kind: "confirmed" };
  if (res.error === "reauth_required") return { kind: "reauth-required" };
  if (res.error === "no_open_deletion_request") return { kind: "no-open-request" };
  if (res.error === "not_authenticated") return { kind: "not-authed" };
  return { kind: "error" };
}

/** Ends this browser's session and returns the sign-in URL that comes back
 *  to the deletion section. The caller navigates there. */
export async function startDeletionReauth(locale: string): Promise<{ href: string }> {
  const safeLocale = /^[a-z]{2}$/.test(locale) ? locale : "lt";
  const supabase = await createClient();
  await supabase.auth.signOut({ scope: "local" });
  const next = `/${safeLocale}/dashboard/privacy#privacy-deletion`;
  return { href: `/${safeLocale}/auth/login?next=${encodeURIComponent(next)}` };
}
