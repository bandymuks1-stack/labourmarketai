import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const cfg = vi.hoisted(() => ({ state: "stripe_live" as string, testMode: false }));
vi.mock("@/lib/billing/config", () => ({ getBillingConfig: () => cfg }));
vi.mock("@/lib/billing/billing-subject", () => ({ resolveBillingSubject: vi.fn() }));
vi.mock("@/lib/billing/customer-store", () => ({ findBillingCustomer: vi.fn() }));
vi.mock("@/lib/billing/subscription-store", () => ({ findScopedSubscription: vi.fn(), hasRecentUserRefreshForSubject: vi.fn() }));
vi.mock("@/lib/billing/reconcile-subscription", () => ({ RECONCILE_EVENT_TYPE: "reconcile.subscription", reconcileSubscription: vi.fn() }));

import { resolveBillingSubject } from "@/lib/billing/billing-subject";
import { findBillingCustomer } from "@/lib/billing/customer-store";
import { findScopedSubscription, hasRecentUserRefreshForSubject } from "@/lib/billing/subscription-store";
import { reconcileSubscription } from "@/lib/billing/reconcile-subscription";
import { __resetRateLimitsForTest } from "@/lib/security/rate-limit";
import {
  REFRESH_COOLDOWN_MS,
  REFRESH_LIMIT,
  refreshMyBillingStatus,
  refreshStatusFromResult,
} from "@/lib/billing/refresh-billing-status";
import { POST } from "@/app/api/billing/refresh/route";

const subject = vi.mocked(resolveBillingSubject);
const customer = vi.mocked(findBillingCustomer);
const scoped = vi.mocked(findScopedSubscription);
const recentRefresh = vi.mocked(hasRecentUserRefreshForSubject);
const reconcile = vi.mocked(reconcileSubscription);

const ORG = { subject: { type: "organization" as const, id: "org_1" }, payerProfileId: "user_1", billingAuthority: true, role: "owner" as const };

beforeEach(() => {
  vi.stubEnv("BILLING_RECOVERY_ENABLED", "true");
  vi.clearAllMocks();
  __resetRateLimitsForTest();
  cfg.state = "stripe_live";
  cfg.testMode = false;
  subject.mockResolvedValue(ORG as never);
  scoped.mockResolvedValue({ status: "found", row: { providerSubscriptionId: "sub_1", status: "incomplete", testMode: false } });
  customer.mockResolvedValue({ status: "found", customerId: "cus_1" });
  recentRefresh.mockResolvedValue(false);
  reconcile.mockResolvedValue({ outcome: "applied", changed: true, providerSubscriptionId: "sub_1" });
});

describe("authority", () => {
  it("unauthenticated -> 401, nothing read", async () => {
    subject.mockResolvedValue({ subject: null, payerProfileId: null, billingAuthority: false, role: null } as never);
    expect(await refreshMyBillingStatus()).toMatchObject({ http: 401 });
    expect(reconcile).not.toHaveBeenCalled();
  });
  it("a member WITHOUT billing authority -> 403, nothing read", async () => {
    subject.mockResolvedValue({ ...ORG, billingAuthority: false } as never);
    expect(await refreshMyBillingStatus()).toMatchObject({ http: 403 });
    expect(reconcile).not.toHaveBeenCalled();
  });
});

describe("OPTION B - recovery capability flag", () => {
  it("flag unset: an authorized user gets a coarse 503 try_later and nothing is read or written", async () => {
    vi.stubEnv("BILLING_RECOVERY_ENABLED", "");
    const r = await refreshMyBillingStatus();
    expect(r).toEqual({ http: 503, body: { ok: false, status: "try_later" } });
    expect(JSON.stringify(r)).not.toMatch(/RECOVERY|ENABLED|sub_|cus_/);
    expect(reconcile).not.toHaveBeenCalled();
    expect(scoped).not.toHaveBeenCalled();
    expect(recentRefresh).not.toHaveBeenCalled();
  });
  it("authentication and authority are still checked first when the flag is off", async () => {
    vi.stubEnv("BILLING_RECOVERY_ENABLED", "");
    subject.mockResolvedValue({ subject: null, payerProfileId: null, billingAuthority: false, role: null } as never);
    expect(await refreshMyBillingStatus()).toMatchObject({ http: 401 });
    subject.mockResolvedValue({ ...ORG, billingAuthority: false } as never);
    expect(await refreshMyBillingStatus()).toMatchObject({ http: 403 });
  });
});

