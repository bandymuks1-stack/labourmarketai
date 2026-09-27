"use client";

import { ArrowLeft } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/lib/i18n/navigation";
import { getCoreNavItems } from "@/lib/config/navigation";
import { NAV_ICONS } from "@/components/app/nav-icons";
import { cn } from "@/lib/utils";
import { useAuthOptional } from "@/lib/auth/context";
import { HeaderSearch } from "@/components/app/header-search";
import { NotificationPanel } from "@/components/app/notification-panel";
import { AccountMenu } from "@/components/app/account-menu";
import { LocaleSwitcher } from "@/components/marketing/locale-switcher";
import { LmLogo } from "@/components/ui/lm-logo";
import { WorkspaceChip } from "./workspace-chip";
import { iconControl } from "./icon-scale";

export type ConversationNavLabels = {
  chat: string;
  journal: string;
  messages: string;
  calendar: string;
  profile: string;
};

/**
 * THE ONE TOP BAR (owner audit §4.4 + §13). The conversation is the operating
 * center; journal, calendar, messages and the Player Card are its
 * PROJECTIONS, opened from the conversation (chips, commands, the opening
 * brief, the command search) — never from a parallel tab system. The bar
 * therefore carries exactly the canonical set and nothing else:
 *
 *   left:  ← back-home (on contextual workspaces only) · the LabourMarket
 *          logo — a LINK to the canonical home from every route (owner
 *          decision 0017) · the ACTIVE WORKSPACE chip (real switching, P0.1)
 *   right: search · language · notifications · ONE avatar (profile,
 *          settings, theme, sign-out live inside the menu)
 *
 * Gone from the bar (owner ruling): the four-tab row, the theme icon (menu
 * only), and the "Išplėstinis valdymas" entry — Advanced no longer exists
 * for the ordinary user (admins reach it through the account menu).
 */
