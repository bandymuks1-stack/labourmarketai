/**
 * Stripe Tax — signed-event fixtures through the REAL webhook route.
 *
 * What runs for real here: `POST /api/billing/webhook` (the route handler),
 * the Stripe adapter's `constructWebhookEvent` (the SDK's signature check
 * against a webhook secret generated inside this test), the event mode gate,
 * the idempotency record (`recordWebhookEvent` / `markWebhookProcessed` /
 * `markWebhookFailed`), `applyInvoicePayment`, `captureTaxEvidence` /
 * `applyTaxIdUpdate`, the adapter's READ-ONLY `retrieveTaxEvidenceSources`, the
 * parsers and review rules (stripe-tax-core) and the evidence store
 * (tax-evidence-store). The service-role client is an in-memory table store
 * that keeps the migration's unique keys, so a replay or a concurrent insert
 * behaves like the database would.
 *
 * What is faked: the two HTTP reads the adapter makes (`checkout.sessions
 * .retrieve` with the breakdown expanded, `customers.listTaxIds`) are served
 * from fixtures — this test never reaches Stripe, carries no real key and no
 * real customer data. The pilot-pass grant and the subscription link
 * (apply-subscription-snapshot) are stubbed: they are not the subject here and
 * have their own tests (pilot-pass-core, apply-subscription-snapshot).
 *
 * Payload shapes follow Stripe API version 2026-06-24.dahlia (the version of
 * the sandbox webhook destination): invoices carry `total_taxes[]` (post-Basil)
 * and `parent.subscription_details`; the legacy `total_tax_amounts[]` shape is
 * covered too because a destination on an older version still sends it. A
 * webhook payload never carries `total_details.breakdown` (expand-only), which
 * is why the adapter re-reads the session.
 */
import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ─── Switch + adapter state (the env is not read in this test) ─────────────
const cfg = vi.hoisted(() => ({ taxOn: true, webhookSecret: "" }));
vi.mock("@/lib/billing/config", () => ({
  getBillingConfig: () => ({ state: "stripe_test", testMode: true }),
  billingStripeTaxEnabled: () => cfg.taxOn,
  // Shape-only placeholder so the SDK can be instantiated; every network
  // method the adapter uses here is replaced by a fixture below.
  requireStripeSecret: () => ["sk", "test", "fixture_never_sent"].join("_"),
  requireStripeWebhookSecret: () => cfg.webhookSecret,
}));

// ─── Stripe READS served from fixtures (signature code stays the SDK's) ─────
type Json = Record<string, unknown>;
const reads = vi.hoisted(() => ({
  sessions: new Map<string, Record<string, unknown>>(),
  taxIds: new Map<string, Record<string, unknown>[]>(),
  calls: [] as Array<{ kind: "session" | "taxIds"; id: string; params: unknown }>,
  failNext: false,
}));
vi.mock("stripe", async (importOriginal) => {
  const mod = (await importOriginal()) as { default: new (...a: unknown[]) => unknown };
  const Real = mod.default;
  function FixtureStripe(this: unknown, ...args: unknown[]) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const s = new Real(...args) as any;
    const refuse = () => Object.assign(new Error("fixture: Stripe read failed"), { statusCode: 503 });
    s.checkout.sessions.retrieve = async (id: string, params: unknown) => {
      reads.calls.push({ kind: "session", id, params });
      if (reads.failNext) throw refuse();
      const v = reads.sessions.get(id);
      if (!v) throw Object.assign(new Error("No such checkout.session"), { code: "resource_missing" });
      return structuredClone(v);
    };
    s.customers.listTaxIds = async (id: string, params: unknown) => {
      reads.calls.push({ kind: "taxIds", id, params });
      if (reads.failNext) throw refuse();
      return { object: "list", data: structuredClone(reads.taxIds.get(id) ?? []), has_more: false, url: `/v1/customers/${id}/tax_ids` };
    };
    return s;
  }
  Object.setPrototypeOf(FixtureStripe, Real);
  (FixtureStripe as unknown as { prototype: unknown }).prototype = (Real as unknown as { prototype: unknown }).prototype;
  return { ...mod, default: FixtureStripe, Stripe: FixtureStripe };
});

