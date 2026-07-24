"use client";

import { Bell, SlidersHorizontal, User } from "lucide-react";
import { Link } from "@/lib/i18n/navigation";

/**
 * Minimal conversation header — the ONLY chrome in simple mode. Logo, an
 * optional notifications + profile affordance, and the single "Advanced mode"
 * escape hatch. No module nav, no map/journal/calendar tabs for the ordinary
 * worker; those live in Advanced mode.
 */
export function ConversationHeader({
  title,
  advancedLabel,
}: {
  title: string;
  advancedLabel: string;
}) {
  return (
    <header className="flex flex-none items-center justify-between gap-3 border-b border-ink-600 bg-ink-900/80 px-4 py-2.5 backdrop-blur">
      <span className="flex items-center gap-2">
        <span className="flex size-6 items-center justify-center rounded-md bg-brand-blue text-[11px] font-bold text-white">L</span>
        <span className="text-sm font-semibold tracking-tight text-text-primary">{title}</span>
      </span>
      <div className="flex items-center gap-1">
        <button type="button" aria-label="Notifications" className="flex size-9 items-center justify-center rounded-full text-text-muted hover:text-text-primary">
          <Bell className="size-4" aria-hidden />
        </button>
        <button type="button" aria-label="Profile" className="flex size-9 items-center justify-center rounded-full text-text-muted hover:text-text-primary">
          <User className="size-4" aria-hidden />
        </button>
        <Link
          href="/dashboard"
          data-testid="chat-advanced-link"
          className="ml-1 flex items-center gap-1.5 rounded-full border border-ink-500 px-3 py-1.5 text-xs font-medium text-text-secondary hover:border-brand-blue hover:text-brand-blue"
        >
          <SlidersHorizontal className="size-3.5" aria-hidden />
          <span className="hidden sm:inline">{advancedLabel}</span>
        </Link>
      </div>
    </header>
  );
}
