import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const WEB = join(__dirname, "..", "..");
const read = (rel: string): string => readFileSync(join(WEB, rel), "utf8");

/**
 * A COMPANY-LEVEL PARTNERSHIP NEED rides the EXISTING request/accept model
 * (owner decision 2026-10-01): it is an ordinary published service offering in
 * the `partnership` category; a partner discovers it in the marketplace,
 * requests with a first message, the owner accepts, the canonical conversation
 * opens. No new table, grant, consent system or global write-to-anyone path.
 */
describe("partnership need = a service offering in the partnership category", () => {
  it("one shared constant, no schema", () => {
    expect(read("lib/services/service-offerings-shared.ts")).toMatch(
      /export const PARTNERSHIP_CATEGORY = "partnership"/,
    );
  });
  it("the services page offers the quick path and presets the category", () => {
    const s = read("components/app/service-offerings-section.tsx");
    expect(s).toMatch(/data-testid="service-offering-add-partnership"/);
    expect(s).toMatch(/categorySlug: PARTNERSHIP_CATEGORY/);
  });
  it("discovery labels the offering and keeps the same request action", () => {
    const m = read("components/app/marketplace-loop-section.tsx");
    expect(m).toMatch(/labels\.partnershipBadge/);
    expect(m).toMatch(/requestServiceOffering\(o\.id/);
  });
  it("copy exists in every routed locale", () => {
    for (const loc of ["lt", "en", "de", "nl", "pl", "ru"]) {
      const j = JSON.parse(read(`messages/${loc}.json`)) as {
        marketplace: { partnershipBadge?: string; partnershipRequest?: string };
        serviceOfferings: { addPartnership?: string };
      };
      expect(j.marketplace.partnershipBadge, loc).toBeTruthy();
      expect(j.marketplace.partnershipRequest, loc).toBeTruthy();
      expect(j.serviceOfferings.addPartnership, loc).toBeTruthy();
    }
  });
});
