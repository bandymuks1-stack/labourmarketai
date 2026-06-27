import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Request-loop clarity slice — surface the fields the request loop ALREADY
 * fetches but did not show: the buyer's message on the provider inbox row, and
 * the provider's response note + responded date on the buyer's outgoing row.
 * Pure UI over existing RLS-scoped data — no new DB / RLS / RPC, no fake rows,
 * no payment/rating. This guard pins the rendering + the lt/en/ru copy.
 */

const ROOT = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

describe("the request loop surfaces already-fetched clarity fields", () => {
  const section = read("components/app/marketplace-loop-section.tsx");

  it("provider inbox shows the buyer's message (conditional, never 'null')", () => {
    expect(section).toMatch(/r\.message &&/);
    expect(section).toMatch(/data-testid="marketplace-incoming-message"/);
    expect(section).toMatch(/labels\.requesterMessage/);
  });

  it("buyer outgoing row shows the responded date (locale-independent day)", () => {
    expect(section).toMatch(/isoDay\(r\.respondedAt\)/);
    expect(section).toMatch(/data-testid="marketplace-outgoing-responded"/);
    expect(section).toMatch(/labels\.responded/);
    // tabular numerals for the date, consistent with the control-room density rule
    expect(section).toMatch(/tabular-nums/);
  });

  it("buyer outgoing row shows the provider's note (conditional)", () => {
    expect(section).toMatch(/r\.responseNote &&/);
    expect(section).toMatch(/data-testid="marketplace-outgoing-note"/);
    expect(section).toMatch(/labels\.providerNote/);
  });

  it("the date helper is locale-independent (no toLocaleDateString hydration risk)", () => {
    expect(section).not.toMatch(/toLocaleDateString/);
    expect(section).toMatch(/function isoDay/);
  });
});

describe("the new clarity labels are threaded + present in active locales", () => {
  it("the page passes the three new labels", () => {
    const page = read("app/[locale]/dashboard/service-requests/page.tsx");
    for (const k of ["requesterMessage", "providerNote", "responded"]) {
      expect(page, `page wires ${k}`).toMatch(new RegExp(`${k}: t\\("${k}"\\)`));
    }
  });

  for (const loc of ["en", "lt", "ru"] as const) {
    it(`${loc}: marketplace defines requesterMessage / providerNote / responded`, () => {
      const m = (JSON.parse(read(`messages/${loc}.json`)) as { marketplace?: Record<string, unknown> }).marketplace ?? {};
      for (const k of ["requesterMessage", "providerNote", "responded"]) {
        expect(typeof m[k], `${loc}.${k}`).toBe("string");
        expect(String(m[k]).trim().length, `${loc}.${k}`).toBeGreaterThan(0);
      }
    });
  }
});
