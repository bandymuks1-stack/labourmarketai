/**
 * Stripe Tax — PURE core (owner order 2026-10-23: Stripe Tax for organization
 * paid plans, TEST first, switched OFF by default). No IO, no SDK import.
 *
 * Three jobs:
 *   1. the Checkout tax parameters the switch adds (`checkoutTaxParams`,
 *      `oneTimePriceTaxBehavior`) — EMPTY while the switch is off, so the
 *      session the adapter sends is exactly what it sent before;
 *   2. parsing the tax evidence out of signature-verified Stripe objects
 *      (Checkout Session, Invoice, Tax ID) — tolerant of the pinned post-Basil
 *      API shape AND the legacy shape, like webhook-core;
 *   3. the REVIEW ROUTING rules (owner point 6): when automatic taxation cannot
 *      be determined reliably the transaction is flagged for a human — we never
 *      create our own exemption and never change an amount Stripe computed.
 *
 * The seller is a Lithuanian UAB: LT customers expect standard 21% VAT; a
 * foreign B2B sale may be reverse-charged by Stripe Tax only when the VAT id's
 * verification is confirmed — until then it stays in review.
 */

/** The seller's country (the UAB's VAT registration). */
export const SELLER_COUNTRY = "LT";

/** Stripe Tax ID verification states, plus our own `unknown` (the read failed or no matching id). */
export type TaxIdVerificationStatus = "pending" | "verified" | "unverified" | "unavailable" | "unknown";

const VERIFICATION_STATES = new Set(["pending", "verified", "unverified", "unavailable"]);

// ─── 1. Checkout parameters ────────────────────────────────────────────────

/** Exactly the Checkout Session fields the switch may add (typed to fit the SDK params). */
export interface CheckoutTaxParams {
  automatic_tax?: { enabled: true };
  billing_address_collection?: "required";
  tax_id_collection?: { enabled: true };
  customer_update?: { address: "auto"; name: "auto" };
}

/**
 * The four Checkout Session parameters Stripe Tax needs: automatic tax, the
 * billing address it computes from (required), VAT id collection (OPTIONAL — a
 * non-VAT-registered LT company still pays 21%), and — only with an existing
 * customer — permission for Checkout to store the collected name/address on
 * that customer (Stripe refuses automatic tax on a reused customer otherwise).
 * Off → `{}`: the session is byte-for-byte what it was before the switch.
 */
export function checkoutTaxParams(input: {
  readonly enabled: boolean;
  readonly hasCustomer: boolean;
}): CheckoutTaxParams {
  if (!input.enabled) return {};
  return {
    automatic_tax: { enabled: true },
    billing_address_collection: "required",
    tax_id_collection: { enabled: true },
    ...(input.hasCustomer ? { customer_update: { address: "auto", name: "auto" } } : {}),
  };
}

/**
 * Inline `price_data` (the pilot pass) carries its own tax behaviour: the
 * amount is tax-EXCLUSIVE, VAT is added on top. Saved prices carry it on the
 * Stripe price object (an owner action, docs/billing/stripe-tax-rollout.md).
 */
export function oneTimePriceTaxBehavior(enabled: boolean): { tax_behavior?: "exclusive" } {
  return enabled ? { tax_behavior: "exclusive" } : {};
}

// ─── 2. Evidence parsing ───────────────────────────────────────────────────

export interface TaxLine {
  /** Percentage as Stripe reports it (e.g. 21), or derived amount/taxable_amount; null when unknown. */
  readonly rate: number | null;
  readonly jurisdiction: string | null;
  readonly taxabilityReason: string | null;
  readonly amount: number;
  readonly taxableAmount: number | null;
}

export interface TaxEvidence {
  readonly objectKind: "checkout_session" | "invoice";
  readonly providerObjectId: string;
  readonly providerCustomerId: string | null;
  readonly organizationId: string | null;
  readonly ownerId: string | null;
  readonly customerBusinessName: string | null;
  readonly billingCountry: string | null;
  readonly taxIdType: string | null;
  readonly taxIdValue: string | null;
  readonly automaticTaxRequested: boolean;
  readonly automaticTaxStatus: string | null;
  readonly amountSubtotal: number | null;
  readonly amountTax: number | null;
  readonly amountTotal: number | null;
  readonly currency: string | null;
  readonly reverseCharge: boolean;
  /** null = Stripe gave no breakdown at all (absent / not expanded). */
  readonly taxes: readonly TaxLine[] | null;
  readonly invoiceId: string | null;
  readonly invoiceUrl: string | null;
}

