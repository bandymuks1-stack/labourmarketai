/**
 * Guard — BILLING SAFETY INVARIANTS (owner directive 2026-09-05 "BILLING
 * SAFETY — MANDATORY BEFORE REAL CUSTOMERS").
 *
 * Pins the ten owner properties so they stay regression-tested. Behavioural
 * assertions run the PURE cores; source pins hold the wiring in the ONE
 * checkout route, the ONE webhook handler, the ONE state machine and the ONE
 * migration. Companion behaviour suites (mocked collaborators) live beside the
 * modules: lib/billing/{checkout-operations-core, checkout-operations-store,
 * checkout-admission, test-checkout-route, webhook-ordering-core,
 * webhook-route-safety, subscription-store-safety, reconcile-core}.test.ts.
 *
 *   P1  checkout idempotency — server-side operation identity → Stripe key
 *   P2  ONE active subscription per subject + plan — admission + partial index
 *   P3  webhook idempotency by event id — insert-first, replay 200, no re-run
 *   P4  out-of-order events — decideSubscriptionTransition, never a regress
 *   P5  DB concurrency — unique / partial unique indexes, status-guarded writes
 *   P6  amount authority — price id only from prices.ts (env); strict schema
 *   P7  entitlement authority — webhook store only; success_url grants nothing
 *   P8  reconciliation — read-only report, never a charge
 *   P9  evidence — event id/created, price evidence, environment stamp, mode
 *   P10 safe test matrix — no live key literal; live requires the owner arm
 *
 * This guard is STRENGTHENED, never disabled.
 */
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  decideCheckoutAdmission,
  checkoutOperationIdempotencyKey,
  checkoutWindow,
  expiresAtUnixFromIso,
  subscriptionBlocksCheckout,
  CHECKOUT_WINDOW_MINUTES,
} from "../billing/checkout-operations-core";
import { decideSubscriptionTransition } from "../billing/webhook-core";
import { detectAnomalies } from "../billing/reconcile-core";

const here = resolve(fileURLToPath(import.meta.url), "..");
const webRoot = resolve(here, "..", "..");
const repoRoot = resolve(webRoot, "..", "..");
const read = (rel: string) => readFileSync(join(webRoot, rel), "utf8");
const readRepo = (rel: string) => readFileSync(join(repoRoot, rel), "utf8");

const MIGRATION = "supabase/migrations/20260905190000_billing_safety_invariants_v1.sql";
const ROLLBACK = "supabase/rollbacks/20260905190000_billing_safety_invariants_v1.down.sql";

function sources(dir: string, acc: string[] = []): string[] {
  if (!existsSync(dir)) return acc;
  for (const f of readdirSync(dir)) {
    if (f === "node_modules" || f === ".next") continue;
    const p = join(dir, f);
    if (statSync(p).isDirectory()) sources(p, acc);
    else if (/\.(ts|tsx)$/.test(f)) acc.push(p);
  }
  return acc;
}
const rel = (file: string) => file.split(/[\\/]apps[\\/]web[\\/]/)[1]?.replace(/\\/g, "/") ?? file;
const prodSources = () =>
  ["lib", "app", "components"].flatMap((d) => sources(join(webRoot, d))).filter((f) => !/\.test\.tsx?$/.test(f));

// ─── P1 checkout idempotency ────────────────────────────────────────────────

