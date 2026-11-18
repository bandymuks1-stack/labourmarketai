import "server-only";

import { cache } from "react";

import { deriveIsAdmin } from "@/lib/auth/admin-signal";
import { readActiveProfileRoles } from "@/lib/auth/profile-roles";
import { getSessionProfile } from "@/lib/auth/session-profile";
import { createClient } from "@/lib/supabase/server";

/**
 * THE caller's platform-admin signal for a page BODY, request-cached.
 *
 * The dashboard shell derives `isAdmin` (`deriveIsAdmin`: `profiles.active_role
 * = 'admin'` OR an active `profile_roles.admin` row — the same dual signal the
 * SQL `is_admin()` policy arm reads, migration 0024) and hands it to the
 * chrome. A page cannot receive a layout's props, so a page body that must SAY
 * what the database will do (`ManagerScopeNotice`) needs the same answer from
 * the same reads. This composes what already exists — the ONE session profile
 * read (`getSessionProfile`, `cache()`d and shared with the shell, so it costs
 * no round-trip here) and the canonical active `profile_roles` read — through
 * the ONE derivation, so no page re-implements the dual signal. `cache()`
 * makes it one `profile_roles` query per request however many components ask.
 *
 * NOT the workspace context: admin is a PERMISSION, independent of the
 * workspace the person is standing in (`lib/auth/admin-signal.ts`), and the
 * shell's single `getWorkspaceContext()` read (W9) stays the only one.
 *
 * Failure semantics follow the page gate on the same request: an unanswered
 * roles read THROWS (`RoleSignalUnavailableError`, after one retry) rather
 * than answering "not an admin" — a notice rendered from a role state nobody
 * could read would be a confident wrong sentence. No session → false, no read.
 */
export const getSessionIsAdmin = cache(async function getSessionIsAdmin(): Promise<boolean> {
  const session = await getSessionProfile();
  if (!session.user) return false;
  const userId = session.user.id;
  const supabase = await createClient();
  const rolesRows = await readActiveProfileRoles(() =>
    supabase
      .from("profile_roles")
      .select("role")
      .eq("profile_id", userId)
      .eq("is_active", true),
  );
  return deriveIsAdmin({
    activeRole: session.profile?.active_role ?? null,
    profileRoles: rolesRows,
  });
});
