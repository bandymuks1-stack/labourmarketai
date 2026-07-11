import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  MATCH_CALC_VERSION,
  compareCompensationV2,
  engagementFormAccepted,
  matchWorkerToNeed,
  type MatchNeed,
  type MatchSubject,
} from "@/lib/market/match-v1";
import {
  sanitizeStructuredDemandV2,
  type StructuredDemandV2,
} from "@/lib/demand/structured-demand-v2";

/**
 * MATCHING CONTRACT V2 guard (Marketplace Precision PR 4; canonical contract
 * §3). Pins the deterministic per-criterion contract on the ONE engine:
 *
 *   1. hard-block non-override — a failed hard criterion forces
 *      eligible=false and the status can never be strong/possible, no matter
 *      how strong the weighted evidence is;
 *   2. missing data → missingFacts + insufficient_data when a HARD criterion
 *      is unknowable on the demand side — eligibility is NEVER fabricated;
 *   3. lenient absence — an absent OPTIONAL fact is unknown, not a block;
 *      only both-sides-stated conflicts block;
 *   4. negotiable close-salary detection (≤15% gap = discussion point);
 *   5. calcVersion present on every result;
 *   6. per-criterion source strings populated (table/field);
 *   7. % never required — the tier explanation renders without any
 *      percentage field.
 */

const v2 = (input: Record<string, unknown>): StructuredDemandV2 => {
  const parsed = sanitizeStructuredDemandV2(input);
  if (!parsed) throw new Error("fixture structured_v2 did not sanitize");
  return parsed;
};

/** A subject whose weighted evidence is maximal: full manager-confirmed
 *  coverage, matching profession/country/availability. */
const strongSubject: MatchSubject = {
  skills: [
    { uri: "concrete-works", evidence: "manager_confirmed" },
    { uri: "rebar-installation", evidence: "manager_confirmed" },
  ],
  professionSlug: "concrete-worker",
  country: "NL",
  preferredCountries: ["NL", "DE"],
  languages: ["en"],
  availabilityStatus: "available",
  salaryMinEur: 2000,
  preferredContractType: "employment",
};

const baseNeed: MatchNeed = {
  skillIds: ["concrete-works", "rebar-installation"],
  professionSlug: "concrete-worker",
  country: "NL",
};

describe("1. hard-block non-override (structural invariant)", () => {
  it("missing required language: eligible=false, status capped despite full confirmed coverage", () => {
    const r = matchWorkerToNeed(
      { ...baseNeed, languages: ["de"] },
      { ...strongSubject, languages: ["en"] },
    );
    expect(r.eligible).toBe(false);
    expect(r.status).not.toBe("strong");
    expect(r.status).not.toBe("possible");
    expect(r.blocking.map((b) => b.criterion)).toContain("language");
    expect(r.blocking.every((b) => b.class === "hard" && b.outcome === "not_met")).toBe(true);
  });

  it("engagement-form conflict (both sides stated): hard block, never outscored", () => {
    const r = matchWorkerToNeed(
      { ...baseNeed, structuredV2: v2({ engagement_form: "self_employed_contractor" }) },
      strongSubject, // preferredContractType: "employment"
    );
    expect(r.eligible).toBe(false);
    expect(r.status).toBe("weak");
    expect(r.blocking.map((b) => b.criterion)).toContain("engagement_form");
  });

  it("compensation below the worker's hard minimum by >15% (both stated, same base): hard block", () => {
    const r = matchWorkerToNeed(
      {
        ...baseNeed,
        structuredV2: v2({
          compensation: { max_cents: 150000, currency: "EUR", unit: "month" },
        }),
      },
      { ...strongSubject, salaryMinEur: 2000 }, // 33% above the €1500 ceiling
    );
    expect(r.eligible).toBe(false);
    expect(r.status).toBe("weak");
    expect(r.blocking.map((b) => b.criterion)).toContain("compensation");
    expect(r.negotiables.map((n) => n.criterion)).not.toContain("compensation");
  });

  it("no hard failure: eligible=true and full weighted evidence reaches strong", () => {
    const r = matchWorkerToNeed(baseNeed, strongSubject);
    expect(r.eligible).toBe(true);
    expect(r.blocking).toHaveLength(0);
    expect(r.status).toBe("strong");
  });
});

