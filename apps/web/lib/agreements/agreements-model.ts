/**
 * Agreement & Rights Engine — pure model (v1). Shared by the server read
 * service, the server actions, the guard test and the register UI. No
 * server-only imports, no IO.
 *
 * The model codes against the contract the SEPARATE, human-gated migration
 * `20260817200000_agreements_v1.sql` proposes. Until the lead applies it the
 * read/action layers degrade honestly (the established tasks/finance
 * pattern) — nothing here fakes an agreement or a status.
 *
 * LEGAL DOCTRINE (binding): LEGAL CONTROL BEFORE TECHNICAL REPRESENTATION.
 * No status below implies SIGNED / LEGAL / VALID / BINDING — the vocabulary
 * is honest record-keeping state only. Signature evidence is a separate,
 * explicitly-labeled field pair: LabourMarket.ai executes no legal
 * signatures; any signature happened OUTSIDE the platform. No e-signature
 * flow, no signing provider.
 */

export const AGREEMENT_TYPES = [
  "employment_related",
  "service",
  "supply",
  "nda",
  "partnership",
  "other",
] as const;
export type AgreementType = (typeof AGREEMENT_TYPES)[number];

/** Honest record-keeping states ONLY. "approved_internally" means an
 *  internal review said yes, nothing more; "active_record" means the
 *  organization treats the record as current, nothing more. */
export const AGREEMENT_STATUSES = [
  "draft",
  "submitted_for_approval",
  "approved_internally",
  "active_record",
  "amended",
  "terminated_record",
  "expired",
] as const;
export type AgreementStatus = (typeof AGREEMENT_STATUSES)[number];

/** Manual transition targets set_agreement_status_v1 accepts; the SQL side
 *  additionally checks the source state (single contract, pinned by the
 *  guard test). 'submitted_for_approval' is deliberately NOT here — only
 *  the submit command (backed by a real workflow instance) reaches it. */
export const AGREEMENT_MANUAL_STATUS_TARGETS = [
  "active_record",
  "terminated_record",
  "expired",
] as const;

/** Which manual targets are legal from which source (mirrors the RPC). */
export function manualStatusTargetsFor(
  status: AgreementStatus,
): readonly (typeof AGREEMENT_MANUAL_STATUS_TARGETS)[number][] {
  switch (status) {
    case "draft":
    case "approved_internally":
      return ["active_record", "terminated_record"];
    case "active_record":
    case "amended":
      return ["terminated_record", "expired"];
    default:
      return [];
  }
}

/** Signature EVIDENCE label — never a legal claim. */
export const AGREEMENT_SIGNATURE_STATUSES = [
  "none",
  "externally_signed_evidence_attached",
] as const;
export type AgreementSignatureStatus =
  (typeof AGREEMENT_SIGNATURE_STATUSES)[number];

export const AGREEMENT_EVENT_TYPES = [
  "created",
  "updated",
  "status_changed",
  "amended",
  "terminated",
  "evidence_attached",
] as const;
export type AgreementEventType = (typeof AGREEMENT_EVENT_TYPES)[number];

/** Bounded lengths — mirrored by the gated RPC validation (one contract). */
export const AGREEMENT_TITLE_MIN = 3;
export const AGREEMENT_TITLE_MAX = 200;
export const AGREEMENT_COUNTERPARTY_MAX = 200;
export const AGREEMENT_ORG_NUMBER_MAX = 60;
export const AGREEMENT_EXTERNAL_REF_MAX = 200;
export const AGREEMENT_AMENDMENT_DESCRIPTION_MAX = 2000;
export const AGREEMENT_READ_LIMIT = 200;

/** Render-time expiry derivation (the documents 30-day precedent). There is
 *  NO notification type for agreements — indication only, no fake sending. */
export const AGREEMENT_EXPIRY_WINDOW_DAYS = 30;

export function isValidAgreementType(v: string): v is AgreementType {
  return (AGREEMENT_TYPES as readonly string[]).includes(v);
}
export function isValidAgreementStatus(v: string): v is AgreementStatus {
  return (AGREEMENT_STATUSES as readonly string[]).includes(v);
}
export function isValidAgreementSignatureStatus(
  v: string,
): v is AgreementSignatureStatus {
  return (AGREEMENT_SIGNATURE_STATUSES as readonly string[]).includes(v);
}

/** Missing-migration detection — the repo's blessed code set. */
export const AGREEMENT_ABSENT_CODES = [
  "42P01", // relation does not exist
  "42883", // function does not exist
  "PGRST202", // PostgREST: function not found
  "PGRST205", // PostgREST: table not found in schema cache
] as const;
export function isAgreementMigrationMissingCode(
  code: string | undefined,
): boolean {
  return (
    code !== undefined &&
    (AGREEMENT_ABSENT_CODES as readonly string[]).includes(code)
  );
}

