import { describe, expect, it } from "vitest";
import { isCanonicallyRedirected } from "./canonical-redirects";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  VISIBLE_PRIMARY_NAV_ITEMS,
  ADMIN_NAV_ITEM,
} from "../config/navigation";
import { getFeatureConfig } from "../config/feature-availability";

/**
 * UPDATE 2026-10-02 (owner decision, see discover-ia.test.ts): the second tab
 * is now DISCOVER (/dashboard/market) - the broader offer/seek world - and the
 * map is its spatial lens, not a tab. The rest of this file's history is kept
 * for context.
 *
 * Compact, MAP-FIRST navigation IA guard.
 *
 * Owner direction (action-first IA v1): the map (Žemėlapis) is its own PRIMARY
 * product surface — the central visual market layer — reached directly from the
 * global nav, not hidden inside an abstract "marketplace" hub. The compact
 * global nav is ACTION-FIRST: Mano erdvė / Žemėlapis / Darbo žurnalas / Žinutės
 * (+ Admin only for admins). Settings/account moved to the avatar menu (a
 * utility, not a primary action). Profile / CV / player-card live UNDER Mano
 * erdvė (the result of journaling), not as competing tabs. The marketplace
 * concept (offers / shop / rentals) becomes FUTURE LAYERS of the map (disabled
 * legend filters), never fake data.
 *
 * This guard freezes that decision in CI so a later refactor can't re-bury the
 * map or re-bloat the global nav.
 */

const ROOT = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");
const ACTIVE_LOCALES = ["lt", "en", "ru"] as const;
const MAP = "app/[locale]/dashboard/market-map/page.tsx";


describe("the global nav is the compact, map-first set, in order", () => {
  it("primary nav ids = overview, discover, journal_text_first, communication, planning, network (production UX repair v2 F14/F15: the calendar and the network are core modules and must be findable through normal navigation)", () => {
    expect(VISIBLE_PRIMARY_NAV_ITEMS.map((i) => i.id)).toEqual([
      "overview",
      "discover",
      "journal_text_first",
      "communication",
      "planning",
      "network",
    ]);
  });

  it("the Discover tab routes to the role-aware Discover destination; the map is its lens, not a tab (owner decision 2026-10-02, see discover-ia.test.ts)", () => {
    const f = getFeatureConfig("discover");
    expect(f.availability).toBe("active");
    expect(f.safeToShowInPrimaryNav).toBe(true);
    expect(f.primaryRoute).toBe("/dashboard/market");
    const item = VISIBLE_PRIMARY_NAV_ITEMS.find((i) => i.id === "discover");
    expect(item?.href).toBe("/dashboard/market");
    // The map stays a real, active product surface - one tap inside Discover.
    const map = getFeatureConfig("market_map");
    expect(map.availability).toBe("active");
    expect(map.primaryRoute).toBe("/dashboard/market-map");
    expect(map.safeToShowInPrimaryNav).toBe(false);
  });

  it("the marketplace hub is SECONDARY — active but not a global tab", () => {
    const f = getFeatureConfig("marketplace_hub");
    expect(f.availability).toBe("active");
    expect(f.safeToShowInPrimaryNav).toBe(false);
  });

  it("Darbo žurnalas IS a primary action tab (action-first)", () => {
    const f = getFeatureConfig("journal_text_first");
    expect(f.availability).toBe("active");
    expect(f.safeToShowInPrimaryNav).toBe(true);
    expect(f.primaryRoute).toBe("/dashboard/journal");
    const item = VISIBLE_PRIMARY_NAV_ITEMS.find((i) => i.id === "journal_text_first");
    expect(item?.href).toBe("/dashboard/journal");
  });

  it("profile stays ACTIVE but is NOT a primary tab (lives under Mano erdvė)", () => {
    const f = getFeatureConfig("profile_text_first");
    expect(f.availability).toBe("active");
    expect(f.safeToShowInPrimaryNav).toBe(false);
  });

  it("account/settings is ACTIVE but NOT a primary tab (moved to avatar menu)", () => {
    const f = getFeatureConfig("account_roles");
    expect(f.availability).toBe("active");
    expect(f.safeToShowInPrimaryNav).toBe(false);
  });
});

describe("Admin is a permission-gated nav item, never shown to non-admins", () => {
  it("ADMIN_NAV_ITEM points at /dashboard/admin", () => {
    expect(ADMIN_NAV_ITEM.href).toBe("/dashboard/admin");
    expect(ADMIN_NAV_ITEM.id).toBe("admin");
  });

  it("desktop tabs gate the admin item behind isAdmin", () => {
    const src = read("components/app/dashboard-tabs.tsx");
    expect(src, "dashboard-tabs imports ADMIN_NAV_ITEM").toMatch(/ADMIN_NAV_ITEM/);
    expect(src, "dashboard-tabs reads isAdmin").toMatch(/isAdmin/);
  });

  it("admin stays reachable for admins via the account dropdown", () => {
    const menu = read("components/app/account-menu.tsx");
    expect(menu).toMatch(/isAdmin/);
    expect(menu).toMatch(/\/dashboard\/admin/);
  });

  it("the mobile bottom nav stays the focused core (NO admin tab crowding it)", () => {
    const src = read("components/app/bottom-nav.tsx");
    expect(src, "bottom-nav must not append the admin item").not.toMatch(
      /ADMIN_NAV_ITEM/,
    );
  });
});

describe("the map is the primary surface; marketplace is secondary", () => {
  const map = read(MAP);

  it("the Žemėlapis nav tab uses the map label, not an abstract word", () => {
    const nav = read("lib/config/navigation.ts");
    expect(nav).toMatch(
      /market_map:\s*\{[\s\S]{0,600}tabLabelKey:\s*"auth\.dashboard\.tabs\.marketMap"/,
    );
  });

  it("the map page is map-first: the ONE map leads (WorldDiscovery)", () => {
    expect(map).toMatch(/<WorldDiscovery\b/);
    expect(map).not.toMatch(/<MarketMapBase\b/);
  });

  it("the map page carries NO layers catalogue — layers appear only where data exists", () => {
    // Deliberately removed (one-canonical-map): the "visible now / coming
    // later" legend (`MapLayersLegend`) was a catalogue of layers that do not
    // exist. The layer pills of the one map come from real reads only.
    expect(map).not.toMatch(/<MapLayersLegend\b/);
  });

  it("/dashboard/marketplace redirects to Discover (the marketplace home)", () => {
    expect(isCanonicallyRedirected("/dashboard/marketplace", "/dashboard/market")).toBe(true);
  });
});

describe("compact map-first nav + legend i18n exists in every active locale", () => {
  for (const loc of ACTIVE_LOCALES) {
    const m = JSON.parse(read(`messages/${loc}.json`));
    it(`${loc}: map + admin tab labels exist`, () => {
      expect(m.auth.dashboard.tabs.marketMap).toBeTruthy();
      expect(m.auth.dashboard.tabs.admin).toBeTruthy();
    });
    it(`${loc}: the removed layers catalogue is gone (no mapLayers namespace)`, () => {
      expect(m.mapLayers).toBeUndefined();
    });
  }
});