// ─── In-memory service-role client (unique keys as in the migrations) ───────
const db = vi.hoisted(() => ({
  tables: {} as Record<string, Array<Record<string, unknown>>>,
  absent: new Set<string>(),
  failNextUpdate: new Set<string>(),
  seq: 0,
}));
const UNIQUE: Record<string, string[]> = {
  payment_webhook_events: ["provider", "event_id"],
  billing_tax_evidence: ["provider", "provider_object_id"],
};
const DEFAULTS: Record<string, () => Record<string, unknown>> = {
  payment_webhook_events: () => ({ provider: "stripe", processed: false, error: null }),
  billing_tax_evidence: () => ({ provider: "stripe", review_required: false, reviewed_at: null, tax_id_verification_event_at: null }),
};

function fakeAdmin() {
  return {
    from(table: string) {
      let op: "select" | "insert" | "update" = "select";
      let payload: Record<string, unknown> | null = null;
      let limit = Infinity;
      const filters: Array<(r: Record<string, unknown>) => boolean> = [];
      const exec = (): { data: unknown; error: { code: string } | null } => {
        if (db.absent.has(table)) return { data: null, error: { code: "42P01" } };
        const rows = (db.tables[table] ??= []);
        if (op === "insert") {
          const row: Record<string, unknown> = { id: `row_${++db.seq}`, created_at: new Date().toISOString(), ...DEFAULTS[table]?.(), ...structuredClone(payload!) };
          const key = UNIQUE[table];
          if (key && rows.some((r) => key.every((k) => r[k] === row[k]))) return { data: null, error: { code: "23505" } };
          rows.push(row);
          return { data: [structuredClone(row)], error: null };
        }
        const hit = rows.filter((r) => filters.every((f) => f(r)));
        if (op === "update") {
          if (db.failNextUpdate.delete(table)) return { data: null, error: { code: "08006" } };
          for (const r of hit) Object.assign(r, structuredClone(payload!));
          return { data: hit.map((r) => structuredClone(r)), error: null };
        }
        return { data: hit.slice(0, limit).map((r) => structuredClone(r)), error: null };
      };
      const b = {
        select: () => b,
        insert: (p: Record<string, unknown>) => ((op = "insert"), (payload = p), b),
        update: (p: Record<string, unknown>) => ((op = "update"), (payload = p), b),
        eq: (c: string, v: unknown) => (filters.push((r) => r[c] === v), b),
        not: (c: string, o: string, v: unknown) => (filters.push((r) => !(o === "is" && v === null && (r[c] ?? null) === null)), b),
        order: () => b,
        limit: (n: number) => ((limit = n), b),
        maybeSingle: async () => {
          const out = exec();
          if (out.error) return out;
          const list = out.data as unknown[];
          return { data: list[0] ?? null, error: null };
        },
        then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve(exec()).then(res, rej),
      };
      return b;
    },
  };
}
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => fakeAdmin() }));
vi.mock("@/lib/auth/superadmin", () => ({ isSuperadmin: vi.fn(async () => false) }));

// ─── Not the subject: plan grants, operation bookkeeping, telemetry ─────────
vi.mock("@/lib/billing/apply-subscription-snapshot", () => ({
  applyPilotPass: vi.fn(async (obj: Json) => (obj.mode === "payment" ? "ok" : null)),
  applyCheckoutLink: vi.fn(async (obj: Json) => ({ result: "ok", providerSubscriptionId: obj.subscription ?? null })),
  applyRawSubscriptionObject: vi.fn(async () => "ok"),
}));
vi.mock("@/lib/billing/checkout-operations-store", () => ({
  completeCheckoutOperationBySession: vi.fn(async () => "ok"),
  expireCheckoutOperationBySession: vi.fn(async () => "ok"),
}));
vi.mock("@/lib/telemetry/server-funnel", () => ({ emitServerFunnelEvent: vi.fn() }));

import Stripe from "stripe";
import { POST } from "@/app/api/billing/webhook/route";
import { STRIPE_PINNED_API_VERSION } from "@/lib/billing/providers/stripe-test";

// ─── Fixtures ──────────────────────────────────────────────────────────────
const API_VERSION = "2026-06-24.dahlia";
const T0 = 1_792_700_000; // 2026-10 — Stripe `created` of the first event
const CUS_LT = "cus_test_fixture_lt";
const CUS_DE = "cus_test_fixture_de";
const ORG = "00000000-0000-4000-8000-0000000000a1";
const OWNER = "00000000-0000-4000-8000-0000000000b1";
// Stripe's documented test VAT ids (sandbox only): 000000000 → verified,
// 111111111 → unverified, 222222222 → unavailable; other valid-format ids stay
// pending first. The values below are format-valid fixtures, not real companies.
const LT_VAT = "LT000000000000";
const DE_VAT = "DE123456789";

