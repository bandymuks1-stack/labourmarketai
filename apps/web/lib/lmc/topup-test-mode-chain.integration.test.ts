/**
 * LMC TOP-UP TEST-MODE CHAIN — checkout → signed webhook → ledger credit, end
 * to end, offline (owner order 2026-10-21: "never grant credits twice").
 * Same method as lib/billing/test-mode-chain.integration.test.ts.
 *
 * REAL (unmocked): lib/env.ts, lib/billing/config-core.ts + config.ts,
 * lib/billing/provider.ts + providers/stripe-test.ts (incl. the real
 * webhooks.constructEvent with the top-up endpoint's own secret),
 * app/api/lmc/topup-checkout/route.ts, app/api/lmc/topup-webhook/route.ts,
 * lib/lmc/topup-settlement.ts, topup-metadata.ts, topup-packages.ts
 * (findSellableTopupPackage — fed a TEST list), lib/lmc/wallet.ts
 * (recordLmcPurchase), lib/company/role-capabilities.ts, and the Stripe SDK's
 * signing (generateTestHeaderString) + verification.
 *
 * FAKED EDGES (only these):
 *   - "@/lib/supabase/admin" — an in-memory `lmc_record_purchase_v1` that
 *     follows the SQL in 20260720190000 (replay under the per-account key,
 *     conflict on a changed amount/reference, the `lmc_tx_idempotency`
 *     constraint, the `lmc_purchases_enabled` row) PLUS the unique index of
 *     20261021150000 (`lmc_purchase_payment_reference_unique`);
 *   - "@/lib/supabase/server" — auth.getUser only;
 *   - "@/lib/company/employer-company-context" — answers "personal workspace";
 *   - "stripe" — the REAL class; checkout.sessions.create is a recording stub,
 *     every other network method throws;
 *   - "@/lib/billing/lmc-flags" — the REAL values (all false) until the test
 *     forces the two top-up flags on, INSIDE THIS FILE ONLY;
 *   - "@/lib/lmc/topup-packages" — the real module, with a TEST package list
 *     (arbitrary figures, not an offer; the production list stays empty).
 */
import { afterAll, describe, expect, it, vi } from "vitest";

const ids = vi.hoisted(() => {
  const PERSON = "0f0f0f0f-0000-4000-8000-0000000000aa";
  const OTHER_COMPANY = "0c0c0c0c-0000-4000-8000-0000000000bb";
  const SECRET = "sk_test_offline_topup_chain";
  const WHSEC_BILLING = "whsec_offline_billing_endpoint";
  const WHSEC_TOPUP = "whsec_offline_topup_endpoint";
  vi.stubEnv("PAYMENTS_ENABLED", "true");
  vi.stubEnv("BILLING_PROVIDER", "stripe");
  vi.stubEnv("STRIPE_MODE", "test");
  vi.stubEnv("STRIPE_SECRET_KEY", SECRET);
  vi.stubEnv("STRIPE_WEBHOOK_SECRET", WHSEC_BILLING);
  vi.stubEnv("STRIPE_TOPUP_WEBHOOK_SECRET", WHSEC_TOPUP);
  vi.stubEnv("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY", "pk_test_offline_topup_chain");
  vi.stubEnv("STRIPE_LIVE_ACTIVATION", "");
  // Pilot unrestricted for this proof: a PERSON subject has no organization.
  vi.stubEnv("BILLING_PILOT_ORGANIZATION_IDS", "ALL_ORGANIZATIONS");
  return { PERSON, OTHER_COMPANY, SECRET, WHSEC_BILLING, WHSEC_TOPUP };
});
afterAll(() => {
  vi.unstubAllEnvs();
});

