import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { isSuperadmin } from "@/lib/auth/superadmin";
import {
  decideVerificationApply,
  evaluateTaxReview,
  joinReviewReasons,
  normalizeTaxIdValue,
  reviewInputFromEvidence,
  type StoredEvidenceForReview,
  type TaxEvidence,
  type TaxIdVerificationStatus,
} from "@/lib/billing/stripe-tax-core";

/**
 * Stripe Tax evidence store — the SERVER-only write path for
 * `billing_tax_evidence` (migration 20261023120000). Same posture as every
 * billing table: the signed webhook has no user session, the table carries NO
 * authenticated write policy, so the service role is the only writer. Never
 * throws into the webhook; returns a status.
 *
 *   - `upsertTaxEvidence` — idempotent per Stripe object; an OLDER event never
 *     overwrites a newer one; a row a platform admin reviewed keeps its review
 *     state (the data columns still refresh).
 *   - `applyTaxIdVerification` — a `customer.tax_id.updated` result on the rows
 *     of that customer + VAT id (stripe-tax-core decideVerificationApply).
 *   - `listTaxEvidenceForAdmin` / `markTaxEvidenceReviewed` — the superadmin
 *     review list; both re-check `isSuperadmin()` themselves. Marking reviewed
 *     records who and when; it never touches an amount.
 */

const RELATION_ABSENT = "42P01";
const UNIQUE_VIOLATION = "23505";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function admin(): any {
  return createAdminClient();
}

export type TaxEvidenceStoreResult = "ok" | "stale-event" | "needs-migration" | "error";

function isoFromUnix(v: number | null | undefined): string | null {
  return typeof v === "number" && Number.isFinite(v) ? new Date(v * 1000).toISOString() : null;
}

const STORED_REVIEW_COLUMNS =
  "id, automatic_tax_requested, automatic_tax_status, billing_country, amount_subtotal, amount_tax, taxes, tax_id_value, tax_id_verification_status, review_required, review_reason, reviewed_at, tax_id_verification_event_at, last_event_created_at";

/**
 * Upsert the evidence of one Stripe object. `verification` is the VAT id's
 * status as read from Stripe at capture time (null = no VAT id collected;
 * "unknown" = the read failed / no matching id — never overrides a known one).
 */
export async function upsertTaxEvidence(input: {
  readonly evidence: TaxEvidence;
  readonly testMode: boolean;
  readonly verification: { readonly status: TaxIdVerificationStatus | null; readonly verifiedName: string | null };
  readonly event: { readonly id: string; readonly created: number | null };
}): Promise<TaxEvidenceStoreResult> {
  const e = input.evidence;
  const sb = admin();
  const { data: existing, error: selErr } = await sb
    .from("billing_tax_evidence")
    .select(STORED_REVIEW_COLUMNS)
    .eq("provider", "stripe")
    .eq("provider_object_id", e.providerObjectId)
    .maybeSingle();
  if (selErr) return selErr.code === RELATION_ABSENT ? "needs-migration" : "error";

  const eventAt = isoFromUnix(input.event.created);
  if (
    existing?.last_event_created_at &&
    eventAt &&
    Date.parse(eventAt) < Date.parse(existing.last_event_created_at)
  ) {
    return "stale-event";
  }

  // Never let an unreadable status ("unknown") replace a status Stripe gave us.
  let status = input.verification.status;
  if (status === "unknown" && existing?.tax_id_verification_status && existing.tax_id_verification_status !== "unknown") {
    status = existing.tax_id_verification_status as TaxIdVerificationStatus;
  }
  const decision = evaluateTaxReview(reviewInputFromEvidence(e, status));
  const now = new Date().toISOString();
  const data: Record<string, unknown> = {
    provider: "stripe",
    object_kind: e.objectKind,
    provider_object_id: e.providerObjectId,
    provider_customer_id: e.providerCustomerId,
    organization_id: e.organizationId,
    owner_id: e.ownerId,
    test_mode: input.testMode,
    customer_business_name: e.customerBusinessName ? e.customerBusinessName.slice(0, 300) : null,
    billing_country: e.billingCountry,
    tax_id_type: e.taxIdType,
    tax_id_value: e.taxIdValue ? e.taxIdValue.slice(0, 64) : null,
    tax_id_verification_status: status,
    tax_id_verified_name: input.verification.verifiedName,
    automatic_tax_requested: e.automaticTaxRequested,
    automatic_tax_status: e.automaticTaxStatus,
    amount_subtotal: e.amountSubtotal,
    amount_tax: e.amountTax,
    amount_total: e.amountTotal,
    currency: e.currency,
    reverse_charge: e.reverseCharge,
    taxes: e.taxes,
    invoice_id: e.invoiceId,
    invoice_url: e.invoiceUrl,
    last_event_id: input.event.id,
    last_event_created_at: eventAt,
    updated_at: now,
  };
  // A human review decision stands: re-capturing the same object refreshes
  // the data columns but never re-opens a row an admin closed.
  if (!existing?.reviewed_at) {
    data.review_required = decision.reviewRequired;
    data.review_reason = joinReviewReasons(decision.reasons);
  }

  if (existing) {
    const { error } = await sb.from("billing_tax_evidence").update(data).eq("id", existing.id);
    if (error) return error.code === RELATION_ABSENT ? "needs-migration" : "error";
    return "ok";
  }
  const { error } = await sb.from("billing_tax_evidence").insert(data);
  if (!error) return "ok";
  if (error.code === RELATION_ABSENT) return "needs-migration";
  if (error.code === UNIQUE_VIOLATION) {
    // A concurrent delivery for the same object won the insert: apply as update.
    const { error: upErr } = await sb
      .from("billing_tax_evidence")
      .update(data)
      .eq("provider", "stripe")
      .eq("provider_object_id", e.providerObjectId);
    return upErr ? "error" : "ok";
  }
  return "error";
}

