"use server";

import { redirect } from "next/navigation";

import {
  acceptInvitationAction,
  declineInvitationAction,
} from "@/lib/invitations/actions";
import { acceptedDestination } from "@/lib/invitations/model";

/**
 * NATIVE-NAV form actions for /[locale]/invite/[token] (core-network area
 * B): submit → real RPC → redirect. Success lands in the EXACT accepted
 * context (project page / dashboard); every failure lands back on the
 * invite page with an honest ?notice= outcome. No fake acceptance states.
 */

export async function acceptInviteFormAction(formData: FormData): Promise<void> {
  const token = String(formData.get("token") ?? "");
  const locale = String(formData.get("locale") ?? "lt");
  if (!token) redirect(`/${locale}/dashboard`);

  const result = await acceptInvitationAction({ token });
  if (result.status === "not-authed") {
    redirect(`/${locale}/auth/login?next=/${locale}/invite/${token}`);
  }
  if (result.status === "needs-migration") {
    redirect(`/${locale}/invite/${token}?notice=not_enabled`);
  }
  if (result.status === "ok" && result.outcome === "accepted") {
    const destination = acceptedDestination({
      invitationType: result.invitationType ?? "",
      projectId: result.projectId,
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
  const locale = String(formData.get("locale") ?? "lt");
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