let signer: Stripe;
function signed(type: string, object: Json, opts: { id: string; created: number }): { body: string; header: string } {
  const body = JSON.stringify({
    id: opts.id,
    object: "event",
    api_version: API_VERSION,
    created: opts.created,
    data: { object },
    livemode: false,
    pending_webhooks: 1,
    request: { id: null, idempotency_key: null },
    type,
  });
  const header = signer.webhooks.generateTestHeaderString({ payload: body, secret: cfg.webhookSecret });
  return { body, header };
}

function deliver(s: { body: string; header: string }): Promise<Response> {
  return POST(
    new Request("https://staging.invalid/api/billing/webhook", {
      method: "POST",
      body: s.body,
      headers: { "stripe-signature": s.header, "content-type": "application/json" },
    }),
  );
}

const address = (country: string) => ({ city: "Fixture", country, line1: "Fixture st. 1", line2: null, postal_code: "00000", state: null });
const automaticTaxComplete = { enabled: true, liability: { type: "self" }, provider: "stripe", status: "complete" };

/** checkout.session.completed — €1 pilot pass, LT company with a VAT id (webhook payload: no breakdown). */
function pilotSession(id: string): Json {
  return {
    id,
    object: "checkout.session",
    mode: "payment",
    status: "complete",
    payment_status: "paid",
    livemode: false,
    currency: "eur",
    amount_subtotal: 100,
    amount_total: 121,
    automatic_tax: automaticTaxComplete,
    billing_address_collection: "required",
    tax_id_collection: { enabled: true, required: "never" },
    client_reference_id: OWNER,
    customer: CUS_LT,
    customer_creation: null,
    customer_details: {
      address: address("LT"),
      business_name: "Fixture UAB",
      email: "billing@fixture.invalid",
      individual_name: null,
      name: "Fixture UAB",
      phone: null,
      tax_exempt: "none",
      tax_ids: [{ type: "eu_vat", value: LT_VAT }],
    },
    invoice: "in_test_fixture_pilot",
    invoice_creation: { enabled: true, invoice_data: { metadata: { organization_id: ORG } } },
    metadata: { kind: "pilot_pass", organization_id: ORG, owner_id: OWNER, environment: "test", test_mode: "true" },
    payment_intent: "pi_test_fixture_pilot",
    subscription: null,
    total_details: { amount_discount: 0, amount_shipping: 0, amount_tax: 21 },
  };
}

/** The same session as `checkout.sessions.retrieve(id, {expand: ["total_details.breakdown", "invoice"]})` returns it. */
function expandedPilotSession(id: string): Json {
  const s = pilotSession(id);
  return {
    ...s,
    invoice: {
      id: "in_test_fixture_pilot",
      object: "invoice",
      hosted_invoice_url: "https://invoice.stripe.com/i/test_fixture_pilot",
      invoice_pdf: "https://pay.stripe.com/invoice/test_fixture_pilot/pdf",
    },
    total_details: {
      amount_discount: 0,
      amount_shipping: 0,
      amount_tax: 21,
      breakdown: {
        discounts: [],
        taxes: [
          {
            amount: 21,
            rate: {
              id: "txr_test_fixture_lt21",
              object: "tax_rate",
              active: true,
              country: "LT",
              display_name: "VAT",
              inclusive: false,
              jurisdiction: "LT",
              jurisdiction_level: "country",
              livemode: false,
              percentage: 21,
              effective_percentage: 21,
              rate_type: "percentage",
              state: null,
              tax_type: "vat",
            },
            taxability_reason: "standard_rated",
            taxable_amount: 100,
          },
        ],
      },
    },
  };
}

function taxIdObject(customer: string, value: string, status: string, opts: { id?: string; verifiedName?: string | null } = {}): Json {
  return {
    id: opts.id ?? `txi_test_${customer}`,
    object: "tax_id",
    country: value.slice(0, 2),
    created: T0 - 600,
    customer,
    livemode: false,
    owner: { customer, type: "customer" },
    type: "eu_vat",
    value,
    verification: {
      status,
      verified_address: status === "verified" ? "FIXTURE ADDRESS" : null,
      verified_name: status === "verified" ? (opts.verifiedName ?? "FIXTURE COMPANY") : null,
    },
  };
}

