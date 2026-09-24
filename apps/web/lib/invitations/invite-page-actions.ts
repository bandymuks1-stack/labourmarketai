"use server";

import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { readHeldProfileRoles } from "@/lib/auth/profile-roles";
import { toActiveLocale } from "@/lib/i18n/config";
import {
  acceptInvitationAction,
  declineInvitationAction,
} from "@/lib/invitations/actions";
import {
  acceptedDestination,
  agencyClientLanding,
  isAgencyClientInvitation,
} from "@/lib/invitations/model";

/**
 * NATIVE-NAV form actions for /[locale]/invite/[token] (core-network area
 * B): submit → real RPC → redirect. Success lands in the EXACT accepted
 * context (project page / dashboard); every failure lands back on the
 * invite page with an honest ?notice= outcome. No fake acceptance states.
 *
 * The locale is a FORM field interpolated into every redirect here, so it
 * is clamped to the closed active set first (`toActiveLocale`): a forged
 * `/evil.com` would otherwise become a protocol-relative Location.
 */

/**
 * Whether the signed-in person holds the `company` role — the very fact the
 * partners door gates on (`requireRoleOrRedirect(locale, "company")`).
 * `null` when the read never answered or there is no session: an unknown is
 * never narrowed into "no role" — the door's own gate then decides (it
 * retries and answers honestly).
 */
async function holdsCompanyRole(): Promise<boolean | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const roles = await readHeldProfileRoles({ supabase, userId: user.id });
  return roles.ok ? roles.value.includes("company") : null;
}

export async function acceptInviteFormAction(formData: FormData): Promise<void> {
  const token = String(formData.get("token") ?? "");
  const locale = toActiveLocale(String(formData.get("locale") ?? ""));
  // The invitation's stored proposed_role, echoed by the server-rendered page
  // (the accept RPC does not return it). It decides ONLY where the person
  // lands afterwards; a forged value lands them on a page whose own reads
  // are RLS-scoped, and never changes what acceptance creates.
  const proposedRole = String(formData.get("proposedRole") ?? "") || null;
  if (!token) redirect(`/${locale}/dashboard`);

  const result = await acceptInvitationAction({ token });
  if (result.status === "not-authed") {
    redirect(`/${locale}/auth/login?next=/${locale}/invite/${token}`);
  }
  if (result.status === "needs-migration") {
    redirect(`/${locale}/invite/${token}?notice=not_enabled`);
  }
  if (result.status === "ok" && result.outcome === "accepted") {
    // An external-source referral carries declared context the person now
    // reviews (accept / reject / correct) — on this same page, which shows
    // it only to the person who accepted. Nothing was written to their
    // profile by accepting.
    if (result.hasDeclaredContext) {
      redirect(`/${locale}/invite/${token}?notice=referral_accepted`);
    }
    // The agency's connection invitation: the partners door is where the
    // connection is confirmed, but that door is gated on the company role.
    // A person who holds none is sent to the company-setup entry with the
    // pending connection named — never into a refusal (review round 2).
    if (
      isAgencyClientInvitation({
        invitationType: result.invitationType ?? "",
        proposedRole,
      })
    ) {
      const landing = agencyClientLanding(await holdsCompanyRole());
      redirect(`/${locale}${landing.path}?notice=${landing.notice}`);
    }
    const destination = acceptedDestination({
      invitationType: result.invitationType ?? "",
      projectId: result.projectId,
      proposedRole,
    });
    redirect(`/${locale}${destination}?notice=invitation_accepted`);
  }
  redirect(
    `/${locale}/invite/${token}?notice=${encodeURIComponent(
      result.status === "ok" ? result.outcome : "error",
    )}`,
  );
}

export async function declineInviteFormAction(formData: FormData): Promise<void> {
  const token = String(formData.get("token") ?? "");
  const locale = toActiveLocale(String(formData.get("locale") ?? ""));
  if (!token) redirect(`/${locale}/dashboard`);

  const result = await declineInvitationAction({ token });
  if (result.status === "not-authed") {
    redirect(`/${locale}/auth/login?next=/${locale}/invite/${token}`);
  }
  redirect(
    `/${locale}/invite/${token}?notice=${encodeURIComponent(
      result.status === "ok" ? result.outcome : "error",
    )}`,
  );
}
