/**
 * Guard — LMC TOP-UPS: FLAGS FIRST, TEST MODE ONLY, ONE CREDIT PER PAYMENT
 * (LMC train Wagon 4; owner order 2026-10-21 "Neleisk dvigubai suteikti
 * kreditų"; owner decision 2026-10-21 item 6, issue #2628).
 *
 * Fails the build if:
 *   1. either top-up route, or the settlement handler, reaches config, auth,
 *      Stripe, the request body or the ledger BEFORE checking BOTH
 *      `STRIPE_LMC_TOPUPS_ENABLED` and `LMC_PURCHASES_ENABLED`;
 *   2. any part of the path accepts a state other than `stripe_test`, or a
 *      live event, or loses the test-only secret/key accessors;
 *   3. the credit is keyed on anything but the payment intent
 *      (`stripe_pi:<id>`, reference = the same id), or a second
 *      `recordLmcPurchase` call site appears;
 *   4. a top-up denomination is hardcoded (the owner list must stay empty
 *      until the owner fills it — MDD-03) or a route accepts an amount;
 *   5. the database exactly-once index (20261021150000) or its mapping to
 *      `already_credited` disappears;
 *   6. the route home moves off `/api/lmc` (MDD-20; catalogue §7.1) or the
 *      subscription webhook starts to settle a payment-mode session.
 *
 * STRENGTHENED, never disabled. Filling the package list is an owner act and
 * changes test 4 in the same reviewed PR.
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import * as flags from "@/lib/billing/lmc-flags";
import { parseCheckoutSessionObject } from "@/lib/billing/webhook-core";

const here = resolve(fileURLToPath(import.meta.url), "..");
const webRoot = resolve(here, "..", "..");
const repoRoot = resolve(webRoot, "..", "..");
const read = (rel: string) => readFileSync(join(webRoot, rel), "utf8");

const CHECKOUT = "app/api/lmc/topup-checkout/route.ts";
const WEBHOOK = "app/api/lmc/topup-webhook/route.ts";
const SETTLEMENT = "lib/lmc/topup-settlement.ts";
const PACKAGES = "lib/lmc/topup-packages.ts";
const PROVIDER = "lib/billing/provider.ts";
const ADAPTER = "lib/billing/providers/stripe-test.ts";
const MIGRATION = "20261021150000_lmc_purchase_payment_reference_unique_v1";

function sources(dir: string, acc: string[] = []): string[] {
  if (!existsSync(dir)) return acc;
  for (const f of readdirSync(dir)) {
    if (f === "node_modules" || f === ".next") continue;
    const p = join(dir, f);
    if (statSync(p).isDirectory()) sources(p, acc);
    else if (/\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f)) acc.push(p);
  }
  return acc;
}
const rel = (file: string) =>
  file.split(/[\\/]apps[\\/]web[\\/]/)[1]?.replace(/\\/g, "/") ?? file;

/** Body of `export async function <name>(…) {` up to the next top-level export/function. */
function fnBody(src: string, name: string): string {
  const start = src.indexOf(`export async function ${name}(`);
  expect(start, `${name} exists`).toBeGreaterThan(-1);
  const open = src.indexOf("{\n", src.indexOf(")", start));
  const next = src.slice(open).search(/\n(export |function |async function )/);
  return src.slice(open, next === -1 ? undefined : open + next);
}

