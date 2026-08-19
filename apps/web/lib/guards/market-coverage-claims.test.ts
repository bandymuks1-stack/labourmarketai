import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import {
  ADOPTION_CLAIM_POPULATIONS,
  ADOPTION_VERBS,
  BROWSABLE_VACANCY_PREDICATE,
  COMPANY_CLAIM_POPULATIONS,
  MIN_FLOOR_HEADROOM_RATIO,
  PUBLISHED_VACANCY_PREDICATE,
  SWEDEN_COVERAGE_2026_08_17,
  SWEDEN_COVERAGE_CURRENT,
  SWEDEN_MEASUREMENT_CURRENT,
  floorSupportFailures,
  floorsAreSupportedBy,
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
    const claim = formatCoverageClaim(SWEDEN_COVERAGE_CURRENT);
    expect(claim).toBe(
      "35,000+ active job opportunities from 7,000+ employers across all 21 Swedish regions",
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

/**
 * FLOOR SUPPORT (owner-approved correction 2026-08-19,
 * docs/audits/landing-coverage-claim-basis-2026-08-18.md).
 *
 * The landing advertised "41 000+ active job opportunities" and "7 600+
 * employers" under the eyebrow "On the platform right now". Both were derived
 * from ONE reading on `is_active AND lifecycle = 'published'` — a predicate the
 * public job board does not use. Two independent defects followed:
 *
 *   1. WRONG BASIS — /jobs renders its real total, so the visitor could
 *      disprove the landing in one click.
 *   2. WRONG SHAPE — a floor from a single day is a spot price. Over
 *      2026-08-15..19 the employers count ran 7,482 → 7,416 → 7,252 → 7,433 →
 *      7,628, so "7 600+" was false on four of five days.
 *
 * These pins make both defects unrepeatable: a public floor may only derive
 * from the job board's own predicate, over a multi-day window, and must clear
 * the window LOW with headroom.
 */
describe("market-coverage floor support", () => {
  it("measures on the public job board's own predicate, not the published one", () => {
    expect(SWEDEN_MEASUREMENT_CURRENT.basis).toBe(BROWSABLE_VACANCY_PREDICATE);
    expect(BROWSABLE_VACANCY_PREDICATE).not.toBe(PUBLISHED_VACANCY_PREDICATE);
    // The predicate is a value, not prose, so it can be compared to the RPC.
    expect(BROWSABLE_VACANCY_PREDICATE).toContain("expires_at");
    expect(PUBLISHED_VACANCY_PREDICATE).not.toContain("expires_at");
  });

  it("supports the shipped floors", () => {
    expect(
      floorSupportFailures(SWEDEN_COVERAGE_CURRENT, SWEDEN_MEASUREMENT_CURRENT),
    ).toEqual([]);
    expect(
      floorsAreSupportedBy(SWEDEN_COVERAGE_CURRENT, SWEDEN_MEASUREMENT_CURRENT),
    ).toBe(true);
  });

  it("rejects the superseded 41,000 / 7,600 floors against real measurement", () => {
    expect(
      floorsAreSupportedBy(
        SWEDEN_COVERAGE_2026_08_17,
        SWEDEN_MEASUREMENT_CURRENT,
      ),
    ).toBe(false);
    const failures = floorSupportFailures(
      SWEDEN_COVERAGE_2026_08_17,
      SWEDEN_MEASUREMENT_CURRENT,
    );
    // BOTH floors fail, not just the vacancy one — that was the missed half.
    expect(failures.some((f) => f.includes("vacancy floor"))).toBe(true);
    expect(failures.some((f) => f.includes("employer floor"))).toBe(true);
  });

  it("rejects a measurement taken on the superseded published-only basis", () => {
    expect(
      floorsAreSupportedBy(SWEDEN_COVERAGE_CURRENT, {
        ...SWEDEN_MEASUREMENT_CURRENT,
        basis: PUBLISHED_VACANCY_PREDICATE,
      }),
    ).toBe(false);
  });

  it("rejects a single-day reading — a floor needs a window", () => {
    expect(
      floorsAreSupportedBy(SWEDEN_COVERAGE_CURRENT, {
        ...SWEDEN_MEASUREMENT_CURRENT,
        windowDays: 1,
      }),
    ).toBe(false);
  });

  it("rejects a floor that clears the low but keeps no headroom", () => {
    // The 7,600 floor once sat 32 above a daily-moving count. A floor exactly
    // AT the observed low is the same countdown and must not pass.
    expect(
      floorsAreSupportedBy(
        {
          ...SWEDEN_COVERAGE_CURRENT,
          identifiedEmployersFloor:
            SWEDEN_MEASUREMENT_CURRENT.identifiedEmployersLow,
        },
        SWEDEN_MEASUREMENT_CURRENT,
      ),
    ).toBe(false);
    expect(MIN_FLOOR_HEADROOM_RATIO).toBeGreaterThanOrEqual(0.03);
  });

  it("requires the read-back to carry an ISO date", () => {
    expect(SWEDEN_MEASUREMENT_CURRENT.measuredAt).toMatch(
      /^\d{4}-\d{2}-\d{2}$/,
    );
    expect(
      floorsAreSupportedBy(SWEDEN_COVERAGE_CURRENT, {
        ...SWEDEN_MEASUREMENT_CURRENT,
        measuredAt: "recently",
      }),
    ).toBe(false);
  });

  it("quotes regions exactly — it is a completeness fact, not a floor", () => {
    expect(SWEDEN_COVERAGE_CURRENT.regions).toBe(
      SWEDEN_MEASUREMENT_CURRENT.regions,
    );
    expect(
      floorsAreSupportedBy(
        { ...SWEDEN_COVERAGE_CURRENT, regions: 20 },
        SWEDEN_MEASUREMENT_CURRENT,
      ),
    ).toBe(false);
  });

  it("never promises more than the latest reading actually holds", () => {
    expect(SWEDEN_COVERAGE_CURRENT.activeVacanciesFloor).toBeLessThan(
      SWEDEN_MEASUREMENT_CURRENT.activeVacanciesLatest,
    );
    expect(SWEDEN_COVERAGE_CURRENT.identifiedEmployersFloor).toBeLessThan(
      SWEDEN_MEASUREMENT_CURRENT.identifiedEmployersLatest,
    );
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