export type AgreementRow = {
  readonly id: string;
  readonly organizationId: string;
  readonly agreementType: AgreementType;
  readonly title: string;
  readonly counterpartyName: string;
  readonly counterpartyOrgNumber: string | null;
  readonly workerId: string | null;
  readonly responsibleProfileId: string | null;
  readonly effectiveFrom: string | null;
  readonly effectiveTo: string | null;
  readonly status: AgreementStatus;
  readonly signatureStatus: AgreementSignatureStatus;
  readonly signatureEvidenceFileId: string | null;
  readonly currentDocumentId: string | null;
  readonly externalRef: string | null;
  readonly createdAt: string;
};

export type AgreementAmendmentRow = {
  readonly id: string;
  readonly agreementId: string;
  readonly sequence: number;
  readonly title: string;
  readonly description: string | null;
  readonly documentId: string | null;
  readonly effectiveDate: string | null;
  readonly createdAt: string;
};

/** UI filter model (all optional; applied on the bounded RLS-scoped read). */
export type AgreementFilters = {
  readonly type: AgreementType | null;
  readonly status: AgreementStatus | null;
  readonly search: string;
  readonly expiring: boolean;
};

export function parseAgreementFilters(params: {
  readonly agrType?: string;
  readonly agrStatus?: string;
  readonly agrSearch?: string;
  readonly agrExpiring?: string;
}): AgreementFilters {
  const type =
    params.agrType && isValidAgreementType(params.agrType)
      ? params.agrType
      : null;
  const status =
    params.agrStatus && isValidAgreementStatus(params.agrStatus)
      ? params.agrStatus
      : null;
  const search = (params.agrSearch ?? "").trim().slice(0, 100);
  return { type, status, search, expiring: params.agrExpiring === "1" };
}

/** Days until effective_to, or null when no end date. Pure. */
export function daysUntilExpiry(
  effectiveTo: string | null,
  now: Date,
): number | null {
  if (!effectiveTo) return null;
  const end = new Date(`${effectiveTo}T00:00:00Z`);
  if (Number.isNaN(end.getTime())) return null;
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.round((end.getTime() - today) / 86400000);
}

/** True when the record ends within the 30-day window (or already ended)
 *  and is still a live record. Render-time derivation only. */
export function isExpiringSoon(row: AgreementRow, now: Date): boolean {
  if (row.status === "terminated_record" || row.status === "expired") {
    return false;
  }
  const days = daysUntilExpiry(row.effectiveTo, now);
  return days !== null && days <= AGREEMENT_EXPIRY_WINDOW_DAYS;
}

export function applyAgreementFilters(
  rows: readonly AgreementRow[],
  filters: AgreementFilters,
  now: Date,
): readonly AgreementRow[] {
  const needle = filters.search.toLowerCase();
  return rows.filter((row) => {
    if (filters.type && row.agreementType !== filters.type) return false;
    if (filters.status && row.status !== filters.status) return false;
    if (filters.expiring && !isExpiringSoon(row, now)) return false;
    if (
      needle.length > 0 &&
      !row.counterpartyName.toLowerCase().includes(needle) &&
      !row.title.toLowerCase().includes(needle)
    ) {
      return false;
    }
    return true;
  });
}

/** Notice vocabulary the actions redirect with (`?agr=`). */
export type AgreementNotice =
  | "created"
  | "updated"
  | "submitted"
  | "amended"
  | "attached"
  | "evidence_attached"
  | "repaired"
  | "no_pending_workflow"
  | "no_approval_definition"
  | "invalid"
  | "invalid_transition"
  | "invalid_state"
  | "not_editable"
  | "not_found"
  | "not_allowed"
  | "limit_reached"
  | "needs_migration"
  | "error";

export const AGREEMENT_SUCCESS_NOTICES: readonly AgreementNotice[] = [
  "created",
  "updated",
  "submitted",
  "amended",
  "attached",
  "evidence_attached",
  "repaired",
];

/** Map the RPC outcome vocabulary onto the notice vocabulary (1:1 where the
 *  words match; everything unknown is an honest "error"). */
export function noticeForAgreementOutcome(outcome: string): AgreementNotice {
  switch (outcome) {
    case "created":
    case "updated":
    case "submitted":
    case "amended":
    case "attached":
    case "evidence_attached":
    case "no_pending_workflow":
    case "invalid":
    case "invalid_transition":
    case "invalid_state":
    case "not_editable":
    case "not_found":
    case "not_allowed":
    case "limit_reached":
      return outcome;
    case "repaired_approved":
    case "repaired_returned":
      return "repaired";
    default:
      return "error";
  }
}
