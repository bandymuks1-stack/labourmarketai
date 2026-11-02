"use server";

import { toActiveLocale } from "@/lib/i18n/config";
import { acceptInvitationAction } from "@/lib/invitations/actions";
import { readInvitationSignupContext } from "@/lib/invitations/signup-bridge";
import { createClient } from "@/lib/supabase/server";

/**
 * Continue the canonical invitation acceptance RIGHT AFTER a successful signup
 * through the addressed invitation (frictionless addressed invite, owner
 * decision 2026-10-06): the person already entered through that invitation, so
 * a second "Accept invitation" tap on the landing page is redundant.
 *
 * This is NOT a second acceptance implementation: it is the same
 * `acceptInvitationAction` the landing page's button runs - same RPC
 * (`accept_invitation_v2`), same server-side e-mail binding (`151100`: the
 * session e-mail must equal the invited address, else `email_mismatch` and
 * nothing is accepted). It grants no consent, selects no work country, makes
 * nobody visible to employer searches. The caller proceeds to onboarding whatever the outcome;
 * a failed auto-accept simply leaves the invitation pending for the landing
 * page (the person can still accept there).
 */
export async function acceptInvitationAfterSignup(input: {
  token: string;
  locale: string;
}): Promise<{ accepted: boolean; outcome: string }> {
  const token = String(input.token ?? "");
  if (!token || token.length > 128 || !/^[A-Za-z0-9_-]+$/.test(token)) {
    return { accepted: false, outcome: "invalid_token" };
  }
  const result = await acceptInvitationAction({ token, locale: toActiveLocale(input.locale) });
  if (result.status === "ok") {
    return { accepted: result.outcome === "accepted", outcome: result.outcome };
  }
  return { accepted: false, outcome: result.status };
}

/**
 * SIGNUP THROUGH AN ADDRESSED INVITATION, address kept server-side.
 *
 * The invited address is resolved HERE from the token and handed straight to
 * `auth.signUp`; the browser only ever holds the masked form (c***@domain) and
 * the password. So whoever holds a usable link learns no more than the existing
 * public preview already shows. The e-mail binding (151100) is unchanged: it
 * still compares the new session's address to the invited one at acceptance.
 *
 * Returns the auth error's code/message/status (never the address) so the form
 * maps it exactly as it maps a client-side signUp failure.
 */
export type AddressedSignupResult =
  | { status: "session"; accepted: boolean }
  | { status: "check_email" }
  | { status: "unavailable" }
  | { status: "error"; code: string | null; message: string; httpStatus: number | null };

export async function signUpAddressedInviteAction(input: {
  token: string;
  password: string;
  locale: string;
  emailRedirectTo: string;
  metadata?: Record<string, string>;
}): Promise<AddressedSignupResult> {
  const token = String(input.token ?? "");
  const context = await readInvitationSignupContext(token || null);
  if (context.kind !== "addressed") return { status: "unavailable" };
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: context.email,
    password: String(input.password ?? ""),
    options: {
      emailRedirectTo: input.emailRedirectTo,
      data: { locale: input.locale, ...(input.metadata ?? {}) },
    },
  });
  if (error) {
    return {
      status: "error",
      code: (error as { code?: string }).code ?? null,
      message: error.message.split(context.email).join("the invited address"),
      httpStatus: error.status ?? null,
    };
  }
  if (!data.session) return { status: "check_email" };
  const accepted = await acceptInvitationAfterSignup({ token, locale: input.locale });
  return { status: "session", accepted: accepted.accepted };
}