describe("2. missing data never fabricates eligibility", () => {
  it("demand-side hard criterion unknowable (no requirement set) → insufficient_data + missingFacts", () => {
    const r = matchWorkerToNeed({ country: "NL" }, strongSubject);
    expect(r.status).toBe("insufficient_data");
    expect(r.eligible).toBe(false);
    expect(r.missingFacts).toContainEqual({
      criterion: "skills_coverage",
      side: "demand",
      source: "customer_requests.payload.structured_need",
    });
    expect(r.matchedHard).toHaveLength(0);
    expect(r.strengths).toHaveLength(0);
  });

  it("worker has not stated a salary while the demand states numbers → worker-side missing fact, no invented outcome", () => {
    const r = matchWorkerToNeed(
      {
        ...baseNeed,
        structuredV2: v2({
          compensation: { max_cents: 250000, currency: "EUR", unit: "month" },
        }),
      },
      { ...strongSubject, salaryMinEur: null },
    );
    expect(r.eligible).toBe(true);
    expect(r.missingFacts).toContainEqual({
      criterion: "compensation",
      side: "worker",
      source: "workers.salary_min_eur",
    });
    const compOutcomes = [...r.matchedHard, ...r.blocking, ...r.negotiables].filter(
      (c) => c.criterion === "compensation",
    );
    expect(compOutcomes).toHaveLength(0);
  });

  it("demand has not stated pay anywhere → demand-side missing fact", () => {
    const r = matchWorkerToNeed(baseNeed, strongSubject);
    expect(r.missingFacts).toContainEqual({
      criterion: "compensation",
      side: "demand",
      source: "customer_requests.payload.structured_v2.compensation",
    });
  });
});

describe("3. lenient absence — only both-sides-stated conflicts block", () => {
  it("demand states engagement form, worker preference absent → missing fact, NOT a block", () => {
    const r = matchWorkerToNeed(
      { ...baseNeed, structuredV2: v2({ engagement_form: "self_employed_contractor" }) },
      { ...strongSubject, preferredContractType: null },
    );
    expect(r.eligible).toBe(true);
    expect(r.blocking).toHaveLength(0);
    expect(r.missingFacts).toContainEqual({
      criterion: "engagement_form",
      side: "worker",
      source: "workers.preferred_contract_type",
    });
  });

  it("licence categories required: worker side has no store → missing fact, NEVER a block", () => {
    const r = matchWorkerToNeed(
      { ...baseNeed, structuredV2: v2({ transport: { licence_categories: ["C", "CE"] } }) },
      strongSubject,
    );
    expect(r.eligible).toBe(true);
    expect(r.blocking.map((b) => b.criterion)).not.toContain("licence_categories");
    expect(r.missingFacts.map((m) => m.criterion)).toContain("licence_categories");
  });

  it("worker contract-type acceptance map is closed and exact", () => {
    expect(engagementFormAccepted("employment", "posted_worker")).toBe(true);
    expect(engagementFormAccepted("employment", "agency_employment")).toBe(true);
    expect(engagementFormAccepted("employment", "company_subcontract")).toBe(false);
    expect(engagementFormAccepted("subcontract", "self_employed_contractor")).toBe(true);
    expect(engagementFormAccepted("subcontract", "direct_employment")).toBe(false);
    expect(engagementFormAccepted("temporary", "temporary_employment")).toBe(true);
    expect(engagementFormAccepted("temporary", "direct_employment")).toBe(false);
    expect(engagementFormAccepted("any", "posted_worker")).toBe(true);
    // Unknown stored value → null (unknown), never guessed either way.
    expect(engagementFormAccepted("something_else", "direct_employment")).toBe(null);
  });
});

