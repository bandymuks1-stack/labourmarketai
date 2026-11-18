import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  ADMIN_NAV_ITEM,
  CORE_NAV_IDS,
  getAdvancedNavItems,
  getCoreNavItems,
  getHeaderOverflowNavItems,
} from "@/lib/config/navigation";
import {
  activeNavItem,
  headerPlaceLabelKey,
  pathIsInside,
} from "@/lib/navigation/header-place";

/**
 * ONE NAVIGATION SYSTEM (owner order 2026-10-25).
 *
 * The owner's production screenshot (1862px, /lt/dashboard/admin/users/<id>)
 * showed the operator console's own header: the workspace chip laid over the
 * first tab, the tab row in a horizontal scroll strip with a scrollbar and
 * arrow buttons, the logo cut to "Labour…", and a SECOND workspace selector
 * (the role switcher naming the same organization) beside the avatar. That
 * header was a second implementation of the bar every other route already
 * used. The repair is ONE header for every route, with priority + "More"
 * instead of sideways scrolling, and a bottom sheet on phones.
 *
 * Browser evidence (overlap, scroll strips, truncation at 390/768/1280/1920)
 * is the PR's screenshot walk; these source-level pins keep the structure
 * from drifting back.
 */

const APP_ROOT = join(__dirname, "..", "..");
const read = (rel: string): string => readFileSync(join(APP_ROOT, rel), "utf8");

const header = read("components/app/conversation/chat/conversation-header.tsx");
const chrome = read("components/app/dashboard-chrome.tsx");
const layout = read("app/[locale]/dashboard/layout.tsx");

describe("one header for every dashboard route", () => {
  it("the operator console renders THE header, not its own", () => {
    // conversation + panel + full: the same component in every mode.
    expect(chrome.match(/<ConversationHeader\b/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
    expect(chrome).not.toMatch(/fullHeader|fullBottomNav/);
    expect(layout).not.toMatch(/fullHeader|fullBottomNav/);
  });

  it("the second workspace selector and the scrolling tab row are not mounted", () => {
    expect(layout).not.toMatch(/<RoleSwitcher\b/);
    expect(layout).not.toMatch(/<DashboardTabs\b/);
    expect(layout).not.toMatch(/<BottomNav\b/);
    expect(chrome).not.toMatch(/<RoleSwitcher\b|<DashboardTabs\b|<BottomNav\b/);
    // The one workspace selector stays in the one header.
    expect(header).toMatch(/<WorkspaceChip \/>/);
  });

  it("nothing in the header scrolls sideways or truncates a label", () => {
    expect(header).not.toMatch(/overflow-x-(auto|scroll)/);
    // The identity block never shrinks: the logo cannot be cut.
    expect(header).toMatch(/order-1 flex flex-none items-center gap-2/);
    expect(header).toMatch(/whitespace-nowrap font-display/);
  });

  it("priority + More on wide screens, a bottom sheet on phones", () => {
    expect(header).toMatch(/data-testid="header-nav-more"/);
    expect(header).toMatch(/data-testid="header-nav-sheet-trigger"/);
    expect(header).toMatch(/<MobileSheet\b/);
    // The active destination always names itself ("where am I").
    expect(header).toMatch(/active \? ACTIVE_LABEL : CORE_LABEL/);
    expect(header).toMatch(/const CORE_LABEL = "hidden xl:inline"/);
    expect(header).toMatch(/const ACTIVE_LABEL = "hidden lg:inline"/);
    expect(header).toMatch(/aria-current=\{active \? "page" : undefined\}/);
  });
});

describe("the header nav model is the catalogue, split by priority", () => {
  it("primary is the core loop; More is every other catalogue destination", () => {
    expect(getCoreNavItems().map((i) => i.id)).toEqual([...CORE_NAV_IDS]);
    const more = getHeaderOverflowNavItems({ isAdmin: false }).map((i) => i.id);
    const extras = getAdvancedNavItems()
      .map((i) => i.id)
      .filter((id) => !(CORE_NAV_IDS as readonly string[]).includes(id));
    expect(more).toEqual(extras);
    expect(more).toContain("market_map");
    expect(more).toContain("network");
  });

  it("the admin console joins More for admins only", () => {
    expect(getHeaderOverflowNavItems({ isAdmin: false }).map((i) => i.id)).not.toContain("admin");
    const admin = getHeaderOverflowNavItems({ isAdmin: true });
    expect(admin[admin.length - 1]).toEqual(ADMIN_NAV_ITEM);
  });

  it("every destination is reachable from both the wide bar and the phone sheet", () => {
    // Both render from the same two lists; neither spells a route.
    expect(header).toMatch(/const allItems = \[\.\.\.primary, \.\.\.overflow\]/);
    expect(header).toMatch(/items=\{allItems\}/);
    expect(header).toMatch(/items=\{overflow\}/);
    expect(header).not.toMatch(/"\/dashboard\/(planning|journal|communication|network|market-map|admin)"/);
  });
});

describe("where am I", () => {
  const items = [...getCoreNavItems(), ...getHeaderOverflowNavItems({ isAdmin: true })];

  it("home is only the home; areas include their sub-pages", () => {
    expect(pathIsInside("/dashboard", "/dashboard")).toBe(true);
    expect(pathIsInside("/dashboard/journal", "/dashboard")).toBe(false);
    expect(pathIsInside("/dashboard/journal/abc", "/dashboard/journal")).toBe(true);
    expect(pathIsInside("/dashboard/journalx", "/dashboard/journal")).toBe(false);
  });

  it("the admin console's deep pages highlight the admin destination", () => {
    expect(activeNavItem("/dashboard/admin/users/123", items)?.id).toBe("admin");
    expect(activeNavItem("/dashboard", items)?.id).toBe("overview");
    expect(activeNavItem("/dashboard/planning", items)?.id).toBe("planning");
    expect(activeNavItem("/dashboard/company", items)).toBeNull();
  });

  it("surfaces the nav does not name get a place crumb from the module registry", () => {
    expect(headerPlaceLabelKey("/dashboard/projects/abc", items)).toBe("projects.title");
    expect(headerPlaceLabelKey("/dashboard/company/planning", items)).toBe(
      "workforcePlanning.module.title",
    );
    // A catalogue module is named by its feature (a place), not its card action.
    expect(headerPlaceLabelKey("/dashboard/profile", items)).toBe(
      "features.profile_text_first.label",
    );
  });

  it("no crumb repeats what the highlighted nav item already says", () => {
    expect(headerPlaceLabelKey("/dashboard/journal", items)).toBeNull();
    expect(headerPlaceLabelKey("/dashboard/network/people", items)).toBeNull();
    expect(headerPlaceLabelKey("/dashboard", items)).toBeNull();
    expect(headerPlaceLabelKey("/dashboard/admin/users/1", items)).toBeNull();
  });
});