type TaxShape = "total_taxes" | "total_tax_amounts";
/** invoice.paid — €99 Organization subscription invoice (post-Basil, or the legacy tax list). */
function subscriptionInvoice(opts: {
  id: string;
  customer: string;
  country: string;
  vat: string | null;
  tax: number;
  reason: string;
  shape: TaxShape;
}): Json {
  const subtotal = 9900;
  const taxes =
    opts.shape === "total_taxes"
      ? {
          total_taxes: [
            {
              amount: opts.tax,
              tax_behavior: "exclusive",
              tax_rate_details: { tax_rate: `txr_test_fixture_${opts.country.toLowerCase()}` },
              taxability_reason: opts.reason,
              taxable_amount: subtotal,
              type: "tax_rate_details",
            },
          ],
        }
      : {
          total_tax_amounts: [
            {
              amount: opts.tax,
              inclusive: false,
              tax_rate: `txr_test_fixture_${opts.country.toLowerCase()}`,
              taxability_reason: opts.reason,
              taxable_amount: subtotal,
            },
          ],
        };
  return {
    id: opts.id,
    object: "invoice",
    livemode: false,
    status: "paid",
    billing_reason: "subscription_create",
    currency: "eur",
    customer: opts.customer,
    customer_address: address(opts.country),
    customer_name: "Fixture Company",
    customer_tax_exempt: "none",
    customer_tax_ids: opts.vat ? [{ type: "eu_vat", value: opts.vat }] : [],
    automatic_tax: automaticTaxComplete,
    subtotal,
    subtotal_excluding_tax: subtotal,
    total: subtotal + opts.tax,
    total_excluding_tax: subtotal,
    amount_due: subtotal + opts.tax,
    amount_paid: subtotal + opts.tax,
    hosted_invoice_url: `https://invoice.stripe.com/i/${opts.id}`,
    invoice_pdf: `https://pay.stripe.com/invoice/${opts.id}/pdf`,
    metadata: {},
    parent: {
      type: "subscription_details",
      quote_details: null,
      subscription_details: {
        metadata: { plan_key: "company_pilot", organization_id: ORG, owner_id: OWNER },
        subscription: "sub_test_fixture",
      },
    },
    ...taxes,
  };
}

const evidence = () => db.tables.billing_tax_evidence ?? [];
const evidenceFor = (objectId: string) => evidence().find((r) => r.provider_object_id === objectId);
const eventRow = (eventId: string) => (db.tables.payment_webhook_events ?? []).find((r) => r.event_id === eventId);

beforeEach(() => {
  // A fresh TEST signing secret per test, generated here — never a real one.
  cfg.webhookSecret = `whsec_${randomBytes(24).toString("hex")}`;
  cfg.taxOn = true;
  signer = new Stripe(["sk", "test", "fixture_signer"].join("_"), { apiVersion: STRIPE_PINNED_API_VERSION });
  db.tables = {};
  db.absent.clear();
  db.failNextUpdate.clear();
  reads.sessions.clear();
  reads.taxIds.clear();
  reads.calls.length = 0;
  reads.failNext = false;
});
afterEach(() => {
  cfg.taxOn = true;
});

// ─── Signature gate on the real adapter ────────────────────────────────────
describe("signature: the real adapter verifies every delivery", () => {
  it("a delivery signed with another secret is refused before any record or read", async () => {
    const good = signed("checkout.session.completed", pilotSession("cs_test_fixture_sig"), { id: "evt_test_sig", created: T0 });
    const otherSecret = `whsec_${randomBytes(24).toString("hex")}`;
    const forged = signer.webhooks.generateTestHeaderString({ payload: good.body, secret: otherSecret });
    const res = await deliver({ body: good.body, header: forged });
    expect(res.status).toBe(400);
    expect((await res.json()).reason).toBe("invalid_signature");
    expect(db.tables.payment_webhook_events ?? []).toHaveLength(0);
    expect(reads.calls).toHaveLength(0);
  });

  it("a tampered body is refused (the amount cannot be edited in transit)", async () => {
    const good = signed("checkout.session.completed", pilotSession("cs_test_fixture_tamper"), { id: "evt_test_tamper", created: T0 });
    const res = await deliver({ body: good.body.replace('"amount_total":121', '"amount_total":100'), header: good.header });
    expect(res.status).toBe(400);
    expect(evidence()).toHaveLength(0);
  });
});