describe("subject binding - the client never chooses anything", () => {
  it("reconciles the workspace's OWN stored subscription with the server-resolved subject", async () => {
    const r = await refreshMyBillingStatus();
    expect(r).toEqual({ http: 200, body: { ok: true, status: "updated" } });
    expect(reconcile).toHaveBeenCalledWith({
      stripeSubscriptionId: "sub_1",
      source: "user_refresh",
      expectSubject: { type: "organization", id: "org_1" },
    });
    expect(scoped).toHaveBeenCalledWith(expect.objectContaining({ scope: ORG.subject, testMode: false }));
  });

  it("no row yet -> the PAYER's own customer, still bound to the workspace", async () => {
    scoped.mockResolvedValue({ status: "none" });
    await refreshMyBillingStatus();
    expect(customer).toHaveBeenCalledWith("user_1");
    expect(reconcile).toHaveBeenCalledWith({
      customerId: "cus_1",
      source: "user_refresh",
      expectSubject: { type: "organization", id: "org_1" },
    });
  });

  it("no row and no customer -> not_found, Stripe never called", async () => {
    scoped.mockResolvedValue({ status: "none" });
    customer.mockResolvedValue({ status: "absent" });
    expect(await refreshMyBillingStatus()).toEqual({ http: 200, body: { ok: true, status: "not_found" } });
    expect(reconcile).not.toHaveBeenCalled();
  });

  it("personal workspace binds as a profile subject", async () => {
    subject.mockResolvedValue({ subject: { type: "profile", id: "user_1" }, payerProfileId: "user_1", billingAuthority: true, role: null } as never);
    await refreshMyBillingStatus();
    expect(reconcile).toHaveBeenCalledWith(expect.objectContaining({ expectSubject: { type: "profile", id: "user_1" } }));
  });

  it("cross-workspace: a subscription bound to ANOTHER workspace is reported as not_found, never applied", async () => {
    reconcile.mockResolvedValue({ outcome: "conflict", reason: "subject_mismatch" });
    expect(await refreshMyBillingStatus()).toEqual({ http: 200, body: { ok: true, status: "not_found" } });
  });

  it("a manual_ pilot row is not a provider subscription: falls through to the payer customer", async () => {
    scoped.mockResolvedValue({ status: "found", row: { providerSubscriptionId: "manual_abc", status: "active", testMode: false } });
    await refreshMyBillingStatus();
    expect(reconcile).toHaveBeenCalledWith(expect.objectContaining({ customerId: "cus_1" }));
  });
});

describe("rate limit", () => {
  it("allows the budget, then 429 try_later with NO further provider read", async () => {
    for (let i = 0; i < REFRESH_LIMIT.limit; i++) {
      expect((await refreshMyBillingStatus({ nowMs: 1000 })).http).toBe(200);
    }
    const over = await refreshMyBillingStatus({ nowMs: 1000 });
    expect(over).toEqual({ http: 429, body: { ok: false, status: "try_later" } });
    expect(reconcile).toHaveBeenCalledTimes(REFRESH_LIMIT.limit);
  });
  it("the budget is per person", async () => {
    for (let i = 0; i < REFRESH_LIMIT.limit; i++) await refreshMyBillingStatus({ nowMs: 1 });
    subject.mockResolvedValue({ ...ORG, payerProfileId: "user_2" } as never);
    expect((await refreshMyBillingStatus({ nowMs: 1 })).http).toBe(200);
  });
  it("the window frees up", async () => {
    for (let i = 0; i < REFRESH_LIMIT.limit; i++) await refreshMyBillingStatus({ nowMs: 1 });
    expect((await refreshMyBillingStatus({ nowMs: 1 + REFRESH_LIMIT.windowMs + 1 })).http).toBe(200);
  });
});

