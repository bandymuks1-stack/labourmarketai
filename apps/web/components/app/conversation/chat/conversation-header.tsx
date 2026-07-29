"use client";

import { MessageSquare, Mail, Calendar, NotebookPen, SlidersHorizontal } from "lucide-react";
import { useTranslations } from "next-intl";
import { getCoreNavItems } from "@/lib/config/navigation";
import { Link, usePathname } from "@/lib/i18n/navigation";
import { useAuthOptional } from "@/lib/auth/context";
import { HeaderSearch } from "@/components/app/header-search";
import { NotificationPanel } from "@/components/app/notification-panel";
import { AccountMenu } from "@/components/app/account-menu";
import { LocaleSwitcher } from "@/components/marketing/locale-switcher";
import { ThemeToggleIcon } from "@/components/ui/theme-toggle-icon";
import { WorkspaceChip } from "./workspace-chip";
import { iconControl } from "./icon-scale";

export type ConversationNavLabels = {
  chat: string;
  journal: string;
  messages: string;
  calendar: string;
  profile: string;
  advanced: string;
};

/**
 * The simple-mode destinations = THE ONE CORE WORK LOOP from the shared nav
 * source (rebuild W5): chat → journal → calendar → messages. Hrefs and order
 * come from `getCoreNavItems()` — the SAME list the Advanced navbar starts
 * with — so the primary tabs never change identity between shells. Only the
 * short labels are shell-local (the conversation label bag).
 */
const CORE_LABEL_KEY: Record<string, keyof ConversationNavLabels> = {
  overview: "chat",
  journal_text_first: "journal",
  planning: "calendar",
  communication: "messages",
};
const CORE_ICON: Record<keyof ConversationNavLabels, typeof MessageSquare> = {
  chat: MessageSquare,
  journal: NotebookPen,
  calendar: Calendar,
  messages: Mail,
  profile: MessageSquare, // unused (profile renders the initials avatar)
  advanced: SlidersHorizontal,
};
const NAV = getCoreNavItems().flatMap((item) => {
  const key = CORE_LABEL_KEY[item.id];
  return key ? [{ key, href: item.href, icon: CORE_ICON[key] }] : [];
});

function useActiveHref(): string {
  const pathname = usePathname();
  // Longest-prefix match so /dashboard/communication beats /dashboard.
  if (pathname.startsWith("/dashboard/communication")) return "/dashboard/communication";
  if (pathname.startsWith("/dashboard/planning")) return "/dashboard/planning";
  if (pathname.startsWith("/dashboard/journal")) return "/dashboard/journal";
  if (pathname.startsWith("/dashboard/profile")) return "/dashboard/profile";
  if (pathname.startsWith("/dashboard/advanced")) return "/dashboard/advanced";
  return "/dashboard";
}

