"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import { getSessionProfile } from "@/lib/auth/session-profile";
import { baseIdentityForRole } from "@/lib/config/roles";
import { getWorkspaceContext } from "@/lib/company/active-organization";
import { PERSONAL_WORKSPACE_ID } from "@/lib/company/organization-switch";
import {
  MEMBERSHIP_ROLES,
  acceptMembership,
  cancelMembershipInvite,
  changeMembershipRole,
  declineMembership,
  inviteMembership,
  leaveOrganization,
  revokeMembership,
  type MembershipCommandOutcome,
  type MembershipCommandResult,
  type MembershipRole,
} from "./memberships";

/**
 * M-P0-4 Slice 2 — membership server actions.
 *
 * §11 doctrine: every mutation derives the authenticated actor (auth.uid()
 * inside the SECURITY DEFINER command), the TARGET ORGANIZATION (the
 * membership-validated ACTIVE WORKSPACE — never a client field), the actor's
 * current role (the command reads it from the membership truth) and the
 * target membership state (the command reads the row). The only client
 * inputs are the invitee email, the requested role (validated against the
 * closed vocabulary server-side AND SQL-side) and — for per-row commands —
 * a membership id that must belong to the active workspace's organization
 * (verified with an RLS-scoped read before the command runs; the command
 * re-derives all authority anyway, so a forged id can only fail).
 *
 * accept/decline are the INVITEE's own actions: they need no workspace (a
 * person accepts from their Personal context) — the command only ever acts
 * on rows addressed to the caller.
 */

export type MembershipActionState =
  | { ok: true; outcome: MembershipCommandOutcome }
  | {
      ok: false;
      code:
        | "no_workspace"
        | "needs_migration"
        | "invalid"
        | MembershipCommandOutcome
        | "error";
      message?: string;
    };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(supabase: SupabaseClient): any {
  return supabase;
}

/** The membership-validated active ORGANIZATION workspace, or null. */
async function activeOrganizationId(): Promise<string | null> {
  const session = await getSessionProfile();
  const identity = session.profile?.active_role
    ? baseIdentityForRole(session.profile.active_role)
    : null;
  const workspace = await getWorkspaceContext(identity);
  const activeId = workspace.activeWorkspaceId;
  if (activeId === PERSONAL_WORKSPACE_ID) return null;
  const active = workspace.workspaces.find(
    (w) => w.kind === "organization" && w.id === activeId,
  );
  return active ? active.id : null;
}

/** True when the membership row exists in THIS organization for the caller's
 *  RLS view — binds per-row commands to the selected workspace. */
async function membershipBelongsToOrg(
  membershipId: string,
  organizationId: string,
): Promise<boolean> {
  const supabase = await createClient();
  const { data, error } = await asAny(supabase)
    .from("company_memberships")
    .select("id")
    .eq("id", membershipId)
    .eq("organization_id", organizationId)
    .limit(1);
  if (error) return false;
  return ((data ?? []) as unknown[]).length === 1;
}

function mapResult(r: MembershipCommandResult): MembershipActionState {
  if (r.kind === "needs-migration") return { ok: false, code: "needs_migration" };
  if (r.kind === "error") return { ok: false, code: "error" };
  const SUCCESS: readonly MembershipCommandOutcome[] = [
    "invited",
    "accepted",
    "declined",
    "cancelled",
    "role_changed",
    "revoked",
    "left",
    "unchanged",
  ];
  return SUCCESS.includes(r.outcome)
    ? { ok: true, outcome: r.outcome }
    : { ok: false, code: r.outcome };
}

function parseRole(value: unknown): MembershipRole | null {
  const raw = String(value ?? "").trim();
  return (MEMBERSHIP_ROLES as readonly string[]).includes(raw)
    ? (raw as MembershipRole)
    : null;
}

export async function inviteMembershipAction(
  _prev: MembershipActionState | null,
  formData: FormData,
): Promise<MembershipActionState> {
  const email = String(formData.get("email") ?? "").trim();
  const role = parseRole(formData.get("role"));
  if (email === "" || role === null) return { ok: false, code: "invalid" };

  const orgId = await activeOrganizationId();
  if (!orgId) return { ok: false, code: "no_workspace" };

  const r = await inviteMembership(orgId, email, role);
  const state = mapResult(r);
  if (state.ok) revalidatePath("/", "layout");
  return state;
}

export async function acceptMembershipAction(
  _prev: MembershipActionState | null,
  formData: FormData,
): Promise<MembershipActionState> {
  const membershipId = String(formData.get("membershipId") ?? "").trim();
  if (membershipId === "") return { ok: false, code: "invalid" };
  const state = mapResult(await acceptMembership(membershipId));
  if (state.ok) revalidatePath("/", "layout");
  return state;
}

export async function declineMembershipAction(
  _prev: MembershipActionState | null,
  formData: FormData,
): Promise<MembershipActionState> {
  const membershipId = String(formData.get("membershipId") ?? "").trim();
  if (membershipId === "") return { ok: false, code: "invalid" };
  const state = mapResult(await declineMembership(membershipId));
  if (state.ok) revalidatePath("/", "layout");
  return state;
}

export async function cancelMembershipInviteAction(
  _prev: MembershipActionState | null,
  formData: FormData,
): Promise<MembershipActionState> {
  const membershipId = String(formData.get("membershipId") ?? "").trim();
  if (membershipId === "") return { ok: false, code: "invalid" };

  const orgId = await activeOrganizationId();
  if (!orgId) return { ok: false, code: "no_workspace" };
  if (!(await membershipBelongsToOrg(membershipId, orgId))) {
    return { ok: false, code: "not_found" };
  }

  const state = mapResult(await cancelMembershipInvite(membershipId));
  if (state.ok) revalidatePath("/", "layout");
  return state;
}

export async function changeMembershipRoleAction(
  _prev: MembershipActionState | null,
  formData: FormData,
): Promise<MembershipActionState> {
  const membershipId = String(formData.get("membershipId") ?? "").trim();
  const role = parseRole(formData.get("role"));
  if (membershipId === "" || role === null) return { ok: false, code: "invalid" };

  const orgId = await activeOrganizationId();
  if (!orgId) return { ok: false, code: "no_workspace" };
  if (!(await membershipBelongsToOrg(membershipId, orgId))) {
    return { ok: false, code: "not_found" };
  }

  const state = mapResult(await changeMembershipRole(membershipId, role));
  if (state.ok) revalidatePath("/", "layout");
  return state;
}

export async function revokeMembershipAction(
  _prev: MembershipActionState | null,
  formData: FormData,
): Promise<MembershipActionState> {
  const membershipId = String(formData.get("membershipId") ?? "").trim();
  if (membershipId === "") return { ok: false, code: "invalid" };

  const orgId = await activeOrganizationId();
  if (!orgId) return { ok: false, code: "no_workspace" };
  if (!(await membershipBelongsToOrg(membershipId, orgId))) {
    return { ok: false, code: "not_found" };
  }

  const state = mapResult(await revokeMembership(membershipId));
  if (state.ok) revalidatePath("/", "layout");
  return state;
}

export async function leaveOrganizationAction(
  _prev: MembershipActionState | null,
  _formData: FormData,
): Promise<MembershipActionState> {
  const orgId = await activeOrganizationId();
  if (!orgId) return { ok: false, code: "no_workspace" };
  const state = mapResult(await leaveOrganization(orgId));
  if (state.ok) revalidatePath("/", "layout");
  return state;
}
