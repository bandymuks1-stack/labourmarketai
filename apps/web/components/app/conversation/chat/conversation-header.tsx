"use client";

import { MessageSquare, Mail, Calendar, SlidersHorizontal } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/lib/i18n/navigation";
import { useAuthOptional } from "@/lib/auth/context";
import { HeaderSearch } from "@/components/app/header-search";
import { NotificationPanel } from "@/components/app/notification-panel";
import { AccountMenu } from "@/components/app/account-menu";
import { LocaleSwitcher } from "@/components/marketing/locale-switcher";
import { ThemeToggleIcon } from "@/components/ui/theme-toggle-icon";
import { personMonogram } from "@/lib/visual/avatar-monogram";
import { iconControl } from "./icon-scale";

export type ConversationNavLabels = {
  chat: string;
  messages: string;
  calendar: string;
  profile: string;
  advanced: string;
};

/** The five simple-mode destinations, in canonical order. `href` is matched
 *  against the locale-stripped pathname so the active tab is correct on the
 *  conversation home AND on the panel routes (communication/planning/profile)
 *  that share this header via the (panels) simple shell. */
const NAV = [
  { key: "chat", href: "/dashboard", icon: MessageSquare },
  { key: "messages", href: "/dashboard/communication", icon: Mail },
  { key: "calendar", href: "/dashboard/planning", icon: Calendar },
] as const;

function useActiveHref(): string {
  const pathname = usePathname();
  // Longest-prefix match so /dashboard/communication beats /dashboard.
  if (pathname.startsWith("/dashboard/communication")) return "/dashboard/communication";
  if (pathname.startsWith("/dashboard/planning")) return "/dashboard/planning";
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
  const initials = personMonogram(auth?.profile?.full_name ?? null);
  const label = (key: (typeof NAV)[number]["key"]) => nav[key];
  // Reuses the account menu's existing theme copy — no new i18n keys.
  const tTheme = useTranslations("auth.dashboard.account.theme");

  return (
    <header className="flex flex-none items-center justify-between gap-3 border-b border-ink-600 bg-ink-900/80 px-4 py-2.5 backdrop-blur">
      <span className="flex items-center gap-2">
        <span className="flex size-6 flex-none items-center justify-center rounded-sm bg-brand-blue text-meta font-bold text-white">L</span>
        <span className={`font-display text-card-title font-bold tracking-tightest text-text-primary ${mobile ? "" : "hidden sm:inline"}`}>{title}</span>
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

      <div className="flex items-center gap-1">
        {/* Real chrome renders only inside the authenticated app; the
          provider-less dev preview keeps a lean header for screenshots. */}
        {/* The SAME universal command search the Advanced header mounts — one
            registry, one deterministic matcher, one role filter, one shortcut.
            It was previously only reachable from Advanced pages, so the
            chat-first home had no way to reach the other 40 destinations
            without leaving for the module navbar first. */}
        {auth && (
          <HeaderSearch
            testId="chat-command-search"
            className="inline-flex size-11 items-center justify-center rounded-full border border-ink-500 text-text-secondary transition-colors hover:border-brand-blue hover:text-text-primary"
          />
        )}
        {auth && <LocaleSwitcher className={mobile ? "hidden" : "hidden md:flex"} />}
        {/* Appearance is a first-class control, not a setting buried two clicks
            deep in the avatar menu: light is now the default, so the way BACK to
            dark has to be visible on the product's primary screen. Still also
            present in AccountMenu — this is a second entry point, not a second
            implementation. */}
        {auth && (
          <ThemeToggleIcon
            testId="chat-theme-toggle"
            labels={{ toDark: tTheme("toDark"), toLight: tTheme("toLight") }}
            className="inline-flex size-11 items-center justify-center rounded-full border border-ink-500 text-text-secondary transition-colors hover:border-brand-blue hover:text-text-primary"
          />
        )}
        {auth && <NotificationPanel />}
        <Link
          href="/dashboard/profile"
          aria-label={nav.profile}
          aria-current={active === "/dashboard/profile" ? "page" : undefined}
          data-testid="chat-profile-link"
          className={`flex size-11 items-center justify-center rounded-full border text-text-secondary hover:border-brand-blue hover:text-brand-blue ${
            active === "/dashboard/profile" ? "border-brand-blue text-brand-blue" : "border-ink-500"
          }`}
        >
          <span className="text-support font-semibold">{initials}</span>
        </Link>
        <Link
          href="/dashboard/advanced"
          data-testid="chat-advanced-link"
          className={`ml-1 min-h-11 items-center gap-1.5 rounded-full border border-ink-500 px-3.5 text-support font-medium text-text-secondary hover:border-brand-blue hover:text-brand-blue ${mobile ? "hidden" : "hidden md:flex"}`}
        >
          <SlidersHorizontal {...iconControl()} aria-hidden />
          {nav.advanced}
        </Link>
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

/** Mobile simple-mode bottom navigation — the 5 canonical destinations. */
export function ConversationBottomNav({ nav, mobile = false }: { nav: ConversationNavLabels; mobile?: boolean }) {
  const active = useActiveHref();
  const auth = useAuthOptional();
  const initials = personMonogram(auth?.profile?.full_name ?? null);
  const items = [
    { href: "/dashboard", label: nav.chat, icon: <MessageSquare {...iconControl()} aria-hidden /> },
    { href: "/dashboard/communication", label: nav.messages, icon: <Mail {...iconControl()} aria-hidden /> },
    { href: "/dashboard/planning", label: nav.calendar, icon: <Calendar {...iconControl()} aria-hidden /> },
    { href: "/dashboard/profile", label: nav.profile, icon: <span className="flex size-5 items-center justify-center text-meta font-bold">{initials}</span> },
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
