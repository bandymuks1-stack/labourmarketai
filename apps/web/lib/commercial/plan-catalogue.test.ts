/**
 * Canonical typed plan catalogue: equivalence + invariants.
 *
 * The snapshot `__fixtures__/pre-payment-plans.snapshot.json` was captured from
 * `lib/billing/plans.ts` BEFORE the catalogue existed. Every non-function
 * export of plans.ts must still serialize byte-for-byte equal, and the exported
 * function set must be unchanged. No behaviour change.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import * as Plans from "@/lib/billing/plans";
import { resolveEntitlements, entitlementAllows } from "@/lib/billing/entitlements-v1";
import { LMC_PURCHASES_ENABLED, LMC_PROMOTIONAL_GRANTS_ENABLED, LMC_REFERRALS_ENABLED, STRIPE_LMC_TOPUPS_ENABLED, LIVE_PAYMENTS_ENABLED, LMC_SPENDING_ENABLED, LMC_COMPENSATION_ENABLED } from "@/lib/billing/lmc-flags";
import {
  CATALOGUE_DEFERRED_KEYS,
  CATALOGUE_FREE_ORGANIZATION_KEY,
  CATALOGUE_ORGANIZATION_KEY,
  PLAN_CATALOGUE,
  RETIRED_DB_ROWS,
  toBoundary,
} from "./plan-catalogue";
import { dbDisplayAdapter, mobilePaymentAdapter, stripePaymentAdapter } from "./plan-adapters";

const SNAP = JSON.parse(readFileSync(join(__dirname, "__fixtures__/pre-payment-plans.snapshot.json"), "utf8")) as {
  values: Record<string, unknown>;
  functions: string[];
};
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
const src = (f: string) => readFileSync(join(__dirname, f), "utf8");

describe("plans.ts exports are derived from the catalogue with identical values", () => {
  it("every non-function export serializes byte-equal to the pre-change snapshot", () => {
    for (const [k, v] of Object.entries(SNAP.values)) {
      expect(JSON.stringify((Plans as Record<string, unknown>)[k]), k).toBe(JSON.stringify(v));
    }
  });

  it("the exported function set is unchanged", () => {
    const fns = Object.entries(Plans).filter(([, v]) => typeof v === "function").map(([k]) => k).sort();
    expect(fns).toEqual(SNAP.functions);
  });

  it("no new value export appeared on plans.ts", () => {
    const vals = Object.entries(Plans).filter(([, v]) => typeof v !== "function").map(([k]) => k).sort();
    expect(vals).toEqual(Object.keys(SNAP.values).sort());
  });

  it("PRE_PAYMENT_PLANS is exactly the boundary projection of the catalogue (order included)", () => {
    expect(JSON.stringify(Plans.PRE_PAYMENT_PLANS)).toBe(JSON.stringify(PLAN_CATALOGUE.map(toBoundary)));
    for (const p of Plans.PRE_PAYMENT_PLANS) expect("commercial" in p).toBe(false);
  });

  it("the guard-pinned literal keys in plans.ts equal the catalogue keys", () => {
    expect(Plans.FREE_ORGANIZATION_PLAN_KEY).toBe(CATALOGUE_FREE_ORGANIZATION_KEY);
    expect(Plans.ORGANIZATION_PLAN_KEY).toBe(CATALOGUE_ORGANIZATION_KEY);
    expect([...Plans.DEFERRED_PLAN_KEYS]).toEqual([...CATALOGUE_DEFERRED_KEYS]);
  });

  it("live limits: organization has NO numeric ceiling (boolean true, owner 2026-10-06), free organization 1, agency 25 (deferred)", () => {
    const lim = (k: string) => PLAN_CATALOGUE.find((p) => p.slug === k)!.entitlements.company_create_needs;
    expect(lim("company_pilot")).toBe(true);
    expect(lim("free_organization")).toBe(1);
    expect(lim("agency_pilot")).toBe(25);
  });

  it("the shared resolver behaves identically on the derived registry", () => {
    const ctx = resolveEntitlements({ billingActive: true, isAdmin: false, audience: "company", subscriptionPlanKey: "company_pilot", subscriptionStatus: "active", manualOverridePlanKey: null });
    expect(ctx.effectivePlanKey).toBe("company_pilot");
    expect(entitlementAllows(ctx, "company_create_needs")).toBe(true);
  });
});

describe("commercial block invariants", () => {
  it("carries no money figure in code (the figure is referenced from the DB, never copied)", () => {
    const code = stripComments(src("plan-catalogue.ts") + src("plan-adapters.ts"));
    expect(/(?:[€$]\s?\d)|(?:\d[\d.,]*\s?(?:€|\$|EUR|USD)\b)|\b99\b|cents|launch_offer/i.test(code)).toBe(false);
    for (const p of PLAN_CATALOGUE) {
      if (p.commercial.price && "source" in p.commercial.price && p.commercial.price.source === "db") {
        expect(Object.keys(p.commercial.price).sort()).toEqual(["column", "dbSlug", "source"]);
      }
    }
  });

  it("only the one organization plan is sellable and decided; deferred plans stay open and never reach the DB", () => {
    expect(PLAN_CATALOGUE.filter((p) => p.launch === "sellable").map((p) => p.slug)).toEqual(["company_pilot"]);
    for (const p of PLAN_CATALOGUE.filter((x) => x.launch === "deferred")) {
      expect("status" in p.commercial.price ? p.commercial.price.status : "db").toBe("open");
      expect(p.commercial.dbSlug).toBeNull();
    }
    const org = PLAN_CATALOGUE.find((p) => p.slug === "company_pilot")!.commercial;
    expect(org.currency).toMatchObject({ status: "decided", value: "EUR" });
    expect(org.interval).toMatchObject({ status: "decided", value: "month" });
    expect(org.taxBasis).toMatchObject({ status: "decided", value: "exclusive" });
  });

  it("every plan declares annual as open and LMC as open questions, never as entitlements", () => {
    for (const p of PLAN_CATALOGUE) {
      expect(p.commercial.annual.status).toBe("open");
      expect(p.commercial.lmc.includedPerPeriod.status).toBe("open");
      expect(p.commercial.lmc.topupDiscount.status).toBe("open");
    }
  });

  it("retired DB rows are carried as retired: never active, never priced", () => {
    expect(RETIRED_DB_ROWS.map((r) => r.dbSlug)).toEqual(["agency", "enterprise"]);
    for (const r of RETIRED_DB_ROWS) {
      expect(r.state).toBe("retired");
      expect(r.mustBeActive).toBe(false);
      expect(r.mustBePriced).toBe(false);
    }
    expect(PLAN_CATALOGUE.some((p) => p.commercial.dbSlug === "agency" || p.commercial.dbSlug === "enterprise")).toBe(false);
  });

  it("no launch_offer_99 concept is represented", () => {
    expect(src("plan-catalogue.ts").replace(/launch_offer_99 concept[^\n]*/g, "")).not.toMatch(/launch_offer/);
  });
});