// ─── checkout.session.completed ────────────────────────────────────────────
describe("checkout.session.completed (pilot pass, automatic_tax complete, VAT id collected)", () => {
  it("LT B2B 21%: breakdown read with expand, VAT id verified → evidence row without review", async () => {
    reads.sessions.set("cs_test_fixture_lt", expandedPilotSession("cs_test_fixture_lt"));
    reads.taxIds.set(CUS_LT, [taxIdObject(CUS_LT, "LT 000 000 000 000", "verified", { verifiedName: "FIXTURE UAB" })]);
    const res = await deliver(signed("checkout.session.completed", pilotSession("cs_test_fixture_lt"), { id: "evt_test_cs_lt", created: T0 }));

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, processed: true, result: "ok" });
    expect(reads.calls).toEqual([
      { kind: "session", id: "cs_test_fixture_lt", params: { expand: ["total_details.breakdown", "invoice"] } },
      { kind: "taxIds", id: CUS_LT, params: { limit: 100 } },
    ]);
    const row = evidenceFor("cs_test_fixture_lt");
    expect(row).toMatchObject({
      object_kind: "checkout_session",
      provider_customer_id: CUS_LT,
      organization_id: ORG,
      owner_id: OWNER,
      test_mode: true,
      customer_business_name: "Fixture UAB",
      billing_country: "LT",
      tax_id_type: "eu_vat",
      tax_id_value: LT_VAT,
      tax_id_verification_status: "verified",
      tax_id_verified_name: "FIXTURE UAB",
      automatic_tax_requested: true,
      automatic_tax_status: "complete",
      amount_subtotal: 100,
      amount_tax: 21,
      amount_total: 121,
      currency: "eur",
      reverse_charge: false,
      invoice_id: "in_test_fixture_pilot",
      invoice_url: "https://invoice.stripe.com/i/test_fixture_pilot",
      review_required: false,
      review_reason: null,
      last_event_id: "evt_test_cs_lt",
      last_event_created_at: new Date(T0 * 1000).toISOString(),
    });
    expect(row?.taxes).toEqual([
      { rate: 21, jurisdiction: "LT", taxabilityReason: "standard_rated", amount: 21, taxableAmount: 100 },
    ]);
    expect(eventRow("evt_test_cs_lt")).toMatchObject({ event_type: "checkout.session.completed", test_mode: true, processed: true });
  });

  it("LT B2B with the VAT id still pending: 21% was charged, so no review (pending matters only for zero tax)", async () => {
    reads.sessions.set("cs_test_fixture_ltp", expandedPilotSession("cs_test_fixture_ltp"));
    reads.taxIds.set(CUS_LT, [taxIdObject(CUS_LT, LT_VAT, "pending")]);
    await deliver(signed("checkout.session.completed", pilotSession("cs_test_fixture_ltp"), { id: "evt_test_cs_ltp", created: T0 }));
    expect(evidenceFor("cs_test_fixture_ltp")).toMatchObject({ tax_id_verification_status: "pending", review_required: false });
  });

  it("a failed Stripe read never blocks the payment: payload-only evidence, status unknown, routed to review", async () => {
    reads.failNext = true;
    const res = await deliver(signed("checkout.session.completed", pilotSession("cs_test_fixture_readfail"), { id: "evt_test_cs_rf", created: T0 }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ processed: true, result: "ok" });
    const row = evidenceFor("cs_test_fixture_readfail");
    expect(row).toMatchObject({
      amount_tax: 21,
      taxes: null,
      tax_id_verification_status: "unknown",
      review_required: true,
      review_reason: "no_tax_breakdown",
    });
    expect(eventRow("evt_test_cs_rf")?.processed).toBe(true);
  });

  it("switch OFF: the payment is processed exactly as before — no Stripe read, no evidence row", async () => {
    cfg.taxOn = false;
    reads.sessions.set("cs_test_fixture_off", expandedPilotSession("cs_test_fixture_off"));
    const res = await deliver(signed("checkout.session.completed", pilotSession("cs_test_fixture_off"), { id: "evt_test_cs_off", created: T0 }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ processed: true, result: "ok" });
    expect(reads.calls).toHaveLength(0);
    expect(evidence()).toHaveLength(0);
  });

  it("evidence table not applied yet (42P01): the payment is still acknowledged and closed", async () => {
    db.absent.add("billing_tax_evidence");
    reads.sessions.set("cs_test_fixture_nomig", expandedPilotSession("cs_test_fixture_nomig"));
    const res = await deliver(signed("checkout.session.completed", pilotSession("cs_test_fixture_nomig"), { id: "evt_test_cs_nomig", created: T0 }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ processed: true, result: "ok" });
    expect(eventRow("evt_test_cs_nomig")?.processed).toBe(true);
  });
});

