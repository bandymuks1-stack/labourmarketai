import { redirect } from "next/navigation";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, getTranslations, setRequestLocale } from "next-intl/server";
import { Suspense } from "react";

import { pickClientMessages } from "@/lib/i18n/client-messages";
import { AmbientGlow } from "@/components/decor/ambient-glow";
import { BottomNav } from "@/components/app/bottom-nav";
import { DashboardTabs } from "@/components/app/dashboard-tabs";
import { HeaderSearch } from "@/components/app/header-search";
import { LanguageFeedbackWidget } from "@/components/app/language-feedback-widget";
import { NotificationPanel } from "@/components/app/notification-panel";
import { RoleSwitcher } from "@/components/app/role-switcher";
import { SessionTelemetry } from "@/components/app/session-telemetry";
import { SpineStream } from "@/components/app/spine-stream";
import { AccountMenu } from "@/components/app/account-menu";
import { LocaleSwitcher } from "@/components/marketing/locale-switcher";
import { DashboardChrome } from "@/components/app/dashboard-chrome";
import { WorkspaceChip } from "@/components/app/conversation/chat/workspace-chip";
import type { ConversationNavLabels } from "@/components/app/conversation/chat/conversation-header";
import { Link } from "@/lib/i18n/navigation";
import { AuthProvider } from "@/lib/auth/context";
import { type Role } from "@/lib/auth/actions";
import { deriveIsAdmin } from "@/lib/auth/admin-signal";
import { readAdminUiHidden } from "@/lib/auth/admin-ui-pref";
import { baseIdentityForRole } from "@/lib/config/roles";
import { getWorkspaceContext } from "@/lib/company/active-organization";
import type { SwitchableOrganization } from "@/lib/company/organization-switch";
import { getSessionProfile } from "@/lib/auth/session-profile";
import { createClient } from "@/lib/supabase/server";

const ROLES = new Set<Role>(["worker", "company", "agency", "customer"]);

/**
 * Authenticated shell for the whole `/dashboard` tree.
 *
 * Resolves user + profile + roles ONCE, server-side, and hands them to the
 * client `AuthProvider` so every downstream widget (RoleSwitcher,
 * NotificationPanel, DashboardTabs, the simple-mode header) stays in sync. The
 * chrome itself is chosen per-route by the client `<DashboardChrome>`:
 *   - `/dashboard`                              → conversation (bare; the chat
 *                                                  supplies its own simple nav)
 *   - `/dashboard/communication|planning|profile` → simple-mode shell (5-item nav)
 *   - every other module route (detail/admin surfaces) → the full module chrome
 *     (`/dashboard/advanced` itself was deleted by W3 Package 4)
 *
 * This is the real replacement for the previous `fixed inset-0` overlay: the
 * wide navbar is not painted over in simple mode — it is simply never rendered
 * there (its DOM is absent), while Advanced mode keeps the full chrome verbatim.
 * No route files move, so the dashboard file-path contract the guard suite pins
 * stays intact. Doctrine §18 (real, not overlay illusions).
 */
