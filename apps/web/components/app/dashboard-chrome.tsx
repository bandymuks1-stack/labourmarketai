"use client";

import { useEffect } from "react";
import { usePathname } from "@/lib/i18n/navigation";
import { dashboardChromeMode } from "@/lib/config/navigation";
import {
  ConversationHeader,
  type ConversationNavLabels,
} from "@/components/app/conversation/chat/conversation-header";

/**
 * Dashboard chrome selector. It chooses WHICH chrome is actually in the DOM per
 * route — never an overlay painted over a still-mounted navbar. Three modes:
 *
 *   • conversation (`/dashboard`, EVERY identity) — children bare; the
 *     conversation surface is self-contained (`h-[100dvh]`, its own header,
 *     the ONE top bar). The conversation is the authenticated home and the
 *     product's control plane (owner decision 0017, 2026-09-22): there is no
 *     "today" page beside it and no tab that opens it. A worker in their
 *     personal space opens the SAME conversation with ŠIANDIEN as its
 *     opening context (`lib/today/today-route.ts`).
 *   • panel (EVERY other product route) — the canonical ONE TOP BAR
 *     (`<ConversationHeader>`): back-to-home · the LabourMarket logo (a link
 *     home) · the active workspace chip · search · language · notifications
 *     · one avatar menu. The page below it is a CONTEXTUAL WORKSPACE of the
 *     conversation (opportunities, journal, profile, a project, a need…),
 *     reached from the conversation, from search, or by deep link — never
 *     from a parallel tab system. No bottom bar exists here for anyone.
 *   • full (`/dashboard/admin/*` only) — the INTERNAL operator console. Since
 *     2026-10-25 it renders the SAME one top bar as every other route (owner
 *     order: one navigation system); only its <main> differs. Its former
 *     module chrome (a sideways-scrolling tab row, the role switcher as a
 *     second workspace selector, a phone bottom bar) is no longer mounted.
 *
 * RETIRED HERE (2026-09-22): the fourth mode `today` and the worker's 3-tab
 * bar ŠIANDIEN · PASAULIS · PAKLAUSK. Three bottom tabs read as three
 * equivalent product roots and made the conversation a feature a person had
 * to find ("Paklausk"). Frozen contract §2.3 called that tab set "a
 * hypothesis, not irreversible architecture"; the owner retired it. What the
 * tabs carried is preserved: ŠIANDIEN is the conversation's opening context,
 * PASAULIS is the opportunities workspace (a station in that context, a chat
 * intent, a search command and a deep link), PAKLAUSK is the composer that is
 * now always on screen.
 *
 * WHY panel is the default, not a four-route exception
 * ---------------------------------------------------
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
 * Every mode now renders `<ConversationHeader>` — there is no header markup
 * left in `dashboard/layout.tsx`; this component only decides WHICH shell
 * (bare conversation, contextual panel, operator console) renders.
 */
/** The ONLY subtree that keeps the legacy module chrome is the internal
 *  operator console; the rule itself is `dashboardChromeMode` in
 *  `lib/config/navigation.ts` (pure, beside the canonical admin nav item, so
 *  the admin route has ONE source and the guards read the same predicate). */

/** The one map route — it carries no partner credit line. */
const MARKET_MAP_PATH = "/dashboard/market-map";

/**
 * HYDRATION BOUNDARY for server-authored slots (React #418, 2026-10-09).
 *
 * `children` and the slot props arrive from the RSC payload and may still be
 * LAZY references when hydration reaches `<main>`. Reconciling a lazy child
 * directly under a HOST element suspends that host fiber; React then REPLAYS
 * the host element's begin phase — but the hydration cursor already moved into
 * `<main>` on the first attempt, so the replayed claim compares `main` against
 * its own first child and throws #418 ("server rendered HTML didn't match").
 * Intermittent by nature: it fires only when the RSC chunk lands after the
 * hydrator reaches `<main>` (measured 2–4 of 12 cold loads on /opportunities,
 * /inbox; byte-identical server HTML on failing and passing loads).
 *
 * A function component between the host element and the slots moves that
 * suspension onto a fiber that claims no DOM, so its replay cannot desync the
 * cursor. Renders exactly its children — no element, no behaviour.
 * Guard: lib/guards/hydration-slot-boundary.test.ts.
 */
function SlotBoundary({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

export function DashboardChrome({
  children,
  headerTitle,
  nav,
  rexora,
}: {
  children: React.ReactNode;
  headerTitle: string;
  nav: ConversationNavLabels;
  rexora: React.ReactNode;
}) {
  const pathname = usePathname();
  const mode = dashboardChromeMode(pathname);

  // Flag the conversation surface on <html> so globals.css can lift the global
  // language-feedback FAB above the chat's composer. The FAB is a SIBLING of
  // this component, so a custom property set on the chat subtree would never
  // reach it — and without the lift the composer's `z-50` buries an
  // interactive control that stays visible but unclickable.
  useEffect(() => {
    if (mode !== "conversation") return;
    const root = document.documentElement;
    root.dataset.surface = "conversation";
    return () => {
      delete root.dataset.surface;
    };
  }, [mode]);

  // Conversation: bare — the chat is self-contained (h-[100dvh], own header).
  if (mode === "conversation") {
    return <>{children}</>;
  }

  // Panel: a CONTEXTUAL WORKSPACE of the conversation (owner audit §4.4) —
  // the same minimal top bar with the back-home affordance; no parallel tab
  // system, no bottom bar.
  if (mode === "panel") {
    return (
      <div className="flex min-h-[100dvh] flex-col bg-ink-900" data-chrome="simple" data-surface={mode}>
        <ConversationHeader title={headerTitle} nav={nav} />
        <main className="relative z-10 mx-auto w-full max-w-container flex-1 px-4 py-6 pb-[calc(2.5rem+env(safe-area-inset-bottom))] sm:px-12 md:pb-8">
          <SlotBoundary>
            {children}
            {/* The Rexora product credit (owner directive 2026-07-14, pinned by
                legal-entity-truth.test.ts) used to hang off the FULL chrome. Now
                that full serves only the admin console it would have vanished
                from every user-facing surface, so it hangs here instead — the
                same one-line credit, in the shell the product actually uses. */}
            {/* The map is the product's own working surface: no partner credit
                line under it (owner direction — one clean map). */}
            {pathname === MARKET_MAP_PATH ? null : rexora}
          </SlotBoundary>
        </main>
      </div>
    );
  }

  // Full: the internal operator console. It renders THE SAME one top bar
  // (owner order 2026-10-25: one navigation system). Its former private
  // header — a sideways-scrolling tab row, the role switcher as a SECOND
  // workspace selector, a truncating logo — and its phone bottom bar are
  // gone: the admin console is one more destination in the header's "More",
  // highlighted while the operator works inside it, and the phone sheet
  // carries every destination at once.
  return (
    <div className="flex min-h-[100dvh] flex-col bg-ink-900" data-chrome="full" data-surface={mode}>
      <ConversationHeader title={headerTitle} nav={nav} />
      <main className="relative z-10 mx-auto w-full max-w-container flex-1 px-4 py-6 pb-[calc(2.5rem+env(safe-area-inset-bottom))] sm:px-12 md:pb-8">
        <SlotBoundary>
          {children}
          {rexora}
        </SlotBoundary>
      </main>
    </div>
  );
}