// ─── Flags: real (all false) until forced on in this file ────────────────────
const flagState = vi.hoisted(() => ({ forced: false }));
vi.mock("@/lib/billing/lmc-flags", async (orig) => {
  const real = (await orig()) as Record<string, unknown>;
  return {
    ...real,
    get STRIPE_LMC_TOPUPS_ENABLED() {
      return flagState.forced ? true : real.STRIPE_LMC_TOPUPS_ENABLED;
    },
    get LMC_PURCHASES_ENABLED() {
      return flagState.forced ? true : real.LMC_PURCHASES_ENABLED;
    },
  };
});

// ─── Test package list (real lookup, injected list) ──────────────────────────
vi.mock("@/lib/lmc/topup-packages", async (orig) => {
  const real = (await orig()) as typeof import("@/lib/lmc/topup-packages");
  const TEST = [
    { key: "chain_pack", creditCents: 2500, chargeMinor: 2500, currency: "eur" as const, approval: { state: "owner_approved" as const, decisionRef: "TEST-ONLY", approvedOnIso: "2026-10-21" } },
    { key: "chain_unapproved", creditCents: 100, chargeMinor: 100, currency: "eur" as const, approval: { state: "owner_unapproved" as const } },
  ];
  return {
    ...real,
    OWNER_APPROVED_LMC_TOPUP_PACKAGES: TEST,
    findSellableTopupPackage: (k: unknown, list: readonly import("@/lib/lmc/topup-packages").LmcTopupPackage[] = TEST) =>
      real.findSellableTopupPackage(k, list),
  };
});

// ─── In-memory ledger (the DB edge) ──────────────────────────────────────────
type Tx = { id: string; account_id: string; kind: string; amount_cents: number; idempotency_key: string; reference: string };
const ledger = vi.hoisted(() => ({
  accounts: [] as Array<{ id: string; profile_id: string | null; company_id: string | null }>,
  txs: [] as Tx[],
  dbPurchasesFlag: false,
  rpcCalls: 0,
  seq: 0,
}));

function fakeRecordPurchase(a: { p_amount_cents: number; p_reference: string; p_idempotency_key: string; p_profile_id?: string; p_company_id?: string }) {
  ledger.rpcCalls++;
  const err = (message: string) => ({ data: null, error: { message } });
  if ((a.p_profile_id == null) === (a.p_company_id == null)) return err("lmc_invalid_subject");
  const find = () =>
    ledger.accounts.find((x) => (a.p_profile_id ? x.profile_id === a.p_profile_id : x.company_id === a.p_company_id));
  const replay = (accountId: string) => {
    const t = ledger.txs.find((x) => x.account_id === accountId && x.idempotency_key === a.p_idempotency_key);
    if (!t) return null;
    if (t.kind !== "purchased" || t.amount_cents !== a.p_amount_cents || t.reference !== a.p_reference) {
      return err(`lmc_idempotency_conflict: key ${a.p_idempotency_key}`);
    }
    return { data: { transaction_id: t.id, account_id: accountId, kind: "purchased", amount_cents: t.amount_cents, already_processed: true }, error: null };
  };
  const existing = find();
  if (existing) {
    const r = replay(existing.id);
    if (r) return r;
  }
  if (!ledger.dbPurchasesFlag) return err("lmc_purchases_disabled");
  let acc = find();
  if (!acc) {
    acc = { id: `acc-${++ledger.seq}`, profile_id: a.p_profile_id ?? null, company_id: a.p_company_id ?? null };
    ledger.accounts.push(acc);
  }
  const r = replay(acc.id);
  if (r) return r;
  // constraint lmc_tx_idempotency unique (account_id, idempotency_key)
  if (ledger.txs.some((x) => x.account_id === acc!.id && x.idempotency_key === a.p_idempotency_key)) {
    return err('duplicate key value violates unique constraint "lmc_tx_idempotency"');
  }
  // 20261021150000: unique ((metadata->>'reference')) where kind = 'purchased'
  if (ledger.txs.some((x) => x.kind === "purchased" && x.reference === a.p_reference)) {
    return err('duplicate key value violates unique constraint "lmc_purchase_payment_reference_unique"');
  }
  const tx: Tx = { id: `tx-${++ledger.seq}`, account_id: acc.id, kind: "purchased", amount_cents: a.p_amount_cents, idempotency_key: a.p_idempotency_key, reference: a.p_reference };
  ledger.txs.push(tx);
  return { data: { transaction_id: tx.id, account_id: acc.id, kind: "purchased", amount_cents: tx.amount_cents, already_processed: false }, error: null };
}

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({
    rpc: async (fn: string, args: Record<string, unknown>) => {
      if (fn !== "lmc_record_purchase_v1") throw new Error(`unexpected rpc ${fn}`);
      return fakeRecordPurchase(args as Parameters<typeof fakeRecordPurchase>[0]);
    },
    from: (t: string) => {
      throw new Error(`unexpected table read ${t}`);
    },
  })),
}));

