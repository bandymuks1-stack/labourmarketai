/**
 * Pure procurement model (functional completion train V2, audit OPERATIONS
 * section — the MISSING "procurement" row) — shared by the server read
 * service, the server actions, the guard test and the finance-page
 * procurement section. No server-only imports, no IO.
 *
 * The model codes against the `public.procurement_inquiries` /
 * `procurement_offers` / `procurement_events` contract the SEPARATE,
 * human-gated migration 20260817221000_procurement_v1 proposes. Until the
 * lead applies it the read/action layers degrade honestly (the established
 * tasks/finance/timesheets pattern) — nothing here fakes an offer.
 *
 * HONEST scope: manually recorded purchase inquiries and supplier offers.
 * Recording an offer contacts nobody; selecting an offer orders nothing —
 * the order_reference is a bounded manual note. Approval, when requested,
 * runs on the canonical Workflow & Approval Engine (context_entity_type =
 * 'procurement') — nothing re-implemented here. All money is integer cents.
 */

export const PROCUREMENT_STATUSES = [
  "draft",
  "submitted",
  "decided",
  "ordered",
  "closed",
  "cancelled",
] as const;
export type ProcurementStatus = (typeof PROCUREMENT_STATUSES)[number];

/** Engine-MIRROR approval states — null means approval was never requested. */
export const PROCUREMENT_APPROVAL_STATUSES = [
  "pending",
  "approved",
  "rejected",
] as const;
export type ProcurementApprovalStatus =
  (typeof PROCUREMENT_APPROVAL_STATUSES)[number];

export const PROCUREMENT_EVENT_ACTIONS = [
  "created",
  "updated",
  "submitted",
  "offer_added",
  "offer_selected",
  "ordered",
  "closed",
  "cancelled",
  "approval_submitted",
  "approval_approved",
  "approval_rejected",
  "approval_cleared",
  "finance_linked",
  "finance_unlinked",
] as const;

/** Bounds — mirrored by the gated RPC validation (single contract). */
export const PROCUREMENT_DESCRIPTION_MIN = 3;
export const PROCUREMENT_DESCRIPTION_MAX = 2000;
export const PROCUREMENT_QUANTITY_MAX = 80;
export const PROCUREMENT_ORDER_REFERENCE_MAX = 120;
export const PROCUREMENT_SUPPLIER_MIN = 2;
export const PROCUREMENT_SUPPLIER_MAX = 160;
export const PROCUREMENT_OFFER_NOTE_MAX = 500;
export const PROCUREMENT_MAX_OFFERS = 20;

/** Bounded reads everywhere — never an unbounded stream. */
export const PROCUREMENT_READ_LIMIT = 100;

export const PROCUREMENT_MIGRATION_MISSING_ERROR_CODES = [
  "42P01",
  "42703",
  "42883",
  "PGRST202",
] as const;

export function isProcurementMigrationMissingCode(
  code: string | undefined,
): boolean {
  return (
    PROCUREMENT_MIGRATION_MISSING_ERROR_CODES as readonly string[]
  ).includes(code ?? "");
}

export function isValidProcurementStatus(v: string): v is ProcurementStatus {
  return (PROCUREMENT_STATUSES as readonly string[]).includes(v);
}

export function isValidProcurementApprovalStatus(
  v: string,
): v is ProcurementApprovalStatus {
  return (PROCUREMENT_APPROVAL_STATUSES as readonly string[]).includes(v);
}

export type ProcurementInquiryRow = {
  readonly id: string;
  readonly organizationId: string;
  readonly requesterProfileId: string;
  readonly projectId: string | null;
  readonly objectId: string | null;
  readonly itemDescription: string;
  readonly quantity: string | null;
  /** Integer cents or null. Never a float anywhere in this layer. */
  readonly estimatedBudgetCents: number | null;
  readonly status: ProcurementStatus;
  readonly approvalStatus: ProcurementApprovalStatus | null;
  readonly selectedOfferId: string | null;
  readonly orderReference: string | null;
  readonly financeRecordId: string | null;
  readonly createdAt: string;
};

export type ProcurementOfferRow = {
  readonly id: string;
  readonly inquiryId: string;
  readonly supplierName: string;
  /** Integer cents. */
  readonly amountCents: number;
  readonly currency: string;
  readonly note: string | null;
  readonly orgDocumentId: string | null;
  readonly createdAt: string;
};

/** Statuses the requester/managers can still edit fields in. */
export function isProcurementEditable(status: ProcurementStatus): boolean {
  return status === "draft";
}

/** Statuses offers may still be recorded in. */
export function isProcurementOfferable(status: ProcurementStatus): boolean {
  return status === "draft" || status === "submitted";
}

export type ProcurementNotice =
  | "created"
  | "updated"
  | "submitted"
  | "offer_added"
  | "decided"
  | "linked"
  | "unlinked"
  | "cancelled"
  | "invalid"
  | "needs_migration"
  | "not_authorized"
  | "not_found"
  | "not_editable"
  | "limit_reached"
  | "approval_submitted"
  | "approval_approved"
  | "approval_rejected"
  | "approval_pending"
  | "approval_cleared"
  | "approval_none"
  | "no_template"
  | "no_approvers"
  | "error";

/** Map RPC outcome strings to notices (single mapping, guard-pinned). */
export function procurementNoticeForOutcome(outcome: string): ProcurementNotice {
  switch (outcome) {
    case "updated":
    case "submitted":
    case "decided":
    case "linked":
    case "unlinked":
      return outcome;
    case "already_submitted":
      return "submitted";
    case "not_editable":
    case "not_submitted":
      return "not_editable";
    case "not_found":
    case "offer_not_found":
      return "not_found";
    case "not_allowed":
      return "not_authorized";
    case "limit_reached":
      return "limit_reached";
    case "invalid":
      return "invalid";
    default:
      return "error";
  }
}
