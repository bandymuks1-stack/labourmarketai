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
  /** The addressed signup form or the onboarding finish. */
  surface?: "addressed_signup" | "onboarding";
  /** `REVIEW_NOTICE_VERSION` only when that surface showed the review sentence. */
  reviewNotice?: string | null;
}): Promise<{ accepted: boolean; outcome: string }> {
  const token = String(input.token ?? "");
  if (!token || token.length > 128 || !/^[A-Za-z0-9_-]+$/.test(token)) {
    return { accepted: false, outcome: "invalid_token" };
  }
  const result = await acceptInvitationAction({
    token,
    locale: toActiveLocale(input.locale),
    noticeSurface: input.surface ?? "onboarding",
    reviewNotice: input.reviewNotice ?? null,
  });
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
  /** `REVIEW_NOTICE_VERSION` only when the form showed the review sentence. */
  reviewNotice?: string | null;
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
  // Confirm email ON + an address that already has an account: no error, no
  // mail, a user with no identities. The form then shows the sign-in door.
  if (!data.session && data.user && data.user.identities?.length === 0) {
    return { status: "error", code: "user_already_exists", message: "", httpStatus: null };
  }
  if (!data.session) return { status: "check_email" };
  const accepted = await acceptInvitationAfterSignup({
    token,
    locale: input.locale,
    surface: "addressed_signup",
    reviewNotice: input.reviewNotice ?? null,
  });
  return { status: "session", accepted: accepted.accepted };
}

/**
 * Resend the sign-up confirmation for an ADDRESSED invitation. The form only
 * holds the masked address (x***@domain) — a resend from the browser went to
 * that masked string and reached nobody. The real address is resolved here
 * from the invitation token and never leaves the server.
 */
export async function resendAddressedInviteConfirmationAction(input: {
  token: string;
  emailRedirectTo: string;
}): Promise<{ status: "sent" } | { status: "unavailable" } | { status: "error"; code: string | null; message: string; httpStatus: number | null }> {
  const context = await readInvitationSignupContext(String(input.token ?? "") || null);
  if (context.kind !== "addressed") return { status: "unavailable" };
  const supabase = await createClient();
  const { error } = await supabase.auth.resend({
    type: "signup",
    email: context.email,
    options: { emailRedirectTo: input.emailRedirectTo },
  });
  if (error) {
    return {
      status: "error",
      code: (error as { code?: string }).code ?? null,
      message: error.message.split(context.email).join("the invited address"),
      httpStatus: error.status ?? null,
    };
  }
  return { status: "sent" };
}