type Obj = Record<string, unknown>;

function asObj(v: unknown): Obj | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : null;
}
function str(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}
function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}
function idFrom(v: unknown): string | null {
  if (typeof v === "string") return v.length > 0 ? v : null;
  return str(asObj(v)?.id);
}
function country(v: unknown): string | null {
  const c = str(v);
  return c ? c.toUpperCase() : null;
}
/** Normalized VAT id for matching (Stripe stores it as typed: spaces/dots/case vary). */
export function normalizeTaxIdValue(v: string | null | undefined): string | null {
  if (!v) return null;
  const n = v.replace(/[\s.\-]/g, "").toUpperCase();
  return n.length > 0 ? n : null;
}

/** First collected tax id ({type, value}) of a list. */
function firstTaxId(list: unknown): { type: string | null; value: string | null } {
  if (!Array.isArray(list)) return { type: null, value: null };
  for (const t of list) {
    const o = asObj(t);
    const value = str(o?.value);
    if (value) return { type: str(o?.type), value };
  }
  return { type: null, value: null };
}

/** owner/org linkage from canonical metadata (metadata-core) — never trusted for money. */
function linkage(metas: Array<Obj | null>, clientReferenceId: unknown): { ownerId: string | null; organizationId: string | null } {
  let ownerId = str(clientReferenceId);
  let organizationId: string | null = null;
  for (const m of metas) {
    if (!m) continue;
    ownerId = ownerId ?? str(m.owner_id) ?? str(m.client_reference_id);
    organizationId = organizationId ?? str(m.organization_id);
  }
  return { ownerId, organizationId };
}

function rateFrom(percentage: number | null, amount: number, taxable: number | null): number | null {
  if (percentage !== null) return percentage;
  if (taxable && taxable > 0) return Math.round((amount / taxable) * 10000) / 100;
  return null;
}

/** Checkout Session `total_details.breakdown.taxes[]` (present only when expanded). */
function sessionTaxLines(totalDetails: Obj | null, fallbackCountry: string | null): TaxLine[] | null {
  const breakdown = asObj(totalDetails?.breakdown);
  if (!breakdown || !Array.isArray(breakdown.taxes)) return null;
  const lines: TaxLine[] = [];
  for (const t of breakdown.taxes) {
    const o = asObj(t);
    if (!o) continue;
    const amount = num(o.amount) ?? 0;
    const taxable = num(o.taxable_amount);
    const rate = asObj(o.rate);
    lines.push({
      rate: rateFrom(num(rate?.percentage), amount, taxable),
      jurisdiction: str(rate?.jurisdiction) ?? country(rate?.country) ?? fallbackCountry,
      taxabilityReason: str(o.taxability_reason),
      amount,
      taxableAmount: taxable,
    });
  }
  return lines;
}

/** Invoice taxes — post-Basil `total_taxes[]`, legacy `total_tax_amounts[]`. */
function invoiceTaxLines(inv: Obj, fallbackCountry: string | null): TaxLine[] | null {
  const list = Array.isArray(inv.total_taxes)
    ? inv.total_taxes
    : Array.isArray(inv.total_tax_amounts)
      ? inv.total_tax_amounts
      : null;
  if (!list) return null;
  const lines: TaxLine[] = [];
  for (const t of list) {
    const o = asObj(t);
    if (!o) continue;
    const amount = num(o.amount) ?? 0;
    const taxable = num(o.taxable_amount);
    const details = asObj(o.tax_rate_details);
    const rateObj = asObj(details?.tax_rate) ?? asObj(o.tax_rate);
    lines.push({
      rate: rateFrom(num(rateObj?.percentage), amount, taxable),
      jurisdiction: str(rateObj?.jurisdiction) ?? country(rateObj?.country) ?? fallbackCountry,
      taxabilityReason: str(o.taxability_reason),
      amount,
      taxableAmount: taxable,
    });
  }
  return lines;
}

function sumTax(lines: readonly TaxLine[] | null): number | null {
  if (!lines) return null;
  return lines.reduce((s, l) => s + l.amount, 0);
}

function isReverseCharge(lines: readonly TaxLine[] | null, taxExempt: unknown): boolean {
  if (taxExempt === "reverse") return true;
  return Boolean(lines?.some((l) => l.taxabilityReason === "reverse_charge"));
}

