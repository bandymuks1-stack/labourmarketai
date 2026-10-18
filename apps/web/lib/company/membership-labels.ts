import "server-only";

import { getTranslations } from "next-intl/server";

import type { InvitationsPanelLabels } from "@/components/app/membership-invitations-panel";
import type { MembersSectionLabels } from "@/components/app/organization-members-section";
import { MEMBERSHIP_ROLES, type MembershipRole } from "@/lib/company/memberships";

/**
 * THE labels of the governance surfaces (member directory + invitations
 * panel), read from the `organizationMembers` catalogue in the request
 * locale. One builder, mounted from two places (the organization's Settings
 * door and the Activity Setup Hub's invitee panel), so the words — and every
 * command outcome sentence — cannot drift between them.
 *
 * Until 2026-09-23 these lived inline on /dashboard/start as LT/EN pairs
 * (`label("Savininkas", "Owner")`), so a Russian, Dutch, German or Polish
 * reader saw English on a localized product. The catalogue carries all 11
 * locales now.
 */

/** Every outcome the seven membership commands and the actions can answer
 *  with — one sentence each (`organizationMembers.outcomes.*`). */
export const MEMBERSHIP_OUTCOME_KEYS = [
  "invited",
  "accepted",
  "declined",
  "cancelled",
  "role_changed",
  "revoked",
  "left",
  "unchanged",
  "granted",
  "withdrawn",
  "held_by_role",
  "already_member",
  "already_invited",
  "already_active",
  "not_invited",
  "not_active",
  "not_a_member",
  "not_found",
  "not_authorized",
  "no_such_user",
  "cannot_invite_self",
  "invalid_role",
  "last_owner",
  "no_workspace",
  "needs_migration",
  "invalid",
  "error",
] as const;

export interface MembershipLabels {
  readonly invitations: InvitationsPanelLabels;
  readonly members: MembersSectionLabels;
}

export async function getMembershipLabels(): Promise<MembershipLabels> {
  const t = await getTranslations("organizationMembers");
  const roleLabels = Object.fromEntries(
    MEMBERSHIP_ROLES.map((role) => [role, t(`roles.${role}`)]),
  ) as Record<MembershipRole, string>;
  const outcomes = Object.fromEntries(
    MEMBERSHIP_OUTCOME_KEYS.map((key) => [key, t(`outcomes.${key}`)]),
  ) as Record<string, string>;
  return {
    invitations: {
      heading: t("invitations.heading"),
      explainer: t("invitations.explainer"),
      roleLabels,
      accept: t("invitations.accept"),
      decline: t("invitations.decline"),
      outcomes,
    },
    members: {
      heading: t("members.heading"),
      explainer: t("members.explainer"),
      roleLabels,
      statusInvited: t("members.statusInvited"),
      inviteHeading: t("members.inviteHeading"),
      inviteEmail: t("members.inviteEmail"),
      inviteRole: t("members.inviteRole"),
      inviteSubmit: t("members.inviteSubmit"),
      cancelInvite: t("members.cancelInvite"),
      revoke: t("members.revoke"),
      leave: t("members.leave"),
      managesInvitations: t("members.managesInvitations"),
      grantInvitations: t("members.grantInvitations"),
      withdrawInvitations: t("members.withdrawInvitations"),
      outcomes,
    },
  };
}