/**
 * Record a VAT id verification result (customer.tax_id.updated) on every
 * evidence row of that customer + VAT id. Rows are matched by the provider
 * customer and the NORMALIZED VAT id; no match = nothing to do ("ok").
 */
export async function applyTaxIdVerification(input: {
  readonly providerCustomerId: string;
  readonly taxIdValue: string;
  readonly status: TaxIdVerificationStatus;
  readonly verifiedName: string | null;
  readonly event: { readonly id: string; readonly created: number | null };
}): Promise<TaxEvidenceStoreResult> {
  const sb = admin();
  const { data: rows, error } = await sb
    .from("billing_tax_evidence")
    .select(STORED_REVIEW_COLUMNS)
    .eq("provider", "stripe")
    .eq("provider_customer_id", input.providerCustomerId)
    .not("tax_id_value", "is", null)
    .limit(500);
  if (error) return error.code === RELATION_ABSENT ? "needs-migration" : "error";
  const want = normalizeTaxIdValue(input.taxIdValue);
  const eventAt = isoFromUnix(input.event.created) ?? new Date().toISOString();
  for (const row of (rows ?? []) as Array<StoredEvidenceForReview & { id: string; tax_id_value: string | null }>) {
    if (normalizeTaxIdValue(row.tax_id_value) !== want) continue;
    const decision = decideVerificationApply(row, { status: input.status, eventCreated: input.event.created });
    if (!decision.apply) continue;
    const patch: Record<string, unknown> = {
      tax_id_verification_status: input.status,
      tax_id_verified_name: input.verifiedName,
      tax_id_verification_event_at: eventAt,
      updated_at: new Date().toISOString(),
    };
    if (decision.review) {
      patch.review_required = decision.review.reviewRequired;
      patch.review_reason = decision.review.reviewReason;
    }
    const { error: upErr } = await sb.from("billing_tax_evidence").update(patch).eq("id", row.id);
    if (upErr) return "error";
  }
  return "ok";
}

// ─── Superadmin review list ────────────────────────────────────────────────