// ─── invoice.paid in both tax-list shapes ──────────────────────────────────
describe.each<TaxShape>(["total_taxes", "total_tax_amounts"])("invoice.paid — %s shape", (shape) => {
  it("LT 21% standard_rated → amount, derived rate, LT jurisdiction, no review", async () => {
    const id = `in_test_fixture_lt_${shape}`;
    reads.taxIds.set(CUS_LT, [taxIdObject(CUS_LT, LT_VAT, "verified")]);
    const res = await deliver(
      signed("invoice.paid", subscriptionInvoice({ id, customer: CUS_LT, country: "LT", vat: LT_VAT, tax: 2079, reason: "standard_rated", shape }), {
        id: `evt_test_inv_lt_${shape}`,
        created: T0 + 10,
      }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ processed: true, result: "ok" });
    // An invoice is read for the VAT id only — its taxes come in the signed payload.
    expect(reads.calls.map((c) => c.kind)).toEqual(["taxIds"]);
    const row = evidenceFor(id);
    expect(row).toMatchObject({
      object_kind: "invoice",
      organization_id: ORG,
      owner_id: OWNER,
      billing_country: "LT",
      amount_subtotal: 9900,
      amount_tax: 2079,
      amount_total: 11979,
      reverse_charge: false,
      tax_id_verification_status: "verified",
      invoice_id: id,
      invoice_url: `https://invoice.stripe.com/i/${id}`,
      review_required: false,
      review_reason: null,
    });
    expect(row?.taxes).toEqual([
      { rate: 21, jurisdiction: "LT", taxabilityReason: "standard_rated", amount: 2079, taxableAmount: 9900 },
    ]);
  });

  it("DE B2B reverse_charge 0 with the VAT id pending → reverse_charge recorded, held for review", async () => {
    const id = `in_test_fixture_de_${shape}`;
    reads.taxIds.set(CUS_DE, [taxIdObject(CUS_DE, DE_VAT, "pending")]);
    const res = await deliver(
      signed("invoice.paid", subscriptionInvoice({ id, customer: CUS_DE, country: "DE", vat: DE_VAT, tax: 0, reason: "reverse_charge", shape }), {
        id: `evt_test_inv_de_${shape}`,
        created: T0 + 20,
      }),
    );
    expect(res.status).toBe(200);
    const row = evidenceFor(id);
    expect(row).toMatchObject({
      billing_country: "DE",
      amount_tax: 0,
      amount_total: 9900,
      reverse_charge: true,
      tax_id_value: DE_VAT,
      tax_id_verification_status: "pending",
      review_required: true,
      review_reason: "foreign_b2b_zero_tax_vat_id_pending",
    });
    expect(row?.taxes).toEqual([
      { rate: 0, jurisdiction: "DE", taxabilityReason: "reverse_charge", amount: 0, taxableAmount: 9900 },
    ]);
  });
});

describe("invoice.finalized / invoice.payment_succeeded", () => {
  it("invoice.finalized is acknowledged and ignored: evidence is captured when the invoice is PAID", async () => {
    const inv = subscriptionInvoice({ id: "in_test_fixture_fin", customer: CUS_LT, country: "LT", vat: LT_VAT, tax: 2079, reason: "standard_rated", shape: "total_taxes" });
    const res = await deliver(signed("invoice.finalized", { ...inv, status: "open", amount_paid: 0 }, { id: "evt_test_inv_fin", created: T0 }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ignored: true });
    expect(evidence()).toHaveLength(0);
    expect(reads.calls).toHaveLength(0);
    expect(eventRow("evt_test_inv_fin")?.processed).toBe(true);
  });

  it("invoice.paid + invoice.payment_succeeded for the same invoice → ONE evidence row", async () => {
    reads.taxIds.set(CUS_LT, [taxIdObject(CUS_LT, LT_VAT, "verified")]);
    const inv = subscriptionInvoice({ id: "in_test_fixture_pair", customer: CUS_LT, country: "LT", vat: LT_VAT, tax: 2079, reason: "standard_rated", shape: "total_taxes" });
    await deliver(signed("invoice.paid", inv, { id: "evt_test_pair_paid", created: T0 + 30 }));
    await deliver(signed("invoice.payment_succeeded", inv, { id: "evt_test_pair_succ", created: T0 + 30 }));
    expect(evidence().filter((r) => r.provider_object_id === "in_test_fixture_pair")).toHaveLength(1);
    expect(evidenceFor("in_test_fixture_pair")).toMatchObject({ review_required: false, last_event_id: "evt_test_pair_succ" });
  });
});

