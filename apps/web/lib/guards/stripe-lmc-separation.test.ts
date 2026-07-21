/**
 * Guard — STRIPE SUBSCRIPTIONS ⟂ LMC LEDGER (Stripe TEST subscriptions v1).
 *
 * The Stripe TEST subscription chain and the LMC internal-credit ledger are
 * SEPARATE domains. A Stripe subscription may never mint, top up, spend, or
 * cash out LMC, and the six LMC commercial flags stay pinned OFF. This guard
 * fails the build if:
 *   1. any billing module or billing API route references an LMC table/RPC;
 *   2. any LMC flag constant flips true;
 *   3. a top-up / cash-out / payout surface appears under the billing API;
 *   4. the portal route reads a request body (caller-supplied customer ids
 *      must be structurally impossible, not merely validated away);
 *   5. the checkout route stops using the strict schema or starts accepting
 *      a caller-supplied price;
 *   6. a plan is activated from the success redirect instead of the
 *      signature-verified webhook.
 *
 * This guard is STRENGTHENED, never disabled.
 */
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  LMC_PURCHASES_ENABLED,
  LMC_PROMOTIONAL_GRANTS_ENABLED,
  LMC_REFERRALS_ENABLED,
  STRIPE_LMC_TOPUPS_ENABLED,
  LIVE_PAYMENTS_ENABLED,
  LMC_SPENDING_ENABLED,
} from "../billing/lmc-flags";

const here = resolve(fileURLToPath(import.meta.url), "..");
const webRoot = resolve(here, "..", "..");
const read = (rel: string) => readFileSync(join(webRoot, rel), "utf8");

function sources(dir: string, acc: string[] = []): string[] {
  if (!existsSync(dir)) return acc;
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) sources(p, acc);
    else if (/\.tsx?$/.test(f)) acc.push(p);
  }
  return acc;
}

const rel = (file: string) =>
  file.split(/[\\/]apps[\\/]web[\\/]/)[1]?.replace(/\\/g, "/") ?? file;

const BILLING_SURFACES = [
  join(webRoot, "lib", "billing"),
  join(webRoot, "app", "api", "billing"),
];

