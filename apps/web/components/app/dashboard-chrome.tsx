"use client";

import { useEffect } from "react";
import { usePathname } from "@/lib/i18n/navigation";
import {
  ConversationHeader,
  ConversationBottomNav,
  type ConversationNavLabels,
} from "@/components/app/conversation/chat/conversation-header";

/**
 * Dashboard chrome selector — the real replacement for the old `fixed inset-0`
 * overlay. Instead of painting the conversation OVER a still-mounted wide navbar
 * (a CSS trick), this chooses WHICH chrome to actually render by route, so the
 * wide navbar is simply NOT in the DOM in simple mode. Three modes:
 *
 *   • conversation (`/dashboard`) — renders the children bare; the conversation
 *     surface supplies its own full-height simple header + bottom nav. No wide
 *     navbar exists here at all.
 *   • panel (`/dashboard/communication|planning|profile`) — the simple-mode
 *     shell (the SAME 5-item nav the conversation uses), NOT the module navbar.
 *   • full (every other module route incl. `/dashboard/advanced`) — the full
 *     Advanced chrome, verbatim, so Advanced mode loses nothing.
 *
 * `usePathname()` (locale-stripped) is client-reactive, so switching modes on a
 * client navigation flips the chrome correctly — no overlay, no file moves.
 *
 * The FULL-mode chrome (header + main wrapper + bottom nav + Rexora credit) is
 * authored in `dashboard/layout.tsx` and handed in as slots (`fullHeader`,
 * `fullBottomNav`, `fullMain`). This keeps the chrome markup where the guard
 * suite pins it (the layout source) while this client component only decides
 * WHICH chrome renders per route.
 */
const PANEL_PREFIXES = [
  "/dashboard/communication",
  "/dashboard/planning",
  "/dashboard/profile",
];

type Mode = "conversation" | "panel" | "full";

function modeFor(pathname: string): Mode {
  if (pathname === "/dashboard") return "conversation";
  if (PANEL_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return "panel";
  }
  return "full";
}

export function DashboardChrome({
  children,
  headerTitle,
  nav,
  fullHeader,
  fullBottomNav,
  rexora,
}: {
  children: React.ReactNode;
  headerTitle: string;
  nav: ConversationNavLabels;
  /** Full-mode chrome slots, authored server-side in the layout. */
  fullHeader: React.ReactNode;
  fullBottomNav: React.ReactNode;
  rexora: React.ReactNode;
}) {
  const mode = modeFor(usePathname());

  // Flag the conversation surface on <html> so globals.css can lift the global
  // language-feedback FAB above the chat's composer + bottom nav. The FAB is a
  // SIBLING of this component, so a custom property set on the chat subtree
  // would never reach it — and without the lift the composer's `z-50` buries
  // an interactive control that stays visible but unclickable.
  useEffect(() => {
    if (mode !== "conversation") return;
    const root = document.documentElement;
    root.dataset.surface = "conversation";
    return () => {
      delete root.dataset.surface;
    };
  }, [mode]);

  // Conversation: bare — the chat is self-contained (h-[100dvh], own nav).
  if (mode === "conversation") return <>{children}</>;

  // Panel: the simple-mode shell (same nav as the conversation).
  if (mode === "panel") {
    return (
      <div className="flex min-h-[100dvh] flex-col bg-ink-900" data-chrome="simple">
        <ConversationHeader title={headerTitle} nav={nav} />
        <main className="relative z-10 mx-auto w-full max-w-container flex-1 px-4 py-6 pb-[calc(5rem+env(safe-area-inset-bottom))] sm:px-12 md:pb-8">
          {children}
        </main>
        <ConversationBottomNav nav={nav} />
      </div>
    );
  }

  // Full: the Advanced-mode chrome, rendered from the layout-authored slots.
  return (
    <div className="relative min-h-screen" data-chrome="full">
      {fullHeader}
      <main className="relative z-10 mx-auto max-w-container px-4 py-6 pb-[calc(5rem+env(safe-area-inset-bottom))] sm:px-12 md:pb-8">
        {children}
        {rexora}
      </main>
      {fullBottomNav}
    </div>
  );
}
