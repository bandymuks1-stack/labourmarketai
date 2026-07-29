import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Role } from "./actions";

/**
 * The roles a person ACTUALLY holds, for a READ that must not invent one.
 *
 * The conversation dispatcher has a near-identical query with a deliberately
 * DIFFERENT fallback: on an empty or failed read it assumes `worker`, so a
 * brand-new account can still act. That default is right for an execution path
 * and wrong for a context read — telling the AI "you are a worker" when the
 * role table did not answer would make every downstream statement about
 * permissions a guess presented as a fact.
 *
 * So this reader fails CLOSED and returns nothing, and the caller says
 * "permissions unknown". The dispatcher keeps its own fallback: changing an
 * authorization default is not something a workspace slice gets to do quietly.
 *
 * `is_active` is part of the query, not an afterthought: a deactivated role row
 * must never grant anything.
 */
export async function readHeldRoles(
  supabase: SupabaseClient,
  profileId: string,
): Promise<Set<Role>> {
  try {
    const { data } = await supabase
      .from("profile_roles")
      .select("role")
      .eq("profile_id", profileId)
      .eq("is_active", true);
    return new Set<Role>(((data ?? []) as { role: string }[]).map((r) => r.role as Role));
  } catch {
    // Fail CLOSED: an unreadable role table grants nothing.
    return new Set<Role>();
  }
}
