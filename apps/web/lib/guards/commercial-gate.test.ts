/**
 * Guard — COMMERCIAL GATE (financial safety).
 *
 * Binding contract: `docs/product/commercial-sustainability-v1.md`.
 *
 * CI turns RED when a commercial item becomes sellable — a plan with a price,
 * a top-up with an amount, a micro-feature with an LMC price, or any new AI /
 * API / advertising feature — without an economic model answering FSR-005:
 * who pays, for what, at what approximate cost, at what expected margin.
 *
 * Every RED condition below is proven by a NEGATIVE CONTROL: the test
 * constructs the offending shape and asserts the gate rejects it. A gate that
 * has never been shown to fail is not a gate.
 *
 * This guard is STRENGTHENED, never disabled.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  COMMERCIAL_PRINCIPLES,
  ECONOMIC_ASSESSMENTS,
  GRANDFATHERED_ITEMS,
  commercialGateReport,
  commercialItems,
  itemRef,
  machineEnforcedPrinciples,
  reviewOnlyPrinciples,
  violationsFor,
  type CommercialItem,
  type EconomicAssessment,
  type EconomicModel,
} from "../commercial/sustainability";

const here = resolve(fileURLToPath(import.meta.url), "..");
const repoRoot = resolve(here, "..", "..", "..", "..");
const DOC = join(repoRoot, "docs", "product", "commercial-sustainability-v1.md");

/** A complete, compliant model — the shape each negative control mutates. */
const SOUND: EconomicModel = {
  payer: "company",
  paidFor: "One promoted job advertisement for 30 days",
  costDriver: "ad serving + moderation review",
  estimatedUnitCostCents: 120,
  costUnit: "per ad-month",
  costScalesWithUsage: true,
  revenueScalesWithUsage: true,
  expectedMarginPercent: 60,
  unlimitedClaim: false,
  abuseLimitMechanism: null,
  subsidised: false,
  subsidyFundedBy: null,
  deliveredCapability: "One additional active job advertisement slot",
  assessedAt: "2026-07-28",
};

const sellable: CommercialItem = {
  kind: "micro_feature",
  code: "single_ad",
  activatable: true,
};
const assessedWith = (m: Partial<EconomicModel>): EconomicAssessment => ({
  assessed: true,
  model: { ...SOUND, ...m },
});

// ── 1. The document exists and is binding ──────────────────────────────────

describe("commercial gate — the binding document", () => {
  it("the sustainability document exists and states every principle", () => {
    expect(existsSync(DOC)).toBe(true);
    const doc = readFileSync(DOC, "utf8");
    for (const p of COMMERCIAL_PRINCIPLES) {
      expect(doc, `${p.id} missing from the binding document`).toContain(p.id);
    }
    expect(doc).toMatch(/lib\/commercial\/sustainability\.ts/);
  });

  it("all ten principles are declared, each with an enforcement kind", () => {
    expect(COMMERCIAL_PRINCIPLES).toHaveLength(10);
    const ids = COMMERCIAL_PRINCIPLES.map((p) => p.id);
    expect(new Set(ids).size).toBe(10);
    for (const p of COMMERCIAL_PRINCIPLES) {
      expect(p.statement.length).toBeGreaterThan(30);
      expect(p.enforcedBy.length).toBeGreaterThan(20);
    }
    // Honest split: what is proven vs what is design judgement.
    expect(machineEnforcedPrinciples()).toEqual([
      "CSP-001", "CSP-002", "CSP-005",
      "FSR-001", "FSR-002", "FSR-003", "FSR-004", "FSR-005",
    ]);
    expect(reviewOnlyPrinciples()).toEqual(["CSP-003", "CSP-004"]);
  });
});

// ── 2. The gate is green today, for the right reason ───────────────────────

describe("commercial gate — current state", () => {
  it("is GREEN today because nothing is sellable yet", () => {
    const report = commercialGateReport();
    expect(
      report.violations.map((v) => `${v.item} ${v.code}`).join("\n"),
    ).toBe("");
    expect(report.status).toBe("GREEN");
    expect(report.itemsActivatable).toBe(0);
    expect(report.itemsAssessed).toBe(0);
  });

  it("every catalogue item has an assessment entry (nothing is unlisted)", () => {
    for (const item of commercialItems()) {
      const ref = itemRef(item.kind, item.code);
      expect(ECONOMIC_ASSESSMENTS[ref], `${ref} has no assessment entry`).toBeDefined();
    }
  });

  it("every unassessed item names the owner decision that will produce its model", () => {
    for (const [ref, a] of Object.entries(ECONOMIC_ASSESSMENTS)) {
      if (!a.assessed) {
        expect(a.ownerDecision, `${ref} is unassessed with no owner decision`).toMatch(
          /^MOD-\d\d$/,
        );
        expect(a.activatable).toBe(false);
      }
    }
  });

  it("the grandfather baseline is closed and covers exactly today's items", () => {
    const refs = commercialItems().map((i) => itemRef(i.kind, i.code)).sort();
    expect([...GRANDFATHERED_ITEMS].sort()).toEqual(refs);
    // 20 items = 5 plans + 7 top-up slots + 8 micro-features.
    expect(GRANDFATHERED_ITEMS).toHaveLength(20);
  });
});

