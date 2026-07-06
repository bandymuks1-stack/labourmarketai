import { redirect } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { AmbientGlow } from "@/components/decor/ambient-glow";
import { BottomNav } from "@/components/app/bottom-nav";
import { DashboardTabs } from "@/components/app/dashboard-tabs";
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
import { getOwnCompany } from "@/lib/company/company-setup";
import { Link } from "@/lib/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import { getUnreadConversationCount } from "@/lib/communication/unread";
import {
  getBookingResponsesNewCount,
  getPendingIncomingBookingCount,
} from "@/lib/booking/booking-actions";
import {
  getPendingIncomingRequestCount,
  getServiceRequestsNewCounts,
} from "@/lib/marketplace/service-requests";
import type { Notification } from "@/lib/auth/context";

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

  // The profile row and the profile_roles catalogue are independent reads;
  // running them in parallel halves the auth-shell SSR latency. Every
  // route under the dashboard tree pays this layout cost, so the saving
  // compounds. (Avoid writing the literal slash-star sequence in this
  // comment: the project's source-level guards run a comment-stripping
  // regex that treats it as a block comment opener and would consume
  // past this Promise.all into the JSX below.)
  const [
    profileRes,
    rolesRes,
    unreadConversations,
    pendingIncomingRequests,
    requestNewCounts,
    pendingIncomingBookings,
    bookingResponsesNew,
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select("full_name, email, active_role, onboarded_at")
      .eq("id", user.id)
      .single(),
    supabase
      .from("profile_roles")
      .select("role")
      .eq("profile_id", user.id)
      .eq("is_active", true),
    // Unread inbox count → Messages nav badge + bell, so an incoming message
    // is actually noticed. Defensive (returns 0 on any error) so it never
    // breaks the auth shell.
    getUnreadConversationCount(),
    // Bell signals (audit PR5) — the same real per-surface counts the
    // dashboard cards use; every one returns 0 on any missing-data state,
    // so the bell never fabricates attention.
    getPendingIncomingRequestCount(),
    getServiceRequestsNewCounts(),
    getPendingIncomingBookingCount(),
    getBookingResponsesNewCount(),
  ]);
  const profile = profileRes.data;
  const rolesRows = rolesRes.data;
  const navBadges = { communication: unreadConversations } as const;

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
  // switching person ↔ company is unambiguous. Read-only, RLS-scoped, reuses
  // the existing company read; resolved ONLY for the company identity (the
  // person identity skips the query). Null — never a fabricated name — when no
  // company row exists yet, so the header only claims an org when one is real.
  let activeOrgName: string | null = null;
  if (activeRole && baseIdentityForRole(activeRole) === "company") {
    const company = await getOwnCompany();
    if (company.kind === "ok" && company.row) {
      activeOrgName = company.row.displayName ?? company.row.legalName ?? null;
    }
  }

  // Derived-signal notifications (audit PR5): the bell states only what is
  // REALLY true right now, from the same per-surface models the dashboard
  // cards use. Each item links the exact surface that clears it (visiting IS
  // the read event) — no notifications table, no fake "mark read".
  const signalRole: Role = activeRole ?? "worker";
  const signal = (
    id: string,
    type: string,
    count: number,
    href: string,
  ): Notification | null =>
    count > 0
      ? {
          id,
          role: signalRole,
          type,
          payload: {},
          read_at: null,
          created_at: "",
          count,
          href,
        }
      : null;
  const notifications: Notification[] = [
    signal("unread-messages", "unread_messages", unreadConversations, "/dashboard/communication"),
    signal(
      "incoming-service-requests",
      "incoming_service_requests",
      pendingIncomingRequests,
      "/dashboard/service-requests",
    ),
    signal(
      "service-request-responses",
      "service_request_responses",
      requestNewCounts.buyerNew,
      "/dashboard/service-requests",
    ),
    signal("pending-bookings", "pending_bookings", pendingIncomingBookings, "/dashboard/bookings"),
    signal("booking-responses", "booking_responses", bookingResponsesNew, "/dashboard/bookings"),
  ].filter((n): n is Notification => n !== null);

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
        <main className="relative z-10 mx-auto max-w-container px-6 py-10 pb-[calc(5rem+env(safe-area-inset-bottom))] sm:px-12 md:pb-10">
          {children}
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
