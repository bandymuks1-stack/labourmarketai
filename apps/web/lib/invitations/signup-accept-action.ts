"use server";

import { toActiveLocale } from "@/lib/i18n/config";
import { acceptInvitationAction } from "@/lib/invitations/actions";

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
