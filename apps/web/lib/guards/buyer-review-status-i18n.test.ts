import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Secondary-surfaces cleanup guard (Core Product Sprint Train v2, Wagon —
 * secondary surfaces). The buyer dashboard + buyer setup confirmation rendered
 * the raw `customer.reviewStatus` DB enum ("pending" / "in_review" / "approved"
 * / "needs_followup") straight into the UI, while every sibling field
 * (contactPreference) used a localized options lookup. A raw DB enum is a raw
 * value leaking to the user — forbidden. This guard pins the localized lookup
 * and full enum coverage in every active locale.
 */

const ROOT = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");
const ACTIVE = ["lt", "en", "ru"] as const;
// The ReviewStatus union in lib/buyer/customers.ts.
const STATUSES = ["pending", "in_review", "approved", "needs_followup"] as const;

const BUYER = "app/[locale]/dashboard/buyer/page.tsx";
const START_BUYER = "app/[locale]/dashboard/start/buyer/page.tsx";

describe("buyer reviewStatus renders a localized label, not the raw DB enum", () => {
  it("buyer dashboard uses the reviewStatusOptions lookup (no raw value)", () => {
    const src = read(BUYER);
    expect(src).toMatch(/reviewStatusOptions\.\$\{customer\.reviewStatus\}/);
    expect(src).not.toMatch(/>\s*\{customer\.reviewStatus\}\s*</);
  });

  it("buyer setup confirmation uses the reviewStatusOptions lookup (no raw value)", () => {
    const src = read(START_BUYER);
    expect(src).toMatch(/reviewStatusOptions\.\$\{customer\.reviewStatus\}/);
    expect(src).not.toMatch(/>\s*\{customer\.reviewStatus\}\s*</);
  });
});

describe("every ReviewStatus value has a localized label in each active locale", () => {
  for (const loc of ACTIVE) {
    it(`${loc}: reviewStatusOptions covers all ${STATUSES.length} statuses, non-empty`, () => {
      const opts = (
        JSON.parse(read(`messages/${loc}.json`)) as {
          roleDashboards?: { buyer?: { setup?: { reviewStatusOptions?: Record<string, string> } } };
        }
      ).roleDashboards?.buyer?.setup?.reviewStatusOptions;
      expect(opts, `${loc} reviewStatusOptions`).toBeTruthy();
      for (const s of STATUSES) {
        expect(opts?.[s]?.trim().length, `${loc} reviewStatusOptions.${s}`).toBeGreaterThan(0);
      }
    });
  }
});
