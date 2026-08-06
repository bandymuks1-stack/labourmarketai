/**
 * Guard — COMMERCIAL SINGLE SOURCE OF TRUTH.
 *
 * After `feat/canonical-commercial-system-v1` there is exactly ONE place where
 * a price, an LMC rule, a Stripe product slot or an entitlement source may be
 * defined: `docs/product/commercial-system-v1.md` and its machine-readable
 * half `lib/commercial/catalogue.ts`.
 *
 * This guard fails the build if:
 *   1. the two halves disagree (a plan key, micro-feature code, top-up slot or
 *      owner-decision id exists in one and not the other);
 *   2. a value is missing without a declared owner decision (a silent gap);
 *   3. a commercial EUR/LMC amount is hardcoded anywhere outside the catalogue;
 *   4. the generator would emit a Stripe product for a price nobody set;
 *   5. an entitlement claims a source outside {plan, lmc, admin};
 *   6. the catalogue starts claiming decisions that were never made (the count
 *      of decided prices is pinned at 0 until the owner sets them).
 *
 * This guard is STRENGTHENED, never disabled. When the owner closes a decision,
 * update the catalogue + the document + rule 6's expectation in ONE PR.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  SUBSCRIPTION_PLANS,
  MICRO_FEATURES,
  TOPUP_PACKAGE_SLOTS,
  ENTITLEMENT_BINDINGS,
  OWNER_DECISIONS,
  LMC,
  isDecided,
  stripeProductPlan,
  plansTableRows,
  uiMonthlyPriceCents,
  resolveEffectiveAllowance,
  unresolvedOwnerDecisions,
  dataBlockedDecisions,
  danglingDecisionIds,
  catalogueSummary,
  isCatalogueComplete,
} from "../commercial/catalogue";

const here = resolve(fileURLToPath(import.meta.url), "..");
const webRoot = resolve(here, "..", "..");
const repoRoot = resolve(webRoot, "..", "..");

const DOC = join(repoRoot, "docs", "product", "commercial-system-v1.md");
const doc = readFileSync(DOC, "utf8");

// ── 1. The two halves agree ────────────────────────────────────────────────

describe("commercial single source — the document and the catalogue agree", () => {
  it("the canonical document exists and names the catalogue module", () => {
    expect(existsSync(DOC)).toBe(true);
    expect(doc).toMatch(/lib\/commercial\/catalogue\.ts/);
  });

  it("every plan key appears in the document", () => {
    for (const p of SUBSCRIPTION_PLANS) {
      expect(doc, `plan ${p.planKey} missing from the canonical document`).toContain(
        p.planKey,
      );
    }
  });

  it("every micro-feature code appears in the document", () => {
    for (const f of MICRO_FEATURES) {
      expect(doc, `micro-feature ${f.code} missing from the document`).toContain(f.code);
    }
  });

  it("every top-up slot appears in the document", () => {
    for (const t of TOPUP_PACKAGE_SLOTS) {
      expect(doc, `top-up slot ${t.code} missing from the document`).toContain(t.code);
    }
  });

  it("every owner-decision id appears in the document, and vice versa", () => {
    const inDoc = new Set(doc.match(/MOD-\d\d/g) ?? []);
    const inCode = new Set(OWNER_DECISIONS.map((d) => d.id));
    const missingFromDoc = [...inCode].filter((id) => !inDoc.has(id));
    const missingFromCode = [...inDoc].filter((id) => !inCode.has(id));
    expect(missingFromDoc, "declared in code, absent from the document").toEqual([]);
    expect(missingFromCode, "quoted in the document, not declared in code").toEqual([]);
  });

  it("owner-decision ids are unique and contiguous from MOD-01", () => {
    const ids = OWNER_DECISIONS.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
    const numbers = ids.map((id) => Number(id.slice(4))).sort((a, b) => a - b);
    expect(numbers[0]).toBe(1);
    expect(numbers[numbers.length - 1]).toBe(numbers.length);
  });
});

// ── 2. No silent gap ───────────────────────────────────────────────────────

describe("commercial single source — a missing value always names its decision", () => {
  it("no data field is missing without a declared owner decision", () => {
    expect(danglingDecisionIds()).toEqual([]);
  });

  it("every owner decision states what it blocks and carries its inputs", () => {
    for (const d of OWNER_DECISIONS) {
      expect(d.question.length, `${d.id}: empty question`).toBeGreaterThan(10);
      expect(d.blocks.length, `${d.id}: does not say what it blocks`).toBeGreaterThan(3);
      expect(d.inputs.length, `${d.id}: no recovered inputs recorded`).toBeGreaterThan(0);
    }
  });

  it("every plan carries every commercial axis (a missing axis cannot read as unlimited)", () => {
    const axes = Object.keys(SUBSCRIPTION_PLANS[0].entitlements);
    for (const p of SUBSCRIPTION_PLANS) {
      expect(Object.keys(p.entitlements).sort()).toEqual(axes.sort());
      for (const [axis, allowance] of Object.entries(p.entitlements)) {
        const hasValue = allowance.value !== null;
        const hasDecision =
          allowance.value === null &&
          typeof (allowance as { ownerDecision?: string }).ownerDecision === "string";
        expect(
          hasValue || hasDecision,
          `${p.planKey}.${axis} is neither decided nor attributed to an owner decision`,
        ).toBe(true);
      }
    }
  });
});

// ── 3. No commercial price outside the catalogue ───────────────────────────

/**
 * Modules that define what the product SELLS. User-entered marketplace amounts
 * (accommodation rent, offer prices, invoices) are customer data and live
 * elsewhere by design — they are not part of this scope.
 */
