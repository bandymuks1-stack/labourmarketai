/**
 * Credential validity — CURRENT STATE, kept apart from HISTORY (FINAL
 * COMPLETION Train E1, 2026-09-02; register §16 "Living CV").
 *
 * The Living CV keeps two things that must never be collapsed into one:
 *   • HISTORICAL EVIDENCE — `worker_document_events` is append-only (created /
 *     updated / status_changed, before/after state, actor, time). Nothing here
 *     writes it, nothing here rewrites it. A validity change is a NEW fact on
 *     top of the old ones, never an overwrite of what was once verified.
 *   • CURRENT VALIDITY — what the credential is worth TODAY, derived from the
 *     stored row and the history, by the pure rule below.
 *
 * PURE — no IO and no ambient clock (the caller passes `now`) — so the rule is
 * unit-testable and identical everywhere it is shown (document centre, CV,
 * player card, an assistant's read).
 *
 * The states, in the owner's vocabulary:
 *   ACTIVE    verified by a reviewer and still inside its validity window
 *   EXPIRED   its own `valid_until` has passed (whatever the review said)
 *   REVOKED   was verified at some point in the history, and the latest
 *             review decision is `rejected` — the earlier verification stands
 *             as history; it is no longer valid
 *   PENDING   sent for review, no decision yet
 *   REJECTED  reviewed and refused, never verified before
 *   UNVERIFIED stored, never sent for review
 *   UNKNOWN   the verification axis was not readable in this environment —
 *             nothing is claimed either way
 *
 * NOT_YET_VALID is folded into ACTIVE/UNVERIFIED on purpose: `valid_from` in
 * the future is rare for the documents this product tracks and would only add
 * a state nobody acts on; the date itself is still shown.
 */

export const CREDENTIAL_VALIDITY_STATES = [
  "active",
  "expired",
  "revoked",
  "pending",
  "rejected",
  "unverified",
  "unknown",
] as const;
export type CredentialValidityState = (typeof CREDENTIAL_VALIDITY_STATES)[number];

export type CredentialValidityInput = {
  /** Stored review decision, or null when the axis is not readable. */
  readonly verification: "unverified" | "pending" | "verified" | "rejected" | null;
  /** ISO date (YYYY-MM-DD) or null. */
  readonly validUntil: string | null;
  /** ISO timestamp of the latest reviewer decision, or null. */
  readonly verifiedAt: string | null;
  /** True when the append-only history holds at least one `verified`
   *  decision — the difference between REJECTED and REVOKED. */
  readonly everVerified: boolean;
};

export type CredentialValidity = {
  readonly state: CredentialValidityState;
  /** The date the current state took effect, when known: `valid_until` for
   *  EXPIRED, the reviewer decision time for ACTIVE/REVOKED/REJECTED. */
  readonly since: string | null;
  /** Days until `valid_until` (negative when passed), or null without one. */
  readonly daysToExpiry: number | null;
};

const DAY_MS = 24 * 60 * 60 * 1000;

/** `valid_until` is a DATE: the credential is valid through the END of that
 *  day, everywhere, in UTC (same rule as deriveDocumentStatus). */
function endOfValidityUtc(validUntil: string): number | null {
  const t = Date.parse(`${validUntil}T23:59:59Z`);
  return Number.isNaN(t) ? null : t;
}

export function deriveCredentialValidity(
  input: CredentialValidityInput,
  now: Date,
): CredentialValidity {
  const end = input.validUntil ? endOfValidityUtc(input.validUntil) : null;
  const daysToExpiry =
    end === null ? null : Math.floor((end - now.getTime()) / DAY_MS);

  if (end !== null && end < now.getTime()) {
    return { state: "expired", since: input.validUntil, daysToExpiry };
  }
  if (input.verification === null) {
    return { state: "unknown", since: null, daysToExpiry };
  }
  switch (input.verification) {
    case "verified":
      return { state: "active", since: input.verifiedAt, daysToExpiry };
    case "rejected":
      return {
        state: input.everVerified ? "revoked" : "rejected",
        since: input.verifiedAt,
        daysToExpiry,
      };
    case "pending":
      return { state: "pending", since: null, daysToExpiry };
    case "unverified":
    default:
      return { state: "unverified", since: null, daysToExpiry };
  }
}

/** A `worker_document_events` row carries `after_state` jsonb; a verified
 *  decision leaves `{ "verification": "verified" }` there. Pure, tolerant of
 *  rows whose after_state is null or shaped differently. */
export function historyEverVerified(
  events: readonly { after_state?: unknown }[] | null | undefined,
): boolean {
  if (!events) return false;
  for (const e of events) {
    const after = e?.after_state;
    if (
      after &&
      typeof after === "object" &&
      (after as { verification?: unknown }).verification === "verified"
    ) {
      return true;
    }
  }
  return false;
}
