/**
 * readOrganizationInvoices (registry 7.20) with a MOCKED Stripe adapter: the
 * server resolves who, whether and which customers; the adapter is read only
 * for an organization's billing manager, only with that organization's own
 * stored customers, and a failure is unknown — never "no invoices".
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("react", async (orig) => ({ ...(await orig<typeof import("react")>()), cache: <T,>(fn: T) => fn }));

const state = vi.hoisted(() => ({
  config: { state: "stripe_live", testMode: false } as { state: string; testMode: boolean },
}));

vi.mock("@/lib/billing/billing-subject", () => ({ resolveBillingSubject: vi.fn() }));
vi.mock("@/lib/billing/config", () => ({ getBillingConfigFor: vi.fn(() => state.config) }));
vi.mock("@/lib/billing/subscription-store", () => ({ readOrganizationBillingLinks: vi.fn() }));
vi.mock("@/lib/billing/provider", () => ({ getBillingProvider: vi.fn() }));

import { resolveBillingSubject } from "@/lib/billing/billing-subject";
import { getBillingConfigFor } from "@/lib/billing/config";
import { readOrganizationBillingLinks } from "@/lib/billing/subscription-store";
import { getBillingProvider } from "@/lib/billing/provider";
import { readOrganizationInvoices } from "@/lib/billing/org-invoices";

const subject = vi.mocked(resolveBillingSubject);
const configFor = vi.mocked(getBillingConfigFor);
const links = vi.mocked(readOrganizationBillingLinks);
const providerOf = vi.mocked(getBillingProvider);
const listInvoices = vi.fn();

const MANAGER = { subject: { type: "organization" as const, id: "org-a" }, payerProfileId: "co-manager", billingAuthority: true, role: "admin" as const };

function paidPass(over: Record<string, unknown> = {}) {
  return {
    id: "in_pass",
    number: "LM-0001",
    status: "paid",
    livemode: true,
    created: 1_761_200_000,
    currency: "eur",
    total: 100,
    total_excluding_tax: 100,
    total_taxes: [],
    hosted_invoice_url: "https://invoice.stripe.com/i/acct/x",
    invoice_pdf: "https://pay.stripe.com/invoice/acct/x/pdf",
    metadata: { organization_id: "org-a" },
    lines: { data: [] },
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  state.config = { state: "stripe_live", testMode: false };
  subject.mockResolvedValue(MANAGER as never);
  links.mockResolvedValue({ status: "ok", customerIds: ["cus_payer"], subscriptionIds: [] });
  listInvoices.mockResolvedValue({ ok: true, invoices: [paidPass()], hasMore: false });
  providerOf.mockResolvedValue({ id: "stripe_live", active: true, listCustomerInvoices: listInvoices } as never);
});

describe("authorization — a non-manager or another organization gets nothing", () => {
  it("a member without manage-billing: nothing is read from the store or Stripe", async () => {
    subject.mockResolvedValue({ ...MANAGER, billingAuthority: false, role: "member" } as never);
    expect(await readOrganizationInvoices()).toEqual({ state: "not_authorized" });
    expect(links).not.toHaveBeenCalled();
    expect(listInvoices).not.toHaveBeenCalled();
  });
  it("a personal workspace / signed-out caller: nothing is read", async () => {
    subject.mockResolvedValue({ subject: { type: "profile", id: "p1" }, payerProfileId: "p1", billingAuthority: true, role: null } as never);
    expect(await readOrganizationInvoices()).toEqual({ state: "not_authorized" });
    subject.mockResolvedValue({ subject: null, payerProfileId: null, billingAuthority: false, role: null } as never);
    expect(await readOrganizationInvoices()).toEqual({ state: "not_authorized" });
    expect(links).not.toHaveBeenCalled();
    expect(listInvoices).not.toHaveBeenCalled();
  });
  it("keys everything by the SERVER-resolved organization and the adapter mode", async () => {
    await readOrganizationInvoices();
    expect(configFor).toHaveBeenCalledWith("org-a");
    expect(links).toHaveBeenCalledWith({ organizationId: "org-a", testMode: false });
    expect(listInvoices).toHaveBeenCalledWith("cus_payer");
  });
  it("a co-manager of organization B sees B's invoices only — A's invoice on the same payer customer is filtered out", async () => {
    subject.mockResolvedValue({ ...MANAGER, subject: { type: "organization", id: "org-b" } } as never);
    links.mockResolvedValue({ status: "ok", customerIds: ["cus_payer"], subscriptionIds: [] });
    listInvoices.mockResolvedValue({
      ok: true,
      invoices: [paidPass(), paidPass({ id: "in_b", metadata: { organization_id: "org-b" } })],
      hasMore: false,
    });
    const r = await readOrganizationInvoices();
    expect(links).toHaveBeenCalledWith({ organizationId: "org-b", testMode: false });
    expect(r.state === "list" && r.invoices.map((i) => i.id)).toEqual(["in_b"]);
  });
  it("the function takes no argument — a client cannot name an organization or a customer", () => {
    expect(readOrganizationInvoices.length).toBe(0);
  });
});

describe("honest states", () => {
  it("billing off → billing_off, no store or Stripe read", async () => {
    state.config = { state: "disabled", testMode: true };
    expect(await readOrganizationInvoices()).toEqual({ state: "billing_off" });
    expect(links).not.toHaveBeenCalled();
    expect(listInvoices).not.toHaveBeenCalled();
  });
  it("no stored customer yet → no_customer, Stripe not called", async () => {
    links.mockResolvedValue({ status: "ok", customerIds: [], subscriptionIds: [] });
    expect(await readOrganizationInvoices()).toEqual({ state: "no_customer" });
    expect(listInvoices).not.toHaveBeenCalled();
  });
  it("the store read fails (or is not migrated) → unknown", async () => {
    links.mockResolvedValue({ status: "error" });
    expect(await readOrganizationInvoices()).toEqual({ state: "unknown" });
    links.mockResolvedValue({ status: "needs-migration" });
    expect(await readOrganizationInvoices()).toEqual({ state: "unknown" });
  });
  it("the Stripe read fails or throws → unknown, never 'no invoices'", async () => {
    listInvoices.mockResolvedValue({ ok: false, reason: "api_connection_error" });
    expect(await readOrganizationInvoices()).toEqual({ state: "unknown" });
    listInvoices.mockRejectedValue(new Error("boom"));
    expect(await readOrganizationInvoices()).toEqual({ state: "unknown" });
  });
  it("an inactive provider or one without the read → unknown", async () => {
    providerOf.mockResolvedValue({ id: "noop", active: false } as never);
    expect(await readOrganizationInvoices()).toEqual({ state: "unknown" });
  });
  it("Stripe answers with nothing for this organization → an empty list", async () => {
    listInvoices.mockResolvedValue({ ok: true, invoices: [], hasMore: false });
    expect(await readOrganizationInvoices()).toEqual({ state: "list", invoices: [], incomplete: false });
  });
  it("the paid 1 € pass shows: number, date, excl. VAT, VAT, total, currency, status, links", async () => {
    const r = await readOrganizationInvoices();
    expect(r).toMatchObject({
      state: "list",
      incomplete: false,
      invoices: [
        {
          id: "in_pass",
          number: "LM-0001",
          created: 1_761_200_000,
          amountExcludingTax: 100,
          tax: 0,
          total: 100,
          currency: "eur",
          status: "paid",
          hostedInvoiceUrl: "https://invoice.stripe.com/i/acct/x",
          invoicePdfUrl: "https://pay.stripe.com/invoice/acct/x/pdf",
        },
      ],
    });
  });
  it("two customers (two payers over time), one read fails → the rest shows, marked incomplete", async () => {
    links.mockResolvedValue({ status: "ok", customerIds: ["cus_1", "cus_2"], subscriptionIds: [] });
    listInvoices.mockImplementation(async (id: string) =>
      id === "cus_1" ? { ok: true, invoices: [paidPass()], hasMore: false } : { ok: false, reason: "rate_limit" },
    );
    expect(await readOrganizationInvoices()).toMatchObject({ state: "list", incomplete: true });
  });
  it("a TEST-mode config reads test rows and drops live invoices", async () => {
    state.config = { state: "stripe_test", testMode: true };
    const r = await readOrganizationInvoices();
    expect(links).toHaveBeenCalledWith({ organizationId: "org-a", testMode: true });
    expect(r).toEqual({ state: "list", invoices: [], incomplete: false });
  });
});
