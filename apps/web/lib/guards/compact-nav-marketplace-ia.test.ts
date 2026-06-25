import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  VISIBLE_PRIMARY_NAV_ITEMS,
  ADMIN_NAV_ITEM,
} from "../config/navigation";
import { getFeatureConfig } from "../config/feature-availability";

/**
 * Compact navigation + Marketplace hub IA guard (IA cleanup v2).
 *
 * Owner correction after PR #496: the authenticated product was still too
 * modular. The global top nav must be the COMPACT, role-aware set —
 * Mano erdvė / Marketplace / Žinutės / Nustatymai (+ Admin only for admins).
 * Profile, Mano CV, the map, company, calendar, offers, shop and rentals live
 * as logical SUB-surfaces (inside the active identity / the Marketplace hub),
 * never as a global tab each.
 *
 * This guard freezes that decision in CI so a later refactor can't quietly
 * re-bloat the global nav, and asserts the Marketplace hub is honest (links to
 * real surfaces; preparing surfaces are labelled, never fake listings).
 */

const ROOT = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");
const ACTIVE_LOCALES = ["lt", "en", "ru"] as const;
const HUB = "app/[locale]/dashboard/marketplace/page.tsx";

describe("the global nav is the compact set, in order", () => {
  it("primary nav ids = overview, marketplace_hub, communication, account_roles", () => {
    expect(VISIBLE_PRIMARY_NAV_ITEMS.map((i) => i.id)).toEqual([
      "overview",
      "marketplace_hub",
      "communication",
      "account_roles",
    ]);
  });

  it("marketplace_hub is active, primary-nav-safe, routes to /dashboard/marketplace", () => {
    const f = getFeatureConfig("marketplace_hub");
    expect(f.availability).toBe("active");
    expect(f.safeToShowInPrimaryNav).toBe(true);
    expect(f.primaryRoute).toBe("/dashboard/marketplace");
  });

  it("map / profile / Mano CV stay ACTIVE but are NOT primary-nav tabs", () => {
    for (const key of [
      "market_map",
      "profile_text_first",
      "journal_text_first",
    ] as const) {
      const f = getFeatureConfig(key);
      expect(f.availability, `${key} stays reachable`).toBe("active");
      expect(f.safeToShowInPrimaryNav, `${key} is not a global tab`).toBe(false);
    }
  });
});

describe("Admin is a permission-gated nav item, never shown to non-admins", () => {
  it("ADMIN_NAV_ITEM points at /dashboard/admin", () => {
    expect(ADMIN_NAV_ITEM.href).toBe("/dashboard/admin");
    expect(ADMIN_NAV_ITEM.id).toBe("admin");
  });

  it("both nav surfaces gate the admin item behind isAdmin", () => {
    for (const rel of [
      "components/app/dashboard-tabs.tsx",
      "components/app/bottom-nav.tsx",
    ]) {
      const src = read(rel);
      expect(src, `${rel} imports ADMIN_NAV_ITEM`).toMatch(/ADMIN_NAV_ITEM/);
      expect(src, `${rel} reads isAdmin`).toMatch(/isAdmin/);
    }
  });
});

describe("the Marketplace hub is real navigation, not fake listings", () => {
  const hub = read(HUB);

  it("links to the live surfaces (map + opportunities)", () => {
    expect(hub).toMatch(/\/dashboard\/market-map/);
    expect(hub).toMatch(/\/dashboard\/opportunities/);
  });

  it("lists REAL owned companies via the owned-organizations read model", () => {
    expect(hub).toMatch(/getOwnedOrganizations/);
    // never a hardcoded company array (no fake companies)
    expect(hub).not.toMatch(/const\s+companies\s*=\s*\[/);
  });

  it("preparing surfaces (offers/shop) carry an honest prepare badge, no CTA", () => {
    expect(hub).toMatch(/PrepareCard/);
    expect(hub).toMatch(/prepareBadge/);
  });

  it("carries the no-fake disclosure note", () => {
    expect(hub).toMatch(/notFakeNote/);
  });
});

describe("compact nav + hub i18n exists in every active locale", () => {
  for (const loc of ACTIVE_LOCALES) {
    const m = JSON.parse(read(`messages/${loc}.json`));
    it(`${loc}: marketplace + admin tab labels exist`, () => {
      expect(m.auth.dashboard.tabs.marketplace).toBeTruthy();
      expect(m.auth.dashboard.tabs.admin).toBeTruthy();
    });
    it(`${loc}: marketplaceHub block has all six sections`, () => {
      const h = m.marketplaceHub;
      expect(h).toBeTruthy();
      for (const k of [
        "map",
        "opportunities",
        "offers",
        "shop",
        "individual",
        "company",
      ]) {
        expect(h[k], `${loc}.marketplaceHub.${k}`).toBeTruthy();
      }
      expect(h.notFakeNote).toBeTruthy();
      expect(h.prepareBadge).toBeTruthy();
    });
  }
});