describe("P1 — checkout idempotency is a server-side identity, not a disabled button", () => {
  it("the route derives the Stripe key from the checkout OPERATION and hands Stripe the operation's expiry", () => {
    const route = read("app/api/billing/test-checkout/route.ts");
    expect(route).toMatch(/openCheckoutOperation\(/);
    expect(route).toMatch(/operation\.idempotencyKey/);
    expect(route).toMatch(/expiresAt:\s*operation \? expiresAtUnixFromIso\(operation\.expiresAt\)/);
    // an unreadable operations store fails CLOSED (no identity → no session)
    expect(route).toMatch(/opened\.kind === "error"/);
    expect(route.indexOf('opened.kind === "error"')).toBeLessThan(route.indexOf("provider.createCheckoutSession("));
    // a provider refusal closes the identity so the next click is fresh
    expect(route).toMatch(/markCheckoutOperationFailed\(operation\.id/);
  });

  it("same operation → same key; the stored window round-trips to one unix value (Stripe replay needs identical params)", () => {
    const scope = { type: "organization" as const, id: "o" };
    expect(checkoutOperationIdempotencyKey({ operationId: "x", planKey: "p", scope }))
      .toBe(checkoutOperationIdempotencyKey({ operationId: "x", planKey: "p", scope }));
    const w = checkoutWindow(new Date("2026-01-01T00:00:00Z"));
    expect(expiresAtUnixFromIso(w.expiresAt.toISOString())).toBe(w.expiresAtUnix);
    expect(CHECKOUT_WINDOW_MINUTES).toBeGreaterThanOrEqual(30); // Stripe's expires_at minimum
    expect(CHECKOUT_WINDOW_MINUTES).toBeLessThanOrEqual(24 * 60);
  });

  it("the adapter forwards the window as the Checkout Session's expires_at", () => {
    const adapter = read("lib/billing/providers/stripe-test.ts");
    expect(adapter).toMatch(/expires_at:\s*input\.expiresAt/);
  });

  it("ONE open operation per (scope, plan, provider) is a partial unique index in the migration", () => {
    const sql = readRepo(MIGRATION);
    expect(sql).toMatch(/create unique index if not exists billing_checkout_operations_open_scope_uniq[\s\S]*?\(scope_key, plan_key, provider\)[\s\S]*?where status = 'open'/);
    expect(sql).toMatch(/idempotency_key\s+text not null unique/);
  });

  it("the store REUSES a colliding open operation instead of minting a second identity", () => {
    const store = read("lib/billing/checkout-operations-store.ts");
    expect(store).toMatch(/UNIQUE_VIOLATION/);
    expect(store).toMatch(/kind: "reused"/);
    expect(store).toMatch(/isOperationReusable/);
  });
});

// ─── P2 one active subscription per subject + plan ──────────────────────────

describe("P2 — one active subscription per organization + plan", () => {
  it("every billing status refuses a fresh checkout; only the provider's DEAD answer admits", () => {
    for (const status of ["active", "trialing", "past_due", "incomplete", "unpaid"] as const) {
      expect(subscriptionBlocksCheckout(status), status).toBe(true);
      const refused = decideCheckoutAdmission({ local: { status, providerSubscriptionId: "sub" }, provider: null });
      expect(refused.admit, `${status} without provider`).toBe(false);
      const live = decideCheckoutAdmission({ local: { status, providerSubscriptionId: "sub" }, provider: { status: "active" } });
      expect(live.admit, `${status} confirmed live`).toBe(false);
      const dead = decideCheckoutAdmission({ local: { status, providerSubscriptionId: "sub" }, provider: { status: "cancelled" } });
      expect(dead.admit, `${status} provider cancelled`).toBe(true);
    }
    for (const status of ["cancelled", "expired", "none"] as const) {
      expect(subscriptionBlocksCheckout(status), status).toBe(false);
    }
  });

  it("the route runs admission BEFORE the customer/session calls and answers 409 subscription_exists", () => {
    const route = read("app/api/billing/test-checkout/route.ts");
    expect(route).toMatch(/admitCheckout\(\{ scope, planKey, testMode: config\.testMode, provider \}\)/);
    expect(route.indexOf("admitCheckout(")).toBeLessThan(route.indexOf("ensureBillingCustomer("));
    expect(route.indexOf("admitCheckout(")).toBeLessThan(route.indexOf("provider.createCheckoutSession("));
    expect(route).toMatch(/subscription_exists/);
    expect(route).toMatch(/409/);
  });

  it("admission consults the PROVIDER (read) and heals ONLY to a dead status", () => {
    const adm = read("lib/billing/checkout-admission.ts");
    expect(adm).toMatch(/retrieveSubscription\(/);
    expect(adm).toMatch(/applyProviderReconciledStatus\(/);
    const store = read("lib/billing/subscription-store.ts");
    expect(store).toMatch(/status: "cancelled" \| "expired";/); // the heal's type forbids a grant
  });

  it("the DB holds ONE row per organization + plan (partial unique index, applied 20260806220000)", () => {
    const sql = readRepo("supabase/migrations/20260806220000_stripe_multi_subject_v2.sql");
    expect(sql).toMatch(/billing_subscriptions_org_plan_uniq[\s\S]*?\(organization_id, plan_key, provider\)[\s\S]*?where organization_id is not null/);
    expect(sql).toMatch(/billing_subscriptions_personal_plan_uniq[\s\S]*?where origin_organization_id is null/);
  });

  it("the account page withholds the order button for ANY billing status", () => {
    const cmp = read("components/app/account-billing-section.tsx");
    expect(cmp).toMatch(/!subscriptionBlocksCheckout\(status\)/);
  });
});

// ─── P3 webhook idempotency by event id ─────────────────────────────────────

describe("P3 — webhook idempotency by Stripe event id", () => {
  it("record-first, then process; a processed duplicate returns 200 without side effects", () => {
    const route = read("app/api/billing/webhook/route.ts");
    const recordAt = route.indexOf("recordWebhookEvent(");
    expect(recordAt).toBeGreaterThan(-1);
    expect(recordAt).toBeLessThan(route.indexOf("upsertSubscription("));
    expect(recordAt).toBeLessThan(route.indexOf("applyInvoicePayment("));
    expect(recordAt).toBeLessThan(route.indexOf("completeCheckoutOperationBySession("));
    expect(route).toMatch(/recorded === "duplicate-processed"[\s\S]*?duplicate: true/);
  });

  it("uniqueness is the DB's: unique (provider, event_id) on payment_webhook_events", () => {
    const sql = readRepo("supabase/migrations/20260613200000_billing_test_mode_records.sql");
    expect(sql).toMatch(/payment_webhook_events[\s\S]*?unique \(provider, event_id\)/);
  });

  it("financial events are record-only — no entitlement, credit or ledger side effect", () => {
    const core = read("lib/billing/webhook-core.ts");
    expect(core).toMatch(/RECORD_ONLY = new Set\(\[\s*"charge\.refunded",\s*"charge\.dispute\.created",\s*"charge\.dispute\.closed",\s*\]\)/);
  });
});

// ─── P4 out-of-order events ─────────────────────────────────────────────────

describe("P4 — out-of-order events never regress state", () => {
  const T = 1_700_000_000;
  const at = (u: number) => new Date(u * 1000).toISOString();

  it("a late checkout.session.completed cannot regress active → incomplete", () => {
    expect(decideSubscriptionTransition({ status: "active", lastEventCreatedAt: at(T) }, { kind: "link", status: "incomplete", eventCreated: T - 1 }))
      .toEqual({ apply: true, keepStatus: true });
  });
  it("an older subscription/invoice event is stale; a cancelled row is never revived", () => {
    expect(decideSubscriptionTransition({ status: "active", lastEventCreatedAt: at(T) }, { kind: "subscription", status: "incomplete", eventCreated: T - 1 }))
      .toEqual({ apply: false, reason: "stale_event" });
    expect(decideSubscriptionTransition({ status: "active", lastEventCreatedAt: at(T) }, { kind: "invoice", status: "past_due", eventCreated: T - 1 }))
      .toEqual({ apply: false, reason: "stale_event" });
    expect(decideSubscriptionTransition({ status: "cancelled", lastEventCreatedAt: null }, { kind: "subscription", status: "active", eventCreated: null }))
      .toEqual({ apply: false, reason: "terminal_state" });
  });
  it("the store consults the decision on every write and the route acknowledges a stale skip as processed", () => {
    const store = read("lib/billing/subscription-store.ts");
    expect((store.match(/decideSubscriptionTransition\(/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect(store).toMatch(/return "stale-event"/);
    const route = read("app/api/billing/webhook/route.ts");
    expect(route).toMatch(/result === "ok" \|\| result === "stale-event"/);
    expect(route).toMatch(/transitionKind: "link"/);
  });
  it("the adapter surfaces Stripe's `created` and the record stores it", () => {
    expect(read("lib/billing/providers/stripe-test.ts")).toMatch(/created: event\.created/);
    expect(readRepo(MIGRATION)).toMatch(/last_event_created_at timestamptz/);
    expect(readRepo(MIGRATION)).toMatch(/event_created_at timestamptz/);
  });
});

// ─── P5 DB concurrency ──────────────────────────────────────────────────────

describe("P5 — DB uniqueness + status-guarded writes protect against concurrent requests", () => {
  it("one customer per (owner, provider, MODE); one subscription id; one event id; one open operation per scope", () => {
    const m1 = readRepo("supabase/migrations/20260613200000_billing_test_mode_records.sql");
    expect(m1).toMatch(/billing_subscriptions[\s\S]*?unique \(provider, provider_subscription_id\)/);
    const m3 = readRepo(MIGRATION);
    expect(m3).toMatch(/add constraint billing_customers_owner_provider_mode_key\s+unique \(owner_id, provider, test_mode\)/);
    expect(m3).toMatch(/billing_checkout_operations_open_scope_uniq/);
    expect(m3).toMatch(/billing_checkout_operations_session_uniq/);
  });
  it("closing writes are guarded by status (a completed operation is never re-opened or re-failed)", () => {
    const store = read("lib/billing/checkout-operations-store.ts");
    expect(store).toMatch(/status: "failed"[\s\S]*?\.eq\("status", "open"\)/);
    expect(store).toMatch(/status: "expired"[\s\S]*?\.eq\("status", "open"\)/);
  });
  it("the customer store resolves a create race through the unique key (re-read, never a second mapping)", () => {
    const cs = read("lib/billing/customer-store.ts");
    expect(cs).toMatch(/UNIQUE_VIOLATION[\s\S]*?findBillingCustomer\(user\.id\)/);
    expect(cs).toMatch(/\.eq\("test_mode", getBillingConfig\(\)\.testMode\)/);
    expect(cs).toMatch(/test_mode: created\.testMode/);
  });
});

// ─── P6 amount authority ────────────────────────────────────────────────────

describe("P6 — amount authority: the server resolves the price; the browser never supplies one", () => {
  it("the checkout body is strict and carries only planKey", () => {
    const route = read("app/api/billing/test-checkout/route.ts");
    expect(route).toMatch(/z\.object\(\{ planKey: z\.string\(\)\.min\(1\)\.max\(40\) \}\)\.strict\(\)/);
    expect(route).not.toMatch(/priceId\s*:\s*z\./);
    expect(route).not.toMatch(/amount/i);
    expect(route).toMatch(/const priceId = testPriceIdFor\(planKey\)/);
  });
  it("prices.ts reads ONLY the validated env slots — no literal price id, no figure", () => {
    const prices = read("lib/billing/prices.ts");
    expect(prices).toMatch(/env\.STRIPE_PRICE_COMPANY_PILOT/);
    expect(prices).not.toMatch(/price_[A-Za-z0-9]{8,}/);
    expect(prices).not.toMatch(/\b(99|9900)\b/);
  });
  it("no production source outside prices.ts names a STRIPE_PRICE_ env slot or a price_ literal", () => {
    const offenders: string[] = [];
    for (const f of prodSources()) {
      const r = rel(f);
      if (r === "lib/billing/prices.ts" || r === "lib/env.ts") continue;
      const txt = readFileSync(f, "utf8");
      if (/STRIPE_PRICE_[A-Z_]+/.test(txt) && !/^\s*(\/\/|\*)/m.test(txt.split(/\r?\n/).find((l) => /STRIPE_PRICE_/.test(l)) ?? "")) offenders.push(`${r} [env slot]`);
      if (/["'`]price_[A-Za-z0-9]{10,}["'`]/.test(txt)) offenders.push(`${r} [price literal]`);
    }
    expect(offenders, offenders.join("\n")).toEqual([]);
  });
  it("the operation records the SERVER-resolved price id as evidence and reconciliation compares against the ONE slot", () => {
    expect(read("lib/billing/checkout-operations-store.ts")).toMatch(/provider_price_id: input\.priceId/);
    expect(read("lib/billing/reconcile.ts")).toMatch(/testPriceIdFor\(ORGANIZATION_PLAN_KEY\)/);
    expect(read("lib/billing/reconcile.ts")).toMatch(/price_eur_monthly/);
  });
});

// ─── P7 entitlement authority ───────────────────────────────────────────────

describe("P7 — entitlement comes only from verified provider state via the ONE state machine", () => {
  it("billing_subscriptions writers are exactly the webhook store + admin manual grants", () => {
    const allowed = new Set(["lib/billing/subscription-store.ts", "lib/admin/billing-actions.ts"]);
    const offenders = prodSources().filter((f) => {
      const r = rel(f);
      if (allowed.has(r)) return false;
      return /from\(\s*["'`]billing_subscriptions["'`]\s*\)\s*[\s\S]{0,80}?\.(insert|upsert|update|delete)\(/.test(readFileSync(f, "utf8"));
    }).map(rel);
    expect(offenders).toEqual([]);
  });
  it("the success return reads a query flag and writes nothing; the checkout route writes no subscription", () => {
    const acct = read("components/app/account-billing-section.tsx");
    expect(acct).not.toMatch(/\.(insert|upsert|update)\(/);
    const route = read("app/api/billing/test-checkout/route.ts");
    expect(route).not.toMatch(/billing_subscriptions/);
  });
  it("entitlements resolve ONLY from the subscription row status (active/trialing/past_due) — never from a session or redirect", () => {
    const ent = read("lib/billing/entitlements-v1.ts");
    expect(ent).toMatch(/s === "active" \|\| s === "trialing"/);
    expect(ent).not.toMatch(/session|redirect|success_url/i);
    const eff = read("lib/billing/effective-entitlements.ts");
    expect(eff).toMatch(/from\("billing_subscriptions"\)/);
    expect(eff).not.toMatch(/searchParams|billing=/);
  });
  it("the admission heal can only REMOVE an entitlement (typed to dead statuses) and the reconciliation writes nothing", () => {
    expect(read("lib/billing/subscription-store.ts")).toMatch(/status: "cancelled" \| "expired";/);
    const rec = read("lib/billing/reconcile.ts");
    expect(rec).not.toMatch(/\.(insert|upsert|update|delete)\(/);
    expect(rec).toMatch(/writesPerformed: 0/);
  });
});

// ─── P8 reconciliation ──────────────────────────────────────────────────────

describe("P8 — reconciliation is read-only, admin-only, and names every anomaly class", () => {
  it("the route is GET-only, superadmin-gated, takes no input", () => {
    const route = read("app/api/billing/reconcile/route.ts");
    expect(route).toMatch(/export async function GET\(\)/);
    expect(route).not.toMatch(/export async function (POST|PUT|PATCH|DELETE)/);
    expect(route).toMatch(/isSuperadmin\(\)/);
    expect(route).not.toMatch(/req\.json|searchParams|formData/);
  });
  it("the server wrapper re-checks isSuperadmin, never calls a mutating provider method, never a charge", () => {
    const rec = read("lib/billing/reconcile.ts");
    expect(rec).toMatch(/if \(!\(await isSuperadmin\(\)\)\)/);
    expect(rec).toMatch(/retrieveSubscription\(|listCustomerSubscriptions\(/);
    // call SHAPES, not prose — the module's own comments say "never a charge"
    expect(rec).not.toMatch(/\.(createCheckoutSession|createCustomer|createPortalSession)\(/);
    expect(rec).not.toMatch(/\.(charges|refunds|paymentIntents|invoices|subscriptions)\s*\.\s*(create|capture|confirm|pay|update|cancel|del)\s*\(/);
  });
  it("the pure core detects each named anomaly class", () => {
    const now = new Date("2026-09-05T12:00:00Z");
    const base = {
      subscriptions: [], customers: [], providerSubscriptions: {}, providerSubscriptionsByCustomer: {},
      webhookEvents: [], checkoutOperations: [], expectedPriceId: "price_ok", expectedUnitAmountCents: 9900, expectedCurrency: "eur", liveMode: true, now,
    };
    const local = { id: "l", ownerId: "o", organizationId: "g", planKey: "company_pilot", providerCustomerId: "c", providerSubscriptionId: "s", status: "active", testMode: false, providerPriceId: null, unitAmountCents: null, currency: null, lastEventCreatedAt: null };
    const provider = { id: "s", customerId: "c", status: "active" as const, priceId: "price_ok", unitAmountCents: 9900, currency: "eur", livemode: true };
    const kinds = (i: Parameters<typeof detectAnomalies>[0]) => detectAnomalies(i).map((a) => a.kind);
    expect(kinds({ ...base, subscriptions: [local], providerSubscriptions: { l: provider } })).toEqual([]);
    expect(kinds({ ...base, subscriptions: [local, { ...local, id: "l2", providerSubscriptionId: "s2" }] })).toContain("multiple_blocking_subscriptions_per_scope");
    expect(kinds({ ...base, subscriptions: [local], providerSubscriptions: { l: null } })).toContain("local_entitlement_without_provider_subscription");
    expect(kinds({ ...base, providerSubscriptionsByCustomer: { c: [provider] } })).toContain("provider_subscription_without_local_row");
    expect(kinds({ ...base, subscriptions: [local], providerSubscriptions: { l: { ...provider, priceId: "price_other" } } })).toContain("unexpected_price");
    expect(kinds({ ...base, subscriptions: [local], providerSubscriptions: { l: { ...provider, unitAmountCents: 1 } } })).toContain("unexpected_amount_or_currency");
    expect(kinds({ ...base, webhookEvents: [{ eventId: "e", eventType: "x", processed: false, error: null, createdAt: "2026-09-05T11:00:00Z" }] })).toContain("unprocessed_webhook_event");
    expect(kinds({ ...base, customers: [{ ownerId: "a", providerCustomerId: "c", testMode: false }, { ownerId: "b", providerCustomerId: "c", testMode: false }] })).toContain("duplicate_customer_linkage");
  });
  it("the route is classified in the API auth boundary as cookie-only", () => {
    expect(read("lib/guards/api-auth-boundary.test.ts")).toMatch(/"billing\/reconcile\/route\.ts":\s*\{\s*class: "cookie-only"/);
  });
});

// ─── P9 evidence / traceability ─────────────────────────────────────────────

describe("P9 — every financial object carries attributable, immutable identifiers", () => {
  it("the adapter stamps the TRUE environment (live/test) on customers, sessions and subscriptions", () => {
    const adapter = read("lib/billing/providers/stripe-test.ts");
    expect(adapter).toMatch(/environment: live \? "live" : "test"/);
    expect(adapter).toMatch(/\.\.\.environmentStamp/);
    expect((adapter.match(/\.\.\.environmentStamp/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });
  it("the operation row links request → key → session → subscription with timestamps and price evidence", () => {
    const sql = readRepo(MIGRATION);
    for (const col of ["idempotency_key", "provider_session_id", "provider_subscription_id", "provider_price_id", "expires_at", "created_at", "completed_at", "failure_reason", "source"]) {
      expect(sql, col).toMatch(new RegExp(`\\b${col}\\b`));
    }
    expect(read("lib/billing/checkout-operations-store.ts")).toMatch(/attachProviderSession/);
    expect(read("app/api/billing/webhook/route.ts")).toMatch(/completeCheckoutOperationBySession\(\{\s*sessionId,\s*providerSubscriptionId: link\.providerSubscriptionId/);
  });
  it("the subscription row keeps the last event id/created and the billed price; the event record keeps Stripe's created", () => {
    const store = read("lib/billing/subscription-store.ts");
    expect(store).toMatch(/last_event_id/);
    expect(store).toMatch(/last_event_created_at/);
    expect(store).toMatch(/provider_price_id/);
    expect(store).toMatch(/event_created_at/);
    expect(store).toMatch(/reconcile:\$\{input\.source\}/); // heal provenance
  });
  it("the checkout response returns the operation id (support can attribute a session to a server-side request)", () => {
    expect(read("app/api/billing/test-checkout/route.ts")).toMatch(/operationId: operation\?\.id \?\? null/);
  });
});

// ─── P10 safe test matrix ───────────────────────────────────────────────────

describe("P10 — nothing here can touch real money by accident", () => {
  it("the migration is RED-annotated, additive, ships a paired rollback, and refuses silent loss", () => {
    const sql = readRepo(MIGRATION);
    expect(sql).toMatch(/^-- @human-gate-approved/);
    expect(sql).not.toMatch(/^\s*(drop table|drop column|delete from|truncate)/im);
    expect(sql).toMatch(/drop constraint if exists billing_customers_owner_id_provider_key[\s\S]*?add constraint billing_customers_owner_provider_mode_key/);
    expect(existsSync(join(repoRoot, ROLLBACK))).toBe(true);
    expect(readRepo(ROLLBACK)).toMatch(/ROLLBACK REFUSED/);
  });
  it("the reconcile/admission provider reads are NOT capture-shaped and stay inside the adapter", () => {
    const CAPTURE = [/paymentIntents\s*\.\s*(create|capture|confirm)/, /charges\s*\.\s*(create|capture)/, /subscriptions\s*\.\s*create/, /invoices\s*\.\s*pay\s*\(/, /setupIntents\s*\.\s*create/, /refunds\s*\.\s*create/, /subscriptions\s*\.\s*(update|cancel|del)\s*\(/];
    const offenders: string[] = [];
    for (const f of prodSources()) {
      const txt = readFileSync(f, "utf8");
      for (const rx of CAPTURE) if (rx.test(txt)) offenders.push(`${rel(f)} [${rx.source}]`);
    }
    expect(offenders).toEqual([]);
    const sdkUsers = prodSources().filter((f) => /subscriptions\s*\.\s*(retrieve|list)\s*\(/.test(readFileSync(f, "utf8"))).map(rel);
    expect(sdkUsers).toEqual(["lib/billing/providers/stripe-test.ts"]);
  });
  it("a TEST-mode row can neither block nor entitle a LIVE checkout (mode-scoped lookups)", () => {
    expect(read("lib/billing/subscription-store.ts")).toMatch(/\.eq\("test_mode", input\.testMode\)/);
    expect(read("lib/billing/reconcile.ts")).toMatch(/s\.testMode !== modeIsTest/);
  });
  it("the account page's order CTA and the checkout route agree on the ONE sellable plan key", () => {
    expect(read("components/app/account-billing-section.tsx")).toMatch(/planKey=\{ORGANIZATION_PLAN_KEY\}/);
    expect(read("lib/billing/plans.ts")).toMatch(/ORGANIZATION_PLAN_KEY = "company_pilot"/);
  });
});
