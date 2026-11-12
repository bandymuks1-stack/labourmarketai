/**
 * TEST-MODE CHAIN — checkout → signed webhook → entitlement, end to end,
 * offline (owner order 2026-10-21: "Prove the test-mode checkout → webhook →
 * entitlement path end to end").
 *
 * Production cannot be walked from a sandbox, so this is the strongest offline
 * proof: the REAL modules are chained, and only the I/O edges are faked.
 *
 * REAL (run unmocked, in this file):
 *   - lib/env.ts                          (parses the test-shaped env below)
 *   - lib/billing/config-core.ts + config.ts   (resolver + pilot gate)
 *   - app/api/billing/test-checkout/route.ts
 *   - lib/billing/checkout-core.ts, plans.ts, prices.ts, metadata-core.ts,
 *     trial-core.ts, checkout-operations-core.ts
 *   - lib/billing/billing-subject.ts + lib/company/role-capabilities.ts
 *   - lib/billing/checkout-admission.ts, customer-store.ts,
 *     checkout-operations-store.ts, subscription-store.ts
 *   - lib/billing/provider.ts + providers/stripe-test.ts (the real adapter,
 *     including constructWebhookEvent → stripe.webhooks.constructEvent, i.e.
 *     the real signature verification with the env webhook secret)
 *   - app/api/billing/webhook/route.ts, webhook-core.ts,
 *     apply-subscription-snapshot.ts, billing-funnel.ts
 *   - lib/billing/effective-entitlements.ts → entitlements-v1.ts
 *     (resolveEntitlements, entitlementAllows) + entitlements.ts (limitFor)
 *   - lib/auth/superadmin.ts (admin signal read against the in-memory rows)
 *   - the Stripe SDK itself: signing (webhooks.generateTestHeaderString) and
 *     verification (webhooks.constructEvent) are the real SDK code.
 *
 * FAKED EDGES (and only these):
 *   - "@/lib/supabase/server" and "@/lib/supabase/admin": ONE in-memory
 *     PostgREST-shaped store (below) that models the billing tables' unique
 *     constraints, partial unique indexes and the origin-organization trigger
 *     from supabase/migrations (20260613200000, 20260806220000,
 *     20260905200000). RLS is NOT modelled — both clients see every row.
 *   - "stripe": the REAL SDK class, wrapped so that each instance's NETWORK
 *     methods (checkout.sessions.create, customers.create, prices.retrieve)
 *     are recording stubs; every other network method throws. Webhook
 *     signing / verification on the same instance is untouched.
 *   - "@/lib/company/employer-company-context": the workspace → organization
 *     → governance-role chain reads the httpOnly workspace cookie
 *     (next/headers) and company_memberships; it is replaced by a stub that
 *     answers "this user is OWNER of <org>". billing-subject.ts, which turns
 *     that into a billing subject + manage-billing authority, stays real.
 *   - "@/lib/telemetry/server-funnel": fire-and-forget telemetry (next/headers
 *     + a DB write) — recorded, not sent.
 *
 * No network, no Stripe account, no keys beyond throwaway sk_test_/whsec_
 * strings, no production data.
 */
import { afterAll, describe, expect, it, vi } from "vitest";

// ─── Test-shaped env (set BEFORE lib/env.ts parses process.env) ───────────────
const ids = vi.hoisted(() => {
  const PILOT_ORG = "0a1b2c3d-0000-4000-8000-000000000001";
  // A second pilot organization that holds only a LIVE-mode (test_mode=false)
  // row — proves the entitlement read is scoped to the adapter's mode.
  const PILOT_ORG_LIVE_ROW = "0a1b2c3d-0000-4000-8000-000000000002";
  const NON_PILOT_ORG = "0a1b2c3d-0000-4000-8000-000000000003";
  const OWNER = "0f0f0f0f-0000-4000-8000-0000000000aa";
  const PRICE = "price_test_org_server_slot";
  const SECRET = "sk_test_offline_chain_proof";
  const WHSEC = "whsec_offline_chain_proof";
  vi.stubEnv("PAYMENTS_ENABLED", "true");
  vi.stubEnv("BILLING_PROVIDER", "stripe");
  vi.stubEnv("STRIPE_MODE", "test");
  vi.stubEnv("STRIPE_SECRET_KEY", SECRET);
  vi.stubEnv("STRIPE_WEBHOOK_SECRET", WHSEC);
  vi.stubEnv("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY", "pk_test_offline_chain_proof");
  vi.stubEnv("STRIPE_LIVE_ACTIVATION", "");
  vi.stubEnv("STRIPE_PRICE_COMPANY_PILOT", PRICE);
  vi.stubEnv("BILLING_PILOT_ORGANIZATION_IDS", `${PILOT_ORG},${PILOT_ORG_LIVE_ROW}`);
  return { PILOT_ORG, PILOT_ORG_LIVE_ROW, NON_PILOT_ORG, OWNER, PRICE, SECRET, WHSEC };
});

afterAll(() => {
  vi.unstubAllEnvs();
});

// ─── In-memory PostgREST-shaped store (the DB edge) ──────────────────────────
type Row = Record<string, unknown>;
interface Unique {
  cols: string[];
  where?: (r: Row) => boolean;
}

const db = vi.hoisted(() => {
  const tables: Record<string, Row[]> = {
    profiles: [],
    profile_roles: [],
    billing_customers: [],
    billing_subscriptions: [],
    payment_webhook_events: [],
    billing_checkout_operations: [],
  };
  const unknownTables: string[] = [];
  let seq = 0;
  return { tables, unknownTables, nextId: () => `00000000-0000-4000-9000-${String(++seq).padStart(12, "0")}` };
});

