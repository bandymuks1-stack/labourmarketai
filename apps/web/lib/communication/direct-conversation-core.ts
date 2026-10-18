import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { deriveIsAdmin } from "@/lib/auth/admin-signal";

import {
  createConversationCore,
  type CommunicationCaller,
  type CommunicationResult,
} from "./communication-core";
import {
  evaluateContactPermission,
  isContactPermitted,
  type ContactPermissionState,
} from "./communication-eligibility";
import { issueContactAuthority } from "./contact-authority";

/**
 * THE direct (1:1) conversation core for an EXPLICIT caller (G4 bridge,
 * 2026-09-30): find the thread two people already share, or — only when the
 * §8.1 contact-permission gate holds — open a new one through the SAME
 * `createConversationCore` the web runs. `getOrCreateDirectConversation`
 * (cookie session) uses `findExistingDirectConversation` from here, so the
 * dedupe rule exists once.
 *
 * PERMISSION for an explicit caller is the SAME §8.1 evaluator
 * (`evaluateContactPermission`) over the same facts — existing shared thread,
 * engagement, platform admin — with ONE scoped engagement fact added for the
 * project case (owner 2026-09-30: contact the people on a project): the caller
 * MANAGES the named project (`can_manage_project`, the database's own gate) AND
 * the recipient is ACTIVELY assigned to it. That is a real, current work
 * relationship → `allowed_engagement`. No new permission state; nothing wider.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(c: SupabaseClient): any {
  return c;
}

/** The oldest DIRECT conversation both profiles are participants of, if any. */
export async function findExistingDirectConversation(
  supabase: SupabaseClient,
  userId: string,
  otherProfileId: string,
): Promise<string | null> {
  const { data: mine } = await supabase
    .from("conversation_participants")
    .select("conversation_id")
    .eq("profile_id", userId);
  const myConvIds = [
    ...new Set(
      (mine ?? [])
        .map((r) => (r as { conversation_id: string | null }).conversation_id)
        .filter((v): v is string => typeof v === "string"),
    ),
  ];
  if (myConvIds.length === 0) return null;
  const { data: shared } = await supabase
    .from("conversation_participants")
    .select("conversation_id")
    .eq("profile_id", otherProfileId)
    .in("conversation_id", myConvIds);
  const sharedIds = [
    ...new Set(
      (shared ?? [])
        .map((r) => (r as { conversation_id: string | null }).conversation_id)
        .filter((v): v is string => typeof v === "string"),
    ),
  ];
  if (sharedIds.length === 0) return null;
  const { data: direct } = await supabase
    .from("conversations")
    .select("id, created_at")
    .in("id", sharedIds)
    .eq("kind", "direct")
    .order("created_at", { ascending: true })
    .limit(1);
  const existing = (direct ?? [])[0] as { id: string } | undefined;
  return existing?.id ?? null;
}

/** Project engagement: the caller manages THIS project and the recipient is
 *  actively assigned to it. Both facts are read under the caller's own RLS
 *  and the database's own `can_manage_project`. */
export async function managesProjectOf(
  caller: CommunicationCaller,
  projectId: string,
  otherProfileId: string,
): Promise<boolean> {
  const { data: manages, error } = await asAny(caller.supabase).rpc("can_manage_project", {
    p_project_id: projectId,
  });
  if (error || manages !== true) return false;
  const { data } = await asAny(caller.supabase)
    .from("project_worker_assignments")
    .select("id, workers!inner(profile_id)")
    .eq("project_id", projectId)
    .eq("status", "active")
    .eq("workers.profile_id", otherProfileId)
    .limit(1);
  return (data ?? []).length > 0;
}

/**
 * TEAM: the caller and the other profile are on ONE team — both hold an ACTIVE
 * governance membership (company_memberships) of, or an ACTIVE engagement
 * (engagement_contexts) in, the same organization. Every read is the CALLER'S
 * OWN RLS read, so the database decides what is visible: a member sees the
 * members of the organizations they belong to; a manager sees the engaged
 * people of the organizations they manage; anyone else sees nothing and the
 * answer is false (default-closed). No service role, no new policy.
 */
