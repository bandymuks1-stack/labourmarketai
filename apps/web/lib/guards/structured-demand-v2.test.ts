/**
 * Guard — structured demand contract v2 (marketplace precision PR 2).
 *
 * Pins the capture-side honesty rules of `payload.structured_v2`:
 *  - closed sets only; invalid input rejects the WHOLE cluster (no partial
 *    salvage of near-valid free text);
 *  - old records without structured_v2 read back as an honest null;
 *  - publish-honesty flags surface missing minimum / basis / guaranteed hours
 *    / deductions instead of blocking or fabricating;
 *  - the worker-board projection exposes ONLY the current RPC whitelist —
 *    structured_v2 clusters never leak to a worker surface before the
 *    human-gated MP-3 widening.
 */
import { describe, expect, it } from "vitest";
import {
  deriveCompensationHonestyFlags,
  formatCents,
  parseAmountToCents,
  projectWorkerBoardView,
  readStructuredDemandV2,
  requiresTalentPoolDisclosure,
  sanitizeStructuredDemandV2,
  STRUCTURED_DEMAND_CONTRACT_VERSION,
} from "@/lib/demand/structured-demand-v2";

const VALID = {
  opportunity_type: "employment",
  target_supply: "team",
  engagement_form: "posted_worker",
  contract_country: "NL",
  time: {
    start_earliest: "2026-08-01",
    start_latest: "2026-08-15",
    hours_per_week: 40,
    min_guaranteed_hours: 30,
    shifts: ["day", "weekend"],
    application_deadline: "2026-07-25",
  },
  compensation: {
    min_cents: 1450,
    max_cents: 1800,
    currency: "EUR",
    basis: "gross",
    unit: "hour",
    deductions: [
      { kind: "accommodation", amount_cents: 9000, period: "week" },
    ],
  },
  accommodation: {
    state: "offered",
    payer: "shared",
    price_cents: 9000,
    price_period: "week",
    room: "shared",
    occupancy_per_room: 2,
  },
  transport: {
    international_travel: "compensated",
    daily: "provided",
    licence_categories: ["B"],
  },
  requirements: {
    min_experience_years: 2,
    languages: [{ lang: "en", level: "B1", one_per_team_sufficient: true }],
    own_tools: true,
  },
  process: { listing_kind: "active_vacancy", response_deadline_days: 7 },
};

describe("sanitizeStructuredDemandV2", () => {
  it("accepts a fully structured demand and stamps the contract version", () => {
    const v2 = sanitizeStructuredDemandV2(VALID);
    expect(v2).not.toBeNull();
    expect(v2?.meta.contract_version).toBe(STRUCTURED_DEMAND_CONTRACT_VERSION);
    expect(v2?.compensation?.min_cents).toBe(1450);
    expect(v2?.requirements?.languages?.[0]?.level).toBe("B1");
  });

  it("rejects the whole cluster on any out-of-vocabulary value (no partial salvage)", () => {
    expect(
      sanitizeStructuredDemandV2({ ...VALID, engagement_form: "gig_platform" }),
    ).toBeNull();
    expect(
      sanitizeStructuredDemandV2({
        ...VALID,
        requirements: { languages: [{ lang: "xx", level: "B1" }] },
      }),
    ).toBeNull();
    expect(
      sanitizeStructuredDemandV2({ ...VALID, injected_free_text: "call me" }),
    ).toBeNull();
  });

  it("rejects contradictory numbers instead of storing them", () => {
    expect(
      sanitizeStructuredDemandV2({
        compensation: { min_cents: 2000, max_cents: 1000 },
      }),
    ).toBeNull();
    expect(
      sanitizeStructuredDemandV2({
        time: { start_earliest: "2026-09-01", start_latest: "2026-08-01" },
      }),
    ).toBeNull();
    expect(
      sanitizeStructuredDemandV2({
        compensation: { min_cents: 1000, guaranteed_base_cents: 2000 },
      }),
    ).toBeNull();
    expect(
      sanitizeStructuredDemandV2({
        compensation: { min_cents: -5 },
      }),
    ).toBeNull();
  });

  it("returns null for empty / valueless input — absence stays honest", () => {
    expect(sanitizeStructuredDemandV2(undefined)).toBeNull();
    expect(sanitizeStructuredDemandV2(null)).toBeNull();
    expect(sanitizeStructuredDemandV2({})).toBeNull();
    expect(sanitizeStructuredDemandV2({ time: {} })).toBeNull();
    expect(sanitizeStructuredDemandV2("posted_worker")).toBeNull();
  });
});