const UNIQUES: Record<string, Unique[]> = {
  // 20260613200000 + 20260905200000 (owner, provider, MODE)
  billing_customers: [
    { cols: ["provider", "provider_customer_id"] },
    { cols: ["owner_id", "provider", "test_mode"] },
  ],
  // 20260613200000 + 20260806220000 (partial per-subject indexes)
  billing_subscriptions: [
    { cols: ["provider", "provider_subscription_id"] },
    { cols: ["owner_id", "plan_key", "provider"], where: (r) => r.origin_organization_id == null },
    { cols: ["organization_id", "plan_key", "provider"], where: (r) => r.organization_id != null },
  ],
  payment_webhook_events: [{ cols: ["provider", "event_id"] }],
  // 20260905200000
  billing_checkout_operations: [
    { cols: ["idempotency_key"] },
    { cols: ["scope_key", "plan_key", "provider"], where: (r) => r.status === "open" },
    { cols: ["provider", "provider_session_id"], where: (r) => r.provider_session_id != null },
  ],
};

const DEFAULTS: Record<string, () => Row> = {
  billing_customers: () => ({ provider: "stripe", test_mode: true }),
  billing_subscriptions: () => ({
    provider: "stripe", status: "none", cancel_at_period_end: false, test_mode: true,
    organization_id: null, origin_organization_id: null, last_payment_status: null,
    last_event_id: null, last_event_created_at: null,
  }),
  payment_webhook_events: () => ({
    provider: "stripe", test_mode: true, payload: {}, processed: false, processed_at: null, error: null,
  }),
  billing_checkout_operations: () => ({
    provider: "stripe", status: "open", test_mode: true, source: "web",
    provider_session_id: null, provider_subscription_id: null, completed_at: null, failure_reason: null,
  }),
};

/** 20260806220000 trigger: origin_organization_id captures organization_id. */
function applyTriggers(table: string, row: Row): void {
  if (table === "billing_subscriptions" && row.organization_id != null && row.origin_organization_id == null) {
    row.origin_organization_id = row.organization_id;
  }
}

function violates(table: string, candidate: Row, self: Row | null): boolean {
  for (const u of UNIQUES[table] ?? []) {
    if (u.where && !u.where(candidate)) continue;
    if (u.cols.some((c) => candidate[c] == null)) continue; // NULLs are distinct
    const clash = db.tables[table].some(
      (r) => r !== self && (!u.where || u.where(r)) && u.cols.every((c) => r[c] === candidate[c]),
    );
    if (clash) return true;
  }
  return false;
}

type Filter = (r: Row) => boolean;
const UNIQUE_VIOLATION = { code: "23505", message: "duplicate key value violates unique constraint" };

function fakeQuery(table: string) {
  const filters: Filter[] = [];
  let op: "select" | "insert" | "update" | "upsert" = "select";
  let columns: string[] | null = null;
  let payload: Row | Row[] | null = null;
  let onConflict: string[] = [];
  let ordering: { col: string; asc: boolean } | null = null;
  let limit: number | null = null;
  let single: "maybe" | "one" | null = null;

  const project = (r: Row): Row =>
    columns ? Object.fromEntries(columns.map((c) => [c, r[c] ?? null])) : { ...r };

  function run(): { data: unknown; error: unknown } {
    const rows = db.tables[table];
    if (!rows) {
      db.unknownTables.push(table);
      return { data: null, error: { code: "42P01", message: `relation "${table}" does not exist` } };
    }
    const now = new Date().toISOString();
    if (op === "insert") {
      const list = Array.isArray(payload) ? payload : [payload as Row];
      const fresh: Row[] = [];
      for (const p of list) {
        const row: Row = { id: db.nextId(), created_at: now, updated_at: now, ...(DEFAULTS[table]?.() ?? {}), ...p };
        applyTriggers(table, row);
        if (violates(table, row, null)) return { data: null, error: UNIQUE_VIOLATION };
        rows.push(row);
        fresh.push(row);
      }
      return { data: null, error: null };
    }
    if (op === "upsert") {
      const p = payload as Row;
      const existing = rows.find((r) => onConflict.every((c) => r[c] != null && r[c] === p[c]));
      if (!existing) {
        op = "insert";
        return run();
      }
      const merged: Row = { ...existing, ...p };
      applyTriggers(table, merged);
      if (violates(table, merged, existing)) return { data: null, error: UNIQUE_VIOLATION };
      Object.assign(existing, merged);
      return { data: null, error: null };
    }
    const matched = rows.filter((r) => filters.every((f) => f(r)));
    if (op === "update") {
      const next = matched.map((r) => {
        const m = { ...r, ...(payload as Row) };
        applyTriggers(table, m);
        return m;
      });
      if (next.some((m, i) => violates(table, m, matched[i]))) return { data: null, error: UNIQUE_VIOLATION };
      matched.forEach((r, i) => Object.assign(r, next[i]));
      return { data: null, error: null };
    }
    let out = matched;
    if (ordering) {
      const { col, asc } = ordering;
      out = [...out].sort((a, b) => (String(a[col]) < String(b[col]) ? -1 : String(a[col]) > String(b[col]) ? 1 : 0) * (asc ? 1 : -1));
    }
    if (limit !== null) out = out.slice(0, limit);
    if (single) {
      if (out.length > 1) return { data: null, error: { code: "PGRST116", message: "multiple rows" } };
      if (out.length === 0) {
        return single === "one" ? { data: null, error: { code: "PGRST116", message: "no rows" } } : { data: null, error: null };
      }
      return { data: project(out[0]), error: null };
    }
    return { data: out.map(project), error: null };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const q: any = {
    select(cols?: string) {
      if (op === "select") {
        columns = !cols || cols.trim() === "*" ? null : cols.split(",").map((c) => c.trim());
      }
      return q;
    },
    insert(p: Row | Row[]) { op = "insert"; payload = p; return q; },
    update(p: Row) { op = "update"; payload = p; return q; },
    upsert(p: Row, opts?: { onConflict?: string }) {
      op = "upsert"; payload = p;
      onConflict = (opts?.onConflict ?? "id").split(",").map((c) => c.trim());
      return q;
    },
    eq(c: string, v: unknown) { filters.push((r) => r[c] === v); return q; },
    neq(c: string, v: unknown) { filters.push((r) => r[c] !== v); return q; },
    is(c: string, v: unknown) { filters.push((r) => (v === null ? r[c] == null : r[c] === v)); return q; },
    in(c: string, vs: unknown[]) { filters.push((r) => vs.includes(r[c])); return q; },
    lt(c: string, v: string) { filters.push((r) => String(r[c]) < v); return q; },
    gte(c: string, v: string) { filters.push((r) => String(r[c]) >= v); return q; },
    order(col: string, opts?: { ascending?: boolean }) { ordering = { col, asc: opts?.ascending !== false }; return q; },
    limit(n: number) { limit = n; return q; },
    maybeSingle() { single = "maybe"; return q; },
    single() { single = "one"; return q; },
    then(ok: (v: unknown) => unknown, err?: (e: unknown) => unknown) {
      return Promise.resolve().then(run).then(ok, err);
    },
  };
  return q;
}

const session = vi.hoisted(() => ({
  user: null as { id: string; email: string } | null,
  /** The organization the stubbed workspace chain resolves (owner role). */
  activeOrg: null as string | null,
}));

function fakeClient() {
  return {
    auth: { getUser: async () => ({ data: { user: session.user }, error: null }) },
    from: (table: string) => fakeQuery(table),
  };
}

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn(async () => fakeClient()) }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn(() => fakeClient()) }));

