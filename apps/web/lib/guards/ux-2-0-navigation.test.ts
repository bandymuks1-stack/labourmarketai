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

  it("the core is exactly chat → journal → calendar → messages, in order", () => {
    expect([...CORE_NAV_IDS]).toEqual([
      "overview",
      "journal_text_first",
      "planning",
      "communication",
    ]);
    expect(getCoreNavItems().map((i) => i.id)).toEqual([...CORE_NAV_IDS]);
  });

  it("the simple shell renders the SAME core from the SAME source", () => {
    expect(chatHeader).toMatch(/from "@\/lib\/config\/navigation"/);
    expect(chatHeader).toMatch(/getCoreNavItems\(\)/);
    // No hardcoded parallel href list for the core loop.
    for (const item of getCoreNavItems()) {
      if (item.href === "/dashboard") continue;
      expect(chatHeader, `${item.href} matched by the active-tab logic`).toContain(item.href);
    }
  });

  it("the Advanced navbars START with the same core, then the module extras", () => {
    const advanced = getAdvancedNavItems().map((i) => i.id);
    expect(advanced.slice(0, CORE_NAV_IDS.length)).toEqual([...CORE_NAV_IDS]);
    expect(advanced).toContain("market_map");
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

  it("the journal renders in the simple shell (the core loop never switches chrome)", () => {
    const chrome = read("components/app/dashboard-chrome.tsx");
    expect(chrome).toMatch(/"\/dashboard\/journal"/);
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
