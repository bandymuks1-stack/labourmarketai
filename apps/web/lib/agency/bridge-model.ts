/**
 * Real two-subject agency→client bridge — pure model (issue #859).
 *
 * Two REAL companies owned by two DIFFERENT profiles: a staffing_agency company
 * and a real client company. A connection is invite→accept→active→revoke; the
 * client shares specific customer_requests; the agency offers active roster
 * workers; the CLIENT (never the agency) reviews on its own scouting surface.
 *
 * Pure (no server imports) so validation + status logic is unit-testable.
 * Missing-schema detection is shared with the existing clients-model.
 */
import { isMissingRpcCode, isMissingTableCode } from "@/lib/agency/clients-model";

export type ConnectionStatus = "pending" | "active" | "declined" | "revoked";
export type ShareStatus = "active" | "revoked";
/** `accepted` / `declined` are written by the CLIENT company owner through
 *  respond_agency_candidate_offer_v1 (migration 20260903101000); `accepted`
 *  also carries the canonical booking proposed to the worker. */
export type OfferStatus = "offered" | "withdrawn" | "accepted" | "declined";
/** Derived (never stored) client-review stage the agency may see. */
export type OfferReviewStage =
  | "offered"
  | "reviewed"
  | "contacted"
  | "rejected"
  | "booking_started"
  | "accepted";

export interface AgencyConnection {
  readonly id: string;
  readonly agencyCompanyId: string;
  readonly clientCompanyId: string | null;
  readonly invitedEmail: string;
  readonly status: ConnectionStatus;
  readonly createdAt: string;
}

/** A connection invite addressed to the current user (client inbox). */
export interface ClientConnectionInvite {
  readonly id: string;
  readonly agencyName: string;
  readonly invitedEmail: string;
  readonly status: ConnectionStatus;
  readonly createdAt: string;
}

/** A request a client shared with the caller-agency (curated columns only). */
export interface SharedRequestRow {
  readonly shareId: string;
  readonly connectionId: string;
  readonly requestId: string;
  readonly title: string;
  readonly roleText: string | null;
  readonly country: string | null;
  readonly status: string;
  readonly sharedAt: string;
}

/** One of the caller-agency's offers + the DERIVED client-review stage. */
export interface OfferProgressRow {
  readonly offerId: string;
  readonly requestId: string;
  readonly workerId: string;
  readonly offerStatus: OfferStatus;
  readonly reviewStage: OfferReviewStage;
  readonly createdAt: string;
}

/** An agency-offered candidate for a request the CLIENT owns (client side). */
export interface OfferedCandidateRow {
  readonly offerId: string;
  readonly workerId: string;
  readonly agencyName: string;
  readonly note: string | null;
  readonly createdAt: string;
  /** The client's decision state. Before 20260903101000 is applied the v1 read
   *  only returns open offers, so this is always `offered` there. */
  readonly offerStatus: OfferStatus;
  /** Canonical booking proposed on acceptance; null otherwise / before apply. */
  readonly bookingId: string | null;
  readonly decidedAt: string | null;
}

export type AgencyConnectionsState =
  | { kind: "ok"; rows: readonly AgencyConnection[] }
  | { kind: "needs-migration" }
  | { kind: "error" };
export type ClientInvitesState =
  | { kind: "ok"; rows: readonly ClientConnectionInvite[] }
  | { kind: "needs-migration" }
  | { kind: "error" };
export type SharedRequestsState =
  | { kind: "ok"; rows: readonly SharedRequestRow[] }
  | { kind: "needs-migration" }
  | { kind: "error" };
export type OfferProgressState =
  | { kind: "ok"; rows: readonly OfferProgressRow[] }
  | { kind: "needs-migration" }
  | { kind: "error" };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;

export function isBridgeUuid(v: string): boolean {
  return UUID_RE.test((v ?? "").trim());
}

export function validateInviteEmail(raw: string): { ok: true; value: string } | { ok: false } {
  const email = (raw ?? "").trim().toLowerCase();
  if (email.length < 3 || email.length > 254 || !EMAIL_RE.test(email)) return { ok: false };
  return { ok: true, value: email };
}

export function validateOfferNote(raw: string | null | undefined): string | null {
  const note = (raw ?? "").trim();
  if (!note) return null;
  return note.length > 500 ? note.slice(0, 500) : note;
}

/** Only pending invites are actionable in the client inbox. */
export function pendingInvites(
  rows: readonly ClientConnectionInvite[],
): readonly ClientConnectionInvite[] {
  return rows.filter((r) => r.status === "pending");
}

/** Visual tone per derived review stage — display only. */
export function reviewStageTone(
  stage: OfferReviewStage,
): "muted" | "info" | "warning" | "success" {
  switch (stage) {
    case "accepted":
      return "success";
    case "booking_started":
    case "contacted":
      return "info";
    case "rejected":
      return "warning";
    default:
      return "muted";
  }
}

export { isMissingRpcCode, isMissingTableCode };