vi.mock("@/lib/company/employer-company-context", () => ({
  resolveEmployerCompanyContext: vi.fn(async () =>
    session.activeOrg
      ? { kind: "ok", companyId: "company-of-" + session.activeOrg, organizationId: session.activeOrg, organizationName: "Org", role: "owner", isCreator: true }
      : { kind: "unavailable", reason: "personal-workspace", activeWorkspaceName: null },
  ),
}));

const funnel = vi.hoisted(() => ({ events: [] as string[] }));
vi.mock("@/lib/telemetry/server-funnel", () => ({
  emitServerFunnelEvent: vi.fn((name: string) => {
    funnel.events.push(name);
  }),
}));

// ─── The Stripe SDK edge: real class, network methods stubbed per instance ──
const stripeNet = vi.hoisted(() => ({
  checkoutCreate: [] as Array<{ params: Record<string, unknown>; options: Record<string, unknown> | undefined }>,
  customersCreate: [] as Array<{ params: Record<string, unknown>; options: Record<string, unknown> | undefined }>,
  pricesRetrieve: [] as string[],
  unexpected: [] as string[],
  sessionSeq: 0,
}));

vi.mock("stripe", async (importOriginal) => {
  const mod = (await importOriginal()) as { default: new (...a: unknown[]) => Record<string, unknown> };
  const Real = mod.default;
  const Wrapped = new Proxy(Real, {
    construct(target, args) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const s: any = Reflect.construct(target, args);
      s.checkout.sessions.create = async (params: Record<string, unknown>, options?: Record<string, unknown>) => {
        stripeNet.checkoutCreate.push({ params, options });
        const id = `cs_test_chain_${++stripeNet.sessionSeq}`;
        return { id, object: "checkout.session", url: `https://checkout.stripe.com/c/pay/${id}`, livemode: false };
      };
      s.customers.create = async (params: Record<string, unknown>, options?: Record<string, unknown>) => {
        stripeNet.customersCreate.push({ params, options });
        return { id: "cus_test_chain_owner", object: "customer", livemode: false };
      };
      s.prices.retrieve = async (id: string) => {
        stripeNet.pricesRetrieve.push(id);
        return { id, object: "price", unit_amount: 9900, currency: "eur", recurring: { interval: "month" }, livemode: false };
      };
      const refuse = (name: string) => async () => {
        stripeNet.unexpected.push(name);
        throw new Error(`unexpected Stripe network call: ${name}`);
      };
      s.subscriptions.retrieve = refuse("subscriptions.retrieve");
      s.subscriptions.list = refuse("subscriptions.list");
      s.billingPortal.sessions.create = refuse("billingPortal.sessions.create");
      return s;
    },
  });
  return { ...mod, default: Wrapped };
});

// ─── Imports (after every vi.mock) ───────────────────────────────────────────
import Stripe from "stripe";
import { resolveBillingConfig } from "@/lib/billing/config-core";
import { getBillingConfig, getBillingConfigFor, billingPilotActive } from "@/lib/billing/config";
import { STRIPE_PINNED_API_VERSION } from "@/lib/billing/providers/stripe-test";
import { eventModeMatches } from "@/lib/billing/webhook-core";
import { getEffectiveEntitlements } from "@/lib/billing/effective-entitlements";
import { entitlementAllows } from "@/lib/billing/entitlements-v1";
import { limitFor } from "@/lib/billing/entitlements";
import { ACTIVE_OPEN_NEED_STATUSES, gateOpenNeeds } from "@/lib/billing/open-needs-gate";
import { TRIAL_PERIOD_DAYS } from "@/lib/billing/trial-core";
import { PRE_PAYMENT_PLANS, type FeatureKey } from "@/lib/billing/plans";
import { planIncludes } from "@/lib/billing/entitlements";
import { getPlan, ORGANIZATION_PLAN_KEY, FREE_ORGANIZATION_PLAN_KEY } from "@/lib/billing/plans";
import { FUNNEL_EVENTS } from "@/lib/telemetry/funnel-events";
import { POST as checkoutPOST } from "@/app/api/billing/test-checkout/route";
import { POST as webhookPOST } from "@/app/api/billing/webhook/route";

// The real SDK signs with the SAME secret the env carries — exactly how Stripe
// signs a delivery to the endpoint.
const signer = new Stripe(ids.SECRET, { apiVersion: STRIPE_PINNED_API_VERSION });

function signedDelivery(event: Record<string, unknown>, secret: string = ids.WHSEC): Request {
  const body = JSON.stringify(event);
  const header = signer.webhooks.generateTestHeaderString({ payload: body, secret });
  return new Request("http://localhost/api/billing/webhook", {
    method: "POST",
    headers: { "content-type": "application/json", "stripe-signature": header },
    body,
  });
}

function postCheckout(planKey: string): Promise<Response> {
  return checkoutPOST(new Request("http://localhost/api/billing/test-checkout", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ planKey }),
  }));
}

