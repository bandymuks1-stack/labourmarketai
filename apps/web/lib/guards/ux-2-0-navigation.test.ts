import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import {
  ADMIN_NAV_ITEM,
  CORE_NAV_IDS,
  VISIBLE_PRIMARY_NAV_ITEMS,
  getAdvancedNavItems,
  getCoreNavItems,
} from "@/lib/config/navigation";

/**
 * UX 2.0 — navigation discovery (stage 6).
 *
 * The audit's P0-4 said "42 route directories behind one Advanced door" and
 * proposed building a command palette. The reality check found one ALREADY
 * built — `CommandFinder` + `HeaderSearch`, ⌘K-bound, on every Advanced page —
 * and merely absent from the chat shell. So this stage surfaces the existing
 * mechanism and de-duplicates the two persistent navs. It removes no route,
 * renames no URL and disables no feature.
 *
 * Negative controls (audit list items 10, 11, 12 + ACL):
 *   • the command search disappearing from the chat shell
 *   • a route becoming unreachable
 *   • Messages or Calendar shown as persistent nav in BOTH shells again
 *   • a role-restricted destination leaking to a role that may not see it
 */

const APP_ROOT = join(__dirname, "..", "..");
const read = (rel: string): string => readFileSync(join(APP_ROOT, rel), "utf8");

const chatHeader = read("components/app/conversation/chat/conversation-header.tsx");
const headerSearch = read("components/app/header-search.tsx");
const dashboardTabs = read("components/app/dashboard-tabs.tsx");
const bottomNav = read("components/app/bottom-nav.tsx");
const navConfig = read("lib/config/navigation.ts");

