import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const WEB = join(__dirname, "..", "..");
const read = (rel: string): string => readFileSync(join(WEB, rel), "utf8");

/**
 * COMPANY<->COMPANY and PERSON<->PERSON first contact goes through the
 * EXISTING request/accept model (owner decision 2026-10-01): a discovered
 * service is requested; the request carries an optional first message; the
 * provider accepts; the canonical conversation then opens. No new consent
 * system, no universal write-to-anyone permission.
 */
describe("a service request carries the requester's first message", () => {
  it("the discovery row sends the draft through the existing request action", () => {
    const src = read("components/app/marketplace-loop-section.tsx");
    expect(src).toMatch(/requestServiceOffering\(o\.id, draftById\[o\.id\] \?\? null\)/);
    expect(src).toMatch(/data-testid="marketplace-offer-message"/);
  });
  it("the action already forwards it to the RPC (trimmed, capped)", () => {
    const src = read("lib/marketplace/service-requests.ts");
    expect(src).toMatch(/p_message: cleanMsg/);
    expect(src).toMatch(/slice\(0, 2000\)/);
  });
  it("copy exists in every routed locale", () => {
    for (const loc of ["lt", "en", "de", "nl", "pl", "ru"]) {
      const m = JSON.parse(read(`messages/${loc}.json`)) as {
        marketplace: { requestMessagePlaceholder?: string };
      };
      expect(m.marketplace.requestMessagePlaceholder, loc).toBeTruthy();
    }
  });
});