export interface AdminTaxEvidenceRow {
  readonly id: string;
  readonly objectKind: string;
  readonly providerObjectId: string;
  readonly organizationId: string | null;
  readonly testMode: boolean;
  readonly customerBusinessName: string | null;
  readonly billingCountry: string | null;
  readonly taxIdType: string | null;
  readonly taxIdValue: string | null;
  readonly taxIdVerificationStatus: string | null;
  readonly automaticTaxStatus: string | null;
  readonly amountSubtotal: number | null;
  readonly amountTax: number | null;
  readonly amountTotal: number | null;
  readonly currency: string | null;
  readonly reverseCharge: boolean;
  readonly invoiceUrl: string | null;
  readonly reviewRequired: boolean;
  readonly reviewReason: string | null;
  readonly reviewedAt: string | null;
  readonly createdAt: string;
}

export type AdminTaxEvidenceList =
  | { readonly status: "ok"; readonly rows: readonly AdminTaxEvidenceRow[] }
  | { readonly status: "not_admin" | "needs-migration" | "error" };

/**
 * Rows awaiting tax review (newest first). The service role is used because
 * the table's SELECT policy reads `public.is_admin()` (active_role only) while
 * the app's admin signal is dual — the same reason lib/billing/reconcile.ts
 * reads with it. Gated by `isSuperadmin()` here, not only by the page.
 */
export async function listTaxEvidenceForAdmin(limit = 50): Promise<AdminTaxEvidenceList> {
  if (!(await isSuperadmin())) return { status: "not_admin" };
  const { data, error } = await admin()
    .from("billing_tax_evidence")
    .select(
      "id, object_kind, provider_object_id, organization_id, test_mode, customer_business_name, billing_country, tax_id_type, tax_id_value, tax_id_verification_status, automatic_tax_status, amount_subtotal, amount_tax, amount_total, currency, reverse_charge, invoice_url, review_required, review_reason, reviewed_at, created_at",
    )
    .eq("review_required", true)
    .order("created_at", { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 200));
  if (error) return { status: error.code === RELATION_ABSENT ? "needs-migration" : "error" };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = ((data ?? []) as any[]).map((r) => ({
    id: String(r.id),
    objectKind: String(r.object_kind),
    providerObjectId: String(r.provider_object_id),
    organizationId: r.organization_id ?? null,
    testMode: r.test_mode === true,
    customerBusinessName: r.customer_business_name ?? null,
    billingCountry: r.billing_country ?? null,
    taxIdType: r.tax_id_type ?? null,
    taxIdValue: r.tax_id_value ?? null,
    taxIdVerificationStatus: r.tax_id_verification_status ?? null,
    automaticTaxStatus: r.automatic_tax_status ?? null,
    amountSubtotal: typeof r.amount_subtotal === "number" ? r.amount_subtotal : null,
    amountTax: typeof r.amount_tax === "number" ? r.amount_tax : null,
    amountTotal: typeof r.amount_total === "number" ? r.amount_total : null,
    currency: r.currency ?? null,
    reverseCharge: r.reverse_charge === true,
    invoiceUrl: r.invoice_url ?? null,
    reviewRequired: r.review_required === true,
    reviewReason: r.review_reason ?? null,
    reviewedAt: r.reviewed_at ?? null,
    createdAt: String(r.created_at),
  }));
  return { status: "ok", rows };
}

export type MarkReviewedResult = "ok" | "not_admin" | "not_found" | "needs-migration" | "error";

/**
 * A platform admin closes a review: review_required=false, reviewed_at/by
 * recorded. Amounts, tax lines and the stated reason stay as they were — the
 * row keeps showing WHY it was flagged.
 */
export async function markTaxEvidenceReviewed(input: {
  readonly id: string;
  readonly reviewerProfileId: string;
}): Promise<MarkReviewedResult> {
  if (!(await isSuperadmin())) return "not_admin";
  const now = new Date().toISOString();
  const { data, error } = await admin()
    .from("billing_tax_evidence")
    .update({ review_required: false, reviewed_at: now, reviewed_by: input.reviewerProfileId, updated_at: now })
    .eq("id", input.id)
    .select("id");
  if (error) return error.code === RELATION_ABSENT ? "needs-migration" : "error";
  return Array.isArray(data) && data.length > 0 ? "ok" : "not_found";
}