export function ConversationHeader({
  title,
  nav,
  mobile = false,
}: {
  title: string;
  nav: ConversationNavLabels;
  /** Force the phone layout (used by the mobile design preview). */
  mobile?: boolean;
}) {
  const auth = useAuthOptional();
  const pathname = usePathname();
  const t = useTranslations();
  // Any simple-shell screen that is not the conversation itself is a
  // projection — it gets the one honest way back to the operating center.
  const isProjection = pathname !== "/dashboard";

  return (
    <header className="flex flex-none items-center justify-between gap-3 border-b border-ink-600 bg-ink-900/80 px-4 py-2.5 backdrop-blur">
      <span className="flex min-w-0 items-center gap-2">
        {isProjection && (
          <Link
            href="/dashboard"
            aria-label={nav.chat}
            data-testid="back-to-chat"
            className="flex size-11 flex-none items-center justify-center rounded-full border border-ink-500 text-text-secondary transition-colors hover:border-brand-blue hover:text-text-primary"
          >
            <ArrowLeft {...iconControl()} aria-hidden />
          </Link>
        )}
        {/* THE LOGO IS THE WAY HOME (owner decision 0017, 2026-09-22): from
            ANY authenticated route the LabourMarket mark leads to the
            canonical home — the conversation — for the current identity and
            context. Never the marketing landing, never a role-specific
            dashboard, never a nested surface. On the home itself it is a
            no-op link, not a dead span, so the affordance is the same
            everywhere. Pinned by lib/guards/logo-home-contract.test.ts. */}
        <Link
          href="/dashboard"
          data-testid="shell-logo-home"
          aria-label={title}
          className="flex min-w-0 items-center gap-2 rounded-sm outline-none ring-brand-blue focus-visible:ring-2"
        >
          {/* The canonical mark (owner §19) — never a letter standing in for
              it. Decorative: the Link's aria-label already names the product. */}
          <LmLogo title="" className="h-6 w-auto shrink-0" />
          <span className={`font-display text-card-title font-bold tracking-tightest text-text-primary ${mobile ? "hidden" : "hidden lg:inline"}`}>{title}</span>
        </Link>
        {/* The ACTIVE WORKSPACE, always visible beside the conversation —
            the user must never have to guess which work context they are in.
            min-w-0 so the chip TRUNCATES on a phone instead of ramming into
            the right-side controls. */}
        {auth && (
          <span className="flex min-w-0">
            <WorkspaceChip />
          </span>
        )}
      </span>

      {/* THE CORE WORK LOOP, IN THE ONE BAR — chat · journal · calendar ·
          messages, from `getCoreNavItems()` (the catalogue is the only source;
          this component never spells a destination itself).

          WHY IT IS BACK, measured rather than argued. Decision 0017 removed the
          four-tab row on the reasoning that "capability is preserved; the
          redundant presentation is not" — every destination still had a command
          in the search and a chip in the conversation. Walked by a real person
          on production 2026-09-27, that reasoning did not hold: THE CALENDAR
          COULD NOT BE FOUND AT ALL. `/dashboard/planning` exists, and the
          catalogue has marked it `availability: "active"` with
          `safeToShowInPrimaryNav: true` the whole time — but the only surfaces
          that render the catalogue (`DashboardTabs`, `BottomNav`) mount ONLY in
          the `full` chrome, and `dashboardChromeMode` gives `full` to
          `/dashboard/admin` alone. So for every non-admin the calendar was
          reachable only by typing the URL or by a chat chip that appears only
          when the context brief happens to return a day. `market-map-nav.test.ts`
          had already recorded this mechanism on 2026-09-19 ("a reachability
          proof that could not fail while the tab was invisible to everyone but
          an admin") and it was worked around per-feature instead of fixed here.

          THIS IS THE ONE PLACE THAT FIXES IT FOR EVERYONE, because this header
          is the universal bar: the chat renders it on the home
          (`conversation-chat.tsx`) and `DashboardChrome` renders it on every
          `panel` route, at every width. So the repair is one component, one
          nav model, one icon source — no new route, no new component, no second
          nav system, and the admin `full` chrome stays exactly as it was.

          It restores all four core destinations at once: the same mechanism had
          hidden `journal_text_first` and `communication` too, not only
          `planning`. Labels come from `nav`, which already carried every one of
          them (including `nav.calendar`) — the contract was there, unrendered.

          Icons-only under `lg` so the bar still fits a phone beside the
          workspace chip and the right-hand controls; the label is the
          accessible name at every width. */}
      {auth && (
        <nav
          aria-label={nav.chat}
          data-testid="header-core-nav"
          className="flex min-w-0 flex-none items-center gap-0.5"
        >
          {getCoreNavItems().map(({ id, href, tabLabelKey, iconKey }) => {
            const Icon = NAV_ICONS[iconKey];
            const active =
              href === "/dashboard"
                ? pathname === "/dashboard"
                : pathname === href || pathname.startsWith(`${href}/`);
            return (
              <Link
                key={id}
                href={href as "/dashboard"}
                aria-current={active ? "page" : undefined}
                aria-label={t(tabLabelKey)}
                data-testid={`header-core-nav-${id}`}
                className={cn(
                  "flex h-11 items-center gap-1.5 rounded-full px-2.5 text-support font-medium transition-colors lg:px-3",
                  active
                    ? "text-brand-orange"
                    : "text-text-secondary hover:text-text-primary",
                )}
              >
                <Icon {...iconControl()} aria-hidden />
                <span className="hidden lg:inline">{t(tabLabelKey)}</span>
              </Link>
            );
          })}
        </nav>
      )}

      <div className="flex flex-none items-center gap-1">
        {auth && (
          <HeaderSearch
            testId="chat-command-search"
            // Visible on EVERY width: with the tab row gone, search is one of
            // the two universal ways (chat, search) to reach any projection.
            className="inline-flex size-11 items-center justify-center rounded-full border border-ink-500 text-text-secondary transition-colors hover:border-brand-blue hover:text-text-primary"
          />
        )}
        {auth && <LocaleSwitcher className={mobile ? "hidden" : "hidden md:flex"} />}
        {auth && <NotificationPanel />}
        {/* THE one avatar. Profile, settings, theme, CV, Advanced (admins)
            and sign-out live inside the menu. */}
        {auth && <AccountMenu />}
      </div>
    </header>
  );
}
