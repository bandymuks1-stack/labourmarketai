/**
 * NEGATIVE proof for POST /api/billing/refresh (#2127). Real route + real
 * refresh logic + REAL recovery adapter (parser + apply primitive); only the
 * session, the stores and the provider are mocked. No live Stripe.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const cfg = vi.hoisted(() => ({ state: "stripe_test" as string, testMode: true }));
vi.mock("@/lib/billing/config", () => ({ getBillingConfig: () => cfg }));
vi.mock("@/lib/billing/provider", () => ({ getBillingProvider: vi.fn() }));
vi.mock("@/lib/billing/billing-subject", () => ({ resolveBillingSubject: vi.fn() }));
vi.mock("@/lib/billing/customer-store", () => ({ findBillingCustomer: vi.fn() }));
vi.mock("@/lib/billing/subscription-store", () => ({
  findScopedSubscription: vi.fn(),
  hasRecentUserRefreshForSubject: vi.fn(),
  readSubscriptionState: vi.fn(),
  recordWebhookEvent: vi.fn(),
  markWebhookProcessed: vi.fn(),
  markWebhookFailed: vi.fn(),
  upsertSubscription: vi.fn(),
}));

import { getBillingProvider } from "@/lib/billing/provider";
import { resolveBillingSubject } from "@/lib/billing/billing-subject";
import { findBillingCustomer } from "@/lib/billing/customer-store";
import {
  findScopedSubscription,
  hasRecentUserRefreshForSubject,
  readSubscriptionState,
  recordWebhookEvent,
  upsertSubscription,
} from "@/lib/billing/subscription-store";
import { __resetRateLimitsForTest } from "@/lib/security/rate-limit";
import { POST } from "@/app/api/billing/refresh/route";

const subject = vi.mocked(resolveBillingSubject);
const scoped = vi.mocked(findScopedSubscription);
const customer = vi.mocked(findBillingCustomer);
const upsert = vi.mocked(upsertSubscription);
const retrieveRaw = vi.fn();
const listSubs = vi.fn();

const ORG = { subject: { type: "organization" as const, id: "org_1" }, payerProfileId: "user_1", billingAuthority: true, role: "owner" as const };
const OBJ = (over: Record<string, unknown> = {}) => ({
  id: "sub_1",
  customer: "cus_1",
  status: "active",
  livemode: false,
  cancel_at_period_end: false,
  metadata: { plan_key: "company_pilot", client_reference_id: "user_1", organization_id: "org_1" },
  items: { data: [{ price: { id: "price_SECRET", unit_amount: 9900, currency: "eur" } }] },
  ...over,
});

const FOUR = /^\{"ok":(true|false),"status":"(updated|already_current|not_found|try_later)"\}$/;
const LEAK = /sub_|cus_|price_|org_|user_|boom|conflict|mismatch|stripe|reason/i;

async function post(init?: RequestInit, url = "http://localhost/api/billing/refresh") {
  // The handler takes NO Request; anything the client sends must be inert.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const res = await (POST as any)(new Request(url, { method: "POST", ...init }));
  const text = await res.text();
  return { status: res.status as number, text };
}

beforeEach(() => {
  vi.clearAllMocks();
  __resetRateLimitsForTest();
  vi.spyOn(console, "info").mockImplementation(() => {});
  cfg.state = "stripe_test";
  cfg.testMode = true;
  subject.mockResolvedValue(ORG as never);
  scoped.mockResolvedValue({ status: "found", row: { providerSubscriptionId: "sub_1", status: "incomplete", testMode: true } });
  customer.mockResolvedValue({ status: "found", customerId: "cus_1" });
  vi.mocked(hasRecentUserRefreshForSubject).mockResolvedValue(false);
  vi.mocked(readSubscriptionState).mockResolvedValue({ status: "found", row: { status: "incomplete", ownerId: "user_1", planKey: "company_pilot" } });
  vi.mocked(recordWebhookEvent).mockResolvedValue("ok");
  upsert.mockResolvedValue("ok");
  retrieveRaw.mockResolvedValue({ ok: true, object: OBJ(), livemode: false });
  listSubs.mockResolvedValue({ ok: true, subscriptions: [{ id: "sub_1" }] });
  vi.mocked(getBillingProvider).mockResolvedValue({
    id: "stripe_test",
    active: true,
    retrieveSubscriptionRaw: retrieveRaw,
    listCustomerSubscriptions: listSubs,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
});

describe("no client-selected identity is honoured", () => {
  const INJECT = {
    workspace_id: "org_ATTACKER",
    organization_id: "org_ATTACKER",
    customer_id: "cus_ATTACKER",
    customerId: "cus_ATTACKER",
    subscription_id: "sub_ATTACKER",
    subscriptionId: "sub_ATTACKER",
    mode: "live",
    livemode: "true",
    provider: "evil",
  };
  const qs = "?" + new URLSearchParams(INJECT).toString();

  it("JSON body, query string, headers and cookies naming workspace/customer/subscription/mode/provider have NO effect", async () => {
    const r = await post(
      {
        headers: {
          "content-type": "application/json",
          cookie: Object.entries(INJECT).map(([k, v]) => `${k}=${v}`).join("; "),
          "x-organization-id": "org_ATTACKER",
          "x-customer-id": "cus_ATTACKER",
          "x-subscription-id": "sub_ATTACKER",
          "x-stripe-mode": "live",
          "x-workspace": "org_ATTACKER",
        },
        body: JSON.stringify(INJECT),
      },
      "http://localhost/api/billing/refresh" + qs,
    );
    expect(r.status).toBe(200);
    // identity is resolved from the session with NO arguments
    expect(subject).toHaveBeenCalledTimes(1);
    expect(subject.mock.calls[0]).toEqual([]);
    // every id handed to the stores / Stripe came from the server-side mocks
    expect(scoped).toHaveBeenCalledWith({ scope: ORG.subject, planKey: "company_pilot", testMode: true });
    expect(retrieveRaw).toHaveBeenCalledWith("sub_1");
    const blob = JSON.stringify([scoped.mock.calls, retrieveRaw.mock.calls, listSubs.mock.calls, upsert.mock.calls, vi.mocked(recordWebhookEvent).mock.calls]);
    expect(blob).not.toMatch(/ATTACKER|evil/);
    // the mode is the CONFIG's (test), not the client's ("live")
    expect(upsert.mock.calls[0][0].testMode).toBe(true);
    expect(r.text).toMatch(FOUR);
  });

  it("the customer path uses the PAYER's stored customer, never a client one", async () => {
    scoped.mockResolvedValue({ status: "none" });
    await post({ body: JSON.stringify(INJECT), headers: { "content-type": "application/json" } }, "http://localhost/api/billing/refresh" + qs);
    expect(customer).toHaveBeenCalledWith("user_1");
    expect(listSubs).toHaveBeenCalledWith("cus_1");
    expect(JSON.stringify(listSubs.mock.calls)).not.toMatch(/ATTACKER/);
  });

  it("a client asking for live mode cannot make a TEST subscription apply under live config, nor the reverse", async () => {
    cfg.state = "stripe_live";
    cfg.testMode = false;
    retrieveRaw.mockResolvedValue({ ok: true, object: OBJ({ livemode: false }), livemode: false });
    const r = await post({ body: JSON.stringify({ mode: "test", livemode: false }) });
    expect(upsert).not.toHaveBeenCalled();
    expect(r.text).toMatch(FOUR);
    expect(JSON.parse(r.text).status).toBe("try_later");
  });
});

describe("another workspace's Stripe subscription is never applied", () => {
  it("metadata organization mismatch -> not_found, upsert NOT called", async () => {
    retrieveRaw.mockResolvedValue({
      ok: true,
      object: OBJ({ metadata: { plan_key: "company_pilot", client_reference_id: "user_1", organization_id: "org_OTHER" } }),
      livemode: false,
    });
    const r = await post();
    expect(JSON.parse(r.text)).toEqual({ ok: true, status: "not_found" });
    expect(upsert).not.toHaveBeenCalled();
  });

  it("owner mismatch for a personal workspace -> not_found, upsert NOT called", async () => {
    subject.mockResolvedValue({ subject: { type: "profile", id: "user_1" }, payerProfileId: "user_1", billingAuthority: true, role: null } as never);
    retrieveRaw.mockResolvedValue({
      ok: true,
      object: OBJ({ metadata: { plan_key: "company_pilot", client_reference_id: "user_2" } }),
      livemode: false,
    });
    expect(JSON.parse((await post()).text)).toEqual({ ok: true, status: "not_found" });
    expect(upsert).not.toHaveBeenCalled();
  });

  it("customer path: a customer holding only other workspaces' subscriptions -> not_found, no write", async () => {
    scoped.mockResolvedValue({ status: "none" });
    listSubs.mockResolvedValue({ ok: true, subscriptions: [{ id: "sub_x" }, { id: "sub_y" }] });
    retrieveRaw.mockResolvedValue({
      ok: true,
      object: OBJ({ metadata: { plan_key: "company_pilot", client_reference_id: "user_1", organization_id: "org_OTHER" } }),
      livemode: false,
    });
    expect(JSON.parse((await post()).text)).toEqual({ ok: true, status: "not_found" });
    expect(upsert).not.toHaveBeenCalled();
  });

  it("a subscription with NO signed binding cannot be verified -> not applied", async () => {
    retrieveRaw.mockResolvedValue({ ok: true, object: OBJ({ metadata: {} }), livemode: false });
    expect(JSON.parse((await post()).text).status).toBe("not_found");
    expect(upsert).not.toHaveBeenCalled();
  });
});

describe("authority", () => {
  it("unauthenticated -> 401 and nothing is read", async () => {
    subject.mockResolvedValue({ subject: null, payerProfileId: null, billingAuthority: false, role: null } as never);
    const r = await post();
    expect(r.status).toBe(401);
    expect(r.text).toMatch(FOUR);
    expect(scoped).not.toHaveBeenCalled();
    expect(retrieveRaw).not.toHaveBeenCalled();
    expect(upsert).not.toHaveBeenCalled();
  });

  it("missing billingAuthority -> 403 and nothing is read", async () => {
    subject.mockResolvedValue({ ...ORG, billingAuthority: false } as never);
    const r = await post();
    expect(r.status).toBe(403);
    expect(r.text).toMatch(FOUR);
    expect(retrieveRaw).not.toHaveBeenCalled();
    expect(upsert).not.toHaveBeenCalled();
  });
});

describe("response bodies: exactly one of four words, never an id or a reason - on EVERY path", () => {
  const paths: Array<[string, () => void, number?]> = [
    ["updated", () => {}],
    ["already_current", () => vi.mocked(readSubscriptionState).mockResolvedValue({ status: "found", row: { status: "active", ownerId: "user_1", planKey: "company_pilot" } })],
    ["stale", () => upsert.mockResolvedValue("stale-event")],
    ["not_found (no row, no customer)", () => { scoped.mockResolvedValue({ status: "none" }); customer.mockResolvedValue({ status: "absent" }); }],
    ["provider 5xx", () => retrieveRaw.mockResolvedValue({ ok: false, reason: "price_x sub_1 cus_1 Stripe exploded", retryable: true })],
    ["conflict-live-subscription", () => upsert.mockResolvedValue("conflict-live-subscription")],
    ["store error", () => upsert.mockResolvedValue("error")],
    ["needs-migration", () => upsert.mockResolvedValue("needs-migration")],
    ["audit failure", () => vi.mocked(recordWebhookEvent).mockResolvedValue("error")],
    ["adapter throws", () => retrieveRaw.mockRejectedValue(new Error("boom sub_1 cus_1 price_1"))],
    ["session resolution throws", () => subject.mockRejectedValue(new Error("boom sub_SECRET"))],
    ["billing disabled", () => { cfg.state = "disabled"; }],
    ["scoped lookup error", () => scoped.mockResolvedValue({ status: "error" })],
    ["durable cooldown", () => vi.mocked(hasRecentUserRefreshForSubject).mockResolvedValue(true)],
    ["unauthenticated", () => subject.mockResolvedValue({ subject: null, payerProfileId: null, billingAuthority: false, role: null } as never)],
    ["no authority", () => subject.mockResolvedValue({ ...ORG, billingAuthority: false } as never)],
  ];
  it.each(paths)("%s", async (_n, arrange) => {
    arrange();
    vi.spyOn(console, "error").mockImplementation(() => {});
    const r = await post();
    expect(r.text).toMatch(FOUR);
    expect(r.text).not.toMatch(LEAK);
  });
});
