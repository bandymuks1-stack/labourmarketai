/**
 * AGENCY-TO-AGENCY COOPERATION AND COMMISSIONS as pure data (register 4.30,
 * migration 20261118100000, RED, owner-gated). Every rule is the database's;
 * this module only names the refusals and shapes the rows the reads return.
 */

/** Every refusal the partnership functions raise, and the two the app adds. */
export const PARTNERSHIP_ERROR_CODES = [
  "not_owner",
  "not_agency",
  "invalid_email",
  "invalid_share",
  "already_invited",
  "invitation_not_found",
  "same_agency",
  "already_partners",
  "partnership_not_found",
  "partnership_not_open",
  "partnership_not_active",
  "share_not_active",
  "partner_share_not_found",
  "worker_not_on_roster",
  "invalid_note",
  "proposal_not_open",
  "already_offered",
  "rate_limited",
  "needs_migration",
  "error",
] as const;
export type PartnershipErrorCode = (typeof PARTNERSHIP_ERROR_CODES)[number];

/** Missing table / function: the migration is not applied here. */
export function partnershipsMissing(code: string | undefined): boolean {
  return code === "42P01" || code === "PGRST205" || code === "PGRST202" || code === "42883";
}

/** The database's refusal → its code. An unknown message is a plain error. */
export function partnershipErrorCode(error: { code?: string; message?: string } | null | undefined): PartnershipErrorCode {
  if (!error) return "error";
  if (partnershipsMissing(error.code)) return "needs_migration";
  const msg = (error.message ?? "").trim();
  const known = PARTNERSHIP_ERROR_CODES.find((c) => c !== "error" && c !== "needs_migration" && msg === c);
  return known ?? "error";
}

export type PartnershipSide = "lead" | "partner" | "invited";
export type PartnershipStatus = "pending" | "active" | "declined" | "ended";

export type Partnership = {
  readonly id: string;
  readonly side: PartnershipSide;
  readonly leadCompanyId: string;
  readonly leadName: string;
  readonly partnerCompanyId: string | null;
  readonly partnerName: string | null;
  /** Shown to the lead only. */
  readonly invitedEmail: string | null;
  readonly partnerSharePercent: number;
  readonly status: PartnershipStatus;
  readonly createdAt: string;
};

export type CommissionRole = "direct" | "lead" | "partner";
export type PlacementStatus = "pending" | "placed" | "not_placed";

export type Commission = {
  readonly offerId: string;
  readonly role: CommissionRole;
  /** The other agency (lead or partner); null for an agency's own candidate. */
  readonly counterpartName: string | null;
  readonly requestId: string;
  readonly feeAmount: number;
  readonly currency: string;
  readonly sharePercent: number;
  /** Set only once the placement happened. */
  readonly amount: number | null;
  readonly placementStatus: PlacementStatus;
  readonly acceptedAt: string | null;
  readonly placedAt: string | null;
};

const SIDES: readonly PartnershipSide[] = ["lead", "partner", "invited"];
const STATUSES: readonly PartnershipStatus[] = ["pending", "active", "declined", "ended"];
const ROLES: readonly CommissionRole[] = ["direct", "lead", "partner"];
const PLACEMENT: readonly PlacementStatus[] = ["pending", "placed", "not_placed"];

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v : null);
const num = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};
const oneOf = <T extends string>(v: unknown, all: readonly T[]): T | null =>
  typeof v === "string" && (all as readonly string[]).includes(v) ? (v as T) : null;

/** A list_agency_partnerships_v1 row, or null when it is not one. */
export function partnershipFromRow(r: Record<string, unknown>): Partnership | null {
  const id = str(r.partnership_id);
  const side = oneOf(r.side, SIDES);
  const status = oneOf(r.status, STATUSES);
  const lead = str(r.lead_company_id);
  const share = num(r.partner_share_percent);
  if (!id || !side || !status || !lead || share === null) return null;
  return {
    id,
    side,
    leadCompanyId: lead,
    leadName: str(r.lead_name) ?? "",
    partnerCompanyId: str(r.partner_company_id),
    partnerName: str(r.partner_name),
    invitedEmail: side === "lead" ? str(r.invited_email) : null,
    partnerSharePercent: share,
    status,
    createdAt: str(r.created_at) ?? "",
  };
}

