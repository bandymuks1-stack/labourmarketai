/**
 * Guard — BILLING READINESS WITHOUT A PROVIDER (Branch 29 closure).
 *
 * Proves that LIVE PAYMENT CAPTURE REMAINS IMPOSSIBLE while billing
 * readiness (plans, boundaries, copy, admin visibility) is closed:
 *
 *   1. PAYMENTS_ENABLED kill-switch is pinned false.
 *   2. Config validation HARD-BLOCKS live mode and live keys (behavioral +
 *      source pin on the exact mechanism in config-core.ts).
 *   3. The webhook rejects live events (source pin + behavioral).
 *   4. No provider secret name / secret shape in client ("use client") code.
 *   5. No payment-capture call sites anywhere in app code; test-mode
 *      checkout-session creation exists ONLY in the allowlisted adapter,
 *      which is unreachable unless the config resolves stripe_test.
 *   6. Every paid tier resolves to `payment_not_enabled` — never a charge.
 *   7. Plan boundary ↔ entitlement wiring is complete: every plan feature
 *      key has a registry entry citing a REAL seam/surface (no phantom
 *      features), and the enforcement seam denies declared-only paid
 *      features once billing enforcement activates (no silent unlimited).
 *   8. Readiness surfaces are honest: claim ledger proofs exist, pricing
 *      readiness is an owner-editable state, and pricing/billing copy makes
 *      no live-payment claim (SR-5 pattern).
 *
 * This guard is STRENGTHENED, never disabled.
 */
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  PAYMENTS_ENABLED,
  PRE_PAYMENT_PLANS,
  type FeatureKey,
} from "../billing/plans";
import { resolveBillingConfig, providerKindFor } from "../billing/config-core";
import { gateFeature, limitFor, planIncludes } from "../billing/entitlements";
import {
  resolveEntitlements,
  entitlementAllows,
} from "../billing/entitlements-v1";
import { assertTestEvent } from "../billing/webhook-core";
import {
  BILLING_READINESS_ITEMS,
  FEATURE_ENFORCEMENT,
  PRICING_READINESS_STATE,
  featureKeysUsedByPlans,
  summarizeEntitlementCoverage,
} from "../billing/readiness";

const here = resolve(fileURLToPath(import.meta.url), "..");
const webRoot = resolve(here, "..", "..");
const repoRoot = resolve(webRoot, "..", "..");
const read = (rel: string) => readFileSync(join(webRoot, rel), "utf8");

function sources(dir: string, acc: string[] = []): string[] {
  if (!existsSync(dir)) return acc;
  for (const f of readdirSync(dir)) {
    if (f === "node_modules" || f === ".next") continue;
    const p = join(dir, f);
    const s = statSync(p);
    if (s.isDirectory()) sources(p, acc);
    else if (/\.(ts|tsx)$/.test(f)) acc.push(p);
  }
  return acc;
}

const rel = (file: string) =>
  file.split(/[\\/]apps[\\/]web[\\/]/)[1]?.replace(/\\/g, "/") ?? file;

const PROD_ROOTS = ["lib", "app", "components"].map((d) => join(webRoot, d));

function prodSources(): string[] {
  return PROD_ROOTS.flatMap((d) => sources(d)).filter(
    (f) => !/\.(test|integration\.test)\.tsx?$/.test(f),
  );
}

// ─── 1. Kill-switch ─────────────────────────────────────────────────────────

describe("kill-switch: payments stay off in code", () => {
  it("PAYMENTS_ENABLED is pinned false", () => {
    expect(PAYMENTS_ENABLED).toBe(false);
  });
});

// ─── 2. Live mode/keys hard-blocked at config validation ───────────────────