const session = vi.hoisted(() => ({ user: null as { id: string; email: string } | null }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({ auth: { getUser: async () => ({ data: { user: session.user }, error: null }) } })),
}));
vi.mock("@/lib/company/employer-company-context", () => ({
  resolveEmployerCompanyContext: vi.fn(async () => ({ kind: "unavailable", reason: "personal-workspace", activeWorkspaceName: null })),
}));

// ─── Stripe SDK edge: real class, network stubbed ────────────────────────────
const stripeNet = vi.hoisted(() => ({
  checkoutCreate: [] as Array<{ params: Record<string, unknown>; options: Record<string, unknown> | undefined }>,
  unexpected: [] as string[],
}));
vi.mock("stripe", async (importOriginal) => {
  const mod = (await importOriginal()) as { default: new (...a: unknown[]) => Record<string, unknown> };
  const Wrapped = new Proxy(mod.default, {
    construct(target, args) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const s: any = Reflect.construct(target, args);
      s.checkout.sessions.create = async (params: Record<string, unknown>, options?: Record<string, unknown>) => {
        stripeNet.checkoutCreate.push({ params, options });
        const id = `cs_test_topup_${stripeNet.checkoutCreate.length}`;
        return { id, object: "checkout.session", url: `https://checkout.stripe.com/c/pay/${id}`, livemode: false };
      };
      const refuse = (name: string) => async () => {
        stripeNet.unexpected.push(name);
        throw new Error(`unexpected Stripe network call: ${name}`);
      };
      s.customers.create = refuse("customers.create");
      s.prices.retrieve = refuse("prices.retrieve");
      s.subscriptions.retrieve = refuse("subscriptions.retrieve");
      s.paymentIntents.create = refuse("paymentIntents.create");
      s.refunds.create = refuse("refunds.create");
      return s;
    },
  });
  return { ...mod, default: Wrapped };
});

// ─── Imports (after every vi.mock) ───────────────────────────────────────────
import Stripe from "stripe";
import { getBillingConfig } from "@/lib/billing/config";
import { STRIPE_PINNED_API_VERSION } from "@/lib/billing/providers/stripe-test";
import * as realFlags from "@/lib/billing/lmc-flags";
import { POST as checkoutPOST } from "@/app/api/lmc/topup-checkout/route";
import { POST as webhookPOST } from "@/app/api/lmc/topup-webhook/route";

const signer = new Stripe(ids.SECRET, { apiVersion: STRIPE_PINNED_API_VERSION });

function signed(event: Record<string, unknown>, secret: string = ids.WHSEC_TOPUP): Request {
  const body = JSON.stringify(event);
  const header = signer.webhooks.generateTestHeaderString({ payload: body, secret });
  return new Request("http://localhost/api/lmc/topup-webhook", {
    method: "POST",
    headers: { "content-type": "application/json", "stripe-signature": header },
    body,
  });
}
const postCheckout = (packageKey: string) =>
  checkoutPOST(new Request("http://localhost/api/lmc/topup-checkout", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ packageKey }),
  }));

