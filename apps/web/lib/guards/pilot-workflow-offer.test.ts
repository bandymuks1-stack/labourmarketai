import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

/**
 * Guard for the Sales Offer — first pilot workflow (slice
 * sales-core-nonstop-v1, Phase 9/10). Ensures the offer stays HONEST: it
 * describes the real shipped chain, routes to the manual pilot CTA, and never
 * claims billing, an invented price, or automated matching/verification.
 */

const APP = resolve(__dirname, "..", "..");
function read(rel: string): string {
  return readFileSync(join(APP, rel), "utf8");
}

describe("PilotWorkflowOffer is wired into the pricing page", () => {
  it("the pricing page mounts <PilotWorkflowOffer />", () => {
    const page = read("app/[locale]/(marketing)/pricing/page.tsx");
    expect(page).toMatch(/<PilotWorkflowOffer\s*\/>/);
    expect(page).toMatch(
      /from\s+["']@\/components\/marketing\/pilot-workflow-offer["']/,
    );
  });

  it("the offer routes to the EXISTING manual pilot CTA (waitlist modal), not checkout", () => {
    const src = read("components/marketing/pilot-workflow-offer.tsx");
    expect(src).toMatch(/WaitlistModal/);
    expect(src).toMatch(/source="pricing_pilot_workflow"/);
    expect(src).toMatch(/data-testid="pilot-workflow-offer"/);
    // No purchase / checkout affordance in the component CODE (strip comments —
    // the honest doc comment legitimately says "no checkout").
    const codeOnly = src
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "");
    expect(codeOnly).not.toMatch(/buy\s*now|checkout|add\s*to\s*cart|stripe/i);
  });
});

describe("the offer copy is honest (LT + EN)", () => {
  // The offer must NOT claim billing, an invented price, or automation the
  // product does not do. Mirrors the SR-5 pricing-honesty intent for this block.
  const FORBIDDEN = [
    /buy\s*now/i,
    /\bcheckout\b/i,
    /\bsubscribe\b/i,
    /automatic\s+billing/i,
    /guaranteed/i,
    /\bai[\s-]*match/i,
    /fully\s+automated/i,
    /[$€£]\s?\d/, // an actual currency price
    /\bper\s+month\b/i,
    /\/mo\b/i,
  ];
  for (const locale of ["en", "lt"] as const) {
    it(`${locale}.json pricing.pilotWorkflow has the 5 real steps + manual CTA, no fake claims`, () => {
      const json = JSON.parse(read(`messages/${locale}.json`));
      const w = json.pricing.pilotWorkflow;
      expect(w.eyebrow).toBeTruthy();
      expect(w.title).toBeTruthy();
      expect(w.body).toBeTruthy();
      expect(Array.isArray(w.steps)).toBe(true);
      expect(w.steps.length).toBe(5);
      expect(w.ctaNote).toBeTruthy();
      expect(w.cta).toBeTruthy();
      const flat = JSON.stringify(w).toLowerCase();
      for (const rx of FORBIDDEN) {
        expect(rx.test(flat), `${locale} pilotWorkflow must not match ${rx}`).toBe(
          false,
        );
      }
    });
  }
});