export default async function DashboardLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const layoutStart = Date.now();
  const supabase = await createClient();

  // P0 auth-performance: NOTHING awaits serially before the batch. The
  // memoized getUser fires inside the same Promise.all as the session
  // profile and the roles read (chained off getUser — profiles.id === auth
  // user id), so the layout costs ONE parallel stage. (The profile row comes
  // from the ONE request-cached session-profile reader shared with the pages.)
  const userPromise = supabase.auth.getUser();
  const rolesPromise: Promise<{ data: { role: string }[] | null }> =
    userPromise.then(async ({ data: { user } }) =>
      user
        ? await supabase
            .from("profile_roles")
            .select("role")
            .eq("profile_id", user.id)
            .eq("is_active", true)
        : { data: null },
    );
  const [userRes, session, rolesRes] = await Promise.all([
    userPromise,
    getSessionProfile(),
    rolesPromise,
  ]);
  const user = userRes.data.user;
  if (!user) redirect(`/${locale}/auth/login`);
  const profile = session.profile;
  const rolesRows = rolesRes.data;
  console.info("[perf] dashboard-layout", {
    ms: Date.now() - layoutStart,
  });

  if (!profile?.onboarded_at) redirect(`/${locale}/onboarding`);

  const roles = (rolesRows ?? [])
    .map((r) => r.role)
    .filter((r): r is Role => ROLES.has(r as Role));
  // Admin is NOT a workspace role — it lives on a separate signal so switching
  // workspaces never strips admin in the UI. See `deriveIsAdmin`.
  const isAdmin = deriveIsAdmin({
    activeRole: profile.active_role,
    profileRoles: rolesRows ?? [],
  });
  const adminUiHidden = isAdmin ? await readAdminUiHidden() : false;
  const activeRole = ROLES.has(profile.active_role as Role)
    ? (profile.active_role as Role)
    : (roles[0] ?? null);

  // Workspace context (real-user workflow rebuild W1): the ACTIVE WORK CONTEXT
  // for EVERY identity — personal space + every org membership from the
  // canonical engagement_contexts spine. The reads are request-cached, so the
  // company-identity block below reuses the same underlying queries.
  const identity = activeRole ? baseIdentityForRole(activeRole) : null;
  const workspace = await getWorkspaceContext(identity);

  // WHICH organization is active — derived from the ONE workspace context
  // resolved above, never from a second reader.
  //
  // W9 (last `getOwnCompany()` read site): this block used to ask
  // `getActiveOrganizationContext()`, which lists OWNED organizations only,
  // and fall back to `getOwnCompany()` (`companies.profile_id = auth.uid()`)
  // — the single-company-per-person assumption the multi-org train removed.
  // Both readers are blind to `company_memberships`, so a manager or admin of
  // an organization they do not OWN got `activeOrgName = null`: the workspace
  // chip (fed by `getWorkspaceContext`, which merges owned + governance +
  // engagement rows) named their organization while the role switcher and the
  // chat's result context said nothing. One acting context cannot have two
  // answers, so both readers are gone from this layout and the name comes
  // from the workspace the chip itself is showing.
  //
  // The WORKSPACE is the acting context (owner audit P0.1), so the name
  // follows the active workspace rather than the base identity — a person
  // whose validated pointer is an organization really is acting there.
  // `resolveActiveWorkspaceId` already fail-closes to the personal workspace
  // for an ambiguous or revoked pointer, so nothing here can fabricate an org.
  const organizationWorkspaces = workspace.workspaces.filter(
    (w) => w.kind === "organization",
  );
  const activeWorkspace =
    organizationWorkspaces.find((w) => w.id === workspace.activeWorkspaceId) ??
    null;
  const activeOrgName: string | null = activeWorkspace?.name ?? null;
  const activeOrganizationId: string | null = activeWorkspace?.id ?? null;
  // The full list is passed; `<RoleSwitcher>` applies the SAME
  // `shouldOfferOrganizationSwitch` rule (>1) the layout used to duplicate.
  const organizations: SwitchableOrganization[] = organizationWorkspaces.map(
    (w) => ({ id: w.id, name: w.name }),
  );

  // Simple-mode nav labels + the Rexora footer credit, resolved once and passed
  // to the client chrome selector (which needs no data fetch of its own).
  const tChat = await getTranslations("conversation.chat");
  const tFooter = await getTranslations("footer");
  const nav: ConversationNavLabels = {
    chat: tChat("navChat"),
    journal: tChat("navJournal"),
    messages: tChat("navMessages"),
    calendar: tChat("navCalendar"),
    profile: tChat("navProfile"),
  };

  // Full (Advanced-mode) chrome, authored here so the shell contract the guard
  // suite pins (logo → /dashboard, DashboardTabs, AccountMenu, BottomNav, the
  // Rexora credit) stays in the layout source. `<DashboardChrome>` renders these
  // slots only on module routes; simple mode never mounts them.
  const fullHeader = (
    <header className="sticky top-0 z-30 border-b border-ink-600/60 bg-ink-900/85 backdrop-blur-md md:relative md:z-20 md:bg-transparent md:backdrop-blur-none">
      <div className="mx-auto flex h-14 max-w-container items-center gap-3 px-3 md:h-auto md:py-3 md:gap-6 sm:px-12">
        {/* App-shell logo links to the dashboard, NOT the public home. */}
        <Link
          href="/dashboard"
          className="min-w-0 shrink truncate font-display text-lg font-bold tracking-tightest text-text-primary"
        >
          LabourMarket<span className="text-gradient-accent">.ai</span>
        </Link>
        {/* W8 slice 1 — THE ACTIVE WORKSPACE, in the FULL chrome too.
            Every employer surface (/dashboard/company, …/scouting,
            /dashboard/bookings, /dashboard/projects) renders here, and until
            now the chip existed only in the conversation header — so the
            employer had no organization indicator on exactly the screens where
            they work, while the data behind those screens ignored the
            workspace entirely (audit P0-1). This is the SAME component reading
            the SAME auth-context workspace state; it is not a second switcher,
            and `min-w-0` lets it truncate on a phone instead of pushing the
            right-hand controls off screen. */}
        <span className="flex min-w-0">
          <WorkspaceChip />
        </span>
        <DashboardTabs className="hidden md:flex" />
        <div className="ml-auto flex shrink-0 items-center gap-2 md:gap-3">
          <HeaderSearch />
          <LocaleSwitcher className="hidden md:flex" />
          <NotificationPanel />
          <RoleSwitcher />
          <AccountMenu />
        </div>
      </div>
    </header>
  );
  const rexora = (
    // Created by Rexora — quiet product credit (owner directive, 2026-07-14).
    // Pinned by legal-entity-truth.test.ts.
    <div className="mt-10 text-center">
      <a
        href="https://aiprocessautomation.eu"
        target="_blank"
        rel="noopener noreferrer"
        className="text-xs text-text-muted transition-colors hover:text-text-secondary"
      >
        {tFooter("rexora")}
      </a>
    </div>
  );

  return (
    <NextIntlClientProvider messages={pickClientMessages(await getMessages())}>
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
          workspaces: [...workspace.workspaces],
          activeWorkspaceId: workspace.activeWorkspaceId,
          workspacePointerAvailable: workspace.pointerAvailable,
        }}
      >
        {/* Streamed notification spine: same single source, off the TTFB
          critical path. Hydrates the bell + nav badges via the auth context as
          soon as the derived signals resolve. Shared by every chrome mode. */}
        <Suspense fallback={null}>
          <SpineStream activeRole={activeRole} />
        </Suspense>
        <SessionTelemetry />
        <AmbientGlow />
        <DashboardChrome
          nav={nav}
          headerTitle={tChat("headerTitle")}
          fullHeader={fullHeader}
          fullBottomNav={<BottomNav />}
          rexora={rexora}
        >
          {children}
        </DashboardChrome>
        {/* v1 tester language-feedback widget — authenticated sessions only. */}
        <LanguageFeedbackWidget />
      </AuthProvider>
    </NextIntlClientProvider>
  );
}