// ── 3. NEGATIVE CONTROLS — each RED condition really fires ─────────────────

describe("commercial gate — RED conditions (negative controls)", () => {
  it("RED: a sellable item with no economic model (FSR-005)", () => {
    const v = violationsFor(sellable, {
      assessed: false,
      ownerDecision: "MOD-18",
      activatable: false,
    });
    expect(v.map((x) => x.code)).toContain("activatable_without_assessment");
    expect(v[0].principle).toBe("FSR-005");
  });

  it("RED: a brand-new item with no assessment entry at all (CSP-002)", () => {
    const v = violationsFor(
      { kind: "ai_feature", code: "cv_rewrite_ai", activatable: false },
      undefined,
    );
    expect(v.map((x) => x.code)).toContain("new_item_without_assessment");
  });

  it("RED: a new item added unassessed, even while not yet sellable (CSP-002)", () => {
    const v = violationsFor(
      { kind: "api_feature", code: "public_search_api", activatable: false },
      { assessed: false, ownerDecision: "MOD-05", activatable: false },
    );
    expect(v.map((x) => x.code)).toContain("new_item_without_assessment");
  });

  it("RED: assessed but the unit cost is unknown (FSR-001)", () => {
    const v = violationsFor(sellable, assessedWith({ estimatedUnitCostCents: null }));
    expect(v.map((x) => x.code)).toContain("missing_unit_cost");
  });

  it("RED: assessed but no expected margin (FSR-005)", () => {
    const v = violationsFor(sellable, assessedWith({ expectedMarginPercent: null }));
    expect(v.map((x) => x.code)).toContain("missing_margin");
  });

  it('RED: "unlimited" with no abuse mechanism (FSR-002)', () => {
    const v = violationsFor(
      sellable,
      assessedWith({ unlimitedClaim: true, abuseLimitMechanism: null }),
    );
    expect(v.map((x) => x.code)).toContain("unlimited_without_abuse_limit");
  });

  it('GREEN: "unlimited" WITH a real mechanism passes (FSR-002)', () => {
    const v = violationsFor(
      sellable,
      assessedWith({
        unlimitedClaim: true,
        abuseLimitMechanism: "fair-use cap of 200 active ads/month, enforced server-side",
      }),
    );
    expect(v).toEqual([]);
  });

  it("RED: cost scales with usage while revenue does not, unbounded (FSR-003)", () => {
    const v = violationsFor(
      sellable,
      assessedWith({
        costScalesWithUsage: true,
        revenueScalesWithUsage: false,
        abuseLimitMechanism: null,
      }),
    );
    expect(v.map((x) => x.code)).toContain("growth_scales_losses");
  });

  it("RED: a non-positive margin that is not a declared subsidy (CSP-001)", () => {
    const v = violationsFor(
      sellable,
      assessedWith({ expectedMarginPercent: -10, subsidised: false }),
    );
    expect(v.map((x) => x.code)).toContain("negative_margin_without_subsidy");
  });

  it("GREEN: a declared subsidy with a named present funding source (CSP-003)", () => {
    const v = violationsFor(
      { kind: "plan", code: "free_worker", activatable: true },
      assessedWith({
        payer: "platform",
        expectedMarginPercent: -100,
        subsidised: true,
        subsidyFundedBy: "gross margin on company and agency subscriptions",
        costScalesWithUsage: true,
        revenueScalesWithUsage: false,
        abuseLimitMechanism: "free-tier AI runs capped per month",
      }),
    );
    expect(v).toEqual([]);
  });

  it("RED: a subsidy justified by future investment (FSR-004)", () => {
    const v = violationsFor(
      sellable,
      assessedWith({
        expectedMarginPercent: -20,
        subsidised: true,
        subsidyFundedBy: "the next investment round",
      }),
    );
    expect(v.map((x) => x.code)).toContain("subsidy_funded_by_future_investment");
  });

  it("RED: an LMC item that delivers a discount rather than a capability (CSP-005)", () => {
    const v = violationsFor(
      sellable,
      assessedWith({ deliveredCapability: "20% discount on the monthly subscription" }),
    );
    expect(v.map((x) => x.code)).toContain("lmc_used_as_discount");
  });

  it("a fully sound model produces no violation at all", () => {
    expect(violationsFor(sellable, assessedWith({}))).toEqual([]);
  });
});

// ── 4. The gate cannot be quietly bypassed ─────────────────────────────────

describe("commercial gate — cannot be bypassed", () => {
  it("the baseline may never grow (adding a code there is not an escape hatch)", () => {
    // Pinned literally: raising this number requires editing the guard, which
    // is a reviewable act, not a silent catalogue edit.
    expect(GRANDFATHERED_ITEMS).toHaveLength(20);
  });

  it("an unassessed item may never declare itself activatable", () => {
    for (const a of Object.values(ECONOMIC_ASSESSMENTS)) {
      if (!a.assessed) expect(a.activatable).toBe(false);
    }
  });

  it("the report counts what it claims to count", () => {
    const r = commercialGateReport();
    const items = commercialItems();
    expect(r.itemsTotal).toBe(items.length);
    expect(r.itemsGrandfathered).toBe(GRANDFATHERED_ITEMS.length);
  });
});
