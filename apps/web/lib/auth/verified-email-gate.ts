import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { isEmailVerifiedRead } from "@/lib/auth/email-verification";

/**
 * APP-LAYER verified-email gate (WORKER_REGISTRATION_FRICTION_REMOVAL, G-3).
 *
 * With Supabase "Confirm email" OFF, `auth.users.email` / the JWT `email` is
 * merely TYPED. Any server code that authorises a read or a claim by the
 * caller's e-mail string — above all code that then reaches for the service
 * role — must prove the mailbox first. This is the ONE helper for that: it asks
 * the database (`my_email_verification_v1`, SECURITY DEFINER, reads the
 * separate evidence table) with the CALLER'S OWN client, so the answer is about
 * the session making the request and nothing else.
 *
 * FAIL-CLOSED: anything other than an explicit `verified: true` with a
 * non-empty address — an error, a missing function (migration not applied), a
 * malformed payload — is NOT verified. Never infer verification from
 * `user.email`, `email_confirmed_at` or `profiles.email`.
 */
export type VerifiedSessionEmail =
  | { readonly status: "verified"; readonly email: string }
  | { readonly status: "unverified" }
  | { readonly status: "unauthenticated" }
  | { readonly status: "error" };

export async function readVerifiedSessionEmail(
  // The caller's own, user-scoped client (never the admin client).
  supabase: SupabaseClient,
): Promise<VerifiedSessionEmail> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: "unauthenticated" };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc("my_email_verification_v1");
  if (error) return { status: "error" };
  const email = (data as { email?: unknown } | null)?.email;
  if (!isEmailVerifiedRead(data) || typeof email !== "string" || email.trim() === "") {
    return { status: "unverified" };
  }
  // The proven address must be the address the session presents; a mismatch
  // (changed since) is treated as unverified, not as a different person.
  if (user.email && user.email.trim().toLowerCase() !== email.trim().toLowerCase()) {
    return { status: "unverified" };
  }
  return { status: "verified", email: email.trim().toLowerCase() };
}
