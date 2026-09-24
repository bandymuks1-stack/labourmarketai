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

/**
 * The client's ONE connection list from its two keyed reads — by invited
 * email (pending + accepted invites) and by client company (every active
 * connection the company owns). Pure. Rows are deduplicated by id, newest
 * first. Either read failing makes the whole list UNKNOWN: a list that
 * silently dropped one read's rows would present a partial relationship set
 * as the complete one (SEP-7).
 */
export function mergeClientConnectionStates(
  byEmail: ClientInvitesState,
  byCompany: ClientInvitesState,
): ClientInvitesState {
  if (byEmail.kind === "needs-migration" || byCompany.kind === "needs-migration") {
    return { kind: "needs-migration" };
  }
  if (byEmail.kind !== "ok" || byCompany.kind !== "ok") return { kind: "error" };
  const byId = new Map<string, ClientConnectionInvite>();
  for (const r of [...byEmail.rows, ...byCompany.rows]) {
    const prev = byId.get(r.id);
    // The joined read may name the agency where the fallback read could not.
    if (!prev || (prev.agencyName === "\u2014" && r.agencyName !== "\u2014")) byId.set(r.id, r);
  }
  return {
    kind: "ok",
    rows: [...byId.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
  };
}

/**
 * The review stage THIS offer may wear.
 *
 * `list_agency_offer_progress_v1` derives `review_stage` per (request, worker)
 * pair — a booking / shortlist / thread for that worker on that request — and
 * never looks at the offer's own status. So when the same worker was offered
 * twice on one request and the client accepted the second offer, the FIRST,
 * declined offer also reads `accepted` ("booking accepted · client declined"
 * on one row — production 2026-09-21). A closed offer cannot carry a live
 * booking stage: a declined offer is `rejected`, a withdrawn one stays at
 * `offered`. Open and accepted offers keep the derived stage. Correcting the
 * derivation itself (key on `o.booking_id` / `o.status`) is a SECDEF body
 * change = RED; this is the honest presentation until that is applied.
 */
export function effectiveReviewStage(
  offerStatus: OfferStatus,
  reviewStage: OfferReviewStage,
): OfferReviewStage {
  if (offerStatus === "declined") return "rejected";
  if (offerStatus === "withdrawn") return "offered";
  return reviewStage;
}

/* ────────────────────────────────────────────────────────────────────────────
 * DELIVERY (2026-09-24). The connection row alone reached nobody; beside it
 * the agency now creates an invitation through the ONE invitation primitive
 * (lib/invitations) and gets the token link back. This is the pure shape of
 * that delivery result and the mapping from the primitive's own outcomes —
 * the section renders it with the primitive's own localized outcome copy.
 * ──────────────────────────────────────────────────────────────────────── */
export type BridgeInviteOutcome =
  /** Stored; e-mail delivery not configured — the agency shares the link. */
  | "created"
  /** Stored AND the provider acknowledged the e-mail. */
  | "sent"
  /** Stored; the provider refused — the link still works, share it. */
  | "delivery_failed"
  /** A pending invitation to this address already exists (the primitive's
   *  idempotency key: inviter + address + type + context); nothing new was
   *  minted — a fresh link comes from the rotate path. */
  | "duplicate_pending"
  /** The primitive refused (limit, rate, authorization…); `reason` names
   *  the primitive's outcome. The connection exists, nothing was delivered. */
  | "refused"
  /** The primitive is absent or failed outright — UNKNOWN, not "not sent". */
  | "unavailable";

export interface BridgeInviteDelivery {
  readonly email: string;
  readonly outcome: BridgeInviteOutcome;
  readonly invitationId: string | null;
  /** The shareable link — returned ONLY to the inviter who minted it, and
   *  only when a token was minted in THIS call. */
  readonly inviteLink: string | null;
  /** The primitive's own outcome slug when `refused`; null otherwise. */
  readonly reason: string | null;
}

/** The primitive's create / resend result, structurally (no import of the
 *  server module here — this file stays pure). */
export interface PrimitiveInvitationResult {
  readonly status: "ok" | "needs-migration" | "not-authed";
  readonly outcome?: string;
  readonly invitationId?: string;
  readonly inviteLink?: string;
}

export function toBridgeInviteDelivery(
  email: string,
  result: PrimitiveInvitationResult | null | undefined,
): BridgeInviteDelivery {
  const base = { email, invitationId: null, inviteLink: null, reason: null };
  if (!result || result.status !== "ok") return { ...base, outcome: "unavailable" };
  const outcome = result.outcome ?? "error";
  if (outcome === "created" || outcome === "sent" || outcome === "delivery_failed") {
    return {
      ...base,
      outcome,
      invitationId: result.invitationId ?? null,
      inviteLink: result.inviteLink ?? null,
    };
  }
  if (outcome === "duplicate_pending") return { ...base, outcome: "duplicate_pending" };
  return { ...base, outcome: "refused", reason: outcome.slice(0, 60) };
}

/** One sent agency-client invitation as the partners door lists it beside
 *  the connection with the same address (the primitive's own rows, read by
 *  the inviter). */
export interface ClientInviteDeliveryRow {
  readonly invitationId: string;
  readonly email: string;
  readonly status: string;
  readonly deliveryStatus: string;
  readonly createdAt: string;
}

export type ClientInviteDeliveriesState =
  | { kind: "ok"; rows: readonly ClientInviteDeliveryRow[] }
  | { kind: "needs-migration" }
  | { kind: "error" };

/**
 * The invitation that COUNTS for each address (lower-cased), from the
 * inviter's own sent list. Pure.
 *
 * Two statuses matter for a pending connection: `pending` (the link is out,
 * nothing answered yet) and `accepted` (single-use, consumed — the client
 * accepted the invitation and now confirms the CONNECTION on their partners
 * door). An accepted row wins over a pending one regardless of age: once the
 * client has accepted, the agency's next move is to wait, not to rotate or
 * mint links — showing the pending row instead invited exactly that (review
 * round 2, 2026-09-24: an accepted invitation read "no invitation link yet"
 * and "Get link" minted a second one). Within one status the newest wins.
 * Declined, expired and revoked rows are dropped: they leave the address
 * without a live invitation, so a fresh one may be minted.
 */
export function deliveryByEmail(
  rows: readonly ClientInviteDeliveryRow[],
): ReadonlyMap<string, ClientInviteDeliveryRow> {
  const rank = (status: string): number =>
    status === "accepted" ? 2 : status === "pending" ? 1 : 0;
  const out = new Map<string, ClientInviteDeliveryRow>();
  for (const r of rows) {
    const score = rank(r.status);
    if (score === 0) continue;
    const key = r.email.trim().toLowerCase();
    const prev = out.get(key);
    if (
      !prev ||
      score > rank(prev.status) ||
      (score === rank(prev.status) && r.createdAt.localeCompare(prev.createdAt) > 0)
    ) {
      out.set(key, r);
    }
  }
  return out;
}

/**
 * The state a PENDING connection row wears on the agency's partners door,
 * in the primitive's own vocabulary:
 *   - `none`            — no live invitation for this address: mint one;
 *   - `accepted`        — delivered and accepted; the client's confirmation
 *                         of the connection is what is awaited — no link;
 *   - `created` / `sent` / `delivery_failed` — a pending invitation's stored
 *                         delivery_status (`not_sent` = the link is ready,
 *                         nothing was e-mailed): a fresh link may be rotated.
 * Pure.
 */
export type ClientInviteRowState = "none" | "accepted" | "created" | "sent" | "delivery_failed";

export function clientInviteRowState(
  row: ClientInviteDeliveryRow | null | undefined,
): ClientInviteRowState {
  if (!row) return "none";
  if (row.status === "accepted") return "accepted";
  if (row.deliveryStatus === "sent") return "sent";
  if (row.deliveryStatus === "delivery_failed") return "delivery_failed";
  return "created";
}

/* ────────────────────────────────────────────────────────────────────────────
 * SPINE COUNTS (2026-09-24). Three STATE-DERIVED bridge signals, each with a
 * surface whose own action clears it — the spine's rule (a count that
 * cannot clear is permanent noise). Offer DECISIONS (accepted / declined,
 * agency side) are deliberately absent: a terminal state never clears by
 * visiting and no seen marker exists; that fact belongs to the durable
 * notification_events channel, not here.
 * ──────────────────────────────────────────────────────────────────────── */
export interface BridgeSpineCounts {
  /** CLIENT: connection invitations addressed to me still pending. */
  readonly pendingConnectionInvites: number;
  /** AGENCY: shared requests with no open/accepted offer from me yet. */
  readonly sharedRequestsAwaitingOffer: number;
  /** CLIENT: agency offers on my requests still awaiting my decision. */
  readonly openCandidateOffers: number;
}

export const ZERO_BRIDGE_SPINE_COUNTS: BridgeSpineCounts = {
  pendingConnectionInvites: 0,
  sharedRequestsAwaitingOffer: 0,
  openCandidateOffers: 0,
};

/** Pending invites in an `ok` read; a failed read counts 0 — the bell never
 *  fabricates attention from an unknown. Pure. */
export function countPendingConnectionInvites(state: ClientInvitesState): number {
  return state.kind === "ok" ? pendingInvites(state.rows).length : 0;
}

/**
 * Shared requests the agency has not answered: no offer of this agency on
 * that request is `offered` or `accepted` (a withdrawn or declined offer
 * leaves the request unanswered again). Either read failing counts 0. Pure.
 */
export function countSharesAwaitingOffer(
  shared: SharedRequestsState,
  progress: OfferProgressState,
): number {
  if (shared.kind !== "ok" || progress.kind !== "ok") return 0;
  const answered = new Set(
    progress.rows
      .filter((p) => p.offerStatus === "offered" || p.offerStatus === "accepted")
      .map((p) => p.requestId),
  );
  return shared.rows.filter((s) => !answered.has(s.requestId)).length;
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