describe("durable per-workspace cooldown (existing audit rows, no migration)", () => {
  it("a recent refresh attempt for THIS workspace -> 429 try_later, Stripe not read", async () => {
    recentRefresh.mockResolvedValue(true);
    expect(await refreshMyBillingStatus({ nowMs: 10_000_000 })).toEqual({ http: 429, body: { ok: false, status: "try_later" } });
    expect(reconcile).not.toHaveBeenCalled();
    expect(recentRefresh).toHaveBeenCalledWith({
      subject: "organization:org_1",
      sinceIso: new Date(10_000_000 - REFRESH_COOLDOWN_MS).toISOString(),
      reconcileEventType: "reconcile.subscription",
    });
  });
  it("no recent attempt -> proceeds", async () => {
    expect((await refreshMyBillingStatus()).http).toBe(200);
  });
  it("the in-memory limiter still applies on top (defense in depth)", async () => {
    for (let i = 0; i < REFRESH_LIMIT.limit; i++) await refreshMyBillingStatus({ nowMs: 5 });
    expect((await refreshMyBillingStatus({ nowMs: 5 })).http).toBe(429);
  });
});

describe("inactive / degraded billing", () => {
  it("billing off -> try_later and Stripe is never consulted", async () => {
    cfg.state = "disabled";
    expect(await refreshMyBillingStatus()).toEqual({ http: 200, body: { ok: true, status: "try_later" } });
    expect(reconcile).not.toHaveBeenCalled();
  });
  it("tables absent / store error -> try_later", async () => {
    scoped.mockResolvedValue({ status: "needs-migration" });
    expect((await refreshMyBillingStatus()).body).toEqual({ ok: true, status: "try_later" });
    scoped.mockResolvedValue({ status: "error" });
    expect((await refreshMyBillingStatus()).body).toEqual({ ok: true, status: "try_later" });
  });
});

describe("refreshStatusFromResult - only four words ever", () => {
  it.each([
    [{ outcome: "applied", changed: true }, "updated"],
    [{ outcome: "applied", changed: false }, "already_current"],
    [{ outcome: "stale" }, "already_current"],
    [{ outcome: "noop", reason: "duplicate_run" }, "already_current"],
    [{ outcome: "noop", reason: "unlinked" }, "not_found"],
    [{ outcome: "not_found" }, "not_found"],
    [{ outcome: "conflict", reason: "subject_mismatch" }, "not_found"],
    [{ outcome: "conflict", reason: "mode_mismatch" }, "try_later"],
    [{ outcome: "conflict", reason: "conflict-live-subscription" }, "try_later"],
    [{ outcome: "provider_error" }, "try_later"],
    [{ outcome: "store_error" }, "try_later"],
    [{ outcome: "needs_migration" }, "try_later"],
    [{ outcome: "inactive" }, "try_later"],
  ] as const)("%j -> %s", (r, expected) => {
    expect(refreshStatusFromResult(r as never)).toBe(expected);
  });
});

describe("nothing identifying reaches the browser", () => {
  it("the HTTP body carries a status word only - no ids, no provider reasons", async () => {
    reconcile.mockResolvedValue({ outcome: "conflict", reason: "conflict-live-subscription", providerSubscriptionId: "sub_SECRET", status: "active" });
    const res = await POST();
    const text = await res.text();
    expect(JSON.parse(text)).toEqual({ ok: true, status: "try_later" });
    expect(text).not.toMatch(/sub_|cus_|org_1|user_1|conflict/);
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("the route and the client component ignore/never send any input", () => {
    const root = join(__dirname, "..", "..");
    const route = readFileSync(join(root, "app/api/billing/refresh/route.ts"), "utf8");
    expect(route).not.toMatch(/req\.(json|text|formData)|request\.(json|text|formData)|searchParams/);
    expect(route).toMatch(/export async function POST\(\)/); // takes no Request at all
    const ui = readFileSync(join(root, "components/app/refresh-billing-status-button.tsx"), "utf8");
    expect(ui).not.toMatch(/body:|JSON\.stringify|FormData|searchParams|subscriptionId|customerId|organization_id/);
    expect(ui).toMatch(/min-h-11/);
    expect(ui).not.toMatch(/checkout|subscribe|STRIPE_|sk_(test|live)_/i);
  });

  it("the section shows the control only behind billing authority + syncing/incomplete, and never trusts the flag", () => {
    const root = join(__dirname, "..", "..");
    const sec = readFileSync(join(root, "components/app/account-billing-section.tsx"), "utf8");
    expect(sec).toMatch(/const showRefresh =\s*billingOn &&\s*Boolean\(subject\?\.billingAuthority\) &&\s*\(syncing \|\| status === "incomplete"\)/);
  });
});
