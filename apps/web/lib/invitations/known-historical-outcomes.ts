import type { DeliveryHealth } from "@/lib/invitations/delivery-retry";

/**
 * KNOWN HISTORICAL UNKNOWN OUTCOMES (owner decision 2026-11-14, invitation 862a91f4: "NO RESEND").
 *
 * An invitation whose first send failed BEFORE the delivery ledger existed (migration
 * 20261113190000) has no failure class and no ledgered attempt: nobody can say whether the mail
 * left. The owner reviewed such a case and decided to keep it exactly as it is — the link stays
 * valid, its status and open history are not touched, and it is never re-sent. Monitoring must
 * still SEE it (diagnostics: `known_historical_unknown_outcome`), but it is not a NEW failure, so it
 * no longer raises `unknown_outcome_open`. Nothing here writes to the database and nothing here
 * marks anything DELIVERED_CONFIRMED.
 *
 * A row counts as known-historical ONLY while every condition still holds:
 *   - its id is in this owner-decided register;
 *   - it is still an open unknown outcome (pending, delivery_failed, not bounced);
 *   - its failure class is still null (unclassified pre-ledger failure);
 *   - it has NO ledgered delivery attempt.
 * Any later attempt, classification or bounce makes it an ordinary row again, so a new
 * UNKNOWN_OUTCOME / BOUNCED / DEAD_LETTER event about it still alerts at once.
 */
export const KNOWN_HISTORICAL_UNKNOWN_OUTCOME = "KNOWN_HISTORICAL_UNKNOWN_OUTCOME" as const;

export interface KnownHistoricalOutcome {
  readonly invitationId: string;
  readonly classification: typeof KNOWN_HISTORICAL_UNKNOWN_OUTCOME;
  readonly decision: "NO_RESEND";
  readonly decidedOn: string;
  readonly note: string;
}

export const KNOWN_HISTORICAL_OUTCOMES: readonly KnownHistoricalOutcome[] = [
  {
    invitationId: "862a91f4-a58f-4359-81a8-a22d11218445",
    classification: KNOWN_HISTORICAL_UNKNOWN_OUTCOME,
    decision: "NO_RESEND",
    decidedOn: "2026-11-14",
    note: "pre-ledger send failure (no failure class, 0 ledgered attempts); link already opened; keep as is",
  },
];

/** What the server reads for each register id that is still an open unknown outcome. */
export interface OpenUnknownRow {
  readonly id: string;
  readonly delivery_failure_class: string | null;
  readonly ledgered_attempts: number;
}

/** How many of `rows` are still known-historical under the owner register. */
export function countKnownHistorical(
  rows: readonly OpenUnknownRow[],
  register: readonly KnownHistoricalOutcome[] = KNOWN_HISTORICAL_OUTCOMES,
): number {
  const ids = new Set(register.map((r) => r.invitationId));
  const seen = new Set<string>();
  for (const r of rows) {
    if (!ids.has(r.id) || seen.has(r.id)) continue;
    if (r.delivery_failure_class !== null) continue;
    if (r.ledgered_attempts !== 0) continue;
    seen.add(r.id);
  }
  return seen.size;
}

/**
 * Moves known-historical rows out of `unknown_outcome_open` (which drives the alert) into the
 * diagnostic counter. Never goes below zero; `known = null` (could not be read) leaves the health
 * untouched so the alert stays — a failed lookup must never hide a real unknown outcome.
 */
export function withKnownHistorical(h: DeliveryHealth, known: number | null): DeliveryHealth {
  if (known === null) return h;
  const moved = Math.max(0, Math.min(known, h.unknown_outcome_open));
  return {
    ...h,
    unknown_outcome_open: h.unknown_outcome_open - moved,
    known_historical_unknown_outcome: moved,
  };
}
