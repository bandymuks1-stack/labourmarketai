import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

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

describe("the offerings manager surfaces the publish funnel", () => {
  const section = read("components/app/service-offerings-section.tsx");

  it("renders a per-status discoverability hint per row", () => {
    expect(section).toMatch(/data-testid=\{`service-offering-discoverability-\$\{row\.id\}`\}/);
    expect(section).toMatch(/labels\.discoverability\[row\.status\]/);
  });

  it("emphasises the activate button when the offering is NOT active", () => {
    expect(section).toMatch(/row\.status === "active"\s*\?\s*"border-ink-500/);
    expect(section).toMatch(/"border-brand-blue\/50 text-brand-blue/);
  });

  it("still uses the existing setServiceOfferingStatus action (no new write path)", () => {
    expect(section).toMatch(/setServiceOfferingStatus\(row\.id, next\)/);
    expect(section).not.toMatch(/\.rpc\(/);
  });

  it("the labels type carries the per-status discoverability map", () => {
    expect(section).toMatch(/discoverability: Record<ServiceOfferingStatus, string>/);
  });
});

describe("the services page threads the discoverability labels", () => {
  const page = read("app/[locale]/dashboard/services/page.tsx");
  it("builds discoverability from the serviceOfferings namespace", () => {
    for (const k of ["draft", "active", "paused"]) {
      expect(page).toMatch(new RegExp(`${k}: t\\("discoverability\\.${k}"\\)`));
    }
  });
});

describe("funnel copy is honest + present across active locales", () => {
  for (const loc of ["en", "lt", "ru"] as const) {
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
