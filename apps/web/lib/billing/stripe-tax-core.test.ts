/**
 * Stripe Tax core (owner order 2026-10-23) — Checkout params, evidence parsing
 * from fixture Stripe payloads, and the review routing rules.
 *
 * Fixtures follow the pinned API version (2026-05-27.dahlia): Checkout
 * Session `customer_details.tax_ids`, `automatic_tax.status`,
 * `total_details.breakdown.taxes[]` (expanded read); Invoice `total_taxes[]`,
 * `customer_tax_ids`, `parent.subscription_details.metadata`; Tax ID
 * `verification.status`. Amounts are minor units (cents).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  checkoutTaxParams,
  decideVerificationApply,
  evaluateTaxReview,
  joinReviewReasons,
  normalizeTaxIdValue,
  oneTimePriceTaxBehavior,
  parseCheckoutSessionTax,
  parseInvoiceTax,
  parseTaxIdObject,
  reviewInputFromEvidence,
  reviewReasonFamily,
  splitReviewReasons,
  verificationFor,
  type StoredEvidenceForReview,
  type TaxIdView,
} from "@/lib/billing/stripe-tax-core";

// ─── fixtures ──────────────────────────────────────────────────────────────

function session(over: {
  country: string;
  amountSubtotal?: number;
  amountTax?: number;
  taxIds?: Array<{ type: string; value: string }>;
  status?: string;
  enabled?: boolean;
  taxes?: Array<{ amount: number; percentage: number; reason: string; taxable: number }> | null;
  taxExempt?: string;
}): Record<string, unknown> {
  const subtotal = over.amountSubtotal ?? 9900;
  const tax = over.amountTax ?? 0;
  return {
    id: "cs_test_1",
    object: "checkout.session",
    mode: "subscription",
    customer: "cus_1",
    client_reference_id: "owner-1",
    metadata: { owner_id: "owner-1", organization_id: "org-1", plan_key: "company_pilot" },
    customer_details: {
      name: "Jonas",
      business_name: "UAB Pavyzdys",
      address: { country: over.country },
      tax_exempt: over.taxExempt ?? "none",
      tax_ids: over.taxIds ?? [],
    },
    automatic_tax: { enabled: over.enabled ?? true, status: over.status ?? "complete" },
    amount_subtotal: subtotal,
    amount_total: subtotal + tax,
    currency: "eur",
    invoice: { id: "in_1", hosted_invoice_url: "https://invoice.stripe.com/i/test" },
    total_details: {
      amount_tax: tax,
      ...(over.taxes === null
        ? {}
        : {
            breakdown: {
              taxes: (over.taxes ?? []).map((t) => ({
                amount: t.amount,
                taxable_amount: t.taxable,
                taxability_reason: t.reason,
                rate: { id: "txr_1", percentage: t.percentage, country: over.country, jurisdiction: over.country },
              })),
            },
          }),
    },
  };
}

const LT_B2B_21 = session({
  country: "LT",
  amountTax: 2079,
  taxIds: [{ type: "eu_vat", value: "LT100001234567" }],
  taxes: [{ amount: 2079, percentage: 21, reason: "standard_rated", taxable: 9900 }],
});
const DE_B2B_REVERSE = session({
  country: "DE",
  amountTax: 0,
  taxIds: [{ type: "eu_vat", value: "DE 123 456 789" }],
  taxExempt: "reverse",
  taxes: [{ amount: 0, percentage: 0, reason: "reverse_charge", taxable: 9900 }],
});
const AUTOTAX_FAILED = session({ country: "LT", status: "failed", amountTax: 0, taxes: [] });
const LT_ZERO = session({
  country: "LT",
  amountTax: 0,
  taxes: [{ amount: 0, percentage: 0, reason: "not_collecting", taxable: 9900 }],
});

function taxId(status: string, value = "DE123456789"): Record<string, unknown> {
  return { id: "txi_1", object: "tax_id", customer: "cus_1", type: "eu_vat", value, verification: { status, verified_name: status === "verified" ? "Beispiel GmbH" : null } };
}

const INVOICE_LT_21: Record<string, unknown> = {
  id: "in_42",
  object: "invoice",
  customer: "cus_1",
  customer_name: "UAB Pavyzdys",
  customer_address: { country: "LT" },
  customer_tax_ids: [{ type: "eu_vat", value: "LT100001234567" }],
  customer_tax_exempt: "none",
  automatic_tax: { enabled: true, status: "complete" },
  subtotal: 9900,
  total: 11979,
  total_excluding_tax: 9900,
  currency: "eur",
  hosted_invoice_url: "https://invoice.stripe.com/i/42",
  invoice_pdf: "https://pay.stripe.com/invoice/42/pdf",
  parent: { subscription_details: { subscription: "sub_1", metadata: { owner_id: "owner-1", organization_id: "org-1" } } },
  total_taxes: [
    { amount: 2079, taxable_amount: 9900, taxability_reason: "standard_rated", tax_behavior: "exclusive", tax_rate_details: { tax_rate: "txr_lt" } },
  ],
};

// ─── 1. Checkout params ────────────────────────────────────────────────────

describe("Checkout tax params — OFF changes nothing, ON adds the four", () => {
  it("OFF: both helpers are empty, so the session is byte-for-byte unchanged", () => {
    expect(checkoutTaxParams({ enabled: false, hasCustomer: true })).toEqual({});
    expect(checkoutTaxParams({ enabled: false, hasCustomer: false })).toEqual({});
    expect(oneTimePriceTaxBehavior(false)).toEqual({});
    // Spreading an empty object leaves a params object identical (keys AND order).
    const base = { mode: "payment", line_items: [{ quantity: 1 }], metadata: { a: "1" } };
    const withOff = { ...base, ...checkoutTaxParams({ enabled: false, hasCustomer: true }) };
    expect(JSON.stringify(withOff)).toBe(JSON.stringify(base));
  });

  it("ON with an existing customer: automatic tax, required address, optional VAT id, customer_update auto", () => {
    expect(checkoutTaxParams({ enabled: true, hasCustomer: true })).toEqual({
      automatic_tax: { enabled: true },
      billing_address_collection: "required",
      tax_id_collection: { enabled: true },
      customer_update: { address: "auto", name: "auto" },
    });
  });

  it("ON without a customer: no customer_update (Stripe rejects it without a customer)", () => {
    expect(checkoutTaxParams({ enabled: true, hasCustomer: false })).toEqual({
      automatic_tax: { enabled: true },
      billing_address_collection: "required",
      tax_id_collection: { enabled: true },
    });
  });

  it("VAT id collection is enabled but never REQUIRED (an unregistered LT company still pays 21%)", () => {
    const p = checkoutTaxParams({ enabled: true, hasCustomer: false }) as Record<string, unknown>;
    expect(p.tax_id_collection).toEqual({ enabled: true });
    expect(JSON.stringify(p)).not.toContain("required\":\"if_supported");
  });

  it("ON: the pilot pass's inline price is tax-exclusive", () => {
    expect(oneTimePriceTaxBehavior(true)).toEqual({ tax_behavior: "exclusive" });
  });

  const adapter = readFileSync(join(__dirname, "providers", "stripe-test.ts"), "utf8");
  it("both checkout paths carry the four params when on: the pilot pass via the helpers, the subscription via its 2026-09-05 literals", () => {
    const sub = adapter.slice(adapter.indexOf("async createCheckoutSession("), adapter.indexOf("async createOneTimeCheckoutSession("));
    expect(sub).toContain("automatic_tax: { enabled: true }");
    expect(sub).toContain('billing_address_collection: "required"');
    expect(sub).toContain("tax_id_collection: { enabled: true }");
    expect(sub).toContain('customer_update: { address: "auto", name: "auto" }');
    // The switch does not touch the subscription path (owner decision 2026-09-05 stands).
    expect(sub).not.toContain("billingStripeTaxEnabled");
    const one = adapter.slice(adapter.indexOf("async createOneTimeCheckoutSession("), adapter.indexOf("async createCustomer("));
    expect(one).toContain("...checkoutTaxParams({ enabled: taxOn, hasCustomer: Boolean(input.providerCustomerId) })");
    expect(one).toContain("...oneTimePriceTaxBehavior(taxOn)");
  });
});

// ─── 2. Evidence parsing ───────────────────────────────────────────────────

describe("evidence parsing from Stripe payloads", () => {
  it("LT B2B at 21%: country, VAT id, amounts, breakdown, invoice and linkage", () => {
    const e = parseCheckoutSessionTax(LT_B2B_21)!;
    expect(e).toMatchObject({
      objectKind: "checkout_session",
      providerObjectId: "cs_test_1",
      providerCustomerId: "cus_1",
      organizationId: "org-1",
      ownerId: "owner-1",
      customerBusinessName: "UAB Pavyzdys",
      billingCountry: "LT",
      taxIdType: "eu_vat",
      taxIdValue: "LT100001234567",
      automaticTaxRequested: true,
      automaticTaxStatus: "complete",
      amountSubtotal: 9900,
      amountTax: 2079,
      amountTotal: 11979,
      currency: "eur",
      reverseCharge: false,
      invoiceId: "in_1",
      invoiceUrl: "https://invoice.stripe.com/i/test",
    });
    expect(e.taxes).toEqual([
      { rate: 21, jurisdiction: "LT", taxabilityReason: "standard_rated", amount: 2079, taxableAmount: 9900 },
    ]);
  });

  it("DE B2B reverse charge is recognised from the taxability reason / tax_exempt", () => {
    const e = parseCheckoutSessionTax(DE_B2B_REVERSE)!;
    expect(e.reverseCharge).toBe(true);
    expect(e.amountTax).toBe(0);
    expect(e.billingCountry).toBe("DE");
  });

  it("a webhook payload WITHOUT the expand-only breakdown parses with taxes = null", () => {
    const e = parseCheckoutSessionTax(session({ country: "LT", amountTax: 2079, taxes: null }))!;
    expect(e.taxes).toBeNull();
    expect(e.amountTax).toBe(2079);
  });

  it("invoice (post-Basil total_taxes): rate derived from amount / taxable, linkage from subscription metadata", () => {
    const e = parseInvoiceTax(INVOICE_LT_21)!;
    expect(e).toMatchObject({
      objectKind: "invoice",
      providerObjectId: "in_42",
      billingCountry: "LT",
      amountSubtotal: 9900,
      amountTax: 2079,
      amountTotal: 11979,
      organizationId: "org-1",
      ownerId: "owner-1",
      invoiceId: "in_42",
      invoiceUrl: "https://invoice.stripe.com/i/42",
      taxIdValue: "LT100001234567",
    });
    expect(e.taxes?.[0]).toMatchObject({ rate: 21, jurisdiction: "LT", taxabilityReason: "standard_rated" });
  });

  it("invoice (legacy total_tax_amounts with an expanded tax rate)", () => {
    const legacy = { ...INVOICE_LT_21, total_taxes: undefined, total_tax_amounts: [{ amount: 2079, taxable_amount: 9900, taxability_reason: "standard_rated", tax_rate: { percentage: 21, country: "LT" } }] };
    const e = parseInvoiceTax(legacy)!;
    expect(e.taxes?.[0]).toMatchObject({ rate: 21, jurisdiction: "LT" });
    expect(e.amountTax).toBe(2079);
  });

  it("Tax ID objects: verification status, unknown when Stripe sends something else", () => {
    expect(parseTaxIdObject(taxId("verified"))).toMatchObject({ status: "verified", providerCustomerId: "cus_1", verifiedName: "Beispiel GmbH" });
    expect(parseTaxIdObject(taxId("pending"))?.status).toBe("pending");
    expect(parseTaxIdObject({ ...taxId("x"), verification: { status: "weird" } })?.status).toBe("unknown");
    expect(parseTaxIdObject({ id: "txi" })).toBeNull();
  });

  it("matches the collected VAT id to the customer's tax ids by NORMALIZED value", () => {
    expect(normalizeTaxIdValue("de 123.456-789")).toBe("DE123456789");
    const ids = [parseTaxIdObject(taxId("verified"))!] as TaxIdView[];
    expect(verificationFor("DE 123 456 789", ids)).toEqual({ status: "verified", verifiedName: "Beispiel GmbH" });
    expect(verificationFor("DE999", ids).status).toBe("unknown");
    expect(verificationFor("DE999", null).status).toBe("unknown");
    expect(verificationFor(null, ids).status).toBeNull();
  });
});

// ─── 3. Review routing ─────────────────────────────────────────────────────

function review(s: Record<string, unknown>, status: Parameters<typeof reviewInputFromEvidence>[1]) {
  return evaluateTaxReview(reviewInputFromEvidence(parseCheckoutSessionTax(s)!, status));
}

describe("review routing (owner point 6)", () => {
  it("LT B2B at 21% with a pending VAT id: no review (tax was charged)", () => {
    expect(review(LT_B2B_21, "pending")).toEqual({ reviewRequired: false, reasons: [] });
  });

  it("DE B2B reverse charge: pending → flagged; verified → clear", () => {
    expect(review(DE_B2B_REVERSE, "pending").reasons).toEqual(["foreign_b2b_zero_tax_vat_id_pending"]);
    expect(review(DE_B2B_REVERSE, "verified")).toEqual({ reviewRequired: false, reasons: [] });
  });

  it("DE B2B reverse charge with unverified / unavailable / unknown stays flagged", () => {
    expect(review(DE_B2B_REVERSE, "unverified").reasons).toEqual(["foreign_b2b_zero_tax_vat_id_unverified"]);
    expect(review(DE_B2B_REVERSE, "unavailable").reasons).toEqual(["foreign_b2b_zero_tax_vat_id_unavailable"]);
    expect(review(DE_B2B_REVERSE, "unknown").reasons).toEqual(["foreign_b2b_zero_tax_vat_id_unknown"]);
  });

  it("automatic tax failed → review (and an empty breakdown is flagged too)", () => {
    const r = review(AUTOTAX_FAILED, null);
    expect(r.reviewRequired).toBe(true);
    expect(r.reasons).toContain("automatic_tax_failed");
    expect(r.reasons).toContain("no_tax_breakdown");
  });

  it("requires_location_inputs and a missing status are both review", () => {
    expect(review(session({ country: "LT", status: "requires_location_inputs", amountTax: 2079, taxes: [{ amount: 2079, percentage: 21, reason: "standard_rated", taxable: 9900 }] }), null).reasons).toEqual(["automatic_tax_requires_location_inputs"]);
    const noStatus = { ...LT_B2B_21, automatic_tax: { enabled: true } };
    expect(review(noStatus, "verified").reasons).toEqual(["automatic_tax_missing"]);
  });

  it("LT customer at 0 tax → review even with a Stripe reason", () => {
    expect(review(LT_ZERO, null).reasons).toEqual(["lt_zero_tax"]);
  });

  it("foreign customer at 0 tax without any VAT id → review", () => {
    const s = session({ country: "FR", amountTax: 0, taxes: [{ amount: 0, percentage: 0, reason: "not_collecting", taxable: 9900 }] });
    expect(review(s, null).reasons).toEqual(["foreign_zero_tax_without_vat_id"]);
  });

  it("no tax breakdown at all while the switch is on → review", () => {
    expect(review(session({ country: "LT", amountTax: 2079, taxes: null }), null).reasons).toEqual(["no_tax_breakdown"]);
  });

  it("automatic tax not requested on a session captured with the switch on → review", () => {
    const s = session({ country: "LT", enabled: false, amountTax: 0, taxes: null });
    expect(review(s, null).reasons[0]).toBe("automatic_tax_not_requested");
  });

  it("a zero-amount session (trial start) needs no tax review when automatic tax completed", () => {
    const trial = session({ country: "LT", amountSubtotal: 0, amountTax: 0, taxes: [] });
    expect(review(trial, null)).toEqual({ reviewRequired: false, reasons: [] });
  });

  it("missing country / tax amount on a paid sale → review", () => {
    const s = { ...LT_B2B_21, customer_details: { address: {} }, total_details: { breakdown: { taxes: [] } } };
    const r = review(s, null);
    expect(r.reasons).toEqual(expect.arrayContaining(["billing_country_missing", "no_tax_breakdown"]));
  });

  it("an invoice at 21% for LT is clean", () => {
    expect(evaluateTaxReview(reviewInputFromEvidence(parseInvoiceTax(INVOICE_LT_21)!, "verified")).reviewRequired).toBe(false);
  });

  it("reasons round-trip through the stored text column and map to i18n families", () => {
    const stored = joinReviewReasons(["automatic_tax_failed", "foreign_b2b_zero_tax_vat_id_pending"]);
    expect(stored).toBe("automatic_tax_failed; foreign_b2b_zero_tax_vat_id_pending");
    expect(joinReviewReasons([])).toBeNull();
    expect(splitReviewReasons(stored)).toEqual(["automatic_tax_failed", "foreign_b2b_zero_tax_vat_id_pending"]);
    expect(reviewReasonFamily("automatic_tax_failed")).toEqual({ family: "automaticTax", status: "failed" });
    expect(reviewReasonFamily("automatic_tax_not_requested").family).toBe("notRequested");
    expect(reviewReasonFamily("foreign_b2b_zero_tax_vat_id_pending")).toEqual({ family: "foreignVatId", status: "pending" });
    expect(reviewReasonFamily("lt_zero_tax").family).toBe("ltZero");
    expect(reviewReasonFamily("something_new").family).toBe("other");
  });
});

// ─── 4. Verification updates (pending → verified) ─────────────────────────

function storedFrom(s: Record<string, unknown>, status: Parameters<typeof reviewInputFromEvidence>[1], over: Partial<StoredEvidenceForReview> = {}): StoredEvidenceForReview {
  const e = parseCheckoutSessionTax(s)!;
  const d = evaluateTaxReview(reviewInputFromEvidence(e, status));
  return {
    automatic_tax_requested: e.automaticTaxRequested,
    automatic_tax_status: e.automaticTaxStatus,
    billing_country: e.billingCountry,
    amount_subtotal: e.amountSubtotal,
    amount_tax: e.amountTax,
    taxes: e.taxes,
    tax_id_value: e.taxIdValue,
    review_required: d.reviewRequired,
    review_reason: joinReviewReasons(d.reasons),
    reviewed_at: null,
    tax_id_verification_event_at: null,
    ...over,
  };
}

describe("customer.tax_id.updated on stored evidence", () => {
  it("DE reverse charge pending → verified clears the flag automatically", () => {
    const row = storedFrom(DE_B2B_REVERSE, "pending");
    expect(row.review_required).toBe(true);
    expect(decideVerificationApply(row, { status: "verified", eventCreated: 1_800_000_000 })).toEqual({
      apply: true,
      review: { reviewRequired: false, reviewReason: null },
    });
  });

  it("pending → unverified keeps the flag with the new reason", () => {
    const row = storedFrom(DE_B2B_REVERSE, "pending");
    expect(decideVerificationApply(row, { status: "unverified", eventCreated: 1_800_000_000 })).toEqual({
      apply: true,
      review: { reviewRequired: true, reviewReason: "foreign_b2b_zero_tax_vat_id_unverified" },
    });
  });

  it("a verified result never clears a flag that has another cause (LT zero tax)", () => {
    const row = storedFrom({ ...LT_ZERO, customer_details: { ...(LT_ZERO.customer_details as object), tax_ids: [{ type: "eu_vat", value: "LT1" }] } }, "pending");
    const d = decideVerificationApply(row, { status: "verified", eventCreated: 1_800_000_000 });
    expect(d).toEqual({ apply: true, review: { reviewRequired: true, reviewReason: "lt_zero_tax" } });
  });

  it("an OLDER verification event is skipped (a late pending never overwrites verified)", () => {
    const row = storedFrom(DE_B2B_REVERSE, "verified", { tax_id_verification_event_at: new Date(1_800_000_100 * 1000).toISOString() });
    expect(decideVerificationApply(row, { status: "pending", eventCreated: 1_800_000_000 })).toEqual({ apply: false, reason: "stale_event" });
  });

  it("a row an admin reviewed keeps its review state; only the status moves", () => {
    const row = storedFrom(DE_B2B_REVERSE, "pending", { review_required: false, reviewed_at: "2026-10-23T10:00:00Z" });
    expect(decideVerificationApply(row, { status: "unverified", eventCreated: 1_800_000_000 })).toEqual({ apply: true, review: null });
  });
});