function signIn(orgId: string | null): void {
  session.user = { id: ids.OWNER, email: "owner@pilot.test" };
  session.activeOrg = orgId;
}

// Seed: the owner (legacy `company` role row, not an admin) and a LIVE-mode
// subscription row for the second pilot organization.
db.tables.profiles.push({ id: ids.OWNER, active_role: "company" });
db.tables.profile_roles.push({ profile_id: ids.OWNER, role: "company" });
db.tables.billing_subscriptions.push({
  id: "seed-live-row", owner_id: ids.OWNER, plan_key: ORGANIZATION_PLAN_KEY, provider: "stripe",
  provider_subscription_id: "sub_live_mode_seed", provider_customer_id: "cus_live_seed",
  status: "active", test_mode: false, organization_id: ids.PILOT_ORG_LIVE_ROW,
  origin_organization_id: ids.PILOT_ORG_LIVE_ROW, cancel_at_period_end: false,
  updated_at: new Date().toISOString(), created_at: new Date().toISOString(),
});

const testRows = (table: string) => db.tables[table].filter((r) => r.test_mode === true);
const ourSubs = () => db.tables.billing_subscriptions.filter((r) => r.organization_id === ids.PILOT_ORG);

// Captured across the ordered steps below.
const chain = {
  sessionId: "",
  checkoutParams: {} as Record<string, unknown>,
  subscriptionId: "sub_test_chain_1",
  customerId: "",
  sessionEvent: {} as Record<string, unknown>,
  subscriptionEvent: {} as Record<string, unknown>,
};

// ─── Lifecycle event builders (steps 6–14) ──────────────────────────────────
let lifeClock = Math.floor(Date.now() / 1000) + 100;

function signedEvent(id: string, type: string, object: Record<string, unknown>): Record<string, unknown> {
  lifeClock += 10;
  return { id, object: "event", type, api_version: STRIPE_PINNED_API_VERSION, created: lifeClock, livemode: false, data: { object } };
}

/** customer.subscription.* for the chain's subscription, with a state override. */
function subEvent(id: string, over: Record<string, unknown>, type = "customer.subscription.updated"): Record<string, unknown> {
  const base = (chain.subscriptionEvent.data as { object: Row }).object;
  return signedEvent(id, type, { ...base, cancel_at_period_end: false, ...over });
}

/** invoice.* in the post-Basil shape (parent.subscription_details.subscription). */
function invoiceEvent(id: string, type: string, over: Record<string, unknown>): Record<string, unknown> {
  return signedEvent(id, type, {
    id: `in_${id}`, object: "invoice", livemode: false, customer: chain.customerId, currency: "eur",
    parent: { type: "subscription_details", subscription_details: { subscription: chain.subscriptionId } },
    ...over,
  });
}

async function deliver(event: Record<string, unknown>): Promise<void> {
  const res = await webhookPOST(signedDelivery(event));
  expect(res.status, String(event.id)).toBe(200);
  expect(await res.json(), String(event.id)).toMatchObject({ ok: true, processed: true });
}

// ─── Plan-access scenarios (owner P0 2026-11-12: FREE / paid / trial) ───────
// The organization's needs live in `customer_requests`. The ONE server gate
// that separates FREE from the paid plan (`gateOpenNeeds`, called by the
// canonical demand creation and reopen paths) is run for real; only its COUNT
// query is answered from this array (the PostgREST `or` / head-count shape is
// a database edge, like every other I/O edge in this file). The billing rows
// it reads are the SAME in-memory rows the webhook wrote.
const needs: Array<{ id: string; organization_id: string; status: string }> = [];
const activeNeeds = (org: string) =>
  needs.filter((n) => n.organization_id === org && (ACTIVE_OPEN_NEED_STATUSES as readonly string[]).includes(n.status));