describe("readStructuredDemandV2 — old-record compatibility", () => {
  it("reads back what was stored", () => {
    const v2 = sanitizeStructuredDemandV2(VALID);
    const roundTripped = readStructuredDemandV2({
      source: "dashboard_demand",
      structured_v2: JSON.parse(JSON.stringify(v2)),
    });
    expect(roundTripped).toEqual(v2);
  });

  it("returns null (never throws, never fabricates) for pre-v2 payloads", () => {
    expect(readStructuredDemandV2(null)).toBeNull();
    expect(readStructuredDemandV2({})).toBeNull();
    expect(
      readStructuredDemandV2({
        source: "dashboard_demand",
        accommodation: "provided_free",
        required_tools: ["scaffolding"],
      }),
    ).toBeNull();
    expect(readStructuredDemandV2({ structured_v2: "corrupted" })).toBeNull();
    expect(
      readStructuredDemandV2({ structured_v2: { meta: { contract_version: 99 } } }),
    ).toBeNull();
  });
});

describe("publish-honesty flags", () => {
  it("a complete compensation raises no flags", () => {
    const v2 = sanitizeStructuredDemandV2(VALID);
    expect(deriveCompensationHonestyFlags(v2)).toEqual([]);
  });

  it("an 'up to X' offer without a minimum is flagged, not blocked", () => {
    const v2 = sanitizeStructuredDemandV2({
      compensation: { max_cents: 2500, currency: "EUR", basis: "gross" },
      time: { min_guaranteed_hours: 40 },
    });
    const flags = deriveCompensationHonestyFlags(v2);
    expect(flags).toContain("missing_minimum");
    expect(flags).toContain("max_without_min");
    expect(flags).toContain("missing_deductions");
  });

  it("unspecified gross/net basis is flagged", () => {
    const v2 = sanitizeStructuredDemandV2({
      compensation: { min_cents: 1400, basis: "unspecified" },
    });
    expect(deriveCompensationHonestyFlags(v2)).toContain("missing_basis");
  });

  it("explicit no_deductions clears the deductions flag; absence does not", () => {
    const withStatement = sanitizeStructuredDemandV2({
      compensation: { min_cents: 1400, basis: "gross", no_deductions: true },
      time: { min_guaranteed_hours: 40 },
    });
    expect(deriveCompensationHonestyFlags(withStatement)).toEqual([]);
    const silent = sanitizeStructuredDemandV2({
      compensation: { min_cents: 1400, basis: "gross" },
      time: { min_guaranteed_hours: 40 },
    });
    expect(deriveCompensationHonestyFlags(silent)).toEqual(["missing_deductions"]);
  });

  it("no compensation cluster at all raises every gap flag", () => {
    expect(deriveCompensationHonestyFlags(null)).toEqual([
      "missing_minimum",
      "missing_basis",
      "missing_guaranteed_hours",
      "missing_deductions",
    ]);
  });

  it("talent-pool listings must disclose themselves", () => {
    const pool = sanitizeStructuredDemandV2({
      process: { listing_kind: "talent_pool" },
    });
    expect(requiresTalentPoolDisclosure(pool)).toBe(true);
    expect(requiresTalentPoolDisclosure(sanitizeStructuredDemandV2(VALID))).toBe(false);
    expect(requiresTalentPoolDisclosure(null)).toBe(false);
  });
});

describe("worker-board projection — whitelist non-regression", () => {
  it("exposes ONLY the current RPC whitelist fields plus a captured marker", () => {
    const projection = projectWorkerBoardView({
      workType: "concrete-works",
      country: "NL",
      teamSize: 4,
      startPeriod: "this_week",
      accommodation: "provided_deducted",
      transport: "provided",
      requiredTools: ["scaffolding"],
      locationLabel: "Rotterdam",
      structuredV2: sanitizeStructuredDemandV2(VALID),
    });
    expect(Object.keys(projection).sort()).toEqual([
      "accommodation",
      "country",
      "locationLabel",
      "requiredTools",
      "startPeriod",
      "teamSize",
      "transport",
      "v2Captured",
      "workType",
    ]);
    // No v2 cluster content leaks through the projection.
    expect(JSON.stringify(projection)).not.toContain("min_cents");
    expect(JSON.stringify(projection)).not.toContain("posted_worker");
    expect(projection.v2Captured).toBe(true);
  });
});

describe("amount helpers", () => {
  it("parses human amounts into integer cents and back", () => {
    expect(parseAmountToCents("14.50")).toBe(1450);
    expect(parseAmountToCents("14,5")).toBe(1450);
    expect(parseAmountToCents("1200")).toBe(120000);
    expect(parseAmountToCents("")).toBeNull();
    expect(parseAmountToCents("-3")).toBeNull();
    expect(parseAmountToCents("1.234")).toBeNull();
    expect(parseAmountToCents("abc")).toBeNull();
    expect(formatCents(1450)).toBe("14.50");
    expect(formatCents(120000)).toBe("1200");
    expect(formatCents(1405)).toBe("14.05");
  });
});