/** A completed Checkout Session (webhook payload, or the expanded read of it). */
export function parseCheckoutSessionTax(session: Obj | null | undefined): TaxEvidence | null {
  if (!session) return null;
  const id = str(session.id);
  if (!id) return null;
  const details = asObj(session.customer_details);
  const address = asObj(details?.address);
  const billingCountry = country(address?.country);
  const totalDetails = asObj(session.total_details);
  const taxes = sessionTaxLines(totalDetails, billingCountry);
  const taxId = firstTaxId(details?.tax_ids);
  const automatic = asObj(session.automatic_tax);
  const invoice = asObj(session.invoice);
  const { ownerId, organizationId } = linkage([asObj(session.metadata)], session.client_reference_id);
  return {
    objectKind: "checkout_session",
    providerObjectId: id,
    providerCustomerId: idFrom(session.customer),
    organizationId,
    ownerId,
    customerBusinessName: str(details?.business_name) ?? str(details?.name),
    billingCountry,
    taxIdType: taxId.type,
    taxIdValue: taxId.value,
    automaticTaxRequested: automatic?.enabled === true,
    automaticTaxStatus: str(automatic?.status),
    amountSubtotal: num(session.amount_subtotal),
    amountTax: num(totalDetails?.amount_tax) ?? sumTax(taxes),
    amountTotal: num(session.amount_total),
    currency: str(session.currency),
    reverseCharge: isReverseCharge(taxes, details?.tax_exempt),
    taxes,
    invoiceId: idFrom(session.invoice),
    invoiceUrl: str(invoice?.hosted_invoice_url) ?? str(invoice?.invoice_pdf),
  };
}

/** A paid invoice (invoice.paid / invoice.payment_succeeded payload). */
export function parseInvoiceTax(inv: Obj | null | undefined): TaxEvidence | null {
  if (!inv) return null;
  const id = str(inv.id);
  if (!id) return null;
  const address = asObj(inv.customer_address);
  const billingCountry = country(address?.country);
  const taxes = invoiceTaxLines(inv, billingCountry);
  const taxId = firstTaxId(inv.customer_tax_ids);
  const automatic = asObj(inv.automatic_tax);
  const parent = asObj(inv.parent);
  const subDetails = asObj(parent?.subscription_details) ?? asObj(inv.subscription_details);
  const { ownerId, organizationId } = linkage([asObj(inv.metadata), asObj(subDetails?.metadata)], null);
  const total = num(inv.total);
  const excl = num(inv.total_excluding_tax);
  const amountTax = sumTax(taxes) ?? num(inv.tax) ?? (total !== null && excl !== null ? total - excl : null);
  return {
    objectKind: "invoice",
    providerObjectId: id,
    providerCustomerId: idFrom(inv.customer),
    organizationId,
    ownerId,
    customerBusinessName: str(inv.customer_name),
    billingCountry,
    taxIdType: taxId.type,
    taxIdValue: taxId.value,
    automaticTaxRequested: automatic?.enabled === true,
    automaticTaxStatus: str(automatic?.status),
    amountSubtotal: num(inv.subtotal),
    amountTax,
    amountTotal: total,
    currency: str(inv.currency),
    reverseCharge: isReverseCharge(taxes, inv.customer_tax_exempt),
    taxes,
    invoiceId: id,
    invoiceUrl: str(inv.hosted_invoice_url) ?? str(inv.invoice_pdf),
  };
}

export interface TaxIdView {
  readonly providerTaxId: string | null;
  readonly providerCustomerId: string | null;
  readonly type: string | null;
  readonly value: string | null;
  readonly status: TaxIdVerificationStatus;
  readonly verifiedName: string | null;
}

/** A Stripe Tax ID object (customer.tax_id.updated payload, or a listTaxIds row). */
export function parseTaxIdObject(o: Obj | null | undefined): TaxIdView | null {
  if (!o) return null;
  const value = str(o.value);
  if (!value) return null;
  const verification = asObj(o.verification);
  const raw = str(verification?.status);
  return {
    providerTaxId: str(o.id),
    providerCustomerId: idFrom(o.customer) ?? idFrom(asObj(o.owner)?.customer),
    type: str(o.type),
    value,
    status: raw && VERIFICATION_STATES.has(raw) ? (raw as TaxIdVerificationStatus) : "unknown",
    verifiedName: str(verification?.verified_name),
  };
}

