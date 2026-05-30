"use server";

import "server-only";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

/**
 * Canonical membership + verified-proof actions for the keystone
 * (feat/cc/membership-engagement-reroute). Every privileged step goes through a
 * SECURITY DEFINER RPC on the engagement_contexts model — NEVER a raw
 * cross-profile write and NEVER the legacy company_workers/agency_workers tables.
 *
 * Why RPCs (not direct table writes): engagement_contexts write RLS is own-only
 * (`profile_id = auth.uid()`) and worker_skills write RLS is `owns_worker`, so a
 * manager/owner cannot insert a worker's membership or flip a worker's skill from
 * their own session — those must run inside a definer RPC that enforces authority
 * internally. (This is why the old app-layer confirm silently failed to verify:
 * its worker_skills update ran as the manager and was RLS-blocked.)
 *
 * NOTE: these RPCs are introduced by migration
 * 20260530140000_membership_engagement_reroute (committed, applied via MCP after
 * the gate). Until `pnpm db:types` is regenerated post-apply, they are not in the
 * generated Database type, so calls use a narrow rpc-cast (the repo's existing
 * pattern for not-yet-typed RPCs).
 */

type DB = Awaited<ReturnType<typeof createClient>>;

// Narrow, explicit cast for RPCs not yet in the generated Database type.
function rpc(supabase: DB, name: string, args: Record<string, unknown>) {
  return (
    supabase.rpc as unknown as (
      n: string,
      a: Record<string, unknown>,
    ) => Promise<{ data: unknown; error: { message: string } | null }>
  )(name, args);
}

export type MembershipResult = { ok: boolean; code: string; message?: string };

async function requireUser(supabase: DB): Promise<string> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  return user.id;
}

/** Owner brings a worker into their organization (canonical employee engagement,
 *  hash-chained). Reuses the engagement_contexts model, not company_workers. */
export async function addOrgMember(
  orgId: string,
  workerId: string,
): Promise<MembershipResult> {
  const supabase = await createClient();
  await requireUser(supabase);
  const { data, error } = await rpc(supabase, "add_org_member", {
    p_org_id: orgId,
    p_worker_id: workerId,
  });
  if (error) return { ok: false, code: "error", message: error.message };
  const code = String(data ?? "");
  return { ok: code === "added" || code === "already_member", code };
}

/** Owner grants a manager engagement (+ operational role) so a foreman/PM gains
 *  review authority. Owner-only (no manager self-escalation). */
export async function grantOrgManager(
  orgId: string,
  profileId: string,
  operationsRole: string | null = null,
): Promise<MembershipResult> {
  const supabase = await createClient();
  await requireUser(supabase);
  const { data, error } = await rpc(supabase, "grant_org_manager", {
    p_org_id: orgId,
    p_profile_id: profileId,
    p_operations_role: operationsRole,
  });
  if (error) return { ok: false, code: "error", message: error.message };
  const code = String(data ?? "");
  return { ok: code === "granted" || code === "already_manager", code };
}

/** Owner/manager opens a worker's journal for review (flag on the worker's
 *  employee engagement). */
export async function setEngagementJournalReview(
  engagementId: string,
  enabled: boolean,
): Promise<MembershipResult> {
  const supabase = await createClient();
  await requireUser(supabase);
  const { data, error } = await rpc(supabase, "set_engagement_journal_review", {
    p_engagement_id: engagementId,
    p_enabled: enabled,
  });
  if (error) return { ok: false, code: "error", message: error.message };
  const code = String(data ?? "");
  return { ok: code === "enabled" || code === "disabled", code };
}

/** THE PROOF STEP. A manager approves an entry and confirms which declared
 *  skills it proves; those worker_skills flip to verified (manager_confirmed).
 *  Returns the number of skills newly verified. */
export async function confirmEntryAndVerifySkills(
  entryId: string,
  skillIds: string[],
  note: string | null,
  locale = "lt",
): Promise<MembershipResult & { verified?: number }> {
  if (skillIds.length === 0) return { ok: false, code: "no_skills" };
  const supabase = await createClient();
  await requireUser(supabase);
  const { data, error } = await rpc(supabase, "confirm_entry_and_verify_skills", {
    p_entry_id: entryId,
    p_skill_ids: skillIds,
    p_note: note,
  });
  if (error) return { ok: false, code: "error", message: error.message };
  const code = String(data ?? "");
  if (code.startsWith("verified:")) {
    revalidatePath(`/${locale}/dashboard/inbox`);
    revalidatePath(`/${locale}/dashboard/journal`);
    revalidatePath(`/${locale}/dashboard/profile`);
    return { ok: true, code: "verified", verified: Number(code.split(":")[1] ?? 0) };
  }
  return { ok: false, code };
}
