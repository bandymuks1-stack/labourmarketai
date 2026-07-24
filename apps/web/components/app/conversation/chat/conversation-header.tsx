"use client";

import { Bell, MessageSquare, Mail, Calendar, SlidersHorizontal } from "lucide-react";
import { Link } from "@/lib/i18n/navigation";

export type ConversationNavLabels = {
  chat: string;
  messages: string;
  calendar: string;
  profile: string;
  advanced: string;
};

/**
 * Simple-mode header. Conversation is the primary control, but the functions
 * that need a specialized view stay reachable: the header carries exactly the
 * simple-mode navigation — Chat · Messages · Calendar · Profile/avatar ·
 * Advanced. CV is reached via Profile / the chat, not a top-level tab. Human
 * message threads (Messages) are kept distinct from the AI chat (Chat).
 * On phones the tabs move to a fixed bottom nav (ConversationBottomNav).
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
  return (
    <header className="flex flex-none items-center justify-between gap-3 border-b border-ink-600 bg-ink-900/80 px-4 py-2.5 backdrop-blur">
      <span className="flex items-center gap-2">
        <span className="flex size-6 items-center justify-center rounded-md bg-brand-blue text-[11px] font-bold text-white">L</span>
        <span className={`text-sm font-semibold tracking-tight text-text-primary ${mobile ? "" : "hidden sm:inline"}`}>{title}</span>
      </span>

      {/* Desktop simple-mode tabs — Chat active. Human message threads and the
          AI chat are separate destinations. Hidden on phones (bottom nav). */}
      <nav className={`items-center gap-1 ${mobile ? "hidden" : "hidden md:flex"}`} aria-label={nav.chat}>
        <NavTab href="/dashboard" label={nav.chat} icon={<MessageSquare className="size-4" aria-hidden />} active />
        <NavTab href="/dashboard/communication" label={nav.messages} icon={<Mail className="size-4" aria-hidden />} />
        <NavTab href="/dashboard/planning" label={nav.calendar} icon={<Calendar className="size-4" aria-hidden />} />
      </nav>

      <div className="flex items-center gap-1">
        <button type="button" aria-label="Notifications" className="flex size-9 items-center justify-center rounded-full text-text-muted hover:text-text-primary">
          <Bell className="size-4" aria-hidden />
        </button>
        <Link href="/dashboard/profile" aria-label={nav.profile} data-testid="chat-profile-link" className="flex size-9 items-center justify-center rounded-full border border-ink-500 text-text-secondary hover:border-brand-blue hover:text-brand-blue">
          <span className="text-xs font-semibold">JP</span>
        </Link>
        <Link
          href="/dashboard/advanced"
          data-testid="chat-advanced-link"
          className={`ml-1 items-center gap-1.5 rounded-full border border-ink-500 px-3 py-1.5 text-xs font-medium text-text-secondary hover:border-brand-blue hover:text-brand-blue ${mobile ? "hidden" : "hidden md:flex"}`}
        >
          <SlidersHorizontal className="size-3.5" aria-hidden />
          {nav.advanced}
        </Link>
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
      className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium ${
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
  const items = [
    { href: "/dashboard", label: nav.chat, icon: <MessageSquare className="size-5" aria-hidden />, active: true },
    { href: "/dashboard/communication", label: nav.messages, icon: <Mail className="size-5" aria-hidden /> },
    { href: "/dashboard/planning", label: nav.calendar, icon: <Calendar className="size-5" aria-hidden /> },
    { href: "/dashboard/profile", label: nav.profile, icon: <span className="flex size-5 items-center justify-center text-[10px] font-bold">JP</span> },
    { href: "/dashboard/advanced", label: nav.advanced, icon: <SlidersHorizontal className="size-5" aria-hidden /> },
  ];
  return (
    <nav className={`flex-none items-stretch border-t border-ink-600 bg-ink-900/95 ${mobile ? "flex" : "flex md:hidden"}`} aria-label={nav.chat} data-testid="conversation-bottom-nav">
      {items.map((it) => (
        <Link
          key={it.href}
          href={it.href}
          aria-current={it.active ? "page" : undefined}
          className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] font-medium ${
            it.active ? "text-brand-blue" : "text-text-muted"
          }`}
        >
          {it.icon}
          <span>{it.label}</span>
        </Link>
      ))}
    </nav>
  );
}
