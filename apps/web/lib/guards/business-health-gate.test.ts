/**
 * Guard — BUSINESS HEALTH ENGINE (CEO financial operating system).
 *
 * Binding contract: `docs/product/business-health-engine-v1.md`.
 *
 * The engine's whole value is that it tells the truth early. That makes two
 * failure modes worse than having no engine at all:
 *   1. reporting a NUMBER that was not measured (a fabricated zero);
 *   2. reporting CLEAR on an early warning it cannot actually evaluate.
 *
 * Both are structurally impossible here, and this guard proves it. It also
 * extends the Commercial Gate: a feature with no owner, no revenue driver, no
 * margin model or no recorded commercial decision cannot go live, because the
 * CEO table could not report on it.
 *
 * This guard is STRENGTHENED, never disabled.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  DATA_SOURCES,
  METRICS,
  WARNING_RULES,
  HEALTH_SCORE_COMPONENTS,
  HEALTH_SCORE_MIN_COMPONENTS,
  businessHealthReadiness,
  ceoDashboardModel,
  dataSource,
  evaluateWarnings,
  featureEconomics,
  financialHealthScore,
  metric,
  metricAvailability,
  planHealth,
  trackedItemCount,
  unmeasuredReasonFor,
} from "../commercial/business-health";
import { violationsFor, type EconomicModel } from "../commercial/sustainability";

const here = resolve(fileURLToPath(import.meta.url), "..");
const repoRoot = resolve(here, "..", "..", "..", "..");
const DOC = join(repoRoot, "docs", "product", "business-health-engine-v1.md");

// ── 1. The binding document ────────────────────────────────────────────────

describe("business health — the binding document", () => {
  it("exists and names the engine module", () => {
    expect(existsSync(DOC)).toBe(true);
    expect(readFileSync(DOC, "utf8")).toMatch(/lib\/commercial\/business-health\.ts/);
  });

  it("documents every metric, warning and score component", () => {
    const doc = readFileSync(DOC, "utf8");
    for (const x of METRICS) {
      expect(doc, `metric ${x.code} missing from the document`).toContain(x.code);
    }
    for (const w of WARNING_RULES) {
      expect(doc, `warning ${w.code} missing from the document`).toContain(w.code);
    }
    for (const c of HEALTH_SCORE_COMPONENTS) {
      expect(doc, `score component ${c.code} missing from the document`).toContain(c.label);
    }
  });
});

// ── 2. Registry integrity ──────────────────────────────────────────────────

describe("business health — the metric registry is complete and honest", () => {
  it("every metric has a formula, at least one input and a reason to exist", () => {
    for (const x of METRICS) {
      expect(x.formula.length, `${x.code}: no formula`).toBeGreaterThan(20);
      expect(x.inputs.length, `${x.code}: no data source`).toBeGreaterThan(0);
      expect(x.why.length, `${x.code}: no stated purpose`).toBeGreaterThan(15);
    }
  });

  it("every metric input names a declared data source", () => {
    for (const x of METRICS) {
      for (const input of x.inputs) {
        expect(dataSource(input), `${x.code} reads undeclared source "${input}"`).not.toBeNull();
      }
    }
  });

  it("metric codes are unique", () => {
    const codes = METRICS.map((x) => x.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it("availability is DERIVED from data sources, never hand-declared", () => {
    // A metric reading a missing source can never claim to be computable.
    for (const x of METRICS) {
      const hasMissing = x.inputs.some((i) => dataSource(i)?.state === "missing");
      if (hasMissing) expect(metricAvailability(x)).toBe("blocked_missing_data");
    }
  });

  it("the health score weights sum to 100 across its 8 components", () => {
    expect(HEALTH_SCORE_COMPONENTS).toHaveLength(8);
    const total = HEALTH_SCORE_COMPONENTS.reduce((a, c) => a + c.weight, 0);
    expect(total).toBe(100);
  });
});

// ── 3. Never a fabricated number ───────────────────────────────────────────

describe("business health — an unmeasured metric never returns a number", () => {
  it("every metric whose sources are missing yields measured:false with a reason", () => {
    for (const x of METRICS) {
      if (metricAvailability(x) === "blocked_missing_data") {
        const v = unmeasuredReasonFor(x);
        expect(v.measured, `${x.code} returned a value with no collector`).toBe(false);
        if (!v.measured) {
          expect(v.reason).toBe("no_collector");
          expect(v.detail.length).toBeGreaterThan(20);
        }
      }
    }
  });

  it("the CEO dashboard reports reasons, not zeros", () => {
    const d = ceoDashboardModel("2026-07-28");
    const cells = [
      d.todayRevenue, d.todayCost, d.todayMargin, d.mrr, d.arr,
      d.usersPaid, d.usersFree, d.conversion, d.arpu, d.acpu,
      d.topCostFeatures, d.topRevenueFeatures, d.topAiConsumers,
      d.lmcOutstandingLiability, d.lmcOutstandingCredits,
    ];
    for (const cell of cells) {
      // Today NOTHING is measurable — and every cell says so explicitly.
      expect(cell.measured).toBe(false);
      if (!cell.measured) expect(cell.detail.length).toBeGreaterThan(10);
    }
  });

  it("plan health reports unknown profitability, never a flattering default", () => {
    const health = planHealth();
    expect(health.length).toBeGreaterThan(0);
    for (const p of health) {
      expect(p.profitability).toBe("unknown");
      expect(p.risk).toBe("unknown");
      expect(p.rationale.length).toBeGreaterThan(30);
      expect(p.revenue.measured).toBe(false);
      expect(p.aiCost.measured).toBe(false);
    }
  });
});

// ── 4. Never CLEAR while blind ─────────────────────────────────────────────

describe("business health — early warnings refuse to reassure", () => {
  it("declares all eight warning codes", () => {
    expect(WARNING_RULES).toHaveLength(8);
    const codes = WARNING_RULES.map((w) => w.code).sort();
    expect(codes).toEqual([
      "EXPENSIVE_FEATURE", "HIGH_AI_COST", "LMC_LIABILITY_GROWING", "LOSS_RISK",
      "LOW_MARGIN", "NEGATIVE_MARGIN", "SUBSIDY_RISK", "UNLIMITED_RISK",
    ]);
  });

  it("every rule states a condition and its inputs", () => {
    for (const w of WARNING_RULES) {
      expect(w.condition.length, `${w.code}: no condition`).toBeGreaterThan(15);
      expect(w.inputs.length, `${w.code}: no inputs`).toBeGreaterThan(0);
    }
  });

  it("a warning whose inputs are unmeasured is NOT_EVALUABLE, never CLEAR", () => {
    const evaluations = evaluateWarnings();
    expect(evaluations).toHaveLength(WARNING_RULES.length);
    for (const e of evaluations) {
      const rule = WARNING_RULES.find((w) => w.code === e.code)!;
      const measurable = rule.inputs
        .map((i) => metric(i))
        .filter((x): x is NonNullable<typeof x> => x !== null)
        .every((x) => metricAvailability(x) === "computable");
      if (!measurable && e.code !== "UNLIMITED_RISK") {
        expect(e.status, `${e.code} claimed a verdict it cannot support`).toBe("NOT_EVALUABLE");
        expect(e.detail).toMatch(/NOT a clear signal|no period of activity/);
      }
    }
  });

  it("no warning is CLEAR today except the one that needs no measurement", () => {
    for (const e of evaluateWarnings()) {
      if (e.status === "CLEAR") expect(e.code).toBe("UNLIMITED_RISK");
    }
  });
});

// ── 5. The health score refuses to be decorative ───────────────────────────

describe("business health — the score refuses to report on thin data", () => {
  it("returns INSUFFICIENT_DATA while fewer than the minimum components exist", () => {
    const score = financialHealthScore();
    expect(score.available).toBe(false);
    if (!score.available) {
      expect(score.reason).toBe("INSUFFICIENT_DATA");
      expect(score.required).toBe(HEALTH_SCORE_MIN_COMPONENTS);
      expect(score.computableComponents).toBeLessThan(HEALTH_SCORE_MIN_COMPONENTS);
      expect(score.missing.length).toBeGreaterThan(0);
    }
  });

  it("the minimum is a real bar (more than one component)", () => {
    expect(HEALTH_SCORE_MIN_COMPONENTS).toBeGreaterThan(1);
  });
});

// ── 6. The gate extension: no feature without CEO-level economics ──────────

const SOUND: EconomicModel = {
  owner: "commercial owner",
  payer: "company",
  paidFor: "One promoted job advertisement for 30 days",
  costDriver: "ad serving + moderation review",
  revenueDriver: "one-off LMC spend per advertisement",
  marginModel: "fixed LMC price above the per-ad serving + moderation cost",
  commercialDecision: "MOD-18",
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
const item = { kind: "micro_feature" as const, code: "single_ad", activatable: true };
const withModel = (patch: Partial<EconomicModel>) =>
  violationsFor(item, { assessed: true, model: { ...SOUND, ...patch } }).map((v) => v.code);

describe("business health gate — RED without CEO-level economics", () => {
  it("RED: no accountable owner", () => {
    expect(withModel({ owner: "" })).toContain("missing_business_health_fields");
  });
  it("RED: no revenue driver", () => {
    expect(withModel({ revenueDriver: "" })).toContain("missing_business_health_fields");
  });
  it("RED: no margin model", () => {
    expect(withModel({ marginModel: "" })).toContain("missing_business_health_fields");
  });
  it("RED: no recorded commercial decision", () => {
    expect(withModel({ commercialDecision: "" })).toContain("missing_business_health_fields");
  });
  it("GREEN: a complete CEO-level model passes", () => {
    expect(withModel({})).toEqual([]);
  });
});

// ── 7. Feature economics view ──────────────────────────────────────────────

describe("business health — the feature economics table", () => {
  it("covers every tracked catalogue item", () => {
    expect(featureEconomics()).toHaveLength(trackedItemCount());
  });

  it("an unassessed feature exposes nulls and names its blocking decision", () => {
    for (const f of featureEconomics()) {
      if (f.assessmentStatus === "unassessed") {
        expect(f.estimatedUnitCostCents).toBeNull();
        expect(f.marginModel).toBeNull();
        expect(f.owner).toBeNull();
        expect(f.commercialDecision).toMatch(/^(MOD-\d\d|MISSING_ASSESSMENT)$/);
      }
    }
  });

  it("nothing is live today, and nothing claims to be assessed", () => {
    for (const f of featureEconomics()) {
      expect(f.activationStatus).toBe("not_activatable");
      expect(f.assessmentStatus).toBe("unassessed");
    }
  });
});

// ── 8. Readiness is reported honestly ──────────────────────────────────────

describe("business health — readiness report", () => {
  it("counts what it claims, and admits how little is measurable", () => {
    const r = businessHealthReadiness();
    expect(r.metricsTotal).toBe(METRICS.length);
    expect(
      r.computable + r.computableEmpty + r.blockedMissingData + r.blockedOwnerDecision,
    ).toBe(METRICS.length);
    // The engine is designed, not yet instrumented: nothing is computable.
    expect(r.computable).toBe(0);
    expect(r.healthScoreAvailable).toBe(false);
    expect(r.missingCollectors.length).toBeGreaterThan(0);
  });

  it("every declared data source is verified against production, with a note", () => {
    for (const d of DATA_SOURCES) {
      expect(d.verifiedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(d.note.length).toBeGreaterThan(5);
      expect(["collecting", "empty", "missing"]).toContain(d.state);
    }
  });
});