// ─── customer.tax_id.updated ───────────────────────────────────────────────
describe("customer.tax_id.updated", () => {
  async function seedPendingDe(): Promise<void> {
    reads.taxIds.set(CUS_DE, [taxIdObject(CUS_DE, DE_VAT, "pending")]);
    await deliver(
      signed("invoice.paid", subscriptionInvoice({ id: "in_test_fixture_de_v", customer: CUS_DE, country: "DE", vat: DE_VAT, tax: 0, reason: "reverse_charge", shape: "total_taxes" }), {
        id: "evt_test_de_seed",
        created: T0,
      }),
    );
    expect(evidenceFor("in_test_fixture_de_v")).toMatchObject({ review_required: true, review_reason: "foreign_b2b_zero_tax_vat_id_pending" });
  }

  it("pending → verified clears the flag automatically and records the verified name", async () => {
    await seedPendingDe();
    const res = await deliver(
      signed("customer.tax_id.updated", taxIdObject(CUS_DE, "de 123 456 789", "verified", { verifiedName: "FIXTURE GMBH" }), { id: "evt_test_txi_ver", created: T0 + 100 }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ processed: true, result: "ok" });
    expect(evidenceFor("in_test_fixture_de_v")).toMatchObject({
      tax_id_verification_status: "verified",
      tax_id_verified_name: "FIXTURE GMBH",
      tax_id_verification_event_at: new Date((T0 + 100) * 1000).toISOString(),
      review_required: false,
      review_reason: null,
      reverse_charge: true,
      amount_tax: 0,
    });
  });

  it.each([
    ["unverified", "foreign_b2b_zero_tax_vat_id_unverified"],
    ["unavailable", "foreign_b2b_zero_tax_vat_id_unavailable"],
  ])("pending → %s keeps the row in review with reason %s", async (status, reason) => {
    await seedPendingDe();
    const res = await deliver(signed("customer.tax_id.updated", taxIdObject(CUS_DE, DE_VAT, status), { id: `evt_test_txi_${status}`, created: T0 + 100 }));
    expect(res.status).toBe(200);
    expect(evidenceFor("in_test_fixture_de_v")).toMatchObject({
      tax_id_verification_status: status,
      tax_id_verified_name: null,
      review_required: true,
      review_reason: reason,
    });
  });

  it("an OLDER pending delivery arriving after verified does not undo the verification", async () => {
    await seedPendingDe();
    await deliver(signed("customer.tax_id.updated", taxIdObject(CUS_DE, DE_VAT, "verified"), { id: "evt_test_txi_new", created: T0 + 200 }));
    const res = await deliver(signed("customer.tax_id.updated", taxIdObject(CUS_DE, DE_VAT, "pending"), { id: "evt_test_txi_old", created: T0 + 150 }));
    expect(res.status).toBe(200);
    expect(evidenceFor("in_test_fixture_de_v")).toMatchObject({ tax_id_verification_status: "verified", review_required: false });
  });

  it("a VAT id with no evidence row is a no-op (and works with the switch OFF)", async () => {
    cfg.taxOn = false;
    const res = await deliver(signed("customer.tax_id.updated", taxIdObject("cus_test_fixture_none", DE_VAT, "verified"), { id: "evt_test_txi_none", created: T0 }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ processed: true, result: "ok" });
    expect(evidence()).toHaveLength(0);
  });
});

