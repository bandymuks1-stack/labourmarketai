"use client";

import { ArrowLeft } from "lucide-react";
import { Link, usePathname } from "@/lib/i18n/navigation";
import { useAuthOptional } from "@/lib/auth/context";
import { HeaderSearch } from "@/components/app/header-search";
import { NotificationPanel } from "@/components/app/notification-panel";
import { AccountMenu } from "@/components/app/account-menu";
import { LocaleSwitcher } from "@/components/marketing/locale-switcher";
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
 *   left:  ← back-to-chat (on projection screens only) · LabourMarket
 *          identity · the ACTIVE WORKSPACE chip (real switching, P0.1)
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
        <span className="flex size-6 flex-none items-center justify-center rounded-sm bg-brand-blue text-meta font-bold text-white">L</span>
        <span className={`font-display text-card-title font-bold tracking-tightest text-text-primary ${mobile ? "hidden" : "hidden lg:inline"}`}>{title}</span>
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
