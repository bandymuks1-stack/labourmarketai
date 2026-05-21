import { redirect } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { AmbientGlow } from "@/components/decor/ambient-glow";
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
        notifications: [],
      }}
    >
      <div className="relative min-h-screen">
        <AmbientGlow />
        <header className="relative z-20 border-b border-ink-600/60">
          <div className="mx-auto flex max-w-container items-center gap-6 px-6 py-3 sm:px-12">
            <Link
              href="/"
              className="font-display text-lg font-bold tracking-tightest text-text-primary"
            >
              labourmarket<span className="text-gradient-accent">.ai</span>
            </Link>
            <DashboardTabs />
            <div className="ml-auto flex items-center gap-3">
              <LocaleSwitcher className="hidden sm:flex" />
              <NotificationPanel />
              <RoleSwitcher />
            </div>
          </div>
        </header>
        <main className="relative z-10 mx-auto max-w-container px-6 py-10 sm:px-12">
          {children}
        </main>
      </div>
    </AuthProvider>
  );
}
