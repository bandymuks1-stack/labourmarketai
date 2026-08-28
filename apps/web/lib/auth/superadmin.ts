import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  RoleSignalUnavailableError,
  readRoleSignal,
} from "@/lib/auth/profile-roles";

/**
 * Server-side superadmin authorization.
 *
 * Admin is recognised via a DUAL signal so a workspace switch
 * (`switchActiveRole` overwriting `profiles.active_role`) never
 * strips admin at the application layer:
 *
 *   (a) `public.profiles.active_role === 'admin'`  — legacy single
 *       source, still honoured for admins whose active_role is admin.
 *   (b) a row in `public.profile_roles` tagged `role = 'admin'` —
 *       inserted by `switchActiveRole` BEFORE it overwrites
 *       active_role, and by `admin:grant-superadmin --apply`. This
 *       signal survives any subsequent workspace switch.
 *
 * The SQL RLS helper `public.is_admin()` (migration 0003) still
 * reads only (a). That mismatch is intentional and explicit: a
 * full schema decoupling (helper checking profile_roles, or a
 * `profiles.is_admin boolean` column) is a follow-up migration.
 * Until then, RLS bypass on admin-only tables requires the admin
 * to have active_role='admin' in DB; the application-level gate
 * via these helpers always grants by (a) OR (b).
 *
 * Security posture:
 *
 *   - `isSuperadmin()` returns false fast for unauthenticated callers
 *     (no DB round-trip) AND for users whose profile row is absent
 *     (silent-fail safe-default).
 *   - `requireSuperadmin(locale)` does the same check and redirects
 *     non-admins to `/[locale]/dashboard` — the gate is server-side,
 *     enforced before any admin component renders.
 *   - Both functions are `server-only`, so importing into a client
 *     component fails the Next.js build.
 *
 * Honesty (2026-08-28): both reads used to swallow their PostgREST
 * error — the profile_roles read destructured it away entirely — so a
 * transient failure (cold DB connection, pooler hiccup) read as "not
 * an admin" and bounced a real admin off the admin tree with no
 * explanation. The reads now go through `readRoleSignal`, which
 * retries once and then throws instead of answering a question it
 * could not resolve. `requireSuperadmin` lets that throw reach the
 * route error boundary (an honest error beats a wrong denial);
 * `isSuperadmin`, a boolean permission probe used inside server
 * actions, still fails CLOSED — it never GRANTS on an unknown answer.
 *
 * Grant path: `pnpm admin:grant-superadmin --email ... --apply
 * --i-understand-this-mutates-production`. The grant is auditable;
 * read side is RLS-enforced (DB-level) and application-gated (here).
 */

/**
 * Throws `RoleSignalUnavailableError` when either read never answered.
 * A missing profile row is an ANSWER (not an admin), not a failure.
 */
async function readAdminSignals(userId: string): Promise<{
  activeRoleAdmin: boolean;
  profileRolesAdmin: boolean;
}> {
  const supabase = await createClient();
  const profile = await readRoleSignal("profiles.active_role", () =>
    supabase.from("profiles").select("active_role").eq("id", userId).maybeSingle(),
  );
  // RLS on profile_roles permits the user to read their own rows.
  const adminRow = await readRoleSignal("profile_roles.admin", () =>
    supabase
      .from("profile_roles")
      .select("role")
      .eq("profile_id", userId)
      .eq("role", "admin")
      .maybeSingle(),
  );
  return {
    activeRoleAdmin: profile?.active_role === "admin",
    profileRolesAdmin: !!adminRow,
  };
}

export async function isSuperadmin(): Promise<boolean> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;
  try {
    const { activeRoleAdmin, profileRolesAdmin } = await readAdminSignals(
      user.id,
    );
    return activeRoleAdmin || profileRolesAdmin;
  } catch (e) {
    // FAIL CLOSED, and only here: this boolean guards server actions, so an
    // unknown answer must never grant. It must not be reported to the user as
    // "you are not an admin" either — callers that render a denial should use
    // `requireSuperadmin`, which surfaces the error instead.
    if (e instanceof RoleSignalUnavailableError) return false;
    throw e;
  }
}

/**
 * Server-side gate for admin pages. Call as the FIRST awaited
 * statement in the admin page/server action so non-admins never see
 * the rendered content.
 *
 * Behavior:
 *   - unauthenticated user → redirect to /<locale>/auth/login;
 *   - authenticated non-admin → redirect to /<locale>/dashboard;
 *   - admin (active_role='admin' OR profile_roles has 'admin') → returns user.id;
 *   - the admin signals could not be READ → the error propagates (fails
 *     closed: the admin tree does not render) rather than pretending the
 *     answer was "not an admin".
 */
export async function requireSuperadmin(locale: string): Promise<string> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale}/auth/login`);

  const { activeRoleAdmin, profileRolesAdmin } = await readAdminSignals(
    user.id,
  );
  if (!activeRoleAdmin && !profileRolesAdmin) {
    redirect(`/${locale}/dashboard`);
  }
  return user.id;
}
