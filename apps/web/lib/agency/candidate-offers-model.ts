/**
 * Agency candidate-offer management — pure model (agency→client bridge v1).
 *
 * Direction A (owner decision 2026-07-05): an agency IS the canonical company
 * profile with companies.company_type='staffing_agency'. A candidate OFFER is
 * the agency proposing one of its OWN active roster workers (company_workers,
 * status='active') as a candidate for one of its OWN structured needs
 * (customer_requests it owns, linked to a client via agency_client_id). It is
 * NEVER a new labour demand and NEVER a booking/match.
 *
 * Backed by the OWNER-GATED draft migration
 * 20260723170000_agency_candidate_offers_v1 (NOT applied yet). Until the owner
 * applies it the read reports `needs-migration` and the write actions report
 * `needs-migration` honestly — the established migration-gated degrade.
 *
 * This module is pure (no server imports) so validation + grouping is
 * unit-testable. Missing-schema code detection is shared with clients-model.
 */

import {
  isMissingRpcCode,
  isMissingTableCode,
} from "@/lib/agency/clients-model";

export type AgencyOfferStatus = "offered" | "withdrawn";

export interface AgencyCandidateOffer {
  readonly id: string;
  readonly workerId: string;
  readonly requestId: string;
  readonly status: AgencyOfferStatus;
  readonly note: string | null;
  readonly createdAt: string;
}

export type AgencyCandidateOffersState =
  | { kind: "ok"; rows: readonly AgencyCandidateOffer[] }
  | { kind: "needs-migration" }
  | { kind: "error" };

/** One active roster worker the agency may offer (its OWN company_workers). */
export interface AgencyRosterOption {
  readonly workerId: string;
  /** Roster display for the agency's OWN worker — the agency already sees this
   *  exact label in its roster section; this is not a foreign-worker preview. */
  readonly label: string;
}

/** One of the agency's OWN needs the offer can target (canonical demand). */
export interface AgencyNeedOption {
  readonly requestId: string;
  readonly title: string;
  /** The client this need is linked to (agency_client_id), when known. */
  readonly clientId: string | null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isOfferUuid(value: string): boolean {
  return UUID_RE.test(value);
}

export type OfferInputValidation =
  | { ok: true; value: { requestId: string; workerId: string; note: string | null } }
  | { ok: false; reason: "requestId" | "workerId" | "note" };

/** Mirrors the server-side checks in submit_agency_candidate_offer_v1. */
export function validateOfferInput(input: {
  requestId: string;
  workerId: string;
  note?: string | null;
}): OfferInputValidation {
  const requestId = (input.requestId ?? "").trim();
  if (!UUID_RE.test(requestId)) return { ok: false, reason: "requestId" };
  const workerId = (input.workerId ?? "").trim();
  if (!UUID_RE.test(workerId)) return { ok: false, reason: "workerId" };
  const note = (input.note ?? "").trim() || null;
  if (note && note.length > 500) return { ok: false, reason: "note" };
  return { ok: true, value: { requestId, workerId, note } };
}

/** offers grouped by the need (request) they target — active offers only. */
export function groupOffersByRequest(
  offers: readonly AgencyCandidateOffer[],
): ReadonlyMap<string, readonly AgencyCandidateOffer[]> {
  const byRequest = new Map<string, AgencyCandidateOffer[]>();
  for (const o of offers) {
    if (o.status !== "offered") continue;
    const list = byRequest.get(o.requestId) ?? [];
    list.push(o);
    byRequest.set(o.requestId, list);
  }
  return byRequest;
}

/**
 * Whether a given (worker, request) already carries an active offer — used to
 * keep the picker honest (a re-offer is idempotent server-side, but the UI can
 * still show "already offered" instead of a redundant control).
 */
export function hasActiveOffer(
  offers: readonly AgencyCandidateOffer[],
  workerId: string,
  requestId: string,
): boolean {
  return offers.some(
    (o) =>
      o.status === "offered" &&
      o.workerId === workerId &&
      o.requestId === requestId,
  );
}

export { isMissingRpcCode, isMissingTableCode };