/** A list_agency_commissions_v1 row, or null. An amount is kept only for a placed row. */
export function commissionFromRow(r: Record<string, unknown>): Commission | null {
  const offerId = str(r.offer_id);
  const role = oneOf(r.role, ROLES);
  const placementStatus = oneOf(r.placement_status, PLACEMENT);
  const fee = num(r.fee_amount);
  const share = num(r.share_percent);
  const currency = str(r.currency);
  if (!offerId || !role || !placementStatus || fee === null || share === null || !currency) return null;
  const amount = placementStatus === "placed" ? num(r.amount) : null;
  return {
    offerId,
    role,
    counterpartName: role === "direct" ? null : str(r.counterpart_name),
    requestId: str(r.request_id) ?? "",
    feeAmount: fee,
    currency,
    sharePercent: share,
    amount,
    placementStatus,
    acceptedAt: str(r.accepted_at),
    placedAt: placementStatus === "placed" ? str(r.placed_at) : null,
  };
}

/** The share a partner may be offered: (0, 100), at most two decimals. */
export function parseSharePercent(raw: string): number | null {
  const n = Number(raw.replace(",", ".").trim());
  if (!Number.isFinite(n) || n <= 0 || n >= 100) return null;
  if (Math.round(n * 100) !== n * 100) return null;
  return n;
}

/** Totals per currency of what is DUE (placed rows only) — never adds currencies together. */
export function dueByCurrency(rows: readonly Commission[]): ReadonlyMap<string, number> {
  const out = new Map<string, number>();
  for (const r of rows) {
    if (r.placementStatus !== "placed" || r.amount === null) continue;
    out.set(r.currency, Math.round(((out.get(r.currency) ?? 0) + r.amount) * 100) / 100);
  }
  return out;
}

/** A partner's candidate awaiting, or past, the LEAD's review (owner decision 2026-11-20). */
export type ProposalStatus = "proposed" | "forwarded" | "returned" | "withdrawn";
const PROPOSAL_STATUSES: readonly ProposalStatus[] = ["proposed", "forwarded", "returned", "withdrawn"];

export type CandidateProposal = {
  readonly proposalId: string;
  readonly partnerShareId: string;
  readonly requestId: string;
  /** "lead": this agency reviews it; "partner": this agency proposed it. */
  readonly side: "lead" | "partner";
  /** The other agency: the partner for the lead, the lead for the partner. Never the client. */
  readonly counterpartName: string;
  readonly workerId: string;
  readonly workerName: string | null;
  /** The partner's note, for the lead's review only; it never reaches the client. */
  readonly note: string | null;
  readonly status: ProposalStatus;
  readonly returnReason: string | null;
  /** How far the forwarded candidate got with the client (offered / accepted / declined / withdrawn). */
  readonly offerStatus: string | null;
  readonly createdAt: string;
};

export function proposalFromRow(r: Record<string, unknown>): CandidateProposal | null {
  const str = (v: unknown) => (typeof v === "string" && v.length > 0 ? v : null);
  const id = str(r.proposal_id);
  const share = str(r.partner_share_id);
  const req = str(r.request_id);
  const worker = str(r.worker_id);
  const status = PROPOSAL_STATUSES.find((s) => s === r.status);
  const side = r.side === "lead" || r.side === "partner" ? r.side : null;
  if (!id || !share || !req || !worker || !status || !side) return null;
  return {
    proposalId: id,
    partnerShareId: share,
    requestId: req,
    side,
    counterpartName: str(r.counterpart_name) ?? "",
    workerId: worker,
    workerName: str(r.worker_name),
    note: str(r.note),
    status,
    returnReason: str(r.return_reason),
    offerStatus: str(r.offer_status),
    createdAt: str(r.created_at) ?? "",
  };
}