describe("config validation hard-blocks live", () => {
  it("live MODE can never produce an active provider", () => {
    const c = resolveBillingConfig({
      paymentsEnabled: "true",
      provider: "stripe",
      mode: "live",
      secretKey: "sk_test_abc",
      webhookSecret: "whsec_abc",
      publishableKey: "pk_test_abc",
    });
    expect(c.state).toBe("stripe_live_blocked");
    expect(c.paymentsEnabled).toBe(false);
    expect(providerKindFor(c)).toBe("noop");
  });

  it("a live KEY shape is blocked even in test mode", () => {
    // Built by concatenation so no live-key literal exists in source
    // (no-live-payments.test.ts scans for the literal shape).
    const liveKeys = ["sk", "pk", "rk"].map((p) => `${p}_live_` + "X123456");
    for (const key of liveKeys) {
      const c = resolveBillingConfig({
        paymentsEnabled: "true",
        provider: "stripe",
        mode: "test",
        secretKey: key.startsWith("sk") ? key : "sk_test_abc",
        webhookSecret: "whsec_abc",
        publishableKey: key.startsWith("sk") ? undefined : key,
      });
      expect(c.state, key).toBe("stripe_live_blocked");
      expect(c.paymentsEnabled, key).toBe(false);
    }
  });

  it("default (no env) resolves disabled → noop provider", () => {
    const c = resolveBillingConfig({
      paymentsEnabled: undefined,
      provider: undefined,
      mode: undefined,
      secretKey: undefined,
      webhookSecret: undefined,
      publishableKey: undefined,
    });
    expect(c.state).toBe("disabled");
    expect(providerKindFor(c)).toBe("noop");
  });

  it("source pin: the hard live block is the FIRST branch of the resolver", () => {
    const src = read("lib/billing/config-core.ts");
    const hardBlock = src.indexOf('state: "stripe_live_blocked"');
    const enablePath = src.indexOf('input.provider !== "stripe"');
    expect(hardBlock).toBeGreaterThan(-1);
    expect(enablePath).toBeGreaterThan(-1);
    expect(hardBlock).toBeLessThan(enablePath); // block evaluated before enable
    expect(src).toMatch(/\(sk\|pk\|rk\)_live_/); // the live-key shape detector
  });
});

// ─── 3. Webhook rejects live events ─────────────────────────────────────────

describe("webhook rejects live events", () => {
  it("assertTestEvent denies a live event, allows a test event", () => {
    expect(assertTestEvent({ testMode: false })).toBe(false);
    expect(assertTestEvent({ testMode: true })).toBe(true);
  });

  it("source pin: the route enforces assertTestEvent → live_event_rejected", () => {
    const src = read("app/api/billing/webhook/route.ts");
    expect(src).toMatch(/assertTestEvent/);
    expect(src).toMatch(/live_event_rejected/);
    // rejection happens BEFORE any subscription write
    expect(src.indexOf("live_event_rejected")).toBeLessThan(
      src.indexOf("upsertSubscription("),
    );
  });
});

// ─── 4. No provider secrets reachable from client code ─────────────────────