export async function callerSharesTeamWith(
  caller: CommunicationCaller,
  otherProfileId: string,
): Promise<boolean> {
  if (!otherProfileId || otherProfileId === caller.userId) return false;
  const db = asAny(caller.supabase);
  const [mem, eng] = await Promise.all([
    db
      .from("company_memberships")
      .select("organization_id")
      .eq("profile_id", caller.userId)
      .eq("status", "active"),
    db
      .from("engagement_contexts")
      .select("organization_id")
      .eq("profile_id", caller.userId)
      .eq("status", "active"),
  ]);
  const myOrgs = [
    ...new Set(
      [...((mem.data ?? []) as { organization_id: string | null }[]), ...((eng.data ?? []) as { organization_id: string | null }[])]
        .map((r) => r.organization_id)
        .filter((v): v is string => typeof v === "string"),
    ),
  ];
  if (myOrgs.length === 0) return false;
  const [theirMem, theirEng] = await Promise.all([
    db
      .from("company_memberships")
      .select("organization_id")
      .eq("profile_id", otherProfileId)
      .eq("status", "active")
      .in("organization_id", myOrgs)
      .limit(1),
    db
      .from("engagement_contexts")
      .select("organization_id")
      .eq("profile_id", otherProfileId)
      .eq("status", "active")
      .in("organization_id", myOrgs)
      .limit(1),
  ]);
  return (theirMem.data ?? []).length > 0 || (theirEng.data ?? []).length > 0;
}

async function callerIsAdmin(caller: CommunicationCaller): Promise<boolean> {
  const [{ data: profile }, { data: rolesRows }] = await Promise.all([
    caller.supabase.from("profiles").select("active_role").eq("id", caller.userId).single(),
    caller.supabase.from("profile_roles").select("role").eq("profile_id", caller.userId).eq("is_active", true),
  ]);
  return deriveIsAdmin({ activeRole: profile?.active_role ?? null, profileRoles: rolesRows ?? [] });
}

export type DirectContactPlan =
  | { kind: "existing"; conversationId: string; permission: "allowed_existing_conversation" }
  | { kind: "new"; permission: ContactPermissionState }
  | { kind: "refused"; permission: "no_permission" };

/** Decide — writing nothing — whether the caller may reach this person, and
 *  whether a thread already exists. */
export async function planDirectContact(
  caller: CommunicationCaller,
  otherProfileId: string,
  opts: { projectId?: string | null } = {},
): Promise<DirectContactPlan> {
  if (!otherProfileId || otherProfileId === caller.userId) return { kind: "refused", permission: "no_permission" };
  const existing = await findExistingDirectConversation(caller.supabase, caller.userId, otherProfileId);
  if (existing) return { kind: "existing", conversationId: existing, permission: "allowed_existing_conversation" };
  const [projectEngagement, sharesTeam, isAdmin] = await Promise.all([
    opts.projectId ? managesProjectOf(caller, opts.projectId, otherProfileId) : Promise.resolve(false),
    callerSharesTeamWith(caller, otherProfileId),
    callerIsAdmin(caller),
  ]);
  const permission = evaluateContactPermission({
    sharesConversation: false,
    hasEngagement: projectEngagement,
    scoutingAllowed: false,
    isAdmin,
    sharesTeam,
  });
  return isContactPermitted(permission) ? { kind: "new", permission } : { kind: "refused", permission: "no_permission" };
}

/** Get the shared thread, or open one when the plan allows — through the ONE
 *  createConversationCore. */
export async function getOrCreateDirectConversationCore(
  caller: CommunicationCaller,
  otherProfileId: string,
  opts: { subject?: string | null; projectId?: string | null; locale: string },
): Promise<CommunicationResult<{ id: string; created: boolean; permission: ContactPermissionState }>> {
  const plan = await planDirectContact(caller, otherProfileId, { projectId: opts.projectId });
  if (plan.kind === "existing") {
    return { ok: true, data: { id: plan.conversationId, created: false, permission: plan.permission } };
  }
  if (plan.kind === "refused") {
    return { ok: false, code: "no_permission", message: "Nėra ryšio, leidžiančio pradėti pokalbį su šiuo asmeniu." };
  }
  const created = await createConversationCore(
    caller,
    {
      subject: opts.subject ?? null,
      kind: "direct",
      participantProfileIds: [otherProfileId],
      locale: opts.locale,
    },
    // The plan above IS the §8.1 gate (planDirectContact); its permission is the proof.
    issueContactAuthority(plan.permission) ?? undefined,
  );
  if (!created.ok) return created;
  return { ok: true, data: { id: created.data.id, created: true, permission: plan.permission } };
}
