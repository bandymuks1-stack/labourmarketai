import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { VISIBLE_PRIMARY_NAV_ITEMS } from "../config/navigation";

/**
 * Action-first IA guard (action-first-product-logic-v1).
 *
 * Owner principle: primary navigation must be based on ACTIONS, not data
 * categories, and must be understandable to a 5-year-old and a 100-year-old.
 * The action-first primary nav is exactly four doors:
 *   Mano erdvė (/dashboard) · Žemėlapis (/dashboard/market-map) ·
 *   Darbo žurnalas (/dashboard/journal) · Žinutės (/dashboard/communication).
 *
 * This guard freezes the simplifications so they cannot regress:
 *   - profile / CV / player-card are NOT separate competing primary tabs (they
 *     live under Mano erdvė as the result of journaling);
 *   - settings/account is NOT a primary tab (it lives in the avatar menu);
 *   - marketplace does NOT compete with the map as a primary tab;
 *   - inbox / instructions are NOT separate primary message entries (Žinutės is
 *     the single communication door);
 *   - sample/preview surfaces (talent / visual-os) are admin/owner-gated, never
 *     a normal-user destination;
 *   - primary tab labels are human (no admin/internal/preview/module words) and
 *     resolve in every served locale (no raw i18n keys).
 */

const ROOT = join(__dirname, "..", "..");
const read = (rel: string): string => readFileSync(join(ROOT, rel), "utf8");
const SERVED = ["lt", "en", "ru"] as const;

describe("primary nav is the four action-first doors, nothing more", () => {
  it("ids are exactly overview / market_map / journal_text_first / communication", () => {
    expect(VISIBLE_PRIMARY_NAV_ITEMS.map((i) => i.id)).toEqual([
      "overview",
      "market_map",
      "journal_text_first",
      "communication",
    ]);
  });

  it("none of profile/account/marketplace/discovery/preview are primary hrefs", () => {
    const hrefs = new Set(VISIBLE_PRIMARY_NAV_ITEMS.map((i) => i.href));
    for (const forbidden of [
      "/dashboard/profile",
      "/dashboard/cv",
      "/dashboard/player-card",
      "/dashboard/account",
      "/dashboard/marketplace",
      "/dashboard/opportunities",
      "/dashboard/candidates",
      "/dashboard/talent",
      "/dashboard/visual-os",
      "/dashboard/inbox",
      "/dashboard/instructions",
    ]) {
      expect(hrefs.has(forbidden), `${forbidden} must not be a primary tab`).toBe(false);
    }
  });

  it("each primary door is unique (no duplicate destinations)", () => {
    const hrefs = VISIBLE_PRIMARY_NAV_ITEMS.map((i) => i.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });
});

describe("sample/preview surfaces are admin/owner-gated (not normal-user destinations)", () => {
  for (const rel of [
    "app/[locale]/dashboard/talent/page.tsx",
    "app/[locale]/dashboard/visual-os/page.tsx",
    "app/[locale]/dashboard/visual-os/agency/page.tsx",
  ]) {
    if (!existsSync(join(ROOT, rel))) continue;
    it(`${rel} calls requireSuperadmin (admin-only)`, () => {
      expect(read(rel)).toMatch(/requireSuperadmin\(/);
    });
  }
});

describe("the journal tab is the human 'Darbo žurnalas' action label", () => {
  it("served locales carry a human work-journal label, no raw key", () => {
    for (const loc of SERVED) {
      const tabs = (JSON.parse(read(`messages/${loc}.json`)) as {
        auth: { dashboard: { tabs: Record<string, string> } };
      }).auth.dashboard.tabs;
      const v = tabs.journal;
      expect(v?.trim().length, `${loc} tabs.journal`).toBeGreaterThan(0);
      expect(v, `${loc} tabs.journal must not be a raw key`).not.toMatch(/^auth\.|tabs\./);
    }
    expect(JSON.parse(read("messages/lt.json")).auth.dashboard.tabs.journal).toMatch(/žurnal/i);
    expect(JSON.parse(read("messages/en.json")).auth.dashboard.tabs.journal).toMatch(/journal/i);
  });
});

describe("primary tab labels are human — no admin/internal/preview/module words", () => {
  const KEYS = ["overview", "marketMap", "journal", "communication"] as const;
  const BAD = /admin|preview|sample|visual ?os|cockpit|module|modul|\bos\b/i;
  for (const loc of SERVED) {
    it(`${loc}: no internal/preview wording in the four primary tab labels`, () => {
      const tabs = (JSON.parse(read(`messages/${loc}.json`)) as {
        auth: { dashboard: { tabs: Record<string, string> } };
      }).auth.dashboard.tabs;
      for (const k of KEYS) {
        expect(tabs[k], `${loc}.tabs.${k}`).toBeTruthy();
        expect(BAD.test(tabs[k]), `${loc}.tabs.${k} = "${tabs[k]}"`).toBe(false);
      }
    });
  }
});