/** The verification status of the collected VAT id among the customer's tax ids. */
export function verificationFor(
  taxIdValue: string | null,
  customerTaxIds: readonly TaxIdView[] | null,
): { status: TaxIdVerificationStatus | null; verifiedName: string | null } {
  if (!taxIdValue) return { status: null, verifiedName: null };
  const want = normalizeTaxIdValue(taxIdValue);
  const hit = customerTaxIds?.find((t) => normalizeTaxIdValue(t.value) === want);
  return hit ? { status: hit.status, verifiedName: hit.verifiedName } : { status: "unknown", verifiedName: null };
}

// ─── 3. Review routing ─────────────────────────────────────────────────────

export interface ReviewInput {
  readonly automaticTaxRequested: boolean;
  readonly automaticTaxStatus: string | null;
  readonly billingCountry: string | null;
  readonly amountSubtotal: number | null;
  readonly amountTax: number | null;
  readonly hasTaxBreakdown: boolean;
  readonly taxIdValue: string | null;
  readonly taxIdVerificationStatus: TaxIdVerificationStatus | null;
}

export interface ReviewDecision {
  readonly reviewRequired: boolean;
  /** Stable machine codes, in rule order; [] when no review is needed. */
  readonly reasons: readonly string[];
}

/**
 * Owner point 6 — route to review when automatic taxation cannot be determined
 * reliably. Evaluated only for evidence captured while the switch is ON.
 *
 *   A. automatic tax not requested, or its status is not `complete`;
 *   B. a PAID sale (subtotal > 0) with no billing country / no tax amount;
 *   C. a paid sale with no tax breakdown at all;
 *   D. LT customer, paid, tax 0 → `lt_zero_tax` (21% expected; even an explicit
 *      Stripe reason goes to a human);
 *   E. foreign customer, paid, tax 0:
 *        with a VAT id whose verification is not `verified` → flagged
 *        (pending stays flagged until verified arrives; unverified /
 *        unavailable / unknown stay flagged);
 *        without any VAT id → flagged (zero tax with no B2B basis).
 *
 * A zero-amount session (a trial start) carries no money, so only rule A
 * applies to it. Nothing here changes an amount or grants an exemption.
 */
export function evaluateTaxReview(input: ReviewInput): ReviewDecision {
  const reasons: string[] = [];
  if (!input.automaticTaxRequested) {
    reasons.push("automatic_tax_not_requested");
  } else if (input.automaticTaxStatus !== "complete") {
    reasons.push(`automatic_tax_${input.automaticTaxStatus ?? "missing"}`);
  }
  const subtotal = input.amountSubtotal;
  const paid = subtotal === null || subtotal > 0;
  if (paid) {
    if (subtotal === null) reasons.push("amount_missing");
    if (!input.billingCountry) reasons.push("billing_country_missing");
    if (input.amountTax === null) reasons.push("tax_amount_missing");
    if (!input.hasTaxBreakdown) reasons.push("no_tax_breakdown");
    if (input.amountTax === 0 && input.billingCountry) {
      if (input.billingCountry === SELLER_COUNTRY) {
        reasons.push("lt_zero_tax");
      } else if (input.taxIdValue) {
        if (input.taxIdVerificationStatus !== "verified") {
          reasons.push(`foreign_b2b_zero_tax_vat_id_${input.taxIdVerificationStatus ?? "unknown"}`);
        }
      } else {
        reasons.push("foreign_zero_tax_without_vat_id");
      }
    }
  }
  return { reviewRequired: reasons.length > 0, reasons };
}

export function reviewInputFromEvidence(
  e: Pick<
    TaxEvidence,
    "automaticTaxRequested" | "automaticTaxStatus" | "billingCountry" | "amountSubtotal" | "amountTax" | "taxes" | "taxIdValue"
  >,
  status: TaxIdVerificationStatus | null,
): ReviewInput {
  return {
    automaticTaxRequested: e.automaticTaxRequested,
    automaticTaxStatus: e.automaticTaxStatus,
    billingCountry: e.billingCountry,
    amountSubtotal: e.amountSubtotal,
    amountTax: e.amountTax,
    hasTaxBreakdown: Array.isArray(e.taxes) && e.taxes.length > 0,
    taxIdValue: e.taxIdValue,
    taxIdVerificationStatus: status,
  };
}