const FLAG_GATE = /if \(!STRIPE_LMC_TOPUPS_ENABLED \|\| !LMC_PURCHASES_ENABLED\) \{\s*return/;

describe("1. both kill-switches come first", () => {
  it("the two flags are still literal false (shipped state)", () => {
    expect(flags.STRIPE_LMC_TOPUPS_ENABLED).toBe(false);
    expect(flags.LMC_PURCHASES_ENABLED).toBe(false);
    expect(flags.LIVE_PAYMENTS_ENABLED).toBe(false);
  });

  const FIRST_IO = [
    /req\.(json|text)\(/,
    /createClient\(/,
    /createAdminClient\(/,
    /getBillingConfig(For)?\(/,
    /createTestModePaymentSession\(/,
    /constructTestModeTopupWebhookEvent\(/,
    /handleLmcTopupEvent\(/,
    /recordLmcPurchase\(/,
    /resolveEmployerCompanyContext\(/,
    /findSellableTopupPackage\(/,
  ];
  const cases: Array<[string, string]> = [
    [CHECKOUT, "POST"],
    [WEBHOOK, "POST"],
    [SETTLEMENT, "handleLmcTopupEvent"],
  ];
  for (const [file, fn] of cases) {
    it(`${file}: the flag gate precedes every I/O call`, () => {
      const body = fnBody(read(file), fn);
      const gate = body.search(FLAG_GATE);
      expect(gate, `${file} must check both flags`).toBeGreaterThan(-1);
      const firstIo = Math.min(
        ...FIRST_IO.map((rx) => body.search(rx)).filter((i) => i >= 0),
      );
      expect(Number.isFinite(firstIo)).toBe(true);
      expect(gate).toBeLessThan(firstIo);
    });
  }
});

describe("2. Stripe TEST mode only — no live path", () => {
  it("both routes refuse every adapter state except stripe_test", () => {
    for (const f of [CHECKOUT, WEBHOOK]) {
      const src = read(f);
      expect(src).toMatch(/\.state !== "stripe_test"\) \{\s*return NextResponse\.json\(\{ ok: false, reason: "test_mode_required" \}/);
      expect(src).not.toMatch(/stripe_live"/);
    }
  });

  it("the webhook rejects a live event before settlement", () => {
    const src = read(WEBHOOK);
    expect(src.indexOf("if (!event.testMode)")).toBeGreaterThan(-1);
    expect(src.indexOf("if (!event.testMode)")).toBeLessThan(src.indexOf("handleLmcTopupEvent(event"));
    expect(read(SETTLEMENT)).toMatch(/if \(!event\.testMode \|\| event\.object\.livemode === true\)/);
    expect(read(SETTLEMENT)).toMatch(/meta\.environment !== "test"/);
  });

  it("the provider seam is stripe_test-only for both one-time-payment entry points", () => {
    const src = read(PROVIDER);
    for (const fn of ["createTestModePaymentSession", "constructTestModeTopupWebhookEvent"]) {
      expect(fnBody(src, fn)).toMatch(/if \(cfg\.state !== "stripe_test"\)/);
    }
  });

  it("the adapter uses ONLY the test-key client and the test-only endpoint secret", () => {
    const src = read(ADAPTER);
    const tail = src.slice(src.indexOf("// ── One-time payments — TEST ONLY"));
    expect(tail).toMatch(/new Stripe\(requireStripeTestSecret\(\)/);
    expect(tail).toMatch(/requireStripeTestTopupWebhookSecret\(\)/);
    expect(tail).toMatch(/mode: "payment"/);
    expect(tail).not.toMatch(/requireStripeSecret\(\)|requireStripeWebhookSecret\(\)|client\(\)\./);
    expect(read("lib/billing/config.ts")).toMatch(
      /export function requireStripeTestTopupWebhookSecret\(\): string \{\s*const cfg = getBillingConfig\(\);\s*if \(cfg\.state !== "stripe_test"\)/,
    );
  });
});

describe("3. one credit per payment intent", () => {
  it("the credit key and reference derive from the payment intent only", () => {
    const src = read(SETTLEMENT);
    expect(src).toMatch(/return `stripe_pi:\$\{paymentIntentId\}`;/);
    const call = src.slice(src.indexOf("recordLmcPurchase("), src.indexOf("deps.client,"));
    expect(call).toMatch(/providerReference: paymentIntentId,/);
    expect(call).toMatch(/idempotencyKey: topupIdempotencyKeyFor\(paymentIntentId\),/);
    expect(call).toMatch(/amountCents: pkg\.creditCents,/);
    expect(call).not.toMatch(/event\.id|session\.id|Date\.now/);
  });

  it("recordLmcPurchase has exactly one product call site — the settlement", () => {
    const callers = [...sources(join(webRoot, "lib")), ...sources(join(webRoot, "app"))]
      .filter((f) => /recordLmcPurchase\(/.test(readFileSync(f, "utf8")))
      .map(rel)
      .filter((r) => r !== "lib/lmc/wallet.ts");
    expect(callers).toEqual([SETTLEMENT]);
  });
});

describe("4. no hardcoded denomination; no caller-supplied amount", () => {
  it("the owner package list is literally empty (MDD-03 open)", () => {
    expect(read(PACKAGES)).toMatch(
      /export const OWNER_APPROVED_LMC_TOPUP_PACKAGES: readonly LmcTopupPackage\[\] = \[\];/,
    );
  });

  it("the checkout body is a strict package key only", () => {
    const src = read(CHECKOUT);
    expect(src).toMatch(/z\.object\(\{ packageKey: z\.string\(\)\.min\(1\)\.max\(40\) \}\)\.strict\(\)/);
    expect(src).toMatch(/unitAmountMinor: pkg\.chargeMinor/);
    expect(src).not.toMatch(/unitAmountMinor: \d|chargeMinor: \d|creditCents: \d/);
  });
});

describe("5. the database enforces once-per-payment", () => {
  const sql = readFileSync(join(repoRoot, "supabase", "migrations", `${MIGRATION}.sql`), "utf8");
  const down = readFileSync(join(repoRoot, "supabase", "rollbacks", `${MIGRATION}.down.sql`), "utf8");

  it("a partial unique index over the purchase reference, RED-annotated, with a rollback", () => {
    expect(sql).toMatch(/^-- @human-gate-approved/);
    expect(sql).toMatch(
      /create unique index if not exists lmc_purchase_payment_reference_unique\s+on public\.lmc_transactions \(\(metadata->>'reference'\)\)\s+where kind = 'purchased';/,
    );
    expect(sql).not.toMatch(/^\s*(drop|delete|truncate|update|insert|grant|revoke|alter)\b/im);
    expect(down).toMatch(/drop index if exists public\.lmc_purchase_payment_reference_unique;/);
  });

  it("the reference the index reads is exactly where the purchase RPC stores it", () => {
    const ledger = readFileSync(
      join(repoRoot, "supabase", "migrations", "20260720190000_lmc_ledger_foundation_v1.sql"),
      "utf8",
    );
    expect(ledger).toMatch(/'settled LMC top-up', jsonb_build_object\('reference', p_reference\)\)/);
  });

  it("its violation maps to already_credited", () => {
    const src = read(SETTLEMENT);
    expect(src).toMatch(/LMC_PURCHASE_REFERENCE_UNIQUE_INDEX = "lmc_purchase_payment_reference_unique"/);
    expect(src).toMatch(/detail\.includes\(LMC_PURCHASE_REFERENCE_UNIQUE_INDEX\)[\s\S]{0,120}return \{ kind: "already_credited"/);
  });
});

describe("6. route home and subscription separation", () => {
  it("the top-up routes live under /api/lmc (MDD-20), none under /api/billing", () => {
    expect(existsSync(join(webRoot, CHECKOUT))).toBe(true);
    expect(existsSync(join(webRoot, WEBHOOK))).toBe(true);
    const billing = sources(join(webRoot, "app", "api", "billing")).map(rel);
    expect(billing.some((r) => /top[-_]?up|lmc/i.test(r))).toBe(false);
  });

  it("the subscription webhook's checkout parser ignores a payment-mode top-up session", () => {
    const topup = {
      id: "cs_test_1", mode: "payment", payment_intent: "pi_test_1", subscription: null,
      client_reference_id: "11111111-1111-4111-8111-111111111111",
      metadata: { purpose: "lmc_topup_v1" },
    };
    expect(parseCheckoutSessionObject(topup, true)).toBeNull();
  });

  it("the refund of a top-up is never reversed here (no lmc_reverse_v1 wrapper; MDD-08)", () => {
    const src = read(SETTLEMENT);
    expect(src).not.toMatch(/lmc_reverse_v1"|reverseLmc/);
    expect(src).toMatch(/kind: "refund_pending_owner_decision"/);
    expect(read(WEBHOOK)).toMatch(/console\.error\(\s*`\[lmc-topup\] refund_pending_owner_decision/);
  });
});
