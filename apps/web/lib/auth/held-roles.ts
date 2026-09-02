import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  RoleSignalUnavailableError,
  readActiveProfileRoles,
} from "@/lib/auth/profile-roles";
import type { Role } from "./actions";

/**
 * The roles a person ACTUALLY holds, for a READ that must not invent one.
 *
 * The conversation dispatcher has a near-identical query with a deliberately
 * DIFFERENT fallback: on an ANSWERED-EMPTY read it assumes `worker`, so a
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
 *
 * `known` is the half that used to be missing (#1314). The docstring above has
 * always promised "the caller must be able to tell an empty role set from an
 * unread one", but the code returned a bare `Set` built from `data ?? []`: a
 * failed read and a person with no roles were the same value. Callers now get
 * the distinction they were documented to have — and `known: false` always
 * comes with an EMPTY set, so a caller that ignores the flag still grants
 * nothing.
 */
export async function readHeldRoles(
  supabase: SupabaseClient,
  profileId: string,
): Promise<{ roles: Set<Role>; known: boolean }> {
  try {
    const rows = await readActiveProfileRoles(() =>
      supabase
        .from("profile_roles")
        .select("role")
        .eq("profile_id", profileId)
        .eq("is_active", true),
    );
    return {
      roles: new Set<Role>(rows.map((r) => r.role as Role)),
      known: true,
    };
  } catch (e) {
    // Fail CLOSED: an unreadable role table grants nothing — and says so,
    // rather than passing an empty set off as the answer.
    if (e instanceof RoleSignalUnavailableError) {
      return { roles: new Set<Role>(), known: false };
    }
    throw e;
  }
}