let evtSeq = 0;
function stripeEvent(type: string, object: Record<string, unknown>, livemode = false): Record<string, unknown> {
  return { id: `evt_test_topup_${++evtSeq}`, object: "event", api_version: STRIPE_PINNED_API_VERSION, created: 1_790_000_000 + evtSeq, livemode, type, data: { object } };
}

const PI = "pi_test_topup_chain_1";
const chain = { metadata: {} as Record<string, string>, completed: {} as Record<string, unknown> };
const credits = () => ledger.txs.filter((t) => t.kind === "purchased");
const balance = (accountId: string) => ledger.txs.filter((t) => t.account_id === accountId).reduce((s, t) => s + t.amount_cents, 0);

describe("LMC top-up chain (offline, real modules, Stripe TEST)", () => {
  it("0. the adapter is stripe_test; the shipped flags are all false", () => {
    expect(getBillingConfig()).toMatchObject({ state: "stripe_test", testMode: true });
    expect(realFlags.STRIPE_LMC_TOPUPS_ENABLED).toBe(false);
    expect(realFlags.LMC_PURCHASES_ENABLED).toBe(false);
  });

  it("1. flags OFF → checkout 503, a valid signed delivery 503; no Stripe call, no ledger call", async () => {
    session.user = { id: ids.PERSON, email: "person@topup.test" };
    const c = await postCheckout("chain_pack");
    expect(c.status).toBe(503);
    const w = await webhookPOST(signed(stripeEvent("checkout.session.completed", { id: "cs_x", mode: "payment" })));
    expect(w.status).toBe(503);
    expect(stripeNet.checkoutCreate).toHaveLength(0);
    expect(ledger.rpcCalls).toBe(0);
  });

  it("2. flags forced on (this test only): an unapproved or unknown package is refused before Stripe", async () => {
    flagState.forced = true;
    ledger.dbPurchasesFlag = true;
    for (const k of ["chain_unapproved", "no_such_pack"]) {
      const r = await postCheckout(k);
      expect(r.status).toBe(400);
      expect(await r.json()).toMatchObject({ reason: "package_not_sellable" });
    }
    expect(stripeNet.checkoutCreate).toHaveLength(0);
  });

  it("3. checkout: a TEST payment-mode session for the server's package figure", async () => {
    const r = await postCheckout("chain_pack");
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ ok: true, testMode: true });
    expect(stripeNet.checkoutCreate).toHaveLength(1);
    const { params, options } = stripeNet.checkoutCreate[0];
    expect(params.mode).toBe("payment");
    expect(params.line_items).toEqual([
      { price_data: { currency: "eur", unit_amount: 2500, product_data: { name: expect.any(String) } }, quantity: 1 },
    ]);
    const md = params.metadata as Record<string, string>;
    expect(md).toMatchObject({ purpose: "lmc_topup_v1", package_key: "chain_pack", subject_type: "person", subject_id: ids.PERSON, environment: "test", test_mode: "true" });
    expect((params.payment_intent_data as { metadata: unknown }).metadata).toEqual(md);
    expect(options?.idempotencyKey).toBe(md.checkout_idempotency_key);
    chain.metadata = md;
    chain.completed = {
      id: "cs_test_topup_1", object: "checkout.session", mode: "payment", payment_status: "paid",
      payment_intent: PI, currency: "eur", amount_subtotal: 2500, amount_total: 2500, livemode: false, metadata: md,
    };
  });

  it("4. the signed checkout.session.completed credits exactly once", async () => {
    const r = await webhookPOST(signed(stripeEvent("checkout.session.completed", chain.completed)));
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ result: "credited" });
    expect(credits()).toHaveLength(1);
    expect(credits()[0]).toMatchObject({ amount_cents: 2500, idempotency_key: `stripe_pi:${PI}`, reference: PI });
    expect(balance(credits()[0].account_id)).toBe(2500);
  });

  it("5. the SAME event replayed 3x + the async_payment_succeeded duplicate → still exactly one credit", async () => {
    const same = stripeEvent("checkout.session.completed", chain.completed);
    for (let i = 0; i < 3; i++) {
      const r = await webhookPOST(signed(same));
      expect(r.status).toBe(200);
      expect(await r.json()).toMatchObject({ result: "already_credited" });
    }
    const asyncDup = await webhookPOST(signed(stripeEvent("checkout.session.async_payment_succeeded", chain.completed)));
    expect(await asyncDup.json()).toMatchObject({ result: "already_credited" });
    // A burst of concurrent retries.
    const burst = await Promise.all(Array.from({ length: 5 }, () => webhookPOST(signed(same))));
    expect(burst.every((b) => b.status === 200)).toBe(true);
    expect(credits()).toHaveLength(1);
    expect(balance(credits()[0].account_id)).toBe(2500);
  });

  it("6. the same payment presented for ANOTHER subject → the DB reference index refuses a second credit", async () => {
    const forged = { ...chain.completed, metadata: { ...chain.metadata, subject_type: "company", subject_id: ids.OTHER_COMPANY } };
    const r = await webhookPOST(signed(stripeEvent("checkout.session.completed", forged)));
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ result: "already_credited" });
    expect(credits()).toHaveLength(1);
    const other = ledger.accounts.find((a) => a.company_id === ids.OTHER_COMPANY);
    expect(other ? balance(other.id) : 0).toBe(0);
  });

  it("7. a live-mode event is refused", async () => {
    const r = await webhookPOST(signed(stripeEvent("checkout.session.completed", { ...chain.completed, payment_intent: "pi_test_topup_live_1", livemode: true }, true)));
    expect(r.status).toBe(400);
    expect(await r.json()).toMatchObject({ reason: "live_event_rejected" });
    expect(credits()).toHaveLength(1);
  });

  it("8. a wrong signature — including the SUBSCRIPTION endpoint's secret — is refused", async () => {
    const fresh = { ...chain.completed, payment_intent: "pi_test_topup_sig_1" };
    for (const secret of ["whsec_attacker", ids.WHSEC_BILLING]) {
      const r = await webhookPOST(signed(stripeEvent("checkout.session.completed", fresh), secret));
      expect(r.status).toBe(400);
      expect(await r.json()).toMatchObject({ reason: "invalid_signature" });
    }
    const tampered = signed(stripeEvent("checkout.session.completed", fresh));
    const body = (await tampered.text()).replace("2500", "9999");
    const r = await webhookPOST(new Request(tampered.url, { method: "POST", headers: tampered.headers, body }));
    expect(r.status).toBe(400);
    expect(credits()).toHaveLength(1);
  });

  it("9. an unpaid (async pending) session credits nothing", async () => {
    const r = await webhookPOST(signed(stripeEvent("checkout.session.completed", { ...chain.completed, payment_intent: "pi_test_topup_pending", payment_status: "unpaid" })));
    expect(await r.json()).toMatchObject({ result: "not_paid" });
    expect(credits()).toHaveLength(1);
  });

  it("10. a refund is reported for the owner — never silently, never auto-reversed (MDD-08 open)", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const r = await webhookPOST(signed(stripeEvent("charge.refunded", { id: "ch_test_topup_1", object: "charge", payment_intent: PI, livemode: false, refunded: true, metadata: chain.metadata })));
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ result: "refund_pending_owner_decision" });
    expect(err.mock.calls.some((c) => String(c[0]).includes(`payment_intent=${PI}`))).toBe(true);
    err.mockRestore();
    expect(credits()).toHaveLength(1);
  });

  it("11. nothing else reached Stripe's network", () => {
    expect(stripeNet.unexpected).toEqual([]);
    expect(stripeNet.checkoutCreate).toHaveLength(1);
  });
});