function gateClient(org: string) {
  const base = fakeClient();
  return {
    ...base,
    from: (table: string) => {
      if (table !== "customer_requests") return base.from(table);
      const result = { count: activeNeeds(org).length, error: null };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const q: any = { select: () => q, in: () => q, or: () => q, then: (ok: (v: unknown) => unknown) => Promise.resolve(result).then(ok) };
      return q;
    },
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const gate = (org: string) => gateOpenNeeds(gateClient(org) as any, org, ids.OWNER);
const addNeeds = (org: string, n: number) => {
  for (let i = 0; i < n; i++) needs.push({ id: `need-${needs.length + 1}`, organization_id: org, status: "submitted" });
};
/** Every feature the organization's effective plan declares, checked through the shared resolver. */
function planFeatures(planKey: string): FeatureKey[] {
  const plan = PRE_PAYMENT_PLANS.find((p) => p.slug === planKey)!;
  return (Object.keys(plan.entitlements) as FeatureKey[]).filter((k) => planIncludes(plan, k));
}

describe("test-mode chain: config → checkout → signed webhook → entitlement (offline, real modules)", () => {
  it("1. config: the real resolver yields stripe_test for test-shaped input, and the env-fed wrapper agrees", () => {
    const direct = resolveBillingConfig({
      paymentsEnabled: "true", provider: "stripe", mode: "test",
      secretKey: ids.SECRET, webhookSecret: ids.WHSEC, publishableKey: "pk_test_offline_chain_proof",
    });
    expect(direct).toMatchObject({ state: "stripe_test", paymentsEnabled: true, testMode: true, mode: "test", reason: "ok" });

    // The server wrapper over the parsed env (lib/env.ts) — no mock in between.
    expect(getBillingConfig()).toMatchObject({ state: "stripe_test", testMode: true, reason: "ok" });
    // Pilot gate (b67aae7): only the listed organizations see the adapter.
    expect(billingPilotActive()).toBe(true);
    expect(getBillingConfigFor(ids.PILOT_ORG)).toMatchObject({ state: "stripe_test", testMode: true });
    expect(getBillingConfigFor(ids.PILOT_ORG.toUpperCase())).toMatchObject({ state: "stripe_test" });
    expect(getBillingConfigFor(ids.NON_PILOT_ORG)).toMatchObject({ state: "disabled", paymentsEnabled: false, reason: "not_in_pilot" });
    expect(getBillingConfigFor(null)).toMatchObject({ state: "disabled", reason: "not_in_pilot" });
  });

  it("before payment the pilot organization is on the FREE plan, enforced (1 open need)", async () => {
    signIn(ids.PILOT_ORG);
    const ctx = await getEffectiveEntitlements();
    expect(ctx).toMatchObject({ effectivePlanKey: FREE_ORGANIZATION_PLAN_KEY, source: "free", enforced: true, active: false });
    expect(limitFor(getPlan(ctx.effectivePlanKey)!, "company_create_needs")).toBe(1);
  });

  it("a NON-pilot organization's owner is refused checkout: no Stripe call, no operation row", async () => {
    signIn(ids.NON_PILOT_ORG);
    const res = await postCheckout(ORGANIZATION_PLAN_KEY);
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ ok: false, reason: "payments_disabled", testMode: false });
    expect(stripeNet.checkoutCreate).toHaveLength(0);
    expect(stripeNet.customersCreate).toHaveLength(0);
    expect(db.tables.billing_checkout_operations).toHaveLength(0);

    // …and its entitlements are not enforced by billing at all (pilot off for it).
    const ctx = await getEffectiveEntitlements();
    expect(ctx).toMatchObject({ enforced: false, source: "billing_disabled", active: false });
  });

  it("2. checkout: the pilot organization's OWNER gets a test session at the SERVER price, and an operation row is opened", async () => {
    signIn(ids.PILOT_ORG);
    const res = await postCheckout(ORGANIZATION_PLAN_KEY);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, testMode: true, reused: false, trialDays: 14 });
    expect(body.url).toMatch(/^https:\/\/checkout\.stripe\.com\/c\/pay\/cs_test_chain_/);

    // Exactly one SDK network call for the session, at the env price slot.
    expect(stripeNet.checkoutCreate).toHaveLength(1);
    const { params, options } = stripeNet.checkoutCreate[0];
    chain.checkoutParams = params;
    expect(params.mode).toBe("subscription");
    expect(params.line_items).toEqual([{ price: ids.PRICE, quantity: 1 }]);
    expect(params.client_reference_id).toBe(ids.OWNER);
    const meta = params.metadata as Record<string, string>;
    expect(meta).toMatchObject({
      plan_key: ORGANIZATION_PLAN_KEY, canonical_plan_key: ORGANIZATION_PLAN_KEY,
      owner_id: ids.OWNER, organization_id: ids.PILOT_ORG, environment: "test", test_mode: "true",
    });
    const subData = params.subscription_data as Record<string, unknown>;
    expect(subData.metadata).toEqual(meta);
    expect(subData.trial_period_days).toBe(14); // first subscription of this org
    expect(stripeNet.pricesRetrieve).toEqual([ids.PRICE]); // trial text reads the billing price

    // The per-payer TEST customer was created once and persisted in test mode.
    expect(stripeNet.customersCreate).toHaveLength(1);
    expect(params.customer).toBe("cus_test_chain_owner");
    expect(db.tables.billing_customers).toEqual([
      expect.objectContaining({ owner_id: ids.OWNER, provider: "stripe", provider_customer_id: "cus_test_chain_owner", test_mode: true }),
    ]);
    chain.customerId = "cus_test_chain_owner";

    // The billing_checkout_operations row: opened for the org scope, at the
    // server price, in test mode; its key IS the Stripe idempotency key, and
    // the session was attached to it.
    expect(db.tables.billing_checkout_operations).toHaveLength(1);
    const op = db.tables.billing_checkout_operations[0];
    expect(op).toMatchObject({
      id: body.operationId, owner_id: ids.OWNER, organization_id: ids.PILOT_ORG,
      scope_key: `organization:${ids.PILOT_ORG}`, plan_key: ORGANIZATION_PLAN_KEY,
      provider_price_id: ids.PRICE, status: "open", test_mode: true, source: "web",
    });
    expect(options).toEqual({ idempotencyKey: op.idempotency_key });
    expect(params.expires_at).toBe(Math.floor(Date.parse(String(op.expires_at)) / 1000));
    chain.sessionId = String(op.provider_session_id);
    expect(chain.sessionId).toMatch(/^cs_test_chain_/);
    expect(funnel.events).toContain(FUNNEL_EVENTS.checkoutStarted);
  });

  it("3. webhook: real-SDK-signed checkout.session.completed + customer.subscription.created are verified and applied", async () => {
    const created = Math.floor(Date.now() / 1000);
    const subMeta = (chain.checkoutParams.subscription_data as Record<string, unknown>).metadata;
    chain.sessionEvent = {
      id: "evt_test_chain_session", object: "event", type: "checkout.session.completed",
      api_version: STRIPE_PINNED_API_VERSION, created, livemode: false,
      data: {
        object: {
          id: chain.sessionId, object: "checkout.session", mode: "subscription", livemode: false,
          status: "complete", payment_status: "no_payment_required",
          client_reference_id: chain.checkoutParams.client_reference_id,
          customer: chain.customerId, subscription: chain.subscriptionId,
          metadata: chain.checkoutParams.metadata,
        },
      },
    };
    chain.subscriptionEvent = {
      id: "evt_test_chain_sub_created", object: "event", type: "customer.subscription.created",
      api_version: STRIPE_PINNED_API_VERSION, created: created + 1, livemode: false,
      data: {
        object: {
          id: chain.subscriptionId, object: "subscription", livemode: false,
          customer: chain.customerId, status: "trialing", cancel_at_period_end: false,
          trial_end: created + 14 * 86400,
          metadata: subMeta,
          items: {
            data: [{
              id: "si_test_chain", price: { id: ids.PRICE, unit_amount: 9900, currency: "eur" },
              current_period_start: created, current_period_end: created + 14 * 86400,
            }],
          },
        },
      },
    };

    const r1 = await webhookPOST(signedDelivery(chain.sessionEvent));
    expect(r1.status).toBe(200);
    expect(await r1.json()).toMatchObject({ ok: true, processed: true, result: "ok" });
    const r2 = await webhookPOST(signedDelivery(chain.subscriptionEvent));
    expect(r2.status).toBe(200);
    expect(await r2.json()).toMatchObject({ ok: true, processed: true, result: "ok" });

    // payment_webhook_events: both recorded, test mode, processed.
    expect(db.tables.payment_webhook_events.map((e) => [e.event_id, e.event_type, e.test_mode, e.processed])).toEqual([
      ["evt_test_chain_session", "checkout.session.completed", true, true],
      ["evt_test_chain_sub_created", "customer.subscription.created", true, true],
    ]);

    // billing_subscriptions: ONE row, bound to the pilot organization, test mode.
    expect(ourSubs()).toHaveLength(1);
    expect(ourSubs()[0]).toMatchObject({
      owner_id: ids.OWNER, plan_key: ORGANIZATION_PLAN_KEY, provider: "stripe",
      provider_subscription_id: chain.subscriptionId, provider_customer_id: chain.customerId,
      organization_id: ids.PILOT_ORG, origin_organization_id: ids.PILOT_ORG,
      status: "trialing", test_mode: true, provider_price_id: ids.PRICE,
      unit_amount_cents: 9900, currency: "eur", last_event_id: "evt_test_chain_sub_created",
    });
    // billing_customers is unchanged by the webhook (still the one test customer).
    expect(testRows("billing_customers")).toHaveLength(1);
    // The checkout operation is closed by the session event.
    expect(db.tables.billing_checkout_operations[0]).toMatchObject({
      status: "completed", provider_subscription_id: chain.subscriptionId,
    });
  });

  it("4. entitlement: the pilot organization now resolves the PAID plan in test mode (subscription source, unmetered needs)", async () => {
    signIn(ids.PILOT_ORG);
    const ctx = await getEffectiveEntitlements();
    expect(ctx).toMatchObject({
      effectivePlanKey: ORGANIZATION_PLAN_KEY, source: "subscription", subscriptionStatus: "trialing",
      active: true, grace: false, enforced: true, profileId: ids.OWNER,
    });
    expect(entitlementAllows(ctx, "company_create_needs")).toBe(true);
    expect(entitlementAllows(ctx, "booking_pipeline")).toBe(true);
    // The paid plan's boundary: no numeric ceiling (free was 1).
    expect(limitFor(getPlan(ctx.effectivePlanKey)!, "company_create_needs")).toBeNull();
  });

  it("S12. TRIAL: for the set time the organization uses every function of the paid plan, through the server gate", async () => {
    // The trial length is the code constant the checkout sent to Stripe.
    expect(TRIAL_PERIOD_DAYS).toBe(14);
    expect((chain.checkoutParams.subscription_data as Record<string, unknown>).trial_period_days).toBe(TRIAL_PERIOD_DAYS);
    const row = ourSubs()[0];
    const days = (Date.parse(String(row.current_period_end)) - Date.parse(String(row.current_period_start))) / 86_400_000;
    expect(days).toBe(TRIAL_PERIOD_DAYS);

    signIn(ids.PILOT_ORG);
    const ctx = await getEffectiveEntitlements();
    expect(ctx).toMatchObject({ subscriptionStatus: "trialing", active: true, enforced: true });
    for (const f of planFeatures(ORGANIZATION_PLAN_KEY)) expect(entitlementAllows(ctx, f), f).toBe(true);

    // Five concurrent needs — four more than FREE allows — pass the server gate.
    addNeeds(ids.PILOT_ORG, 5);
    expect(await gate(ids.PILOT_ORG)).toMatchObject({ allowed: true, enforced: true, limit: null });
    // A trial grants nothing outside its own organization: another pilot
    // organization (no test subscription) is still FREE and limited.
    addNeeds(ids.PILOT_ORG_LIVE_ROW, 1);
    expect(await gate(ids.PILOT_ORG_LIVE_ROW)).toMatchObject({ allowed: false, reason: "over_open_need_limit", limit: 1, used: 1 });
  });

  it("4b. test_mode=true rows only: a pilot organization holding only a LIVE-mode row stays FREE", async () => {
    signIn(ids.PILOT_ORG_LIVE_ROW);
    const ctx = await getEffectiveEntitlements();
    expect(ctx).toMatchObject({ effectivePlanKey: FREE_ORGANIZATION_PLAN_KEY, source: "free", enforced: true, active: false });
    expect(limitFor(getPlan(ctx.effectivePlanKey)!, "company_create_needs")).toBe(1);
  });

  it("4c. a LIVE-mode event, correctly signed, is refused (eventModeMatches) and writes nothing", async () => {
    const before = {
      events: db.tables.payment_webhook_events.length,
      subs: db.tables.billing_subscriptions.length,
    };
    const liveEvent = {
      ...chain.subscriptionEvent,
      id: "evt_live_mode_chain", livemode: true,
      data: { object: { ...(chain.subscriptionEvent.data as { object: Row }).object, id: "sub_live_chain", livemode: true, status: "active" } },
    };
    expect(eventModeMatches(getBillingConfig().state, { testMode: false })).toBe(false);
    const res = await webhookPOST(signedDelivery(liveEvent));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ ok: false, reason: "live_event_rejected" });
    expect(db.tables.payment_webhook_events).toHaveLength(before.events);
    expect(db.tables.billing_subscriptions).toHaveLength(before.subs);

    // And a delivery signed with any other secret never reaches business logic.
    const forged = await webhookPOST(signedDelivery({ ...chain.subscriptionEvent, id: "evt_forged" }, "whsec_not_ours"));
    expect(forged.status).toBe(400);
    expect(await forged.json()).toMatchObject({ ok: false, reason: "invalid_signature" });
    expect(db.tables.payment_webhook_events).toHaveLength(before.events);
  });

  it("5. replay: the same signed events again are acknowledged as duplicates — no second subscription row", async () => {
    const rs = await webhookPOST(signedDelivery(chain.subscriptionEvent));
    expect(rs.status).toBe(200);
    expect(await rs.json()).toMatchObject({ ok: true, duplicate: true });
    const rc = await webhookPOST(signedDelivery(chain.sessionEvent));
    expect(rc.status).toBe(200);
    expect(await rc.json()).toMatchObject({ ok: true, duplicate: true });

    expect(ourSubs()).toHaveLength(1);
    expect(testRows("billing_subscriptions")).toHaveLength(1);
    expect(db.tables.payment_webhook_events).toHaveLength(2);
    expect(ourSubs()[0]).toMatchObject({ status: "trialing", last_event_id: "evt_test_chain_sub_created" });

    // Entitlement is unchanged by the replay.
    signIn(ids.PILOT_ORG);
    const ctx = await getEffectiveEntitlements();
    expect(ctx).toMatchObject({ effectivePlanKey: ORGANIZATION_PLAN_KEY, source: "subscription", active: true });
  });

  // ─── 6–12. LIFECYCLE after activation (owner approval 2026-11-12 (a)) ─────
  // Renewal, payment failure (dunning), recovery, refund, pause, cancellation
  // at period end and final deletion — every state the subscription row can
  // reach after checkout, through the SAME signed-webhook route and the SAME
  // entitlement resolver. Each event is newer than the last (ordering guard).

  it("6. VAT: the checkout asked Stripe Tax for VAT, a billing address and the buyer's VAT id (EU B2B reverse charge)", () => {
    // Stripe Tax computes Swedish 25 % VAT, or 0 % + "reverse charge" when a
    // valid EU VAT id is collected; the rates themselves live in the Stripe
    // dashboard (tax registrations), never in this code.
    expect(chain.checkoutParams.automatic_tax).toEqual({ enabled: true });
    expect(chain.checkoutParams.tax_id_collection).toEqual({ enabled: true });
    expect(chain.checkoutParams.billing_address_collection).toBe("required");
    expect(chain.checkoutParams.customer_update).toEqual({ address: "auto", name: "auto" });
  });

  it("7. renewal: trial → active and the first paid invoice records a succeeded payment", async () => {
    await deliver(subEvent("evt_life_active", { status: "active" }));
    await deliver(invoiceEvent("evt_life_inv_paid_1", "invoice.paid", { amount_paid: 12375, billing_reason: "subscription_cycle" }));
    expect(ourSubs()[0]).toMatchObject({ status: "active", last_payment_status: "succeeded" });
    signIn(ids.PILOT_ORG);
    expect(await getEffectiveEntitlements()).toMatchObject({
      effectivePlanKey: ORGANIZATION_PLAN_KEY, source: "subscription", subscriptionStatus: "active", active: true, grace: false,
    });
  });

  it("S11. PREMIUM: a paying organization can use every function of its plan, with no position ceiling", async () => {
    signIn(ids.PILOT_ORG);
    const ctx = await getEffectiveEntitlements();
    expect(ctx).toMatchObject({ effectivePlanKey: ORGANIZATION_PLAN_KEY, subscriptionStatus: "active", active: true, enforced: true });
    for (const f of planFeatures(ORGANIZATION_PLAN_KEY)) expect(entitlementAllows(ctx, f), f).toBe(true);
    addNeeds(ids.PILOT_ORG, 20); // 25 concurrent needs
    expect(activeNeeds(ids.PILOT_ORG)).toHaveLength(25);
    expect(await gate(ids.PILOT_ORG)).toMatchObject({ allowed: true, enforced: true, limit: null });
  });

  it("8. payment failure: invoice.payment_failed moves the row to past_due — still entitled, flagged as grace", async () => {
    await deliver(invoiceEvent("evt_life_inv_failed", "invoice.payment_failed", { amount_paid: 0, attempt_count: 1 }));
    expect(ourSubs()[0]).toMatchObject({ status: "past_due", last_payment_status: "failed" });
    signIn(ids.PILOT_ORG);
    const ctx = await getEffectiveEntitlements();
    expect(ctx).toMatchObject({ effectivePlanKey: ORGANIZATION_PLAN_KEY, subscriptionStatus: "past_due", active: true, grace: true });
    expect(entitlementAllows(ctx, "company_create_needs")).toBe(true);
  });

  it("9. dunning exhausted: Stripe marks the subscription unpaid → the organization falls back to FREE (1 open need), enforced", async () => {
    await deliver(subEvent("evt_life_unpaid", { status: "unpaid" }));
    expect(ourSubs()[0]).toMatchObject({ status: "unpaid" });
    signIn(ids.PILOT_ORG);
    const ctx = await getEffectiveEntitlements();
    expect(ctx).toMatchObject({ effectivePlanKey: FREE_ORGANIZATION_PLAN_KEY, enforced: true, active: false, grace: false });
    expect(limitFor(getPlan(ctx.effectivePlanKey)!, "company_create_needs")).toBe(1);
  });

  it("10. recovery: the retried invoice is paid and the subscription is active again → the paid plan returns", async () => {
    await deliver(invoiceEvent("evt_life_inv_paid_2", "invoice.paid", { amount_paid: 12375, billing_reason: "subscription_cycle" }));
    await deliver(subEvent("evt_life_recovered", { status: "active" }));
    expect(ourSubs()[0]).toMatchObject({ status: "active", last_payment_status: "succeeded" });
    signIn(ids.PILOT_ORG);
    expect(await getEffectiveEntitlements()).toMatchObject({ effectivePlanKey: ORGANIZATION_PLAN_KEY, active: true, grace: false });
  });

  it("11. refund: charge.refunded is RECORDED with its amounts and changes no subscription state", async () => {
    const before = { ...ourSubs()[0] };
    await deliver(signedEvent("evt_life_refund", "charge.refunded", {
      id: "ch_test_life", object: "charge", livemode: false, payment_intent: "pi_test_life",
      invoice: "in_test_life_2", amount_refunded: 12375, currency: "eur", refunded: true,
    }));
    const rec = db.tables.payment_webhook_events.find((e) => e.event_id === "evt_life_refund");
    expect(rec).toMatchObject({ event_type: "charge.refunded", test_mode: true });
    expect(JSON.stringify(rec)).toContain("12375");
    expect(ourSubs()[0]).toMatchObject({ status: before.status, last_payment_status: before.last_payment_status });
    signIn(ids.PILOT_ORG);
    expect(await getEffectiveEntitlements()).toMatchObject({ effectivePlanKey: ORGANIZATION_PLAN_KEY, active: true });
  });

  it("12. pause: a paused subscription collects nothing → no paid grace, FREE plan", async () => {
    await deliver(subEvent("evt_life_paused", { status: "paused" }));
    expect(ourSubs()[0]).toMatchObject({ status: "unpaid" });
    signIn(ids.PILOT_ORG);
    expect(await getEffectiveEntitlements()).toMatchObject({ effectivePlanKey: FREE_ORGANIZATION_PLAN_KEY, active: false, grace: false });
    // …and resuming it (a payment method added) restores the paid plan.
    await deliver(subEvent("evt_life_resumed", { status: "active" }));
    expect(await getEffectiveEntitlements()).toMatchObject({ effectivePlanKey: ORGANIZATION_PLAN_KEY, active: true });
  });

  it("13. cancellation at period end: still entitled until the period ends, and the account says so", async () => {
    await deliver(subEvent("evt_life_cancel_at_end", { status: "active", cancel_at_period_end: true }));
    expect(ourSubs()[0]).toMatchObject({ status: "active", cancel_at_period_end: true });
    signIn(ids.PILOT_ORG);
    expect(await getEffectiveEntitlements()).toMatchObject({
      effectivePlanKey: ORGANIZATION_PLAN_KEY, active: true, cancelAtPeriodEnd: true,
    });
  });

  it("14. deletion: customer.subscription.deleted ends the paid plan → FREE, and a late 'active' event cannot revive it", async () => {
    await deliver(subEvent("evt_life_deleted", { status: "canceled" }, "customer.subscription.deleted"));
    expect(ourSubs()[0]).toMatchObject({ status: "cancelled" });
    signIn(ids.PILOT_ORG);
    const ctx = await getEffectiveEntitlements();
    expect(ctx).toMatchObject({ effectivePlanKey: FREE_ORGANIZATION_PLAN_KEY, enforced: true, active: false });
    expect(limitFor(getPlan(ctx.effectivePlanKey)!, "company_create_needs")).toBe(1);

    // A delayed 'active' delivery (newer timestamp, same subscription id) is
    // refused by the terminal-state rule: Stripe never revives a cancelled id.
    const late = await webhookPOST(signedDelivery(subEvent("evt_life_late_active", { status: "active" })));
    expect(late.status).toBe(200);
    expect(ourSubs()[0]).toMatchObject({ status: "cancelled" });
    expect(await getEffectiveEntitlements()).toMatchObject({ effectivePlanKey: FREE_ORGANIZATION_PLAN_KEY, active: false });
    expect(ourSubs()).toHaveLength(1);
  });

  it("S13. AFTER THE PAID / TRIAL PERIOD ENDS: the data stays, and the FREE limit applies to new needs", async () => {
    signIn(ids.PILOT_ORG);
    expect(await getEffectiveEntitlements()).toMatchObject({ effectivePlanKey: FREE_ORGANIZATION_PLAN_KEY, enforced: true, active: false });
    // Nothing was destroyed: all 25 needs created under the plan are still there, still active.
    expect(activeNeeds(ids.PILOT_ORG)).toHaveLength(25);
    // …the subscription row is kept as history (cancelled), not deleted…
    expect(ourSubs()).toHaveLength(1);
    expect(ourSubs()[0]).toMatchObject({ status: "cancelled" });
    // …and the server refuses a NEW need until the organization is within the FREE limit.
    expect(await gate(ids.PILOT_ORG)).toMatchObject({
      allowed: false, reason: "over_open_need_limit", limit: 1, used: 25, next: "upgrade", planKey: FREE_ORGANIZATION_PLAN_KEY,
    });
  });

  it("S10. FREE: the server refuses what the plan does not include — not only a hidden button", async () => {
    // At the limit: refused by the gate the demand creation path calls.
    signIn(ids.PILOT_ORG_LIVE_ROW);
    expect(await getEffectiveEntitlements()).toMatchObject({ effectivePlanKey: FREE_ORGANIZATION_PLAN_KEY, enforced: true });
    expect(await gate(ids.PILOT_ORG_LIVE_ROW)).toMatchObject({ allowed: false, reason: "over_open_need_limit", limit: 1, used: 1 });
    // Under the limit (the one need closed): allowed.
    needs.filter((n) => n.organization_id === ids.PILOT_ORG_LIVE_ROW).forEach((n) => { n.status = "closed"; });
    expect(await gate(ids.PILOT_ORG_LIVE_ROW)).toMatchObject({ allowed: true, enforced: true, limit: 1, used: 0 });
    // An unreadable count fails CLOSED for a limited plan (a limit that cannot be checked is not a limit).
    const broken = gateClient(ids.PILOT_ORG_LIVE_ROW);
    const from = broken.from;
    broken.from = (t: string) => {
      if (t !== "customer_requests") return from(t);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const q: any = { select: () => q, in: () => q, or: () => q, then: (ok: (v: unknown) => unknown) => Promise.resolve({ count: null, error: { code: "500" } }).then(ok) };
      return q;
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(await gateOpenNeeds(broken as any, ids.PILOT_ORG_LIVE_ROW, ids.OWNER)).toMatchObject({ allowed: false, reason: "over_open_need_limit" });
    // A plan that is not sold grants nothing a FREE organization could reach:
    // no feature of the deferred plans is allowed beyond the FREE plan's own.
    const ctx = await getEffectiveEntitlements();
    for (const f of ["expanded_cv", "document_expiry_reminders", "priority_visibility", "verify_documents", "manage_pilots"] as FeatureKey[]) {
      expect(entitlementAllows(ctx, f), f).toBe(false);
    }
  });

  it("the chain touched only the modelled tables and made no unexpected Stripe network call", () => {
    expect(db.unknownTables).toEqual([]);
    expect(stripeNet.unexpected).toEqual([]);
    expect(stripeNet.checkoutCreate).toHaveLength(1);
    expect(stripeNet.customersCreate).toHaveLength(1);
  });
});
