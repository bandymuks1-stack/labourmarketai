import type { Metadata } from "next";
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
import { readActiveProfileRoles } from "@/lib/auth/profile-roles";
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

/**
 * Private surface: robots.txt already disallows crawling, but a disallow does
 * not stop URL-only indexing from inbound links — the locale layout's
 * `index: true` used to be inherited here. Explicit noindex closes that gap
 * for the whole authenticated tree (metadata merges downward).
 */
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

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
  // HONESTY (2026-08-28): the roles read used to drop its PostgREST error and
  // hand `null` down, so a transient failure (cold DB connection, pooler
  // hiccup) silently stripped EVERY role from the authenticated shell — the
  // role switcher, the nav and `deriveIsAdmin` all read an empty list as the
  // fact "this user holds no roles". `readActiveProfileRoles` retries once and
  // then throws, so an unanswered read reaches the route error boundary
  // instead of being rendered as a confident, wrong role state.
  const rolesPromise: Promise<{ role: string }[] | null> = userPromise.then(
    async ({ data: { user } }) =>
      user
        ? await readActiveProfileRoles(() =>
            supabase
              .from("profile_roles")
              .select("role")
              .eq("profile_id", user.id)
              .eq("is_active", true),
          )
        : null,
  );
  const [userRes, session, rolesRows] = await Promise.all([
    userPromise,
    getSessionProfile(),
    rolesPromise,
  ]);
  const user = userRes.data.user;
  if (!user) redirect(`/${locale}/auth/login`);
  const profile = session.profile;
  console.info("[perf] dashboard-layout", {
    ms: Date.now() - layoutStart,
  });

  // A FAILED profile read is not "not onboarded" (W6 honesty, 2026-09-06):
  // sending an onboarded person to /onboarding on a timed-out read is the
  // same silent misroute the root fixes. The root renders the NAMED degrade
  // state (or keeps the person's own durable workspace choice); the shell
  // carries on with what it does know — nothing below fabricates a role.
  if (session.profileRead !== "failed" && !profile?.onboarded_at) {
    redirect(`/${locale}/onboarding`);
  }

  const roles = (rolesRows ?? [])
    .map((r) => r.role)
    .filter((r): r is Role => ROLES.has(r as Role));
  // Admin is NOT a workspace role — it lives on a separate signal so switching
  // workspaces never strips admin in the UI. See `deriveIsAdmin`.
  const isAdmin = deriveIsAdmin({
    activeRole: profile?.active_role ?? null,
    profileRoles: rolesRows ?? [],
  });
  const adminUiHidden = isAdmin ? await readAdminUiHidden() : false;
  const activeRole = ROLES.has(profile?.active_role as Role)
    ? (profile?.active_role as Role)
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
        {/* `min-w-0` is LOAD-BEARING, and `overflow-x-auto` is what makes it
            safe. A flex item's default `min-width: auto` floors this nav at
            its max-content width, so from the md breakpoint — where the tabs
            first appear — it claimed 492px and refused to give any back. The
            row then measured 999px inside a 768px viewport, and because
            `html`/`body` are `overflow-x: hidden` the page could NOT be
            scrolled sideways to reach the rest.
            What that cost, measured at 768px:
              brand              0px wide  (squeezed out of existence)
              account menu   955..999px    entirely off-screen, so LOGOUT and
                                           the report-a-problem entry point
                                           were unreachable
              notifications / role switcher / search / locale — same
            `document.documentElement.scrollWidth` still read exactly 768,
            which is why nothing ever reported it; `document.body.scrollWidth`
            read 999.
            With `min-w-0` the nav shrinks to 141px and the account menu comes
            back to 676..720. `overflow-x-auto` then keeps the tabs themselves
            reachable by scrolling instead of letting them spill over the
            controls — the same treatment the company page's chip strip uses.
            Broken range was 768px up to ~999px: tablets and small laptops. */}
        <DashboardTabs className="hidden min-w-0 overflow-x-auto md:flex [-webkit-overflow-scrolling:touch]" />
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
            full_name: profile?.full_name ?? null,
            email: profile?.email ?? null,
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
