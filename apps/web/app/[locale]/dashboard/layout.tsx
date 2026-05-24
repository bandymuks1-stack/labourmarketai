import { redirect } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { AmbientGlow } from "@/components/decor/ambient-glow";
import { BottomNav } from "@/components/app/bottom-nav";
import { DashboardTabs } from "@/components/app/dashboard-tabs";
import { NotificationPanel } from "@/components/app/notification-panel";
import { RoleSwitcher } from "@/components/app/role-switcher";
import { LocaleSwitcher } from "@/components/marketing/locale-switcher";
import { AuthProvider } from "@/lib/auth/context";
import { type Role } from "@/lib/auth/actions";
import { Link } from "@/lib/i18n/navigation";
import { createClient } from "@/lib/supabase/server";

const ROLES = new Set<Role>(["worker", "company", "agency", "customer"]);

/** Authenticated shell for the /dashboard tree. Fetches user + profile +
 *  roles server-side once and hands them to the client AuthProvider so
 *  child widgets (RoleSwitcher, NotificationPanel) stay in sync. */
export default async function DashboardLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale}/auth/login`);

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, email, active_role, onboarded_at")
    .eq("id", user.id)
    .single();

  if (!profile?.onboarded_at) redirect(`/${locale}/onboarding`);

  const { data: rolesRows } = await supabase
    .from("profile_roles")
    .select("role")
    .eq("profile_id", user.id)
    .eq("is_active", true);

  const roles = (rolesRows ?? [])
    .map((r) => r.role)
    .filter((r): r is Role => ROLES.has(r as Role));
  // Admin is NOT a workspace role (the role catalogue only knows worker/
  // company/agency/customer/preparing-roles). When the user is admin we
  // surface that fact via a SEPARATE flag — see role-switcher.tsx for
  // the rendering. activeRole continues to fall back to the user's first
  // user-facing role so the dashboard's tab/nav surfaces still have a
  // workspace context to render in.
  const isAdmin = profile.active_role === "admin";
  const activeRole = ROLES.has(profile.active_role as Role)
    ? (profile.active_role as Role)
    : (roles[0] ?? null);

  return (
    <AuthProvider
      initial={{
        user: { id: user.id, email: user.email ?? null },
        profile: {
          full_name: profile.full_name,
          email: profile.email,
        },
        activeRole,
        roles,
        isAdmin,
        notifications: [],
      }}
    >
      <div className="relative min-h-screen">
        <AmbientGlow />
        <header className="sticky top-0 z-30 border-b border-ink-600/60 bg-ink-900/85 backdrop-blur-md md:relative md:z-20 md:bg-transparent md:backdrop-blur-none">
          <div className="mx-auto flex h-14 max-w-container items-center gap-6 px-6 md:h-auto md:py-3 sm:px-12">
            <Link
              href="/"
              className="font-display text-lg font-bold tracking-tightest text-text-primary"
            >
              labourmarket<span className="text-gradient-accent">.ai</span>
            </Link>
            <DashboardTabs className="hidden md:flex" />
            <div className="ml-auto flex items-center gap-3">
              <LocaleSwitcher className="hidden md:flex" />
              <NotificationPanel />
              <RoleSwitcher />
            </div>
          </div>
        </header>
        {/* Mobile safe bottom — clears the fixed bottom nav (h-16) PLUS an
            extra rem for breathing room so form CTAs (Patvirtinti įrašą /
            Pridėti) never sit flush against the nav (Mobile UX §3-§4). */}
        <main className="relative z-10 mx-auto max-w-container px-6 py-10 pb-[calc(5rem+env(safe-area-inset-bottom))] sm:px-12 md:pb-10">
          {children}
        </main>
        <BottomNav />
      </div>
    </AuthProvider>
  );
}
