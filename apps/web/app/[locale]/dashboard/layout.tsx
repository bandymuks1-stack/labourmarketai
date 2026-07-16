import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { AmbientGlow } from "@/components/decor/ambient-glow";
import { BottomNav } from "@/components/app/bottom-nav";
import { DashboardTabs } from "@/components/app/dashboard-tabs";
import { HeaderSearch } from "@/components/app/header-search";
import { LanguageFeedbackWidget } from "@/components/app/language-feedback-widget";
import { NotificationPanel } from "@/components/app/notification-panel";
import { RoleSwitcher } from "@/components/app/role-switcher";
import { SessionTelemetry } from "@/components/app/session-telemetry";
import { AccountMenu } from "@/components/app/account-menu";
import { LocaleSwitcher } from "@/components/marketing/locale-switcher";
import { AuthProvider } from "@/lib/auth/context";
import { type Role } from "@/lib/auth/actions";
import { deriveIsAdmin } from "@/lib/auth/admin-signal";
import { readAdminUiHidden } from "@/lib/auth/admin-ui-pref";
import { baseIdentityForRole } from "@/lib/config/roles";
import { getActiveOrganizationContext } from "@/lib/company/active-organization";
import type { SwitchableOrganization } from "@/lib/company/organization-switch";
import { getOwnCompany } from "@/lib/company/company-setup";
import { Link } from "@/lib/i18n/navigation";
import { getSessionProfile } from "@/lib/auth/session-profile";
import { createClient } from "@/lib/supabase/server";
import { buildNavBadges, getSpineCounts } from "@/lib/notifications/spine";
import { buildSpineNotifications } from "@/lib/notifications/spine-signals";

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
  const footerT = await getTranslations("footer");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale}/auth/login`);

  // Wagon 2 (nav performance): the profile row comes from the ONE
  // request-cached session-profile reader shared with the overview page and
  // the premium hub — previously three independent `profiles` SELECTs per
  // navigation. It runs in parallel with the independent profile_roles and
  // notification-spine reads (getUser above is memoized on the shared client,
  // so the reader adds no extra auth round-trip). Every route under the
  // dashboard tree pays this layout cost, so the saving compounds. (Avoid
  // writing the literal slash-star sequence in this comment: the project's
  // source-level guards run a comment-stripping regex that treats it as a
  // block comment opener and would consume past this Promise.all into the
  // JSX below.)
  const [session, rolesRes, spineCounts] = await Promise.all([
    getSessionProfile(),
    supabase
      .from("profile_roles")
      .select("role")
      .eq("profile_id", user.id)
      .eq("is_active", true),
    // Notification spine v1 — ONE parallel read of every derived attention
    // signal (unread threads, pending requests/bookings, responses since
    // seen, pending invitations). The bell, the nav badges and the dashboard
    // cards all trace to these same per-surface helpers, so the surfaces can
    // never disagree. Defensive: each count returns 0 on any missing-data
    // state, so a signal read never breaks the auth shell.
    getSpineCounts(),
  ]);
  const profile = session.profile;
  const rolesRows = rolesRes.data;
  const navBadges = buildNavBadges(spineCounts);

  if (!profile?.onboarded_at) redirect(`/${locale}/onboarding`);

  const roles = (rolesRows ?? [])
    .map((r) => r.role)
    .filter((r): r is Role => ROLES.has(r as Role));
  // Admin is NOT a workspace role (the role catalogue only knows worker/
  // company/agency/customer/preparing-roles). Permission and workspace
  // are independent dimensions: admin lives on a SEPARATE signal so
  // that switching workspaces (worker -> company) never strips admin
  // in the UI. See `deriveIsAdmin` for the dual signal — active_role
  // OR a `profile_roles` row tagged 'admin'. The SQL helper
  // `public.is_admin()` still reads only `active_role` for the RLS
  // bypass; full schema decoupling is a follow-up migration.
  const isAdmin = deriveIsAdmin({
    activeRole: profile.active_role,
    profileRoles: rolesRows ?? [],
  });
  // Display-only admin-UI preference (Fix D) — never a permission change.
  const adminUiHidden = isAdmin ? await readAdminUiHidden() : false;
  const activeRole = ROLES.has(profile.active_role as Role)
    ? (profile.active_role as Role)
    : (roles[0] ?? null);

  // Company identity → surface WHICH organization is active in the header so
  // switching person ↔ company is unambiguous. Read-only, RLS-scoped;
  // resolved ONLY for the company identity (the person identity skips the
  // queries). Null — never a fabricated name — when no company row exists
  // yet, so the header only claims an org when one is real.
  //
  // Company architecture v1: the ACTIVE organization now comes from the
  // membership-validated server pointer (profiles.active_organization_id,
  // owner-gated migration). A multi-company profile gets the org list for
  // the header switcher; while the migration is unapplied (or the org read
  // model is absent) we fall back to the legacy single-company read exactly
  // as before — no switcher, honest single-company behaviour.
  let activeOrgName: string | null = null;
  let organizations: SwitchableOrganization[] = [];
  let activeOrganizationId: string | null = null;
  if (activeRole && baseIdentityForRole(activeRole) === "company") {
    const orgContext = await getActiveOrganizationContext();
    if (orgContext.activeOrganization) {
      activeOrgName = orgContext.activeOrganization.name;
      activeOrganizationId = orgContext.activeOrganizationId;
      // The switcher list is populated ONLY when switching can really
      // persist (pointer column applied) AND there is more than one org.
      if (orgContext.canSwitch) {
        organizations = orgContext.organizations.map((o) => ({
          id: o.id,
          name: o.name,
        }));
      }
    } else {
      const company = await getOwnCompany();
      if (company.kind === "ok" && company.row) {
        activeOrgName = company.row.displayName ?? company.row.legalName ?? null;
      }
    }
  }

  // Derived-signal notifications (audit PR5 → spine v1): the bell states
  // only what is REALLY true right now. The signal catalogue lives in
  // lib/notifications/spine-signals.ts — each row links the exact surface
  // that clears it (visiting IS the read event) — no notifications table,
  // no fake "mark read".
  const notifications = buildSpineNotifications(
    spineCounts,
    activeRole ?? "worker",
  );

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
        adminUiHidden,
        activeOrgName,
        organizations,
        activeOrganizationId,
        notifications,
      }}
    >
      <div className="relative min-h-screen">
        <SessionTelemetry />
        <AmbientGlow />
        <header className="sticky top-0 z-30 border-b border-ink-600/60 bg-ink-900/85 backdrop-blur-md md:relative md:z-20 md:bg-transparent md:backdrop-blur-none">
          <div className="mx-auto flex h-14 max-w-container items-center gap-3 px-3 md:h-auto md:py-3 md:gap-6 sm:px-12">
            {/* App-shell logo links to the dashboard, NOT the public home —
                clicking it inside the authenticated app keeps the user in
                their workspace (never bounce to the marketing site / out of
                the session). The public marketing logo still points to "/". */}
            <Link
              href="/dashboard"
              className="min-w-0 shrink truncate font-display text-lg font-bold tracking-tightest text-text-primary"
            >
              LabourMarket<span className="text-gradient-accent">.ai</span>
            </Link>
            <DashboardTabs className="hidden md:flex" badges={navBadges} />
            <div className="ml-auto flex shrink-0 items-center gap-2 md:gap-3">
              {/* Universal OS search (owner UX recovery v1) — the ONE
                  CommandFinder, reachable from every dashboard page. */}
              <HeaderSearch />
              <LocaleSwitcher className="hidden md:flex" />
              <NotificationPanel />
              <RoleSwitcher />
              <AccountMenu />
            </div>
          </div>
        </header>
        {/* Mobile safe bottom — clears the fixed bottom nav (h-16) PLUS an
            extra rem for breathing room so form CTAs (Patvirtinti įrašą /
            Pridėti) never sit flush against the nav (Mobile UX §3-§4). */}
        {/* Owner UX recovery v1: tighter shell padding (py-10 → py-6,
            px-6 → px-4) — less empty frame, more content per screen. The
            mobile safe bottom (fixed nav clearance) is unchanged. */}
        <main className="relative z-10 mx-auto max-w-container px-4 py-6 pb-[calc(5rem+env(safe-area-inset-bottom))] sm:px-12 md:pb-8">
          {children}
          {/* Created by Rexora — quiet product credit (owner directive,
              2026-07-14, URL approved: https://aiprocessautomation.eu).
              Lives INSIDE <main> so it scrolls with content and inherits the
              mobile bottom-nav clearance padding above — it can never sit
              under or collide with the fixed BottomNav. Deliberately the
              subtlest text tier (text-xs, muted). Pinned by
              legal-entity-truth.test.ts. */}
          <div className="mt-10 text-center">
            <a
              href="https://aiprocessautomation.eu"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-text-muted transition-colors hover:text-text-secondary"
            >
              {footerT("rexora")}
            </a>
          </div>
        </main>
        <BottomNav badges={navBadges} />
        {/* v1 tester language-feedback widget. Mounted INSIDE the auth
            shell so it's only visible to authenticated sessions — the
            inbox is also admin-only via RLS, so this is double-gated. */}
        <LanguageFeedbackWidget />
      </div>
    </AuthProvider>
  );
}
