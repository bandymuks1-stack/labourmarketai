import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * P0 Real-Use Hardening — discover reflects "already requested" (PR #535).
 *
 * Found in the real-use smoke: after a buyer requests an offering, the discover
 * row kept an enabled "Request" button, so a second click hit the duplicate
 * error. The loop section already has the buyer's outgoing rows, so it now
 * reflects an honest "Requested" (disabled) state for any offering the buyer has
 * an OPEN ('sent') request for — derived from existing data, no extra query, no
 * new status logic, no fake state. Pins the derivation + i18n parity.
 */

const ROOT = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

describe("discover marks offerings the buyer already has an open request for", () => {
  const section = read("components/app/marketplace-loop-section.tsx");

  it("derives the open-request set from outgoing 'sent' rows (no extra query)", () => {
    expect(section).toMatch(/const openRequestOfferingIds = new Set\(/);
    expect(section).toMatch(/outgoing\.filter\(\(r\) => r\.status === "sent"\)\.map\(\(r\) => r\.offeringId\)/);
  });

  it("renders a disabled 'Requested' state instead of the Request button", () => {
    expect(section).toMatch(/openRequestOfferingIds\.has\(o\.id\) \?/);
    expect(section).toMatch(/data-testid="marketplace-offer-requested"/);
    expect(section).toMatch(/labels\.requested/);
  });

  it("still offers the active Request action for not-yet-requested offerings", () => {
    expect(section).toMatch(/requestServiceOffering\(o\.id\)/);
    expect(section).toMatch(/labels\.request\b/);
  });

  it("the page threads the new label", () => {
    const page = read("app/[locale]/dashboard/service-requests/page.tsx");
    expect(page).toMatch(/requested: t\("requested"\)/);
  });
});

describe("'requested' copy exists across active locales", () => {
  for (const loc of ["en", "lt", "ru"] as const) {
    it(`${loc}: marketplace.requested present + non-empty`, () => {
      const m = (JSON.parse(read(`messages/${loc}.json`)) as { marketplace?: Record<string, unknown> }).marketplace ?? {};
      expect(typeof m.requested, `${loc}.requested`).toBe("string");
      expect(String(m.requested).trim().length).toBeGreaterThan(0);
    });
  }
});
