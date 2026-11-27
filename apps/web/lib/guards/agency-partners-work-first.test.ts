import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * THE AGENCY'S WORK FIRST (owner P0 2026-11-24, agency path walk; decisions
 * 0032 and 0034). An agency's partners page opened with an explainer card and
 * its private client records, and the needs real clients share, with the
 * "Offer candidate" form, sat mid-page on a 3,344 px phone screen. The bridge
 * (shared needs, offers) now leads, then the drafts for clients, then the
 * private records and the mode's doors; the explainer's history line ("the
 * earlier separate agency pages now open here") is no longer shown.
 */
const page = readFileSync(join(__dirname, "..", "..", "app/[locale]/dashboard/company/partners/page.tsx"), "utf8");

describe("the agency's partners page leads with its client work", () => {
  it("bridge → drafts for clients → private client records → the mode's doors", () => {
    const at = (needle: string) => page.indexOf(needle);
    const order = ["<AgencyBridgeSection", "<AgencyDelegationPanel", "<AgencyClientsSection", 'data-testid="company-agency-mode"'].map(at);
    expect(order.every((i) => i > -1)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it("the history line about earlier agency pages is not rendered", () => {
    expect(page).not.toContain('tCompany("agencyMode.legacyNote")');
  });
});
