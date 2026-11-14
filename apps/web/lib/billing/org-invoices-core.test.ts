/**
 * Organization invoices — pure core (registry 7.20). Who may see the list,
 * which Stripe invoices belong to the organization, and the honest states.
 */
import { describe, expect, it } from "vitest";

import {
  buildOrgInvoiceList,
  evaluateOrgInvoiceAccess,
  formatInvoiceAmount,
  invoiceBelongsToOrganization,
  normalizeInvoice,
  stripeHostedUrl,
} from "@/lib/billing/org-invoices-core";

const ORG = "org-a";
const OTHER = "org-b";

/** A finalized post-Basil Stripe invoice (the shape the pinned API version returns). */
function invoice(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "in_1",
    object: "invoice",
    number: "ABCD-0001",
    status: "paid",
    livemode: true,
    created: 1_761_200_000,
    currency: "eur",
    total: 100,
    total_excluding_tax: 100,
    total_taxes: [],
    period_start: 1_761_200_000,
    period_end: 1_761_200_000,
    hosted_invoice_url: "https://invoice.stripe.com/i/acct_x/test_y",
    invoice_pdf: "https://pay.stripe.com/invoice/acct_x/test_y/pdf",
    metadata: { organization_id: ORG, lm_purpose: "lm_pilot_pass" },
    parent: null,
    lines: { data: [{ period: { start: 1_761_200_000, end: 1_761_200_000 } }] },
    ...over,
  };
}

describe("the gate — authorization before anything else", () => {
  const live = "stripe_live";
  it("an organization billing manager passes", () => {
    expect(
      evaluateOrgInvoiceAccess({ subject: { type: "organization", id: ORG }, billingAuthority: true, billingState: live }),
    ).toEqual({ ok: true, organizationId: ORG });
  });
  it("a member without billing authority gets nothing — even while billing is off (no state leak)", () => {
    for (const billingState of [live, "stripe_test", "disabled"]) {
      expect(
        evaluateOrgInvoiceAccess({ subject: { type: "organization", id: ORG }, billingAuthority: false, billingState }),
      ).toEqual({ ok: false, result: { state: "not_authorized" } });
    }
  });
  it("a personal workspace or no session gets nothing", () => {
    expect(evaluateOrgInvoiceAccess({ subject: { type: "profile", id: "p1" }, billingAuthority: true, billingState: live }))
      .toEqual({ ok: false, result: { state: "not_authorized" } });
    expect(evaluateOrgInvoiceAccess({ subject: null, billingAuthority: false, billingState: live }))
      .toEqual({ ok: false, result: { state: "not_authorized" } });
  });
  it("billing off / live blocked reads as billing_off for a manager", () => {
    for (const billingState of ["disabled", "stripe_live_blocked"]) {
      expect(
        evaluateOrgInvoiceAccess({ subject: { type: "organization", id: ORG }, billingAuthority: true, billingState }),
      ).toEqual({ ok: false, result: { state: "billing_off" } });
    }
  });
});

describe("attribution — only this organization's invoices", () => {
  const scope = { organizationId: ORG, subscriptionIds: new Set(["sub_org"]) };
  it("invoice metadata naming the organization (the 1 € pass) belongs", () => {
    expect(invoiceBelongsToOrganization(invoice(), scope)).toBe(true);
  });
  it("a subscription invoice whose metadata snapshot names the organization belongs (post-Basil parent)", () => {
    const raw = invoice({
      metadata: {},
      parent: { type: "subscription_details", subscription_details: { subscription: "sub_x", metadata: { organization_id: ORG } } },
    });
    expect(invoiceBelongsToOrganization(raw, scope)).toBe(true);
  });
  it("an invoice naming ANOTHER organization never belongs — even on this organization's subscription", () => {
    const raw = invoice({
      metadata: { organization_id: OTHER },
      parent: { subscription_details: { subscription: "sub_org", metadata: {} } },
    });
    expect(invoiceBelongsToOrganization(raw, scope)).toBe(false);
    const viaSub = invoice({
      metadata: {},
      parent: { subscription_details: { subscription: "sub_org", metadata: { organization_id: OTHER } } },
    });
    expect(invoiceBelongsToOrganization(viaSub, scope)).toBe(false);
  });
  it("an unnamed invoice belongs only through the organization's own stored subscription (legacy field too)", () => {
    expect(invoiceBelongsToOrganization(invoice({ metadata: {}, subscription: "sub_org" }), scope)).toBe(true);
    expect(invoiceBelongsToOrganization(invoice({ metadata: {}, subscription: "sub_personal" }), scope)).toBe(false);
    expect(invoiceBelongsToOrganization(invoice({ metadata: {} }), scope)).toBe(false);
  });
});