describe("adapters are pure projections", () => {
  it("DB adapter: free_organization -> free, company_pilot -> business, nothing else", () => {
    const rows = dbDisplayAdapter.rows();
    expect(rows.map((r) => [r.planKey, r.dbSlug, r.expectActive])).toEqual([
      ["free_organization", "free", true],
      ["company_pilot", "business", true],
    ]);
    expect(dbDisplayAdapter.retiredRows()).toBe(RETIRED_DB_ROWS);
  });

  it("Stripe adapter: one slot per paying plan key; only company_pilot sellable; deferred slots unset", () => {
    const s = stripePaymentAdapter.slots();
    expect(s.map((x) => [x.planKey, x.slotId, x.sellable])).toEqual([
      ["worker_plus", "worker_plus", false],
      ["company_pilot", "company_pilot", true],
      ["agency_pilot", "agency_pilot", false],
    ]);
    expect(stripePaymentAdapter.slotFor("free_organization")).toBeNull();
  });

  it("mobile payment adapter is a seam with no products", () => {
    for (const p of PLAN_CATALOGUE) expect(mobilePaymentAdapter.productFor(p.slug)).toBeNull();
  });

  it("the catalogue and adapters never touch LMC state or flags: every LMC flag stays false", () => {
    expect([LMC_PURCHASES_ENABLED, LMC_PROMOTIONAL_GRANTS_ENABLED, LMC_REFERRALS_ENABLED, STRIPE_LMC_TOPUPS_ENABLED, LIVE_PAYMENTS_ENABLED, LMC_SPENDING_ENABLED, LMC_COMPENSATION_ENABLED]).toEqual([false, false, false, false, false, false, false]);
    expect(/lmc_|lmc-flags|supabase|stripe\b.*import/i.test(stripComments(src("plan-catalogue.ts") + src("plan-adapters.ts")).replace(/^\s*import[^\n]*\n/gm, "").replace(/lmc: lmcOpen|lmcOpen|\blmc\b:/g, ""))).toBe(false);
  });
});
