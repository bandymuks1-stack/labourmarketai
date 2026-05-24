import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/**
 * Server-side superadmin authorization.
 *
 * Source of truth: `public.profiles.active_role === 'admin'`. The SQL
 * helper `public.is_admin()` (migration 0003) reads the same column;
 * RLS policies on profiles + profile_skill_claims grant admin reads
 * via that helper, so admin queries can use the regular user-scoped
 * Supabase client — no service-role required for read-only inspection.
 *
 * Security posture:
 *
 *   - `isSuperadmin()` returns false fast for unauthenticated callers
 *     (no DB round-trip) AND for users whose profile lookup fails
 *     (silent-fail safe-default).
 *   - `requireSuperadmin(locale)` does the same check and redirects
 *     non-admins to `/[locale]/dashboard` — the gate is server-side,
 *     enforced before any admin component renders.
 *   - Both functions are `server-only`, so importing into a client
 *     component fails the Next.js build.
 *
 * Grant path: `pnpm admin:grant-superadmin --email ... --apply
 * --i-understand-this-mutates-production` (scripts/admin-promote.ts).
 * The grant is auditable; the read side is RLS-enforced.
 */

export async function isSuperadmin(): Promise<boolean> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;

  // RLS on profiles allows the user to read their own row; we read
  // active_role and check it against the canonical 'admin' value.
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("active_role")
    .eq("id", user.id)
    .single();

  if (error || !profile) return false;
  return profile.active_role === "admin";
}

/**
 * Server-side gate for admin pages. Call as the FIRST awaited
 * statement in the admin page/server action so non-admins never see
 * the rendered content.
 *
 * Behavior:
 *   - unauthenticated user → redirect to /<locale>/auth/login;
 *   - authenticated non-admin → redirect to /<locale>/dashboard;
 *   - admin → returns the user.id so the caller can use it.
 */
export async function requireSuperadmin(locale: string): Promise<string> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale}/auth/login`);

  const { data: profile } = await supabase
    .from("profiles")
    .select("active_role")
    .eq("id", user.id)
    .single();

  if (profile?.active_role !== "admin") {
    redirect(`/${locale}/dashboard`);
  }
  return user.id;
}
