import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { activeLocales } from "@/lib/i18n/config";

/**
 * Provider offering → active publishing funnel (clarity slice).
 *
 * Improves the draft/paused → active path with copy + affordance ONLY, over the
 * already-wired `setServiceOfferingStatus`: a per-status discoverability hint
 * (only an ACTIVE offering is findable by signed-in members) and an emphasised
 * activate button when an offering is not yet active. No new DB / RLS / RPC, no
 * fake marketplace activity, no payment.
 */

const ROOT = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

// Since 2026-10-24 the funnel is the ONE lifecycle contract's: the per-row
// "can others find it" line and the publish / pause / resume actions come
// from components/app/market-entry-lifecycle.tsx (pinned in full by
// market-lifecycle-contract.test.ts). Pinned here: the services surface
// still states discoverability per row and still writes through the
// existing service_offerings door — no new write path.
describe("the offerings manager surfaces the publish funnel", () => {
  const section = read("components/app/service-offerings-section.tsx");

  it("renders a per-row discoverability line (the contract's visibility line)", () => {
    expect(section).toMatch(/testId=\{`service-offering-discoverability-\$\{row\.id\}`\}/);
    expect(section).toContain("<MarketEntryVisibility");
  });

  it("publish emphasis lives in the shared actions (publish/resume carry the success tone)", () => {
    const shared = read("components/app/market-entry-lifecycle.tsx");
    expect(shared).toMatch(/publish: "border-state-success\/50 text-state-success/);
  });

  it("writes through the existing service_offerings door (no new write path)", () => {
    expect(section).toMatch(/applyServiceOfferingAction\(row\.id, action\)/);
    expect(section).not.toMatch(/\.rpc\(/);
    expect(read("lib/services/service-offerings.ts")).toMatch(/\.from\("service_offerings"\)\s*\.update\(patch\)/);
  });
});

describe("funnel copy is honest + present across active locales", () => {
  for (const loc of activeLocales) {
    const so = (JSON.parse(read(`messages/${loc}.json`)) as {
      serviceOfferings?: { discoverability?: Record<string, unknown>; intro?: unknown };
    }).serviceOfferings ?? {};

    it(`${loc}: discoverability.{draft,active,paused} present + non-empty`, () => {
      for (const k of ["draft", "active", "paused"]) {
        const v = so.discoverability?.[k];
        expect(typeof v, `${loc}.${k}`).toBe("string");
        expect(String(v).trim().length, `${loc}.${k}`).toBeGreaterThan(0);
      }
    });

    it(`${loc}: the stale "not shown to others" intro is corrected`, () => {
      const intro = String(so.intro ?? "");
      // active offerings ARE discoverable now (PR #525) — intro must not deny it
      expect(intro).not.toMatch(/not shown to others|dar nerodomos|пока не показываются/i);
    });

    it(`${loc}: no payment / rating wording in the funnel copy`, () => {
      const blob = JSON.stringify(so.discoverability ?? {});
      expect(blob).not.toMatch(/\b(payment|stripe|invoice|rating|review|stars?)\b/i);
    });
  }
});