/**
 * Simple-mode header. Conversation is the primary control, but the functions
 * that need a specialized view stay reachable: the header carries exactly the
 * simple-mode navigation — Chat · Messages · Calendar · Profile/avatar ·
 * Advanced. CV is reached via Profile / the chat, not a top-level tab. Human
 * message threads (Messages) are kept distinct from the AI chat (Chat).
 * On phones the tabs move to a fixed bottom nav (ConversationBottomNav).
 *
 * Real chrome is wired in (never a dead button): the bell is the shared
 * `NotificationPanel`, the avatar links to the real profile with the user's real
 * initials, and the account menu / locale switcher keep logout + language within
 * reach in simple mode.
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
  const active = useActiveHref();
  const auth = useAuthOptional();
  const label = (key: (typeof NAV)[number]["key"]) => nav[key];
  // Reuses the account menu's existing theme copy — no new i18n keys.
  const tTheme = useTranslations("auth.dashboard.account.theme");

  return (
    <header className="flex flex-none items-center justify-between gap-3 border-b border-ink-600 bg-ink-900/80 px-4 py-2.5 backdrop-blur">
      <span className="flex min-w-0 items-center gap-2">
        <span className="flex size-6 flex-none items-center justify-center rounded-sm bg-brand-blue text-meta font-bold text-white">L</span>
        <span className={`font-display text-card-title font-bold tracking-tightest text-text-primary ${mobile ? "hidden" : "hidden lg:inline"}`}>{title}</span>
        {/* The ACTIVE WORKSPACE, always visible beside the conversation —
            the user must never have to guess which work context they are in
            (real-user workflow rebuild W1). */}
        {/* min-w-0 so the chip TRUNCATES on a phone instead of ramming into
            the right-side controls (owner-visible mobile overlap bug). */}
        {auth && (
          <span className="flex min-w-0">
            <WorkspaceChip />
          </span>
        )}
      </span>

      {/* Desktop simple-mode tabs. Human message threads and the AI chat are
          separate destinations. Hidden on phones (bottom nav). */}
      <nav className={`items-center gap-1 ${mobile ? "hidden" : "hidden md:flex"}`} aria-label={nav.chat}>
        {NAV.map(({ key, href, icon: Icon }) => (
          <NavTab
            key={href}
            href={href}
            label={label(key)}
            icon={<Icon {...iconControl()} aria-hidden />}
            active={active === href}
          />
        ))}
      </nav>

      <div className="flex flex-none items-center gap-1">
        {/* TOP-BAR CLEANUP (owner ruling 2026-07-29, §B). The bar used to
            carry SEVEN right-side controls, two of which were avatars — the
            profile-initials circle AND the account-menu circle showed the
            same person twice. Now every element has one clear job:
              search (desktop) · locale (desktop) · theme (desktop, guarded
              light-first entry) · notifications · Advanced (desktop) · ONE
              avatar = the account menu, which carries Profile inside it.
            On a PHONE the bar is just: workspace chip · bell · avatar —
            nothing can overlap at 360px. */}
        {auth && (
          <HeaderSearch
            testId="chat-command-search"
            className={`size-11 items-center justify-center rounded-full border border-ink-500 text-text-secondary transition-colors hover:border-brand-blue hover:text-text-primary ${mobile ? "hidden" : "hidden md:inline-flex"}`}
          />
        )}
        {auth && <LocaleSwitcher className={mobile ? "hidden" : "hidden md:flex"} />}
        {/* Appearance stays a first-class DESKTOP control (light is the
            default, so the way back to dark lives on the primary screen —
            ux-2-0 light-first guard). On phones it lives in the account menu
            only: five circles did not fit 360px and the workspace chip was
            overlapping the search button. */}
        {auth && (
          <ThemeToggleIcon
            testId="chat-theme-toggle"
            labels={{ toDark: tTheme("toDark"), toLight: tTheme("toLight") }}
            className={`size-11 items-center justify-center rounded-full border border-ink-500 text-text-secondary transition-colors hover:border-brand-blue hover:text-text-primary ${mobile ? "hidden" : "hidden md:inline-flex"}`}
          />
        )}
        {auth && <NotificationPanel />}
        <Link
          href="/dashboard/advanced"
          data-testid="chat-advanced-link"
          className={`ml-1 min-h-11 items-center gap-1.5 rounded-full border border-ink-500 px-3.5 text-support font-medium text-text-secondary hover:border-brand-blue hover:text-brand-blue ${mobile ? "hidden" : "hidden md:flex"}`}
        >
          <SlidersHorizontal {...iconControl()} aria-hidden />
          {nav.advanced}
        </Link>
        {/* THE one avatar. Profile moved INSIDE the menu (account-menu.tsx),
            so the person appears in the bar exactly once. */}
        {auth && <AccountMenu />}
      </div>
    </header>
  );
}

function NavTab({ href, label, icon, active }: { href: string; label: string; icon: React.ReactNode; active?: boolean }) {
  return (
    <Link
      href={href}
      data-testid={`nav-${label}`}
      aria-current={active ? "page" : undefined}
      className={`flex min-h-11 items-center gap-1.5 rounded-full px-3.5 text-support font-medium ${
        active ? "bg-brand-blue/15 text-brand-blue" : "text-text-secondary hover:text-text-primary"
      }`}
    >
      {icon}
      {label}
    </Link>
  );
}

/** Mobile simple-mode bottom navigation — the SAME core loop as the desktop
 *  tabs (chat · journal · calendar · messages) + the Advanced escape hatch.
 *  Profile is NOT a bottom slot: the header avatar (always visible, incl.
 *  mobile) is its one persistent entry — no duplicated navigation. */
export function ConversationBottomNav({ nav, mobile = false }: { nav: ConversationNavLabels; mobile?: boolean }) {
  const active = useActiveHref();
  const items = [
    ...NAV.map(({ key, href, icon: Icon }) => ({
      href,
      label: nav[key],
      icon: <Icon {...iconControl()} aria-hidden />,
    })),
    { href: "/dashboard/advanced", label: nav.advanced, icon: <SlidersHorizontal {...iconControl()} aria-hidden /> },
  ];
  return (
    <nav className={`flex-none items-stretch border-t border-ink-600 bg-ink-900/95 ${mobile ? "flex" : "flex md:hidden"}`} aria-label={nav.chat} data-testid="conversation-bottom-nav">
      {items.map((it) => (
        <Link
          key={it.href}
          href={it.href}
          aria-current={active === it.href ? "page" : undefined}
          className={`flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 py-2 text-meta font-medium ${
            active === it.href ? "text-brand-blue" : "text-text-muted"
          }`}
        >
          {it.icon}
          <span>{it.label}</span>
        </Link>
      ))}
    </nav>
  );
}
