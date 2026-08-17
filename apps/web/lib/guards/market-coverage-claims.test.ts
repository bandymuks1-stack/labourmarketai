import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import {
  ADOPTION_CLAIM_POPULATIONS,
  ADOPTION_VERBS,
  COMPANY_CLAIM_POPULATIONS,
  SWEDEN_COVERAGE_2026_08_17,
  formatCoverageClaim,
  violatesAdoptionClaimRule,
} from "@/lib/analytics/market-coverage-claims";

/**
 * Public-claim invariant (Sweden market truth, 2026-08-17).
 *
 * Population A (employers in imported `public_vacancies` data) is NOT a
 * customer population. These pins keep marketing copy from ever deriving a
 * "companies use LabourMarket.ai" claim from imported job ads:
 *
 *   1. the population vocabulary stays four-valued and ordered;
 *   2. adoption verbs are reserved for registered/active/paying populations;
 *   3. the canonical coverage template contains no adoption verb;
 *   4. no shipped message catalog attaches an adoption verb to a numeric
 *      company/employer count (LT + EN vocabularies).
 */
describe("market-coverage public-claim invariant", () => {
  it("keeps the four populations distinct and complete", () => {
    expect(COMPANY_CLAIM_POPULATIONS).toEqual([
      "marketplace_employers",
      "registered_organizations",
      "active_employer_accounts",
      "paying_organizations",
    ]);
    // Adoption claims may cite every population EXCEPT marketplace data.
    expect(ADOPTION_CLAIM_POPULATIONS).not.toContain("marketplace_employers");
    expect(ADOPTION_CLAIM_POPULATIONS).toHaveLength(
      COMPANY_CLAIM_POPULATIONS.length - 1,
    );
  });

  it("formats the coverage claim without any adoption verb", () => {
    const claim = formatCoverageClaim(SWEDEN_COVERAGE_2026_08_17);
    expect(claim).toBe(
      "41,000+ active job opportunities from 7,600+ employers across all 21 Swedish regions",
    );
    const lower = claim.toLowerCase();
    for (const verb of ADOPTION_VERBS) {
      expect(lower.includes(verb)).toBe(false);
    }
    expect(violatesAdoptionClaimRule(claim)).toBe(false);
  });

  it("flags adoption-verb claims over company counts", () => {
    expect(
      violatesAdoptionClaimRule("7,600 companies use LabourMarket.ai"),
    ).toBe(true);
    expect(
      violatesAdoptionClaimRule("4000+ įmonių naudojasi LabourMarket.ai"),
    ).toBe(true);
    // Coverage framing over the same numbers stays legal.
    expect(
      violatesAdoptionClaimRule("opportunities from 7,600+ employers"),
    ).toBe(false);
    // Adoption verbs WITHOUT a numeric company count are out of scope.
    expect(violatesAdoptionClaimRule("Companies use our matching")).toBe(false);
  });

  it("no shipped message catalog attaches an adoption verb to a company count", () => {
    const messagesDir = join(__dirname, "..", "..", "messages");
    const files = readdirSync(messagesDir).filter((f) => f.endsWith(".json"));
    expect(files.length).toBeGreaterThanOrEqual(5);
    const offenders: string[] = [];
    for (const file of files) {
      const raw = JSON.parse(
        readFileSync(join(messagesDir, file), "utf-8"),
      ) as unknown;
      walk(raw, (value, path) => {
        if (violatesAdoptionClaimRule(value)) {
          offenders.push(`${file}:${path} → ${value}`);
        }
      });
    }
    expect(offenders).toEqual([]);
  });
});

function walk(
  node: unknown,
  visit: (value: string, path: string) => void,
  path = "",
): void {
  if (typeof node === "string") {
    visit(node, path);
    return;
  }
  if (node && typeof node === "object") {
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      walk(v, visit, path ? `${path}.${k}` : k);
    }
  }
}
