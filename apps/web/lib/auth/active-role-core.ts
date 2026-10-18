import "server-only";

import type { DomainCaller } from "@/lib/domain/caller";
import type { Role } from "@/lib/auth/actions";
import { readHeldRoles } from "@/lib/auth/held-roles";
import {
  actingRoleForWorkspace,
  type WorkspaceActingRole,
  type WorkspaceInfo,
} from "@/lib/company/organization-switch";

/**
 * THE active-role write, as an explicit caller (owner program 2026-09-23).
 *
 * `switchActiveRole` (lib/auth/actions.ts) used to hold this inline, so the
 * workspace switch could only follow the identity by calling a SECOND server
 * action from the client — two non-atomic round trips, the second of which
 * could throw after the first had already moved the pointer — and the MCP
 * `context.switch` could not follow it at all. The logic moved here VERBATIM
 * (held-role check, admin preservation, the `active_role` UPDATE) so the web
 * role switch, the web workspace switch and the bearer workspace switch run
 * ONE implementation. What changed: the UPDATE's error is checked. It used to
 * be discarded, so a refused write answered as a completed switch.
 *
 * Server-only and NOT a server action: it takes a caller, which no browser
 * can construct.
 */

export type SetActiveRoleResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly code: "not-held" | "error" };

export async function setActiveRoleCore(
  caller: DomainCaller,
  role: Role,
): Promise<SetActiveRoleResult> {
  const supabase = caller.supabase;

  // sanity: the role must already be one the user holds
  const { data: held, error: heldError } = await supabase
    .from("profile_roles")
    .select("role")
    .eq("profile_id", caller.userId)
    .eq("role", role)
    .maybeSingle();
  if (heldError) {
    console.error("[setActiveRoleCore] held-role read failed", { code: heldError.code });
    return { ok: false, code: "error" };
  }
  if (!held) return { ok: false, code: "not-held" };

  // Preserve admin across workspace switches. Before overwriting
  // active_role, if the user is currently admin via active_role
  // (the legacy single-source signal) we MUST persist an admin row
  // in profile_roles so the app-level admin gate (dashboard layout,
  // requireSuperadmin) keeps recognising them after the switch.
  // Idempotent: a conflict on (profile_id, role) is a no-op. We do
  // NOT touch profiles.is_admin or any other column. The DB-level
  // RLS helper `public.is_admin()` still reads only active_role and
  // is documented as a follow-up migration.
  const { data: currentProfile } = await supabase
    .from("profiles")
    .select("active_role")
    .eq("id", caller.userId)
    .single();
  if (currentProfile?.active_role === "admin") {
    await supabase
      .from("profile_roles")
      .upsert(
        { profile_id: caller.userId, role: "admin" },
        { onConflict: "profile_id,role" },
      );
  }

  const { error } = await supabase
    .from("profiles")
    .update({ active_role: role })
    .eq("id", caller.userId);
  if (error) {
    console.error("[setActiveRoleCore] active_role update failed", { code: error.code });
    return { ok: false, code: "error" };
  }
  return { ok: true };
}

export type FollowWorkspaceRoleResult =
  | {
      readonly ok: true;
      /** The role the person now acts as in that workspace; null = no held
       *  role fits and the current one was kept. */
      readonly role: WorkspaceActingRole | null;
    }
  | { readonly ok: false; readonly code: "not-held" | "error" };

/**
 * Make the acting identity follow the workspace the person just switched to —
 * by their RELATIONSHIP to it (`actingRoleForWorkspace`, decision d3), never
 * by "holds the company role somewhere". Only a role the person holds is ever
 * activated; an unreadable role table activates nothing and says so.
 *
 * `workspace` is the membership row the switch core already validated (or
 * null for the personal space).
 */
export async function followWorkspaceRoleCore(
  caller: DomainCaller,
  workspace: WorkspaceInfo | null,
): Promise<FollowWorkspaceRoleResult> {
  const held = await readHeldRoles(caller.supabase, caller.userId);
  if (!held.known) return { ok: false, code: "error" };
  const role = actingRoleForWorkspace(workspace, [...held.roles]);
  if (!role) return { ok: true, role: null };
  const set = await setActiveRoleCore(caller, role);
  return set.ok ? { ok: true, role } : set;
}