describe("normalization — the figures Stripe reported, nothing invented", () => {
  it("the 1 € pass: no VAT computed is a real 0, and a one-off has no service period", () => {
    const v = normalizeInvoice(invoice(), { livemode: true })!;
    expect(v).toMatchObject({
      number: "ABCD-0001",
      status: "paid",
      total: 100,
      amountExcludingTax: 100,
      tax: 0,
      currency: "eur",
      periodStart: null,
      periodEnd: null,
    });
    expect(v.hostedInvoiceUrl).toContain("invoice.stripe.com");
    expect(v.invoicePdfUrl).toContain("pay.stripe.com");
  });
  it("Stripe Tax VAT: total_taxes summed, excl. VAT from Stripe", () => {
    const v = normalizeInvoice(
      invoice({ total: 11979, total_excluding_tax: 9900, total_taxes: [{ amount: 2079, tax_behavior: "exclusive" }] }),
      { livemode: true },
    )!;
    expect(v).toMatchObject({ total: 11979, amountExcludingTax: 9900, tax: 2079 });
  });
  it("VAT not reported at all → UNKNOWN (null), never 0", () => {
    const v = normalizeInvoice(invoice({ total_taxes: undefined, total_excluding_tax: null }), { livemode: true })!;
    expect(v.tax).toBeNull();
    expect(v.amountExcludingTax).toBeNull();
    expect(v.total).toBe(100);
  });
  it("a subscription invoice states the line items' service period", () => {
    const v = normalizeInvoice(
      invoice({ lines: { data: [{ period: { start: 1_761_000_000, end: 1_763_600_000 } }] } }),
      { livemode: true },
    )!;
    expect(v.periodStart).toBe(1_761_000_000);
    expect(v.periodEnd).toBe(1_763_600_000);
  });
  it("drafts, unknown statuses and the other Stripe mode are dropped", () => {
    expect(normalizeInvoice(invoice({ status: "draft", number: null }), { livemode: true })).toBeNull();
    expect(normalizeInvoice(invoice({ status: "weird" }), { livemode: true })).toBeNull();
    expect(normalizeInvoice(invoice({ livemode: false }), { livemode: true })).toBeNull();
    for (const status of ["paid", "open", "void", "uncollectible"]) {
      expect(normalizeInvoice(invoice({ status }), { livemode: true })?.status).toBe(status);
    }
  });
  it("links only to Stripe's own https pages", () => {
    expect(stripeHostedUrl("https://invoice.stripe.com/i/x")).toBe("https://invoice.stripe.com/i/x");
    expect(stripeHostedUrl("http://invoice.stripe.com/i/x")).toBeNull();
    expect(stripeHostedUrl("https://evil.example/stripe.com")).toBeNull();
    expect(stripeHostedUrl("https://stripe.com.evil.example/x")).toBeNull();
    expect(stripeHostedUrl("javascript:alert(1)")).toBeNull();
    expect(normalizeInvoice(invoice({ hosted_invoice_url: "https://evil.example/x" }), { livemode: true })?.hostedInvoiceUrl).toBeNull();
  });
});

describe("the list — honest states", () => {
  const base = { organizationId: ORG, subscriptionIds: ["sub_org"], livemode: true };
  it("no customer → no_customer", () => {
    expect(buildOrgInvoiceList({ ...base, reads: [] })).toEqual({ state: "no_customer" });
  });
  it("every read failed → UNKNOWN, never an empty list", () => {
    expect(buildOrgInvoiceList({ ...base, reads: [{ ok: false }, { ok: false }] })).toEqual({ state: "unknown" });
  });
  it("read fine, nothing attributed → an empty list (a real answer)", () => {
    const r = buildOrgInvoiceList({ ...base, reads: [{ ok: true, invoices: [invoice({ metadata: { organization_id: OTHER } })], hasMore: false }] });
    expect(r).toEqual({ state: "list", invoices: [], incomplete: false });
  });
  it("one of two reads failed, or more pages exist → shown and marked incomplete", () => {
    const partial = buildOrgInvoiceList({ ...base, reads: [{ ok: true, invoices: [invoice()], hasMore: false }, { ok: false }] });
    expect(partial).toMatchObject({ state: "list", incomplete: true });
    const paged = buildOrgInvoiceList({ ...base, reads: [{ ok: true, invoices: [invoice()], hasMore: true }] });
    expect(paged).toMatchObject({ state: "list", incomplete: true });
  });
  it("newest first, each invoice once, other organizations' invoices filtered out", () => {
    const r = buildOrgInvoiceList({
      ...base,
      reads: [
        { ok: true, invoices: [invoice({ id: "in_old", created: 10 }), invoice({ id: "in_other", metadata: { organization_id: OTHER } })], hasMore: false },
        { ok: true, invoices: [invoice({ id: "in_new", created: 20 }), invoice({ id: "in_old", created: 10 })], hasMore: false },
      ],
    });
    expect(r.state === "list" && r.invoices.map((i) => i.id)).toEqual(["in_new", "in_old"]);
  });
});

describe("money", () => {
  it("minor units in the page's language; zero-decimal currencies stay whole; unknown stays unknown", () => {
    expect(formatInvoiceAmount(100, "eur", "en")).toBe("€1.00");
    expect(formatInvoiceAmount(100, "eur", "lt")).toMatch(/^1,00\s€$/);
    expect(formatInvoiceAmount(500, "jpy", "en")).toBe("¥500");
    expect(formatInvoiceAmount(null, "eur", "en")).toBeNull();
  });
});