describe("no provider secret names/shapes in client code", () => {
  it('no "use client" file references a Stripe secret', () => {
    const SECRET = /STRIPE_SECRET_KEY|STRIPE_WEBHOOK_SECRET|whsec_|sk_(test|live)_/;
    const offenders: string[] = [];
    for (const file of prodSources()) {
      const txt = readFileSync(file, "utf8");
      if (!/^\s*["']use client["']/m.test(txt)) continue;
      if (SECRET.test(txt)) offenders.push(rel(file));
    }
    expect(offenders, `secrets in client code:\n${offenders.join("\n")}`).toEqual([]);
  });

  it("secret env names live only in the server config/env seam", () => {
    const ALLOWED = new Set([
      "lib/env.ts",
      "lib/billing/config.ts",
      "lib/billing/config-core.ts",
    ]);
    const offenders: string[] = [];
    for (const file of prodSources()) {
      const r = rel(file);
      if (ALLOWED.has(r)) continue;
      if (/STRIPE_SECRET_KEY|STRIPE_WEBHOOK_SECRET/.test(readFileSync(file, "utf8"))) {
        offenders.push(r);
      }
    }
    expect(offenders, `secret names outside seam:\n${offenders.join("\n")}`).toEqual([]);
  });
});

// ─── 5. No capture / subscription-create call sites ────────────────────────

describe("no payment-capture call sites in app code", () => {
  const CAPTURE = [
    /paymentIntents\s*\.\s*(create|capture|confirm)/,
    /charges\s*\.\s*(create|capture)/,
    /subscriptions\s*\.\s*create/,
    /invoices\s*\.\s*pay\s*\(/,
    /setupIntents\s*\.\s*create/,
  ];

  it("no capture-shaped provider call exists anywhere (prod code)", () => {
    const offenders: string[] = [];
    for (const file of prodSources()) {
      const txt = readFileSync(file, "utf8");
      for (const rx of CAPTURE) {
        if (rx.test(txt)) offenders.push(`${rel(file)} [${rx.source}]`);
      }
    }
    expect(offenders, `capture call sites:\n${offenders.join("\n")}`).toEqual([]);
  });

  it("checkout-session creation exists ONLY in the allowlisted test adapter", () => {
    const offenders: string[] = [];
    for (const file of prodSources()) {
      if (/checkout\s*\.\s*sessions\s*\.\s*create/.test(readFileSync(file, "utf8"))) {
        offenders.push(rel(file));
      }
    }
    expect(offenders).toEqual(["lib/billing/providers/stripe-test.ts"]);
  });

  it("the adapter is reachable only through the noop-defaulting provider seam", () => {
    const src = read("lib/billing/provider.ts");
    expect(src).toMatch(/cfg\.state === "stripe_test"/);
    expect(src).toMatch(/noopProvider/);
    // Nothing else imports the adapter directly.
    const offenders = prodSources().filter((f) => {
      const r = rel(f);
      if (r === "lib/billing/provider.ts") return false;
      return /billing\/providers\/stripe-test/.test(readFileSync(f, "utf8"));
    });
    expect(offenders.map(rel)).toEqual([]);
  });
});

// ─── 6. Paid tiers resolve to payment_not_enabled ───────────────────────────

describe("paid tiers never charge — payment_not_enabled", () => {
  const paidPlans = PRE_PAYMENT_PLANS.filter(
    (p) => p.accessState === "payment_not_enabled",
  );

  it("there are paid tiers and they gate as payment_not_enabled", () => {
    expect(paidPlans.length).toBeGreaterThan(0);
    for (const plan of paidPlans) {
      const feature = (Object.keys(plan.entitlements) as FeatureKey[]).find(
        (k) => planIncludes(plan, k),
      )!;
      const g = gateFeature(plan, feature);
      expect(g.allowed, plan.slug).toBe(false);
      expect(g.reason, plan.slug).toBe("payment_not_enabled");
      expect(g.cta, plan.slug).toBe("request_pilot_access");
    }
  });
});

// ─── 7. Plan boundary ↔ entitlement wiring (no phantom, no silent unlimited) ─

describe("plan boundary wiring is complete and real", () => {
  it("every feature key used by a plan has a registry entry", () => {
    const missing = featureKeysUsedByPlans().filter(
      (k) => !(k in FEATURE_ENFORCEMENT),
    );
    expect(missing).toEqual([]);
  });

  it("every registry key is used by at least one plan (no phantom features)", () => {
    const used = new Set(featureKeysUsedByPlans());
    const phantom = (Object.keys(FEATURE_ENFORCEMENT) as FeatureKey[]).filter(
      (k) => !used.has(k),
    );
    expect(phantom).toEqual([]);
  });

  it("cited enforcement sites exist and carry the real check", () => {
    for (const [key, e] of Object.entries(FEATURE_ENFORCEMENT)) {
      const p = join(webRoot, e.site);
      expect(existsSync(p), `${key}: missing site ${e.site}`).toBe(true);
      const txt = readFileSync(p, "utf8");
      if (e.kind === "server_gate") {
        expect(txt, `${key}: site lacks hasFeature("${key}")`).toContain(
          `hasFeature("${key}")`,
        );
      }
      if (e.kind === "admin_rbac") {
        expect(txt, `${key}: RBAC site lacks superadmin check`).toMatch(
          /isSuperadmin|requireSuperadmin/,
        );
      }
      if (e.kind === "declared_boundary_only") {
        expect(txt, `${key}: seam lacks entitlementAllows`).toMatch(
          /entitlementAllows/,
        );
      }
    }
  });

  it("the seam DENIES paid-tier features once enforcement activates", () => {
    // "No feature silently unlimited when a plan claims a boundary": with
    // billing enforcement on and no subscription/override, every paid-tier
    // feature NOT covered by the free fallback plan must be denied.
    for (const plan of PRE_PAYMENT_PLANS.filter(
      (p) => p.accessState === "payment_not_enabled",
    )) {
      const ctx = resolveEntitlements({
        billingActive: true,
        isAdmin: false,
        audience: plan.audience,
        subscriptionPlanKey: null,
        subscriptionStatus: null,
        manualOverridePlanKey: null,
      });
      expect(ctx.active, plan.slug).toBe(false);
      const fallback = PRE_PAYMENT_PLANS.find(
        (p) => p.slug === ctx.effectivePlanKey,
      )!;
      let deniedCount = 0;
      for (const key of Object.keys(plan.entitlements) as FeatureKey[]) {
        if (!planIncludes(plan, key)) continue;
        // A key legitimately covered by a FREE fallback tier stays open —
        // but a NUMERIC key the fallback also carries must carry a LOWER
        // ceiling there (owner launch pricing 2026-09-05: ORGANIZATION FREE
        // has every organization capability at 1 active position; the paid
        // plan buys the ceiling, not the capability).
        if (fallback.accessState === "free" && planIncludes(fallback, key)) {
          const paidLimit = limitFor(plan, key);
          const freeLimit = limitFor(fallback, key);
          if (paidLimit !== null && freeLimit !== null) {
            expect(freeLimit, `${plan.slug}.${key}: the free ceiling must be lower`).toBeLessThan(paidLimit);
            deniedCount += 1;
          }
          continue;
        }
        deniedCount += 1;
        expect(
          entitlementAllows(ctx, key),
          `${plan.slug}.${key} must be denied under enforcement without a grant`,
        ).toBe(false);
      }
      expect(deniedCount, `${plan.slug}: boundary must gate something`).toBeGreaterThan(0);
    }
  });
});

// ─── 8. Readiness surfaces are honest ───────────────────────────────────────

describe("readiness state model + claim ledger", () => {
  it("pricing readiness is a valid owner-editable state", () => {
    expect(["draft_pricing", "owner_confirmed"]).toContain(
      PRICING_READINESS_STATE,
    );
  });

  it("coverage summary is consistent with the registry", () => {
    const s = summarizeEntitlementCoverage();
    expect(s.total).toBe(Object.keys(FEATURE_ENFORCEMENT).length);
    expect(
      s.serverGated + s.adminRbac + s.freeSurface + s.declaredOnly,
    ).toBe(s.total);
    expect(s.serverGated).toBeGreaterThan(0); // booking_requests is real
    expect(s.declaredOnlyKeys.length).toBe(s.declaredOnly);
  });

  it("every readiness claim cites a proof artifact THAT EXISTS", () => {
    const keys = BILLING_READINESS_ITEMS.map((i) => i.key);
    expect(new Set(keys).size).toBe(BILLING_READINESS_ITEMS.length);
    for (const item of BILLING_READINESS_ITEMS) {
      expect(
        existsSync(join(repoRoot, item.proof)),
        `${item.key} cites missing proof ${item.proof}`,
      ).toBe(true);
    }
  });

  it("provider connection stays blocked_by_design (owner gate)", () => {
    const provider = BILLING_READINESS_ITEMS.find(
      (i) => i.key === "provider_connection",
    );
    expect(provider?.status).toBe("blocked_by_design");
  });

  it("the admin billing page renders the readiness ledger", () => {
    const page = read("app/[locale]/dashboard/admin/billing/page.tsx");
    expect(page).toMatch(/billing-readiness/);
    expect(page).toMatch(/BILLING_READINESS_ITEMS/);
    expect(page).toMatch(/PRICING_READINESS_STATE/);
    expect(page).toMatch(/summarizeEntitlementCoverage/);
  });

  it("the public plan boundary shows the prepared-not-purchasable state", () => {
    const cmp = read("components/marketing/pre-payment-plan-boundary.tsx");
    expect(cmp).toMatch(/PRICING_READINESS_STATE/);
    expect(cmp).toMatch(/plan-boundary-readiness/);
  });

  it("readiness i18n exists in en/lt/ru and makes no live-payment claim", () => {
    for (const loc of ["en", "lt", "ru"] as const) {
      const m = JSON.parse(read(`messages/${loc}.json`));
      const readiness = m.adminBilling?.readiness;
      expect(readiness, `${loc}: adminBilling.readiness missing`).toBeTruthy();
      for (const item of BILLING_READINESS_ITEMS) {
        expect(
          typeof readiness.items?.[item.key],
          `${loc}: readiness.items.${item.key} missing`,
        ).toBe("string");
      }
      for (const st of ["ready", "prepared", "blocked_by_design"]) {
        expect(typeof readiness.status?.[st], `${loc}: status.${st}`).toBe("string");
      }
      for (const st of ["draft_pricing", "owner_confirmed"]) {
        expect(typeof readiness.state?.[st], `${loc}: state.${st}`).toBe("string");
      }
      const boundary = m.planBoundary?.readiness;
      expect(boundary?.draft_pricing, `${loc}: planBoundary.readiness`).toBeTruthy();
      expect(boundary?.owner_confirmed, `${loc}: planBoundary.readiness`).toBeTruthy();
      const all = [...flatten(readiness), ...flatten(boundary)];
      for (const s of all) {
        for (const rx of BANNED_LIVE_CLAIMS) {
          expect(rx.test(s), `${loc}: live claim "${s}"`).toBe(false);
        }
      }
    }
  });
});

// ─── 9. WAGON 4 — plan clarity surfaces (CR train, free vs prepared paid) ───
//
// User-facing plan boundaries are DERIVED FROM THE REGISTRY, never
// hand-written; paid CTAs render the honest not-purchasable state; the
// account page carries an honest billing-readiness status; and none of the
// new copy can carry a live-payment/checkout claim. Extends the
// capture-impossible net of sections 1–8 to the WAGON 4 surfaces.

const BANNED_LIVE_CLAIMS = [
  /\bbuy\s+now\b/i,
  /\bpay\s+now\b/i,
  /\bcheckout\s+now\b/i,
  /\bsubscribe\s+now\b/i,
  /\bsubscription\s+active\b/i,
  /\bpayment\s+active\b/i,
  /\bcheckout\s+active\b/i,
  /\bpayments?\s+(?:are|is)\s+live\b/i,
];

const flatten = (o: unknown, out: string[] = []): string[] => {
  if (typeof o === "string") out.push(o);
  else if (o && typeof o === "object")
    for (const v of Object.values(o as Record<string, unknown>)) flatten(v, out);
  return out;
};

describe("WAGON 4 — plan boundary rendering derives from the registry", () => {
  const boundarySrc = () =>
    read("components/marketing/pre-payment-plan-boundary.tsx");

  it("the boundary component maps plan.entitlements — no hand-written list", () => {
    const src = boundarySrc();
    // Feature list comes from the plan registry…
    expect(src).toMatch(/Object\.keys\(plan\.entitlements\)/);
    expect(src).toMatch(/planIncludes\(plan,\s*key\)/);
    // …availability chips come from the enforcement registry…
    expect(src).toMatch(/FEATURE_ENFORCEMENT\[key\]/);
    // …numeric limits come from the registry too.
    expect(src).toMatch(/limitFor\(plan,\s*key\)/);
    expect(src).toMatch(/data-features-from="plans-registry"/);
  });

  it("paid plans render the honest not-purchasable access state", () => {
    const src = boundarySrc();
    // The access chip is keyed by the registry accessState, whose paid value
    // is pinned to payment_not_enabled by section 6 — so a paid card can only
    // ever render the honest state.
    expect(src).toMatch(/access\.\$\{plan\.accessState\}/);
    expect(src).toMatch(/payment_not_enabled/);
    // The boundary is a pure information surface: no button, no form, no
    // link — so no checkout/pay affordance can exist on it at all.
    expect(src).not.toMatch(/<button|<form|href=/i);
  });

  it("free-today explainer exists (free vs prepared-paid vs meaning)", () => {
    const src = boundarySrc();
    expect(src).toMatch(/data-testid="plan-boundary-free-today"/);
    expect(src).toMatch(/freeToday\.free/);
    expect(src).toMatch(/freeToday\.paid/);
    expect(src).toMatch(/freeToday\.prepared/);
  });

  it("en/lt/ru feature labels are SET-EQUAL to the enforcement registry", () => {
    // i18n supplies labels only for real registry keys — a label without a
    // registry entry is a phantom claim; a registry key without a label
    // renders raw. Both directions fail here.
    const registryKeys = [...Object.keys(FEATURE_ENFORCEMENT)].sort();
    for (const loc of ["en", "lt", "ru"] as const) {
      const m = JSON.parse(read(`messages/${loc}.json`));
      const labels = m.planBoundary?.features ?? {};
      expect(
        Object.keys(labels).sort(),
        `${loc}: planBoundary.features must mirror FEATURE_ENFORCEMENT`,
      ).toEqual(registryKeys);
      for (const kind of [
        "free_surface",
        "server_gate",
        "declared_boundary_only",
        "admin_rbac",
      ]) {
        expect(
          typeof m.planBoundary?.enforcement?.[kind],
          `${loc}: planBoundary.enforcement.${kind}`,
        ).toBe("string");
      }
      expect(typeof m.planBoundary?.featuresLabel, `${loc}: featuresLabel`).toBe(
        "string",
      );
      expect(m.planBoundary?.limitValue, `${loc}: limitValue`).toContain(
        "{count}",
      );
    }
  });

  it("features a plan declares false are never claimed (planIncludes)", () => {
    // worker_plus declares priority_visibility: false — the registry-derived
    // renderer must filter it out via planIncludes.
    const workerPlus = PRE_PAYMENT_PLANS.find((p) => p.slug === "worker_plus")!;
    expect(workerPlus.entitlements.priority_visibility).toBe(false);
    expect(planIncludes(workerPlus, "priority_visibility")).toBe(false);
  });
});

describe("WAGON 4 — price slots and account page stay honest", () => {
  it("the pricing table surfaces the owner-editable price-readiness state", () => {
    const src = read("components/marketing/pricing-table.tsx");
    expect(src).toMatch(/PRICING_READINESS_STATE/);
    expect(src).toMatch(/priceState\.\$\{PRICING_READINESS_STATE\}/);
    expect(src).toMatch(/data-testid=\{`pricing-price-state-/);
  });

  it("the account page renders the plan/billing readiness status section", () => {
    const src = read("app/[locale]/dashboard/account/page.tsx");
    expect(src).toMatch(/data-testid="account-plan-status"/);
    expect(src).toMatch(/PRICING_READINESS_STATE/);
    expect(src).toMatch(/accountPlan\.freePilot/);
    expect(src).toMatch(/accountPlan\.prepared/);
    // The readiness line REUSES the guarded planBoundary copy (no duplicate
    // wording that could drift).
    expect(src).toMatch(/planBoundary\.readiness\.\$\{PRICING_READINESS_STATE\}/);
    // No checkout/subscribe affordance on the account surface.
    expect(src).not.toMatch(/checkout/i);
    expect(src).not.toMatch(/subscribe/i);
  });

  it("all WAGON 4 copy (en/lt/ru) carries no live-payment claim and no price figure", () => {
    const PRICE_FIGURE = /\d+\s*(?:€|EUR|\$|USD)|(?:€|\$)\s*\d+/;
    for (const loc of ["en", "lt", "ru"] as const) {
      const m = JSON.parse(read(`messages/${loc}.json`));
      const surfaces = [
        m.planBoundary,
        m.pricing?.priceState,
        m.accountPlan,
      ];
      for (const surface of surfaces) {
        expect(surface, `${loc}: WAGON 4 namespace missing`).toBeTruthy();
      }
      for (const s of surfaces.flatMap((x) => flatten(x))) {
        for (const rx of BANNED_LIVE_CLAIMS) {
          expect(rx.test(s), `${loc}: live claim "${s}"`).toBe(false);
        }
        expect(
          PRICE_FIGURE.test(s),
          `${loc}: price figure in draft-pricing copy "${s}"`,
        ).toBe(false);
      }
      // accountPlan keys required (account billing-readiness status).
      for (const k of ["title", "freePilot", "prepared", "pricingLink"]) {
        expect(typeof m.accountPlan?.[k], `${loc}: accountPlan.${k}`).toBe(
          "string",
        );
      }
    }
  });
});
