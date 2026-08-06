import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";

/**
 * M-P0-4 Slice 2 — governance membership reads + command wrappers.
 *
 * READS are plain RLS-scoped selects (the Slice 1 policy: own rows always;
 * an org's member list only for its ACTIVE members; no write grants exist).
 * WRITES go exclusively through the seven reviewed SECURITY DEFINER
 * commands — there is no client-side table mutation anywhere, and the RPCs
 * re-derive the actor and their authority from the membership truth itself.
 *
 * Everything is feature-detected: environments where Slice 1 / Slice 2 are
 * not applied yield `needs-migration`, never a crash and never a fake empty
 * state ("no members" must mean the org truly has none).
 */

const UNDEFINED_COLUMN_CODE = "42703";
const RELATION_NOT_FOUND_CODE = "42P01";
const RPC_NOT_FOUND_CODE = "PGRST202";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(supabase: SupabaseClient): any {
  return supabase;
}

export const MEMBERSHIP_ROLES = [
  "owner",
  "admin",
  "manager",
  "external_manager",
  "member",
] as const;
export type MembershipRole = (typeof MEMBERSHIP_ROLES)[number];
export type MembershipStatus = "invited" | "active" | "revoked";

export type OrganizationMember = {
  readonly membershipId: string;
  readonly profileId: string;
  readonly fullName: string | null;
  readonly email: string | null;
  readonly role: MembershipRole;
  readonly status: Extract<MembershipStatus, "invited" | "active">;
};

export type OrganizationMembersResult =
  | { kind: "ok"; members: OrganizationMember[]; myRole: MembershipRole | null }
  | { kind: "needs-migration" }
  | { kind: "error"; message: string };

/** The LIVE membership list of one organization (revoked history excluded),
 *  plus the caller's own active role there (null = no live membership). */
export async function listOrganizationMembers(
  organizationId: string,
): Promise<OrganizationMembersResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { kind: "ok", members: [], myRole: null };

  const { data, error } = await asAny(supabase)
    .from("company_memberships")
    // Two FKs point at profiles (profile_id, invited_by) — the embed must
    // name the relationship or PostgREST refuses it as ambiguous.
    .select(
      "id, profile_id, role, status, profiles!company_memberships_profile_id_fkey(full_name, email)",
    )
    .eq("organization_id", organizationId)
    .in("status", ["invited", "active"])
    .order("created_at", { ascending: true })
    .limit(200);
  if (error) {
    if (
      error.code === UNDEFINED_COLUMN_CODE ||
      error.code === RELATION_NOT_FOUND_CODE
    ) {
      return { kind: "needs-migration" };
    }
    return { kind: "error", message: error.message };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = (data ?? []) as any[];
  const members: OrganizationMember[] = rows.map((r) => ({
    membershipId: r.id as string,
    profileId: r.profile_id as string,
    fullName:
      ((r.profiles as { full_name?: string | null } | null)?.full_name as
        | string
        | null) ?? null,
    email:
      ((r.profiles as { email?: string | null } | null)?.email as
        | string
        | null) ?? null,
    role: r.role as MembershipRole,
    status: r.status as "invited" | "active",
  }));
  const myRole =
    members.find((m) => m.profileId === user.id && m.status === "active")
      ?.role ?? null;
  return { kind: "ok", members, myRole };
}

export type MyMembershipInvitation = {
  readonly membershipId: string;
  readonly organizationId: string;
  readonly organizationName: string;
  readonly role: MembershipRole;
};

export type MyInvitationsResult =
  | { kind: "ok"; invitations: MyMembershipInvitation[] }
  | { kind: "needs-migration" }
  | { kind: "error"; message: string };

/** Invitations addressed to the CALLER. Uses the caller-scoped SECURITY
 *  DEFINER read (`membership_my_invitations_v1`) because an invitee is not
 *  yet an active member, so the hardened organizations RLS correctly
 *  refuses them the inviting org's row — the RPC discloses exactly that
 *  display name for the caller's OWN invited rows, nothing else. */
export async function listMyMembershipInvitations(): Promise<MyInvitationsResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { kind: "ok", invitations: [] };

  const { data, error } = await asAny(supabase).rpc(
    "membership_my_invitations_v1",
  );
  if (error) {
    if (error.code === RPC_NOT_FOUND_CODE) return { kind: "needs-migration" };
    return { kind: "error", message: error.message };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = (data ?? []) as any[];
  return {
    kind: "ok",
    invitations: rows.map((r) => ({
      membershipId: r.membership_id as string,
      organizationId: r.organization_id as string,
      organizationName: ((r.organization_name as string | null) ?? "").trim(),
      role: r.member_role as MembershipRole,
    })),
  };
}

/** Every outcome the seven commands can answer with (tagged, never thrown). */
export type MembershipCommandOutcome =
  | "invited"
  | "accepted"
  | "declined"
  | "cancelled"
  | "role_changed"
  | "revoked"
  | "left"
  | "unchanged"
  | "already_member"
  | "already_invited"
  | "already_active"
  | "not_invited"
  | "not_active"
  | "not_a_member"
  | "not_found"
  | "not_authorized"
  | "no_such_user"
  | "cannot_invite_self"
  | "invalid_role"
  | "last_owner";

export type MembershipCommandResult =
  | { kind: "ok"; outcome: MembershipCommandOutcome }
  | { kind: "needs-migration" }
  | { kind: "error"; message: string };

async function callCommand(
  fn: string,
  args: Record<string, unknown>,
): Promise<MembershipCommandResult> {
  const supabase = await createClient();
  const { data, error } = await asAny(supabase).rpc(fn, args);
  if (error) {
    if (error.code === RPC_NOT_FOUND_CODE) return { kind: "needs-migration" };
    return { kind: "error", message: error.message };
  }
  return { kind: "ok", outcome: data as MembershipCommandOutcome };
}

export function inviteMembership(
  organizationId: string,
  email: string,
  role: MembershipRole,
): Promise<MembershipCommandResult> {
  return callCommand("membership_invite_v1", {
    p_organization_id: organizationId,
    p_email: email,
    p_role: role,
  });
}

export function acceptMembership(
  membershipId: string,
): Promise<MembershipCommandResult> {
  return callCommand("membership_accept_v1", { p_membership_id: membershipId });
}

export function declineMembership(
  membershipId: string,
): Promise<MembershipCommandResult> {
  return callCommand("membership_decline_v1", { p_membership_id: membershipId });
}

export function cancelMembershipInvite(
  membershipId: string,
): Promise<MembershipCommandResult> {
  return callCommand("membership_cancel_invite_v1", {
    p_membership_id: membershipId,
  });
}

export function changeMembershipRole(
  membershipId: string,
  newRole: MembershipRole,
): Promise<MembershipCommandResult> {
  return callCommand("membership_change_role_v1", {
    p_membership_id: membershipId,
    p_new_role: newRole,
  });
}

export function revokeMembership(
  membershipId: string,
): Promise<MembershipCommandResult> {
  return callCommand("membership_revoke_v1", { p_membership_id: membershipId });
}

export function leaveOrganization(
  organizationId: string,
): Promise<MembershipCommandResult> {
  return callCommand("membership_leave_v1", {
    p_organization_id: organizationId,
  });
}
