import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { MARKET_COUNTRIES } from "@/lib/taxonomy/work-categories";

/**
 * A COVERAGE CLAIM MAY NOT NAME A REGION THAT STOPPED BEING TRUE.
 *
 * Owner readiness window, 2026-09-09, Priority 6. `/for-agencies` said
 * "Baltic + Nordic clients and workers". The product added GE/BE/FR/ES/AT/CH
 * to `ACTIVE_MARKETS` on 2026-07-17 and US in 2026-07, so seven of the
 * seventeen markets it advertises are outside that description — the same
 * drift that made `/company-need` offer ten countries (#1677 §2.3).
 *
 * A sweep found it was NOT one string. Four public surfaces carried a
 * hard-coded region, and this guard exists because fixing four strings
 * without pinning the CLASS just waits for the fifth.
 *
 * THE RULE: copy that describes WHERE THE PRODUCT WORKS names no region and
 * no count. "every market we operate in" cannot go stale; "Baltic + Nordic"
 * and "17 markets" both can — and the map band, which legitimately states
 * the number, derives it from `coverageCountryCount()` rather than typing it.
 *
 * DELIBERATELY OUT OF SCOPE: `live.clock.badge` ("Northern & Baltic Europe")
 * carries the same staleness, and `live` is a FROZEN landing namespace
 * (lib/guards/landing-freeze.ts). Changing it is an owner decision, not an
 * engineering one, so it is reported rather than edited — and named here so
 * the omission is visible instead of looking like an oversight.
 */

const WEB = join(__dirname, "..", "..");
const LOCALES = ["en", "lt", "ru", "nl", "de"] as const;

const catalog = (loc: string): Record<string, unknown> =>
  JSON.parse(readFileSync(join(WEB, "messages", `${loc}.json`), "utf8")) as Record<
    string,
    unknown
  >;

/** Region words that would be a stale coverage claim in any of the five. */
const REGION = /baltic|baltics|baltijos|baltikum|baltische|балт|nordic|nordics/i;

/**
 * The keys that DESCRIBE COVERAGE. Each was measured carrying a region name
 * and is now region-free. Listed explicitly rather than swept, because an
 * "e.g. Baltic / EU" placeholder and a client-name example ("e.g. Nordic
 * Logistics") are examples, not claims, and must keep their wording.
 */
const COVERAGE_KEYS = [
  "map.caption",
  "companies.features.items.1.desc",
  "trusted.title",
  "agencies.features.items.4.desc",
] as const;

function at(root: Record<string, unknown>, dotted: string): unknown {
  let node: unknown = root;
  for (const seg of dotted.split(".")) {
    if (Array.isArray(node)) node = node[Number(seg)];
    else if (node && typeof node === "object")
      node = (node as Record<string, unknown>)[seg];
    else return undefined;
  }
  return node;
}

describe("1. no coverage claim names a region", () => {
  for (const loc of LOCALES) {
    for (const key of COVERAGE_KEYS) {
      it(`${loc}.${key}`, () => {
        const v = at(catalog(loc), key);
        expect(typeof v, `${loc}.${key} is missing`).toBe("string");
        expect(
          REGION.test(v as string),
          `${loc}.${key} names a region: "${v as string}"`,
        ).toBe(false);
      });
    }
  }
});

describe("2. nor a hard-coded market COUNT", () => {
  /** A number is the other way this goes stale. The map band states the
   *  count legitimately — from `coverageCountryCount()`, not from copy — so
   *  no catalogue string needs to carry it. */
  for (const loc of LOCALES) {
    it(`${loc}: coverage copy carries no digit`, () => {
      for (const key of COVERAGE_KEYS) {
        const v = at(catalog(loc), key) as string;
        expect(/\d/.test(v), `${loc}.${key}: "${v}"`).toBe(false);
      }
    });
  }

  it("the market set is the single source, and it is bigger than the old claim", () => {
    // The fact that made the copy false. If the market set ever shrinks back
    // to the Baltics + Nordics, this fails and the copy can be revisited
    // deliberately instead of drifting the other way.
    expect(MARKET_COUNTRIES.length).toBeGreaterThan(10);
    for (const c of ["FR", "ES", "CH", "US", "GE"]) {
      expect(MARKET_COUNTRIES as readonly string[], `market ${c}`).toContain(c);
    }
  });
});

describe("3. the frozen one is named, not silently skipped", () => {
  it("live.clock.badge still carries the stale region — owner-gated", () => {
    // Asserting the CURRENT state, so this guard tells the truth about what
    // was left alone. When the owner decides, this expectation flips and the
    // key joins COVERAGE_KEYS above.
    const v = at(catalog("en"), "live.clock.badge");
    expect(typeof v).toBe("string");
    expect(
      REGION.test(v as string),
      "live.clock.badge was changed — it is in a FROZEN namespace; if this was deliberate, move the key into COVERAGE_KEYS and record the freeze regeneration",
    ).toBe(true);
  });
});
