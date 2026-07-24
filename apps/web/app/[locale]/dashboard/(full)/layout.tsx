import { getTranslations, setRequestLocale } from "next-intl/server";

import { BottomNav } from "@/components/app/bottom-nav";
import { DashboardTabs } from "@/components/app/dashboard-tabs";
import { HeaderSearch } from "@/components/app/header-search";
import { NotificationPanel } from "@/components/app/notification-panel";
import { RoleSwitcher } from "@/components/app/role-switcher";
import { AccountMenu } from "@/components/app/account-menu";
import { LocaleSwitcher } from "@/components/marketing/locale-switcher";
import { Link } from "@/lib/i18n/navigation";

/**
 * Full-chrome (Advanced-mode) shell — the previous whole-dashboard chrome moved
 * verbatim into the `(full)` route group. Every specialized module route
 * (Advanced overview, market map, journal, admin, …) renders here with the full
 * wide navbar (`DashboardTabs`) + mobile catalogue `BottomNav`, exactly as
 * before. Advanced mode loses NO functionality.
 *
 * All auth/profile/roles data is resolved by the thin parent
 * (`dashboard/layout.tsx`) and reaches the chrome via the client `AuthProvider`
 * context — this layer only paints the chrome, so it needs no data fetch of its
 * own beyond the footer credit translation.
 */
export default async function DashboardFullLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const footerT = await getTranslations("footer");

  return (
    <div className="relative min-h-screen">
      <header className="sticky top-0 z-30 border-b border-ink-600/60 bg-ink-900/85 backdrop-blur-md md:relative md:z-20 md:bg-transparent md:backdrop-blur-none">
        <div className="mx-auto flex h-14 max-w-container items-center gap-3 px-3 md:h-auto md:py-3 md:gap-6 sm:px-12">
          {/* App-shell logo links to the conversation home, keeping the user in
            their workspace (never bounce to the marketing site). */}
          <Link
            href="/dashboard"
            className="min-w-0 shrink truncate font-display text-lg font-bold tracking-tightest text-text-primary"
          >
            LabourMarket<span className="text-gradient-accent">.ai</span>
          </Link>
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
      {/* Mobile safe bottom clears the fixed bottom nav (h-16) plus breathing
        room so form CTAs never sit flush against the nav. */}
      <main className="relative z-10 mx-auto max-w-container px-4 py-6 pb-[calc(5rem+env(safe-area-inset-bottom))] sm:px-12 md:pb-8">
        {children}
        {/* Created by Rexora — quiet product credit (owner directive,
          2026-07-14). Pinned by legal-entity-truth.test.ts. */}
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
      <BottomNav />
    </div>
  );
}