describe("the chat shell reuses the ONE command search", () => {
  it("mounts the existing component, not a copy", () => {
    expect(chatHeader).toMatch(/from "@\/components\/app\/header-search"/);
    expect(chatHeader).toMatch(/<HeaderSearch/);
    // A second finder, registry or matcher would defeat the whole point.
    expect(chatHeader).not.toMatch(/CommandFinder/);
    expect(chatHeader).not.toMatch(/matchCommands/);
    expect(chatHeader).not.toMatch(/COMMAND_REGISTRY/);
  });

  it("there is exactly one CommandFinder mount path — the shared overlay", () => {
    expect(headerSearch).toMatch(/<CommandFinder \/>/);
    // The finder itself is the single implementation of search.
    expect(existsSync(join(APP_ROOT, "components/app/command-finder.tsx"))).toBe(true);
    expect(existsSync(join(APP_ROOT, "lib/navigation/command-registry.ts"))).toBe(true);
  });

  it("keeps one keyboard contract and one role filter", () => {
    expect(headerSearch).toMatch(/metaKey \|\| e\.ctrlKey/);
    expect(headerSearch).toMatch(/"Escape"/);
    // Role filtering lives in the registry matcher, not duplicated per surface.
    expect(read("components/app/command-finder.tsx")).toMatch(/matchCommands\(/);
  });
});

describe("the command dialog is properly modal", () => {
  it("is announced as a dialog from a labelled trigger", () => {
    expect(headerSearch).toMatch(/aria-haspopup="dialog"/);
    expect(headerSearch).toMatch(/aria-expanded=\{open\}/);
    expect(headerSearch).toMatch(/role="dialog"/);
    expect(headerSearch).toMatch(/aria-modal="true"/);
    expect(headerSearch).toMatch(/aria-label=\{t\("title"\)\}/);
  });

  it("Escape closes it", () => {
    expect(headerSearch).toMatch(/if \(e\.key === "Escape"\) setOpen\(false\)/);
  });

  it("focus RETURNS to the trigger on close", () => {
    // Closing without returning focus dumps a keyboard user at the top of the
    // document and they lose their place entirely.
    expect(headerSearch).toMatch(/triggerRef/);
    expect(headerSearch).toMatch(
      /wasOpen\.current && !open[\s\S]*triggerRef\.current\?\.focus\(\)/,
    );
  });

  it("Tab is trapped inside the panel while it is open", () => {
    expect(headerSearch).toMatch(/e\.key !== "Tab"/);
    expect(headerSearch).toMatch(/shiftKey/);
    expect(headerSearch).toMatch(/preventDefault\(\)/);
    // Hidden-but-focusable nodes must not be part of the cycle.
    expect(headerSearch).toMatch(/offsetParent !== null/);
  });
});

describe("ONE core work loop, rendered identically by BOTH shells (rebuild W5)", () => {
  // Supersedes the earlier "single persistent owner" split: giving each
  // destination one owning shell removed literal duplication but kept two
  // DIFFERENT nav systems — the real-user test showed people lose
  // orientation when the primary tabs change identity between screens.
  // The owner-directed fix: one shared core list (chat → journal → calendar
  // → messages) from ONE source, rendered by both shells.

  it("the core is exactly chat → discover → journal → calendar → messages, in order (Discover joined 2026-10-02: the offer/seek world must not hide behind the command search)", () => {
    expect([...CORE_NAV_IDS]).toEqual([
      "overview",
      "discover",
      "journal_text_first",
      "planning",
      "communication",
    ]);
    expect(getCoreNavItems().map((i) => i.id)).toEqual([...CORE_NAV_IDS]);
  });

  it("the core nav renders in a surface a NON-ADMIN actually gets", () => {
    // THE DEFECT CLASS THIS PINS, which cost a real person the calendar on
    // 2026-09-27: a destination can be `active` + `safeToShowInPrimaryNav` in
    // the catalogue, have a real route, have a nav entry, pass every existing
    // nav test — and still be invisible to every non-admin, because the only
    // components that render the catalogue mount in `full` chrome and
    // `dashboardChromeMode` hands `full` to /dashboard/admin alone.
    //
    // "It is in the catalogue" is therefore NOT a reachability proof, and
    // neither is "it has a nav tab". The proof has to end at a surface an
    // ordinary person is given. That surface is this header: the chat renders
    // it on the home and `DashboardChrome` renders it on every `panel` route,
    // which between them is every route a non-admin has.
    expect(chatHeader).toMatch(/getCoreNavItems\(\)/);
    // The chain that makes this header universal — both halves must hold, or
    // the header above stops covering everyone again.
    const chat = read("components/app/conversation/chat/conversation-chat.tsx");
    const chrome = read("components/app/dashboard-chrome.tsx");
    expect(chat).toMatch(/<ConversationHeader/);
    expect(chrome).toMatch(/<ConversationHeader/);
    // `panel` is the default for every non-admin route (the fall-through the
    // "never switches chrome" test below pins), so the two together cover the
    // home plus everything else.
    expect(read("lib/config/navigation.ts")).toMatch(/return "panel";/);
    // The admin-only surfaces must NOT be how a core item becomes reachable.
    // If someone ever "fixes" a hidden item by mounting BottomNav/DashboardTabs
    // for everyone, that is a second nav model and this stays the single one.
    expect(chrome).not.toMatch(/getCoreNavItems\(\)/);
  });

  it("the simple shell is the ONE operating center — ONE nav, and it is reachable (owner ruling 2026-09-27)", () => {
    // ── WHAT CHANGED AND WHY (this assertion used to say the opposite)
    //
    // Decision 0017 removed the four-tab row from this bar, and this test
    // pinned its absence: `expect(chatHeader).not.toMatch(/getCoreNavItems\(\)/)`.
    // The reasoning was that capability survived in the command search and the
    // conversation's chips, so only a redundant PRESENTATION was removed.
    //
    // Walked by a real person on production on 2026-09-27, that reasoning was
    // false: THE CALENDAR COULD NOT BE FOUND. `/dashboard/planning` exists and
    // the catalogue had it `active` + `safeToShowInPrimaryNav: true` the whole
    // time, but the only surfaces that render the catalogue (`DashboardTabs`,
    // `BottomNav`) mount ONLY in `full` chrome, which `dashboardChromeMode`
    // gives to `/dashboard/admin` alone. So the core loop was visible to
    // admins and to nobody else — and `journal_text_first` and `communication`
    // were hidden by the same mechanism, not just `planning`.
    //
    // The owner's ruling: the core items must be reachable from the main
    // navigation a normal authenticated person actually gets. So the bar
    // carries the core list again — from `getCoreNavItems()`, the same single
    // source both Advanced surfaces use, which is why this is ONE nav model
    // and not the "parallel tab system" §4.4 forbade. What §4.4 still forbids,
    // and what this test still pins below, is a SECOND list or a second
    // source of truth.
    expect(chatHeader).toMatch(/getCoreNavItems\(\)/);
    // The catalogue stays the only source: no hand-spelled destinations and no
    // private icon map in this component (both surfaces share `NAV_ICONS`).
    expect(chatHeader).toMatch(/NAV_ICONS/);
    expect(chatHeader).not.toMatch(/"\/dashboard\/planning"/);
    expect(chatHeader).not.toMatch(/"\/dashboard\/journal"/);
    expect(chatHeader).not.toMatch(/"\/dashboard\/communication"/);
    // And the bar keeps everything §4.4 put in it.
    expect(chatHeader).toMatch(/back-to-chat/);
    expect(chatHeader).toMatch(/WorkspaceChip/);
    expect(chatHeader).toMatch(/NotificationPanel/);
    expect(chatHeader).toMatch(/AccountMenu/);
    // Advanced is GONE from the bar for the ordinary user.
    expect(chatHeader).not.toMatch(/dashboard\/advanced/);
  });

  it("the Advanced navbars START with the same core, then the module extras", () => {
    const advanced = getAdvancedNavItems().map((i) => i.id);
    expect(advanced.slice(0, CORE_NAV_IDS.length)).toEqual([...CORE_NAV_IDS]);
    // The map is the spatial lens INSIDE Discover (2026-10-02), no longer a tab.
    expect(advanced).toContain("discover");
    expect(advanced).not.toContain("market_map");
    expect(advanced).toContain("network");
    // Both Advanced surfaces derive from the same list.
    expect(dashboardTabs).toMatch(/getAdvancedNavItems\(\)/);
    expect(bottomNav).toMatch(/getAdvancedNavItems\(\)/);
    expect(dashboardTabs).not.toMatch(/VISIBLE_PRIMARY_NAV_ITEMS/);
    expect(bottomNav).not.toMatch(/VISIBLE_PRIMARY_NAV_ITEMS/);
  });

  it("the CATALOGUE stays the single source — no demotion", () => {
    const ids = VISIBLE_PRIMARY_NAV_ITEMS.map((i) => i.id);
    expect(ids).toContain("planning");
    expect(ids).toContain("network");
    expect(ids).toContain("communication");
    expect(ids).toContain("journal_text_first");
  });

  it("the core loop never switches chrome — because NOTHING user-facing does", () => {
    const chrome = read("components/app/dashboard-chrome.tsx");
    // This used to assert that "/dashboard/journal" appeared in a hand-kept
    // PANEL_PREFIXES list. That list is gone: the simple shell is now the
    // DEFAULT for every product route, so the journal cannot leave it, and
    // neither can opportunities, the company hub, bookings or the map. The
    // guarantee got stronger, so the assertion has to pin the stronger fact —
    // a route the author forgot can no longer fall through to the legacy
    // module chrome, because there is no fall-through left.
    // The rule is the pure `dashboardChromeMode` in lib/config/navigation.ts
    // (owner decision 0017 moved it beside the canonical admin nav item).
    const rule = read("lib/config/navigation.ts");
    expect(rule).toMatch(/return "panel";/);
    expect(chrome).toMatch(/dashboardChromeMode\(pathname\)/);
    // The ONE escape is the internal operator console, and it is named by the
    // canonical admin nav item — never re-spelled as a literal here.
    expect(rule).toMatch(/ADMIN_NAV_ITEM\.href/);
    // No second list of "routes that get the simple shell" may come back:
    // that list is exactly what let the ruling apply to four routes only.
    expect(chrome).not.toMatch(/PANEL_PREFIXES/);
  });

  it("unifying tabs never removes a route", () => {
    for (const item of getCoreNavItems()) {
      if (item.href === "/dashboard") continue;
      const dir = item.href.replace("/dashboard/", "");
      expect(
        existsSync(join(APP_ROOT, "app", "[locale]", "dashboard", dir)),
        `${item.href} must still exist`,
      ).toBe(true);
    }
  });
});

describe("nothing became unreachable", () => {
  /** Every dashboard route directory that renders a page. */
  function routeDirs(): string[] {
    const base = join(APP_ROOT, "app", "[locale]", "dashboard");
    return readdirSync(base, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .filter((n) => existsSync(join(base, n, "page.tsx")));
  }

  it("the route inventory did not shrink", () => {
    // 42 directories was the audit's measurement; the floor guards against a
    // "cleanup" that deletes destinations instead of de-emphasising them.
    expect(routeDirs().length).toBeGreaterThanOrEqual(30);
  });

  it("every catalogue destination still has a page", () => {
    for (const item of [...VISIBLE_PRIMARY_NAV_ITEMS, ADMIN_NAV_ITEM]) {
      if (item.href === "/dashboard") continue;
      const dir = item.href.replace("/dashboard/", "");
      expect(
        existsSync(join(APP_ROOT, "app", "[locale]", "dashboard", dir, "page.tsx")),
        `${item.href} (${item.id}) must resolve`,
      ).toBe(true);
    }
  });

  it("Advanced keeps a real orientation nav — it is not an empty surface", () => {
    // Fully removing the navbar would trade one orientation problem for another.
    expect(getAdvancedNavItems().length).toBeGreaterThanOrEqual(4);
  });

  it("admin stays gated by permission, not by navigation", () => {
    expect(dashboardTabs).toMatch(/isAdmin && !adminUiHidden/);
    expect(navConfig).toMatch(/ADMIN_NAV_ITEM/);
    // Admin is appended, never part of the de-duplicated primary list.
    expect(getAdvancedNavItems().map((i) => i.id)).not.toContain("admin");
  });
});