describe("Stripe subscriptions never touch the LMC ledger", () => {
  it("all six LMC flags stay pinned false", () => {
    expect(LMC_PURCHASES_ENABLED).toBe(false);
    expect(LMC_PROMOTIONAL_GRANTS_ENABLED).toBe(false);
    expect(LMC_REFERRALS_ENABLED).toBe(false);
    expect(STRIPE_LMC_TOPUPS_ENABLED).toBe(false);
    expect(LIVE_PAYMENTS_ENABLED).toBe(false);
    expect(LMC_SPENDING_ENABLED).toBe(false);
  });

  it("no billing module or billing route references an LMC table or RPC", () => {
    // lmc-flags.ts declares the (all-false) constants and is the ONLY billing
    // file allowed to say "lmc" at all.
    const LMC_ACCESS = [
      /from\(\s*["'`]lmc_/i, // reading/writing an lmc_* table
      /rpc\(\s*["'`]lmc_/i, // calling an lmc_* RPC
      /lmc_transactions|lmc_lots|lmc_accounts|lmc_lot_consumptions|lmc_settings/i,
    ];
    const offenders: string[] = [];
    for (const file of BILLING_SURFACES.flatMap((d) => sources(d))) {
      const r = rel(file);
      if (r === "lib/billing/lmc-flags.ts") continue;
      if (/\.test\.tsx?$/.test(r)) continue;
      const txt = readFileSync(file, "utf8");
      for (const rx of LMC_ACCESS) {
        if (rx.test(txt)) offenders.push(`${r} [${rx.source}]`);
      }
    }
    expect(offenders, `LMC access from billing:\n${offenders.join("\n")}`).toEqual([]);
  });

  it("no top-up / cash-out / payout surface exists under the billing API", () => {
    const FORBIDDEN = /top[-_]?up|cash[-_]?out|payout|withdraw/i;
    const offenders: string[] = [];
    for (const file of sources(join(webRoot, "app", "api", "billing"))) {
      if (FORBIDDEN.test(readFileSync(file, "utf8")) || FORBIDDEN.test(file)) {
        offenders.push(rel(file));
      }
    }
    expect(offenders, `top-up/cash-out surface:\n${offenders.join("\n")}`).toEqual([]);
  });

  it("the webhook writes subscription state only — never an LMC ledger row", () => {
    const route = read("app/api/billing/webhook/route.ts");
    const store = read("lib/billing/subscription-store.ts");
    for (const src of [route, store]) {
      expect(src).not.toMatch(/lmc/i);
    }
    // The store's write targets are exactly the three applied billing tables.
    const targets = [...store.matchAll(/\.from\(\s*["'`]([a-z_]+)["'`]\s*\)/g)].map(
      (m) => m[1],
    );
    expect(new Set(targets)).toEqual(
      new Set(["payment_webhook_events", "billing_subscriptions"]),
    );
  });
});

describe("subscription uniqueness model (draft migration 20260721150000)", () => {
  const REPO_ROOT = resolve(webRoot, "..", "..");
  const migration = readFileSync(
    join(
      REPO_ROOT,
      "supabase",
      "migrations",
      "20260721150000_stripe_subscriptions_v1.sql",
    ),
    "utf8",
  );
  const rollback = readFileSync(
    join(
      REPO_ROOT,
      "supabase",
      "rollbacks",
      "20260721150000_stripe_subscriptions_v1.down.sql",
    ),
    "utf8",
  );

  it("replaces owner/plan uniqueness with org-scoped partial indexes", () => {
    // Regression pin (Codex P1): the applied unique (owner_id, plan_key,
    // provider) would reject the same owner buying the same company plan for
    // a SECOND organization and leave the real Stripe subscription untracked.
    expect(migration).toMatch(
      /drop constraint if exists billing_subscriptions_owner_id_plan_key_provider_key/,
    );
    expect(migration).toMatch(
      /billing_subscriptions_personal_plan_uniq[\s\S]*?\(owner_id, plan_key, provider\)[\s\S]*?where organization_id is null/,
    );
    expect(migration).toMatch(
      /billing_subscriptions_org_plan_uniq[\s\S]*?\(organization_id, plan_key, provider\)[\s\S]*?where organization_id is not null/,
    );
  });

  it("stays human-gated with a paired, guarded rollback", () => {
    expect(migration).toMatch(/@human-gate-approved/);
    expect(migration).toMatch(/DO NOT APPLY automatically/);
    expect(rollback).toMatch(/Refusing rollback/);
    // The rollback restores the ORIGINAL constraint so down = pre-migration.
    expect(rollback).toMatch(
      /add constraint billing_subscriptions_owner_id_plan_key_provider_key[\s\S]*?unique \(owner_id, plan_key, provider\)/,
    );
  });
});

describe("portal + checkout structural safety", () => {
  it("the portal route never reads a request body (no caller-supplied ids)", () => {
    const src = read("app/api/billing/portal/route.ts");
    expect(src).not.toMatch(/req\.json|req\.text|formData/);
    // Lookup is by the AUTHENTICATED user's own id; the provider gets ONLY
    // that stored id — no other customer id source exists in the route.
    expect(src).toMatch(/findBillingCustomer\(user\.id\)/);
    expect(src).toMatch(/customerId:\s*lookup\.customerId/);
  });

  it("checkout uses the STRICT schema — unknown fields (e.g. a price) rejected", () => {
    const src = read("app/api/billing/test-checkout/route.ts");
    expect(src).toMatch(/\.strict\(\)/);
    // The only price source is the server-side env mapping.
    expect(src).toMatch(/testPriceIdFor/);
    expect(src).not.toMatch(/priceId\s*:\s*z\./);
    expect(src).not.toMatch(/currency\s*:/i); // no currency field is ever accepted
  });

  it("a success redirect never activates a plan (webhook-only state writes)", () => {
    // No page/component may write billing_subscriptions on the success
    // redirect — the ONLY writers are the webhook store + admin actions.
    const WRITERS_ALLOWED = new Set([
      "lib/billing/subscription-store.ts",
      "lib/admin/billing-actions.ts",
    ]);
    const offenders: string[] = [];
    for (const dir of ["lib", "app", "components"].map((d) => join(webRoot, d))) {
      for (const file of sources(dir)) {
        const r = rel(file);
        if (/\.test\.tsx?$/.test(r) || WRITERS_ALLOWED.has(r)) continue;
        const txt = readFileSync(file, "utf8");
        if (
          /from\(\s*["'`]billing_subscriptions["'`]\s*\)\s*[\s\S]{0,80}?\.(insert|upsert|update|delete)\(/.test(
            txt,
          )
        ) {
          offenders.push(r);
        }
      }
    }
    expect(offenders, `unexpected billing_subscriptions writers:\n${offenders.join("\n")}`).toEqual([]);
  });
});
