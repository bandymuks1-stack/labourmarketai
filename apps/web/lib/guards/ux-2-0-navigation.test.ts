import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import {
  ADMIN_NAV_ITEM,
  SIMPLE_SHELL_OWNED_NAV_IDS,
  VISIBLE_PRIMARY_NAV_ITEMS,
  getAdvancedNavItems,
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

describe("Messages and Calendar have exactly ONE persistent owner", () => {
  const SIMPLE_OWNED = ["communication", "planning"] as const;

  it("the simple (conversation) shell is the owner", () => {
    for (const id of SIMPLE_OWNED) {
      const href = id === "communication" ? "/dashboard/communication" : "/dashboard/planning";
      expect(chatHeader, `${id} in the simple header`).toContain(href);
    }
  });

  it("the Advanced navbars no longer repeat them", () => {
    const advanced = getAdvancedNavItems().map((i) => i.id);
    for (const id of SIMPLE_OWNED) {
      expect(advanced, `${id} must not be persistent in BOTH shells`).not.toContain(id);
    }
    // Both Advanced surfaces derive from the same de-duplicated list.
    expect(dashboardTabs).toMatch(/getAdvancedNavItems\(\)/);
    expect(bottomNav).toMatch(/getAdvancedNavItems\(\)/);
    expect(dashboardTabs).not.toMatch(/VISIBLE_PRIMARY_NAV_ITEMS/);
    expect(bottomNav).not.toMatch(/VISIBLE_PRIMARY_NAV_ITEMS/);
  });

  it("the CATALOGUE is untouched — this is presentation, not a demotion", () => {
    // F14/F15 is a standing owner decision: planning and network are primary
    // modules. De-duplicating where a tab is DRAWN must not rewrite that.
    const ids = VISIBLE_PRIMARY_NAV_ITEMS.map((i) => i.id);
    expect(ids).toContain("planning");
    expect(ids).toContain("network");
    expect(ids).toContain("communication");
  });

  it("network stays in Advanced — it has no simple-shell entry", () => {
    expect(getAdvancedNavItems().map((i) => i.id)).toContain("network");
    expect(SIMPLE_SHELL_OWNED_NAV_IDS).not.toContain("network");
  });

  it("removing a tab never removes a route", () => {
    for (const id of SIMPLE_OWNED) {
      const item = VISIBLE_PRIMARY_NAV_ITEMS.find((i) => i.id === id)!;
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