/** Stored form of the reasons (one text column); "" never stored — null instead. */
export function joinReviewReasons(reasons: readonly string[]): string | null {
  return reasons.length > 0 ? reasons.join("; ") : null;
}

/** The i18n family of one stored reason code (admin review list). */
export type ReviewReasonFamily =
  | "automaticTax"
  | "notRequested"
  | "amountMissing"
  | "countryMissing"
  | "taxMissing"
  | "noBreakdown"
  | "ltZero"
  | "foreignVatId"
  | "foreignNoVatId"
  | "other";

export function reviewReasonFamily(code: string): { family: ReviewReasonFamily; status: string | null } {
  if (code === "automatic_tax_not_requested") return { family: "notRequested", status: null };
  if (code.startsWith("automatic_tax_")) return { family: "automaticTax", status: code.slice("automatic_tax_".length) };
  if (code === "amount_missing") return { family: "amountMissing", status: null };
  if (code === "billing_country_missing") return { family: "countryMissing", status: null };
  if (code === "tax_amount_missing") return { family: "taxMissing", status: null };
  if (code === "no_tax_breakdown") return { family: "noBreakdown", status: null };
  if (code === "lt_zero_tax") return { family: "ltZero", status: null };
  if (code.startsWith("foreign_b2b_zero_tax_vat_id_")) {
    return { family: "foreignVatId", status: code.slice("foreign_b2b_zero_tax_vat_id_".length) };
  }
  if (code === "foreign_zero_tax_without_vat_id") return { family: "foreignNoVatId", status: null };
  return { family: "other", status: null };
}

export function splitReviewReasons(stored: string | null | undefined): string[] {
  return (stored ?? "").split(";").map((s) => s.trim()).filter(Boolean);
}

// ─── 4. Re-evaluation on a verification update ─────────────────────────────

export interface StoredEvidenceForReview {
  readonly automatic_tax_requested: boolean | null;
  readonly automatic_tax_status: string | null;
  readonly billing_country: string | null;
  readonly amount_subtotal: number | null;
  readonly amount_tax: number | null;
  readonly taxes: unknown;
  readonly tax_id_value: string | null;
  readonly review_required: boolean | null;
  readonly review_reason: string | null;
  readonly reviewed_at: string | null;
  readonly tax_id_verification_event_at: string | null;
}

export type VerificationApply =
  | { readonly apply: false; readonly reason: "stale_event" }
  | {
      readonly apply: true;
      /** null = leave the review columns as they are. */
      readonly review: { readonly reviewRequired: boolean; readonly reviewReason: string | null } | null;
    };

/**
 * A `customer.tax_id.updated` result applied to one stored evidence row:
 *   - an event OLDER than the one that last set the status is skipped;
 *   - a row a platform admin already reviewed keeps its review state (only
 *     the status columns move — a human decision is not overridden);
 *   - otherwise the rules are re-run with the new status. A flag is CLEARED
 *     only when the incoming status is `verified` (owner: clearing happens via
 *     a verified result or an admin, never by any other event).
 */
export function decideVerificationApply(
  row: StoredEvidenceForReview,
  incoming: { readonly status: TaxIdVerificationStatus; readonly eventCreated: number | null },
): VerificationApply {
  if (
    row.tax_id_verification_event_at &&
    incoming.eventCreated !== null &&
    incoming.eventCreated * 1000 < Date.parse(row.tax_id_verification_event_at)
  ) {
    return { apply: false, reason: "stale_event" };
  }
  if (row.reviewed_at) return { apply: true, review: null };
  const taxes = Array.isArray(row.taxes) ? row.taxes : null;
  const decision = evaluateTaxReview({
    automaticTaxRequested: row.automatic_tax_requested === true,
    automaticTaxStatus: row.automatic_tax_status,
    billingCountry: row.billing_country,
    amountSubtotal: row.amount_subtotal,
    amountTax: row.amount_tax,
    hasTaxBreakdown: Boolean(taxes && taxes.length > 0),
    taxIdValue: row.tax_id_value,
    taxIdVerificationStatus: incoming.status,
  });
  if (row.review_required && !decision.reviewRequired && incoming.status !== "verified") {
    return { apply: true, review: null };
  }
  return {
    apply: true,
    review: { reviewRequired: decision.reviewRequired, reviewReason: joinReviewReasons(decision.reasons) },
  };
}
