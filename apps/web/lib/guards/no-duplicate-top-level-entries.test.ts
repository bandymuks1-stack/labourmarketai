import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  VISIBLE_PRIMARY_NAV_ITEMS,
  ADMIN_NAV_ITEM,
} from "../config/navigation";

/**
 * Anti-regression guard — "no duplicate top-level entries" (cleanup P0, owner
 * priority #5).
 *
 * The product was repeatedly cleaned (PRs #497–#501) toward: one clear
 * top-level place per concept, a focused mobile bottom nav, admin reachable but
 * not dominating navigation, and one canonical map. This guard freezes those
 * boundaries in CI so a future change can't silently re-introduce a duplicate
 * top-level exit / competing primary entry.
 *
 * It deliberately overlaps `compact-nav-marketplace-ia` + `mobile-map-workspace`
 * — consolidating the "no duplicate top-level entries" invariant under one
 * named guard is the point (a single place to read the rule).
 */

const ROOT = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

describe("the global primary nav is the compact, non-duplicated set", () => {
  it("primary nav = exactly overview / market_map / communication / account_roles", () => {
    expect(VISIBLE_PRIMARY_NAV_ITEMS.map((i) => i.id)).toEqual([
      "overview",
      "market_map",
      "communication",
      "account_roles",
    ]);
  });

  it("each primary concept has ONE href (no duplicate primary destinations)", () => {
    const hrefs = VISIBLE_PRIMARY_NAV_ITEMS.map((i) => i.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });
});

describe("the mobile bottom nav stays the focused core (no extra top-level entries)", () => {
  const bottom = read("components/app/bottom-nav.tsx");

  it("renders the catalogue-driven core items only — admin is NOT appended", () => {
    expect(bottom).toMatch(/VISIBLE_PRIMARY_NAV_ITEMS/);
    expect(bottom, "bottom nav must not append the admin item").not.toMatch(
      /ADMIN_NAV_ITEM/,
    );
  });
});

describe("admin stays reachable but does not dominate navigation", () => {
  it("admin item targets /dashboard/admin", () => {
    expect(ADMIN_NAV_ITEM.href).toBe("/dashboard/admin");
  });

  it("admin is exposed only via gated secondary surfaces (desktop tabs + account menu)", () => {
    const tabs = read("components/app/dashboard-tabs.tsx");
    const menu = read("components/app/account-menu.tsx");
    // desktop tabs append the admin item gated by isAdmin
    expect(tabs).toMatch(/ADMIN_NAV_ITEM/);
    expect(tabs).toMatch(/isAdmin/);
    // account dropdown gates the admin link by isAdmin
    expect(menu).toMatch(/\/dashboard\/admin/);
    expect(menu).toMatch(/isAdmin/);
  });
});

describe("one canonical market map (no separate/competing map products)", () => {
  it("the market-map page mounts exactly one map engine", () => {
    const page = read("app/[locale]/dashboard/market-map/page.tsx");
    expect((page.match(/<MarketMapBase\b/g) ?? []).length).toBe(1);
  });

  it("/dashboard/marketplace redirects to the one map (not a competing surface)", () => {
    const mk = read("app/[locale]/dashboard/marketplace/page.tsx");
    expect(mk).toMatch(/redirect\(/);
    expect(mk).toMatch(/\/dashboard\/market-map/);
  });
});

describe("logout is the single intended pair (header dropdown + settings), no scatter", () => {
  it("logout posts to the auth/logout route from the account menu + account page only", () => {
    const menu = read("components/app/account-menu.tsx");
    const account = read("app/[locale]/dashboard/account/page.tsx");
    expect(menu).toMatch(/auth\/logout/);
    expect(account).toMatch(/auth\/logout/);
  });
});