// ─── Replay / retry ────────────────────────────────────────────────────────
describe("replay and retry", () => {
  it("the SAME signed delivery twice → second is a duplicate: no second read, no second write", async () => {
    reads.sessions.set("cs_test_fixture_replay", expandedPilotSession("cs_test_fixture_replay"));
    reads.taxIds.set(CUS_LT, [taxIdObject(CUS_LT, LT_VAT, "verified")]);
    const delivery = signed("checkout.session.completed", pilotSession("cs_test_fixture_replay"), { id: "evt_test_replay", created: T0 });

    const first = await deliver(delivery);
    expect(first.status).toBe(200);
    const before = structuredClone(evidenceFor("cs_test_fixture_replay"));
    const readsAfterFirst = reads.calls.length;

    const second = await deliver(delivery);
    expect(second.status).toBe(200);
    expect(await second.json()).toMatchObject({ ok: true, duplicate: true });
    expect(reads.calls).toHaveLength(readsAfterFirst);
    expect(evidence()).toHaveLength(1);
    expect(evidenceFor("cs_test_fixture_replay")).toEqual(before);
    expect(db.tables.payment_webhook_events).toHaveLength(1);
  });

  it("a replayed tax_id.updated (same event id) is not re-applied", async () => {
    reads.taxIds.set(CUS_DE, [taxIdObject(CUS_DE, DE_VAT, "pending")]);
    await deliver(
      signed("invoice.paid", subscriptionInvoice({ id: "in_test_fixture_de_r", customer: CUS_DE, country: "DE", vat: DE_VAT, tax: 0, reason: "reverse_charge", shape: "total_taxes" }), {
        id: "evt_test_de_r",
        created: T0,
      }),
    );
    const upd = signed("customer.tax_id.updated", taxIdObject(CUS_DE, DE_VAT, "verified"), { id: "evt_test_txi_r", created: T0 + 100 });
    await deliver(upd);
    const before = structuredClone(evidenceFor("in_test_fixture_de_r"));
    expect(before).toMatchObject({ tax_id_verification_status: "verified", review_required: false });
    const again = await deliver(upd);
    expect(await again.json()).toMatchObject({ duplicate: true });
    expect(evidenceFor("in_test_fixture_de_r")).toEqual(before);
  });

  it("an evidence WRITE failure keeps the event open (500) and Stripe's retry completes it", async () => {
    reads.taxIds.set(CUS_LT, [taxIdObject(CUS_LT, LT_VAT, "verified")]);
    const inv = subscriptionInvoice({ id: "in_test_fixture_retry", customer: CUS_LT, country: "LT", vat: LT_VAT, tax: 2079, reason: "standard_rated", shape: "total_taxes" });
    const delivery = signed("invoice.paid", inv, { id: "evt_test_retry", created: T0 });
    // First delivery: the row exists from an earlier event, and its update fails.
    await deliver(signed("invoice.payment_succeeded", inv, { id: "evt_test_retry_seed", created: T0 - 5 }));
    db.failNextUpdate.add("billing_tax_evidence");

    const failed = await deliver(delivery);
    expect(failed.status).toBe(500);
    expect(await failed.json()).toMatchObject({ processed: false, reason: "tax-evidence-error" });
    expect(eventRow("evt_test_retry")).toMatchObject({ processed: false, error: "tax-evidence-error" });

    const retried = await deliver(delivery);
    expect(retried.status).toBe(200);
    expect(await retried.json()).toMatchObject({ processed: true, result: "ok" });
    expect(eventRow("evt_test_retry")).toMatchObject({ processed: true, error: null });
    expect(evidenceFor("in_test_fixture_retry")).toMatchObject({ last_event_id: "evt_test_retry", review_required: false });
  });

  it("an OLDER invoice event after a newer one is acknowledged but does not overwrite the evidence", async () => {
    reads.taxIds.set(CUS_LT, [taxIdObject(CUS_LT, LT_VAT, "verified")]);
    const inv = subscriptionInvoice({ id: "in_test_fixture_order", customer: CUS_LT, country: "LT", vat: LT_VAT, tax: 2079, reason: "standard_rated", shape: "total_taxes" });
    await deliver(signed("invoice.paid", inv, { id: "evt_test_order_new", created: T0 + 50 }));
    const res = await deliver(signed("invoice.payment_succeeded", inv, { id: "evt_test_order_old", created: T0 + 40 }));
    expect(res.status).toBe(200);
    expect(evidenceFor("in_test_fixture_order")).toMatchObject({ last_event_id: "evt_test_order_new" });
  });
});