describe("4. negotiable close-salary detection (≤15%)", () => {
  it("offer 10% below the worker minimum → discussion point, still eligible", () => {
    const r = matchWorkerToNeed(
      {
        ...baseNeed,
        structuredV2: v2({
          compensation: { max_cents: 200000, currency: "EUR", unit: "month" },
        }),
      },
      { ...strongSubject, salaryMinEur: 2200 }, // 10% above €2000
    );
    expect(r.eligible).toBe(true);
    expect(r.blocking).toHaveLength(0);
    expect(r.negotiables.map((n) => n.criterion)).toContain("compensation");
    expect(r.status).toBe("strong"); // negotiables never silently downgrade
  });

  it("offer meets the minimum → hard criterion met", () => {
    const r = matchWorkerToNeed(
      {
        ...baseNeed,
        structuredV2: v2({
          compensation: { max_cents: 250000, currency: "EUR", unit: "month" },
        }),
      },
      { ...strongSubject, salaryMinEur: 2000 },
    );
    expect(r.matchedHard.map((m) => m.criterion)).toContain("compensation");
    expect(r.negotiables.map((n) => n.criterion)).not.toContain("compensation");
  });

  it("different bases (hourly offer vs monthly expectation) → honest discussion point, no fabricated conversion", () => {
    const cmp = compareCompensationV2(
      v2({ compensation: { max_cents: 1800, currency: "EUR", unit: "hour" } }),
      2000,
    );
    expect(cmp).toEqual({ kind: "not_comparable" });
  });

  it("start-date after the stated window → negotiable, never a silent block", () => {
    const r = matchWorkerToNeed(
      {
        ...baseNeed,
        structuredV2: v2({
          time: { start_earliest: "2026-08-01", start_latest: "2026-08-15" },
        }),
      },
      {
        ...strongSubject,
        availabilityStatus: "busy",
        availableFrom: "2026-09-01",
      },
    );
    expect(r.eligible).toBe(true);
    expect(r.negotiables.map((n) => n.criterion)).toContain("start_date");
  });

  it("stated shifts/hours → discussion point (worker side has no stated preference store)", () => {
    const r = matchWorkerToNeed(
      { ...baseNeed, structuredV2: v2({ time: { shifts: ["night"], hours_per_week: 50 } }) },
      strongSubject,
    );
    expect(r.negotiables.map((n) => n.criterion)).toContain("shifts_hours");
  });
});

describe("5.–6. calc version + per-criterion sources", () => {
  it("MATCH_CALC_VERSION is '2.1' (P2-PR4 mirrored dimensions) and present on every result", () => {
    expect(MATCH_CALC_VERSION).toBe("2.1");
    expect(matchWorkerToNeed(baseNeed, strongSubject).calcVersion).toBe("2.1");
    expect(matchWorkerToNeed({}, strongSubject).calcVersion).toBe("2.1");
  });

  it("every criterion result and missing fact carries a non-empty table/field source", () => {
    const r = matchWorkerToNeed(
      {
        ...baseNeed,
        languages: ["en"],
        structuredV2: v2({
          engagement_form: "direct_employment",
          compensation: { max_cents: 200000, currency: "EUR", unit: "month" },
          time: { shifts: ["day"], start_earliest: "2026-08-01" },
          transport: { licence_categories: ["B"] },
        }),
      },
      strongSubject,
    );
    const all = [...r.matchedHard, ...r.blocking, ...r.strengths, ...r.negotiables];
    expect(all.length).toBeGreaterThan(0);
    for (const c of all) {
      expect(c.source.trim().length, `${c.criterion} source`).toBeGreaterThan(0);
    }
    for (const m of r.missingFacts) {
      expect(m.source.trim().length, `${m.criterion} missing source`).toBeGreaterThan(0);
      expect(["worker", "demand"]).toContain(m.side);
    }
  });
});

describe("7. % is never required for the explanation", () => {
  it("tier records carry no percentage — explanations render from criterion/class/outcome/source only", () => {
    const r = matchWorkerToNeed(
      {
        ...baseNeed,
        structuredV2: v2({
          compensation: { max_cents: 200000, currency: "EUR", unit: "month" },
        }),
      },
      { ...strongSubject, salaryMinEur: 2200 },
    );
    const all = [...r.matchedHard, ...r.blocking, ...r.strengths, ...r.negotiables];
    for (const c of all) {
      expect(Object.keys(c).sort()).toEqual(["class", "criterion", "outcome", "source"]);
    }
    expect(JSON.stringify(all)).not.toContain("%");
    expect(JSON.stringify(all)).not.toContain("pct");
  });

  it("the worker board tier UI renders without any standalone percentage", () => {
    const page = readFileSync(
      join(__dirname, "..", "..", "app", "[locale]", "dashboard", "opportunities", "page.tsx"),
      "utf8",
    );
    // The board stays band-based: tier explanation present, no "NN% match".
    expect(page).toMatch(/blocking/);
    expect(page).toMatch(/negotiables/);
    expect(page).toMatch(/missingFacts/);
    expect(page).not.toMatch(/\d+\s*%\s*match/i);
    expect(page).not.toMatch(/skillFit\.pct/);
  });
});

describe("determinism of the v2 tiers", () => {
  it("same inputs → identical tier output", () => {
    const need: MatchNeed = {
      ...baseNeed,
      structuredV2: v2({
        engagement_form: "direct_employment",
        compensation: { max_cents: 210000, currency: "EUR", unit: "month" },
      }),
    };
    const a = matchWorkerToNeed(need, strongSubject);
    const b = matchWorkerToNeed(need, strongSubject);
    expect(a).toEqual(b);
  });
});
