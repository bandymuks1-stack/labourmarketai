import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { readActiveProfileRoles } from "@/lib/auth/profile-roles";
import { type Role } from "@/lib/auth/actions";

/**
 * Server-side role gate for role-context dashboards (company / agency
 * / buyer). Companion to `lib/auth/superadmin.ts`.
 *
 * Behavior:
 *
 *   - unauthenticated user → redirect to /<locale>/auth/login;
 *   - authenticated user whose `profile_roles` does NOT include the
 *     expected role → redirect to /<locale>/dashboard (the general
 *     overview), where the role-switcher can be used to add the role;
 *   - authenticated user who has the role → returns user.id;
 *   - the roles read FAILED (it did not answer) → the error propagates
 *     to the route error boundary. See below.
 *
 * Note: we check `profile_roles` (the user's catalogue of held roles),
 * NOT `profiles.active_role` (the currently-viewed workspace). A user
 * is allowed onto the company dashboard the moment they hold the
 * `company` role — even if their active_role is currently 'worker'.
 * This matches the product doctrine "role choice is an entry point,
 * not a prison" + "a person can grow into multiple roles".
 *
 * Honesty (2026-08-28): "the read said you do not hold this role" and
 * "the read did not answer" are DIFFERENT states and only the first one
 * may emit `?notice=needs_<role>_role`. This gate used to destructure
 * the PostgREST error away, so a transient failure (cold DB connection
 * on the first request after a boot, pooler hiccup) produced an empty
 * role set and told a `worker / is_active=true` user they lack the
 * worker role — an infrastructure fault presented as a fact about
 * their account. `readActiveProfileRoles` retries once and then throws;
 * a thrown `RoleSignalUnavailableError` fails CLOSED (the user does
 * not enter the role space) onto the honest generic error surface
 * (`app/[locale]/error.tsx`) instead of a false claim about their roles.
 */
export async function requireRoleOrRedirect(
  locale: string,
  expectedRole: Role,
): Promise<string> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale}/auth/login`);

  // Throws RoleSignalUnavailableError when the read never answered — NOT
  // caught here on purpose: an unknown role state must never be narrowed into
  // "you do not hold this role".
  const rolesRows = await readActiveProfileRoles(() =>
    supabase
      .from("profile_roles")
      .select("role")
      .eq("profile_id", user.id)
      .eq("is_active", true),
  );

  const heldRoles = new Set(rolesRows.map((r) => r.role as string));
  if (!heldRoles.has(expectedRole)) {
    // Never a silent bounce (audit PR4): the overview renders a banner
    // explaining WHICH space the link needed and where to add that role,
    // instead of teleporting the user home with zero explanation. Reached
    // ONLY when the read answered, so the banner is always a true statement.
    redirect(`/${locale}/dashboard?notice=needs_${expectedRole}_role`);
  }
  return user.id;
}
