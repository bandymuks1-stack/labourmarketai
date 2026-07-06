import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
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
 *   - authenticated user who has the role → returns user.id.
 *
 * Note: we check `profile_roles` (the user's catalogue of held roles),
 * NOT `profiles.active_role` (the currently-viewed workspace). A user
 * is allowed onto the company dashboard the moment they hold the
 * `company` role — even if their active_role is currently 'worker'.
 * This matches the product doctrine "role choice is an entry point,
 * not a prison" + "a person can grow into multiple roles".
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

  const { data: rolesRows } = await supabase
    .from("profile_roles")
    .select("role")
    .eq("profile_id", user.id)
    .eq("is_active", true);

  const heldRoles = new Set(
    (rolesRows ?? []).map((r) => r.role as string),
  );
  if (!heldRoles.has(expectedRole)) {
    // Never a silent bounce (audit PR4): the overview renders a banner
    // explaining WHICH space the link needed and where to add that role,
    // instead of teleporting the user home with zero explanation.
    redirect(`/${locale}/dashboard?notice=needs_${expectedRole}_role`);
  }
  return user.id;
}
