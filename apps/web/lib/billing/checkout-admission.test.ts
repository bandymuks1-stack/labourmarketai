/**
 * Checkout admission — server seam (billing safety v1). The store and the
 * provider are mocked; the decision table itself is pinned in
 * checkout-operations-core.test.ts. This proves the WIRING: when the provider
 * is consulted, when the heal write fires (dead statuses only), and that an
 * unreadable local state fails CLOSED.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/billing/subscription-store", () => ({
  findScopedSubscription: vi.fn(),
  applyProviderReconciledStatus: vi.fn(),
}));

import { applyProviderReconciledStatus, findScopedSubscription } from "@/lib/billing/subscription-store";
import { admitCheckout } from "./checkout-admission";
import type { BillingProvider } from "@/lib/billing/provider";

const find = vi.mocked(findScopedSubscription);
const heal = vi.mocked(applyProviderReconciledStatus);

function provider(retrieve: BillingProvider["retrieveSubscription"]): BillingProvider {
  return {
    id: "stripe_live",
    active: true,
    createCheckoutSession: vi.fn(),
    createCustomer: vi.fn(),
    createPortalSession: vi.fn(),
    constructWebhookEvent: vi.fn(),
    listCustomerSubscriptions: vi.fn(),
    retrieveSubscription: retrieve,
  };
}

const scope = { type: "organization" as const, id: "org-1" };
const base = { scope, planKey: "company_pilot", testMode: false };

beforeEach(() => {
  vi.clearAllMocks();
  heal.mockResolvedValue("ok");
});

describe("admitCheckout", () => {
  it("no local row → admit; the provider is not consulted", async () => {
    find.mockResolvedValue({ status: "none" });
    const retrieve = vi.fn();
    const r = await admitCheckout({ ...base, provider: provider(retrieve) });
    expect(r).toEqual({ admit: true, reason: "no_local_subscription" });
    expect(retrieve).not.toHaveBeenCalled();
    expect(find).toHaveBeenCalledWith({ scope, planKey: "company_pilot", testMode: false });
  });

  it("unreadable local state (needs-migration / error) → checkout_unavailable (fail CLOSED)", async () => {
    find.mockResolvedValue({ status: "needs-migration" });
    expect(await admitCheckout({ ...base, provider: provider(vi.fn()) })).toEqual({ admit: false, reason: "checkout_unavailable", cause: "needs-migration" });
    find.mockResolvedValue({ status: "error" });
    expect(await admitCheckout({ ...base, provider: provider(vi.fn()) })).toEqual({ admit: false, reason: "checkout_unavailable", cause: "store_error" });
  });

  it("a manual grant admits without consulting the provider", async () => {
    find.mockResolvedValue({ status: "found", row: { providerSubscriptionId: "manual_x", status: "active", testMode: false } });
    const retrieve = vi.fn();
    expect((await admitCheckout({ ...base, provider: provider(retrieve) })).admit).toBe(true);
    expect(retrieve).not.toHaveBeenCalled();
  });

  it("blocking row + provider confirms live → REFUSED, no heal", async () => {
    find.mockResolvedValue({ status: "found", row: { providerSubscriptionId: "sub_1", status: "active", testMode: false } });
    const retrieve = vi.fn().mockResolvedValue({ ok: true, subscription: { id: "sub_1", customerId: "cus_1", rawStatus: "active", priceId: "p", unitAmountCents: 9900, currency: "eur", livemode: true, cancelAtPeriodEnd: false } });
    const r = await admitCheckout({ ...base, provider: provider(retrieve) });
    expect(r).toEqual({ admit: false, reason: "subscription_exists", localStatus: "active", provider: "confirmed_live" });
    expect(retrieve).toHaveBeenCalledWith("sub_1");
    expect(heal).not.toHaveBeenCalled();
  });

  it("blocking row + provider unreachable → REFUSED (fail closed), no heal", async () => {
    find.mockResolvedValue({ status: "found", row: { providerSubscriptionId: "sub_1", status: "incomplete", testMode: false } });
    const retrieve = vi.fn().mockResolvedValue({ ok: false, reason: "network" });
    const r = await admitCheckout({ ...base, provider: provider(retrieve) });
    expect(r).toEqual({ admit: false, reason: "subscription_exists", localStatus: "incomplete", provider: "unavailable" });
    expect(heal).not.toHaveBeenCalled();
  });

  it("blocking row + provider says canceled → admit AND heal the row to cancelled", async () => {
    find.mockResolvedValue({ status: "found", row: { providerSubscriptionId: "sub_1", status: "active", testMode: false } });
    const retrieve = vi.fn().mockResolvedValue({ ok: true, subscription: { id: "sub_1", customerId: "cus_1", rawStatus: "canceled", priceId: "p", unitAmountCents: 9900, currency: "eur", livemode: true, cancelAtPeriodEnd: false } });
    const r = await admitCheckout({ ...base, provider: provider(retrieve) });
    expect(r).toEqual({ admit: true, reason: "healed_from_provider", providerStatus: "cancelled" });
    expect(heal).toHaveBeenCalledWith({ providerSubscriptionId: "sub_1", status: "cancelled", source: "checkout_admission" });
  });

  it("blocking row + provider has NO such object in this mode → admit AND heal to expired", async () => {
    find.mockResolvedValue({ status: "found", row: { providerSubscriptionId: "sub_1", status: "incomplete", testMode: false } });
    const retrieve = vi.fn().mockResolvedValue({ ok: true, subscription: null });
    const r = await admitCheckout({ ...base, provider: provider(retrieve) });
    expect(r).toEqual({ admit: true, reason: "healed_from_provider", providerStatus: "expired" });
    expect(heal).toHaveBeenCalledWith({ providerSubscriptionId: "sub_1", status: "expired", source: "checkout_admission" });
  });

  it("blocking row + provider says incomplete_expired → admit AND heal to expired", async () => {
    find.mockResolvedValue({ status: "found", row: { providerSubscriptionId: "sub_1", status: "incomplete", testMode: false } });
    const retrieve = vi.fn().mockResolvedValue({ ok: true, subscription: { id: "sub_1", customerId: null, rawStatus: "incomplete_expired", priceId: null, unitAmountCents: null, currency: null, livemode: true, cancelAtPeriodEnd: false } });
    const r = await admitCheckout({ ...base, provider: provider(retrieve) });
    expect(r.admit).toBe(true);
    expect(heal).toHaveBeenCalledWith(expect.objectContaining({ status: "expired" }));
  });
});
