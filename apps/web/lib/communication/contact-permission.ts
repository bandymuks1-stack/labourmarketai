import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { deriveIsAdmin } from "@/lib/auth/admin-signal";
import { getEmployerOwnerProfileId } from "./employer-resolution";
import {
  evaluateContactPermission,
  type ContactPermissionState,
} from "./communication-eligibility";

/**
 * Contact permission resolver + safe counterpart identity reader
 * (§8.1 — product-tree branch 20).
 *
 * PERMISSION: `resolveContactPermission` gathers the REAL relationship facts
 * server-side (never trusted from the client) and maps them through the pure
 * `evaluateContactPermission` model:
 *   - engagement, worker → company: the caller's own accepted invitation
 *     resolves this profile as their employer (getEmployerOwnerProfileId —
 *     RLS reads only the caller's own row);
 *   - engagement, company → worker: the caller owns a company that has a
 *     company_workers link to this worker (owner-scoped RLS read);
 *   - admin: the dual admin signal (profiles.active_role + profile_roles).
 * The scouting state (`allowed_scouting_shortlist`) is NOT resolved here —
 * it belongs to the Step 4A action that verifies demand ownership +
 * shortlist + contactability, and is passed in as an already-verified grant.
 *
 * IDENTITY: `readCounterpartIdentities` is the safe counterpart identity
 * reader. It calls ONE gated SECURITY DEFINER read RPC
 * (`conversation_counterpart_identities`, migration 20260705170000 — DRAFT,
 * owner-gated apply) that returns ONLY the display name of the other
 * unrevoked participant of a 2-person direct conversation the CALLER
 * participates in. It never selects any other profile field and never
 * exposes a contact channel. Until the owner applies the migration the
 * reader degrades to an empty map, so the UI keeps today's honest
 * restricted state — no fabricated names, ever.
 *
 * INTERNAL-ONLY BOUNDARY: nothing here sends anything anywhere. A permission
 * only ever opens an IN-APP conversation.
 */

const RELATION_NOT_FOUND = "42P01";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(supabase: SupabaseClient): any {
  return supabase;
}

/**
 * Resolve the contact-permission state between the CALLER and one other
 * profile. Default-closed: unauthenticated, self, blank target, or any
 * read failure resolves the corresponding fact to false.
 */
export async function resolveContactPermission(
  otherProfileId: string,
  opts?: {
    /** Caller already proved the two profiles share an unrevoked direct
     *  conversation (e.g. the get-or-create dedupe hit). */
    sharesConversation?: boolean;
  },
): Promise<ContactPermissionState> {
  if (!otherProfileId) return "no_permission";
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || otherProfileId === user.id) return "no_permission";

  const [employerOwnerProfileId, employsWorker, isAdmin] = await Promise.all([
    getEmployerOwnerProfileId(),
    callerCompanyEmploysProfile(supabase, user.id, otherProfileId),
    callerIsAdmin(supabase, user.id),
  ]);

  return evaluateContactPermission({
    sharesConversation: opts?.sharesConversation === true,
    hasEngagement:
      employerOwnerProfileId === otherProfileId || employsWorker,
    scoutingAllowed: false, // Step 4A resolves this in its own gated action.
    isAdmin,
  });
}

/** Company → worker engagement: does a company OWNED by the caller hold a
 *  company_workers link to the target profile? Owner-scoped RLS reads only;
 *  degrades to false when the linking migration is absent (42P01). */
async function callerCompanyEmploysProfile(
  supabase: SupabaseClient,
  callerId: string,
  otherProfileId: string,
): Promise<boolean> {
  const { data: company } = await supabase
    .from("companies")
    .select("id")
    .eq("profile_id", callerId)
    .maybeSingle();
  if (!company?.id) return false;
  const { data, error } = await asAny(supabase)
    .from("company_workers")
    .select("worker_id, workers!inner(profile_id)")
    .eq("company_id", company.id)
    .eq("workers.profile_id", otherProfileId)
    .limit(1);
  if (error) {
    if (error.code !== RELATION_NOT_FOUND) {
      console.error("[contact-permission] engagement read failed:", error.message);
    }
    return false;
  }
  return (data ?? []).length > 0;
}

/** Real dual admin signal (same derivation the conversation detail page uses). */
async function callerIsAdmin(
  supabase: SupabaseClient,
  callerId: string,
): Promise<boolean> {
  const [{ data: profile }, { data: rolesRows }] = await Promise.all([
    supabase.from("profiles").select("active_role").eq("id", callerId).single(),
    supabase
      .from("profile_roles")
      .select("role")
      .eq("profile_id", callerId)
      .eq("is_active", true),
  ]);
  return deriveIsAdmin({
    activeRole: profile?.active_role ?? null,
    profileRoles: rolesRows ?? [],
  });
}

/**
 * Safe counterpart identity reader. Returns conversationId → display name
 * for the OTHER unrevoked participant of each 2-person direct conversation
 * the caller participates in — via the gated read RPC only. Empty map on
 * any error or while the migration is unapplied (honest degradation: the
 * UI keeps the restricted counterpart state). Only real, non-empty names
 * are mapped — nothing is fabricated.
 */
export async function readCounterpartIdentities(
  conversationIds: readonly string[],
): Promise<ReadonlyMap<string, string>> {
  const out = new Map<string, string>();
  const ids = [...new Set(conversationIds.filter((id) => !!id))];
  if (ids.length === 0) return out;
  const supabase = await createClient();
  const { data, error } = await asAny(supabase).rpc(
    "conversation_counterpart_identities",
    { p_conversation_ids: ids },
  );
  if (error || !Array.isArray(data)) return out;
  for (const row of data as Array<{
    conversation_id?: string | null;
    display_name?: string | null;
  }>) {
    const id = typeof row?.conversation_id === "string" ? row.conversation_id : null;
    const name =
      typeof row?.display_name === "string" ? row.display_name.trim() : "";
    if (id && name) out.set(id, name);
  }
  return out;
}
