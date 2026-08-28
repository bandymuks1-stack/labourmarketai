"use client";

import { useEffect } from "react";
import { usePathname } from "@/lib/i18n/navigation";
import { ADMIN_NAV_ITEM } from "@/lib/config/navigation";
import {
  ConversationHeader,
  type ConversationNavLabels,
} from "@/components/app/conversation/chat/conversation-header";

/**
 * Dashboard chrome selector. It chooses WHICH chrome is actually in the DOM per
 * route — never an overlay painted over a still-mounted navbar. Three modes:
 *
 *   • conversation (`/dashboard`) — children bare; the conversation surface is
 *     self-contained (`h-[100dvh]`, its own header).
 *   • panel (EVERY other product route) — the canonical ONE TOP BAR
 *     (`<ConversationHeader>`): back-to-chat · identity · the active workspace
 *     chip · search · language · notifications · one avatar menu.
 *   • full (`/dashboard/admin/*` only) — the legacy module chrome (wide tab
 *     row + role switcher + bottom nav), kept for the INTERNAL operator
 *     console, which is not the user-facing product.
 *
 * WHY panel is now the default, not a four-route exception
 * -------------------------------------------------------
 * The conversation header's own contract already calls itself "THE ONE TOP BAR
 * (owner audit §4.4 + §13)", and records that the tab row and the Advanced
 * entry are gone by owner ruling. That ruling was only ever applied to four
 * route prefixes. Everywhere else — opportunities, the company hub, bookings,
 * projects, network, the map — the user left the conversation and landed back
 * in the pre-ruling module chrome. The product read as "AI on the homepage,
 * old SaaS everywhere else", and the owner's production screenshot of
 * `/lt/dashboard/opportunities` showed what that chrome costs:
 *
 *   • a 6-7 item tab row that scrolls sideways inside the header;
 *   • the role switcher sitting two controls from the workspace chip — TWO
 *     permanent context controls naming the SAME active organization, in two
 *     different vocabularies ("role" vs "workspace"), with two switch menus;
 *   • the bottom nav, a third navigation system, on phones.
 *
 * Capability is preserved; the redundant presentation is not:
 *   • every tab destination (overview · journal · planning · communication ·
 *     market map · network) has a command in `lib/navigation/command-registry`,
 *     reachable from the search control this header carries at EVERY width and
 *     from the conversation's own intent router;
 *   • switching person to organization is the workspace chip, which is not the
 *     lesser control: `switchWorkspace` in `lib/auth/context` already moves the
 *     BASE IDENTITY with the workspace ("the workspace IS the acting context",
 *     owner audit P0.1), so the chip does everything the role switcher's
 *     organization list did;
 *   • ACQUIRING an identity you do not hold yet — the role switcher's one
 *     genuinely unique power — is `/dashboard/start/company`, reached from the
 *     `create-organization` intent and from the registry;
 *   • the admin console link lives in the avatar menu (`account-menu-admin-link`).
 *
 * `usePathname()` (locale-stripped) is client-reactive, so switching modes on a
 * client navigation flips the chrome correctly — no overlay, no file moves.
 *
 * The FULL-mode chrome is still authored in `dashboard/layout.tsx` and handed
 * in as slots, so the chrome markup stays where the guard suite pins it; this
 * component only decides WHICH chrome renders.
 */
/** The ONLY subtree that keeps the legacy module chrome: the internal operator
 *  console. It is admin-gated (`dashboard/admin/layout.tsx` fail-closes), so no
 *  ordinary user can reach the wide tab row at all.
 *
 *  Taken from the canonical admin nav item rather than spelled out again: the
 *  admin route has ONE source, and a route PREDICATE written as a literal here
 *  is indistinguishable — to `admin-visibility.test.ts` and to a reader — from
 *  an ungated admin LINK. Deriving it keeps both honest. */
const FULL_CHROME_PREFIX = ADMIN_NAV_ITEM.href;

type Mode = "conversation" | "panel" | "full";

function modeFor(pathname: string): Mode {
  if (pathname === "/dashboard") return "conversation";
  if (
    pathname === FULL_CHROME_PREFIX ||
    pathname.startsWith(`${FULL_CHROME_PREFIX}/`)
  ) {
    return "full";
  }
  return "panel";
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

  // Panel: a PROJECTION of the conversation (owner audit §4.4) — the same
  // minimal top bar with the back-to-chat affordance; no parallel tab system
  // and no bottom nav exists any more.
  if (mode === "panel") {
    return (
      <div className="flex min-h-[100dvh] flex-col bg-ink-900" data-chrome="simple">
        <ConversationHeader title={headerTitle} nav={nav} />
        <main className="relative z-10 mx-auto w-full max-w-container flex-1 px-4 py-6 pb-[calc(2.5rem+env(safe-area-inset-bottom))] sm:px-12 md:pb-8">
          {children}
          {/* The Rexora product credit (owner directive 2026-07-14, pinned by
              legal-entity-truth.test.ts) used to hang off the FULL chrome. Now
              that full serves only the admin console it would have vanished
              from every user-facing surface, so it hangs here instead — the
              same one-line credit, in the shell the product actually uses. */}
          {rexora}
        </main>
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