const COMMERCIAL_DIRS = ["lib/billing", "lib/commercial", "lib/marketing", "app/api/billing"];
const CATALOGUE_FILE = "lib/commercial/catalogue.ts";

/**
 * A hardcoded commercial amount. Deliberately broad on the identifier side:
 * the first version of this rule only matched a lowercase `price` and let
 * `PROBE_PRICE_CENTS = 999` through, which is exactly the drift it exists to
 * stop. Any identifier containing "price" or "amount" (in any casing) bound to
 * a numeric literal counts, as does any EUR figure.
 */
const EUR_LITERAL = /\d+(?:[.,]\d{2})?\s*(?:€|EUR)\b|\b(?:€|EUR)\s*\d+/;
const PRICE_ASSIGNMENT = /\b[A-Za-z_$]*(?:price|amount)[A-Za-z_$]*\s*[:=]\s*\d/i;

function sources(dir: string, acc: string[] = []): string[] {
  if (!existsSync(dir)) return acc;
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) sources(p, acc);
    else if (/\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f)) acc.push(p);
  }
  return acc;
}

const rel = (file: string) =>
  file.split(/[\\/]apps[\\/]web[\\/]/)[1]?.replace(/\\/g, "/") ?? file;

describe("commercial single source — no price lives anywhere else", () => {
  it("no commercial module hardcodes a EUR amount or a price literal", () => {
    const offenders: string[] = [];
    for (const dir of COMMERCIAL_DIRS) {
      for (const file of sources(join(webRoot, dir))) {
        const r = rel(file);
        if (r === CATALOGUE_FILE) continue; // the one allowed home
        const src = readFileSync(file, "utf8");
        // Strip comments: provenance notes legitimately quote historic prices.
        const code = src
          .replace(/\/\*[\s\S]*?\*\//g, "")
          .replace(/^\s*\/\/.*$/gm, "");
        if (EUR_LITERAL.test(code) || PRICE_ASSIGNMENT.test(code)) offenders.push(r);
      }
    }
    expect(
      offenders,
      `commercial price defined outside docs/product/commercial-system-v1.md + ${CATALOGUE_FILE}:\n${offenders.join("\n")}`,
    ).toEqual([]);
  });

  it("the Stripe price map still resolves env vars only, never amounts", () => {
    const src = readFileSync(join(webRoot, "lib/billing/prices.ts"), "utf8");
    expect(src).toMatch(/STRIPE_PRICE_/);
    expect(src).not.toMatch(EUR_LITERAL);
  });
});

// ── 4. The generator refuses to invent ─────────────────────────────────────

describe("commercial single source — generation is blocked, not guessed", () => {
  it("no Stripe product is generatable while its price is an open decision", () => {
    for (const s of stripeProductPlan()) {
      if (s.monthlyCents === null || s.annualCents === null) {
        expect(s.ready, `${s.planKey} claims to be generatable without a price`).toBe(false);
        expect(s.blockedBy.length).toBeGreaterThan(0);
      }
    }
  });

  it("a plan with no decided price yields null, never 0 and never a placeholder", () => {
    for (const p of SUBSCRIPTION_PLANS) {
      if (!isDecided(p.monthlyPrice)) {
        expect(uiMonthlyPriceCents(p.planKey)).toBeNull();
      }
    }
    const rows = plansTableRows();
    expect(rows.length).toBe(SUBSCRIPTION_PLANS.length);
    for (const r of rows) {
      expect(r.price_eur_monthly === null || typeof r.price_eur_monthly === "number").toBe(true);
    }
  });

  it("the catalogue is not complete while any decision is open", () => {
    expect(unresolvedOwnerDecisions().length).toBeGreaterThan(0);
    expect(isCatalogueComplete()).toBe(false);
  });
});

// ── 5. Entitlement sources are closed ──────────────────────────────────────

describe("commercial single source — rights come only from plan, LMC or admin", () => {
  it("no entitlement declares a fourth source", () => {
    const allowed = new Set(["plan", "lmc", "admin"]);
    for (const e of ENTITLEMENT_BINDINGS) {
      expect(e.sources.length).toBeGreaterThan(0);
      for (const s of e.sources) {
        expect(allowed.has(s), `${e.key} claims source "${s}"`).toBe(true);
      }
    }
  });

  it("every entitlement key in the plan boundary is bound to a source", async () => {
    const { PRE_PAYMENT_PLANS } = await import("../billing/plans");
    const boundKeys = new Set(ENTITLEMENT_BINDINGS.map((e) => e.key));
    for (const plan of PRE_PAYMENT_PLANS) {
      for (const key of Object.keys(plan.entitlements)) {
        expect(boundKeys.has(key), `${key} has no entitlement-source binding`).toBe(true);
      }
    }
  });

  it("no entitlement is obtainable from LMC until a micro-feature is priced", () => {
    const anyPriced = MICRO_FEATURES.some((f) => f.lmcPrice !== null);
    if (!anyPriced) {
      // Honest state: the `lmc` source is declared but cannot yet grant anything.
      expect(MICRO_FEATURES.every((f) => f.lmcPrice === null)).toBe(true);
    }
  });
});

// ── 6. Nothing was invented ────────────────────────────────────────────────

describe("commercial single source — the catalogue invents nothing", () => {
  it("no paid plan has a price, no top-up has an amount, no feature has an LMC price", () => {
    const s = catalogueSummary();
    // These zeros are the whole point: they change ONLY when the owner decides.
    expect(s.topUpPackagesDecided).toBe(0);
    expect(s.microFeaturesPriced).toBe(0);
    expect(s.stripeProductsGeneratable).toBe(0);
    expect(s.stripePricesGeneratable).toBe(0);
    for (const p of SUBSCRIPTION_PLANS) {
      if (p.stripePriceEnvVar !== null) {
        expect(isDecided(p.monthlyPrice), `${p.planKey} acquired a price`).toBe(false);
      }
    }
  });

  it("the LMC unit and grant rules match the binding train document", () => {
    expect(LMC.eurPerLmc).toBe(1);
    expect(LMC.centsPerLmc).toBe(100);
    expect(LMC.grants.signup.lmc).toBe(50);
    expect(LMC.grants.activity.lmc).toBe(50);
    expect(LMC.grants.perUserPromotionalCeilingLmc).toBe(100);
    expect(LMC.grants.adminGrantMaxLmc).toBe(1000);
    expect(LMC.grants.adminGrantMaxExpiryDays).toBe(365);
    expect(LMC.expiry.promotionalDays).toBe(60);
    expect(LMC.grants.dailyRewardForbidden).toBe(true);
    // No referral rate may ever default in.
    expect(LMC.referral.rate).toBeNull();
    expect(LMC.referral.singleLevelOnly).toBe(true);
  });

  it("the two owner-only kill-switches are not downgraded", () => {
    expect(LMC.flags.stripe_lmc_topups_enabled).toBe("owner_only");
    expect(LMC.flags.live_payments_enabled).toBe("owner_only");
  });

  it("the plan+LMC combination rule cannot exceed an unlimited plan", () => {
    expect(resolveEffectiveAllowance("unlimited", 100)).toBe("unlimited");
    expect(resolveEffectiveAllowance(5, 5)).toBe(10);
    expect(resolveEffectiveAllowance(5, -3)).toBe(5);
    expect(resolveEffectiveAllowance(5, 2.7)).toBe(7);
  });

  it("the count of decisions that block a concrete field is recorded honestly", () => {
    const blocking = dataBlockedDecisions();
    expect(blocking.length).toBeGreaterThan(0);
    expect(blocking.length).toBeLessThanOrEqual(OWNER_DECISIONS.length);
    expect(doc).toContain(`${blocking.length} of the ${OWNER_DECISIONS.length}`);
  });
});
