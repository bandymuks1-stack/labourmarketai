/**
 * INVITATION DELIVERY RELIABILITY — the pure rules (owner P0, 2026-11-13).
 *
 * Incident: partner referral invitation 862a91f4 (lead_5d5f567d) was stored,
 * its send-ledger slot was reserved, the SMTP conversation failed, and the row
 * became `delivery_failed`. The transport DID return a reason code
 * (`timeout`, `smtp_rcpt_to_550`, …) but no caller kept it: it was neither
 * logged nor stored, so the real cause could not be recovered afterwards.
 *
 * This module decides, from that reason code alone:
 *   - the failure CLASS — TEMPORARY (retry later), PERMANENT (this address or
 *     this message will never be accepted: stop), CONFIGURATION (our mailbox /
 *     provider setup is wrong: stop and alert, retrying spends attempts on a
 *     fault no retry can fix);
 *   - WHEN the next automatic retry of an ALREADY AUTHORISED send may happen
 *     (exponential backoff, bounded);
 *   - the delivery STATE shown to people, where DELIVERED needs evidence from
 *     the recipient's side (the link was opened or the invitation accepted) —
 *     a provider / SMTP acknowledgement is only SENT, never DELIVERED.
 *
 * No I/O, no addresses: reason codes and timestamps only.
 */

export type DeliveryFailureClass = "TEMPORARY" | "PERMANENT" | "CONFIGURATION";

export type ClassifiedFailure = {
  /** Normalised reason code, `[a-z0-9_]{1,64}` — safe to log and store. */
  readonly reason: string;
  readonly failureClass: DeliveryFailureClass;
};

/** A reason code safe to log/store: lowercase `[a-z0-9_]`, at most 64 chars. */
export function normaliseReason(reason: string | null | undefined): string {
  const r = String(reason ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 64);
  return r === "" ? "unknown" : r;
}

/**
 * The class of one failed attempt. Unknown codes are TEMPORARY: the retry is
 * bounded (MAX_DELIVERY_ATTEMPTS) and dead-letters with the code kept, so an
 * unexpected code costs at most a few spaced attempts, never a mail storm.
 */
export function classifyDeliveryFailure(rawReason: string | null | undefined): ClassifiedFailure {
  const reason = normaliseReason(rawReason);
  return { reason, failureClass: classOf(reason) };
}

function classOf(reason: string): DeliveryFailureClass {
  // The recipient address itself.
  if (reason === "invalid_address" || reason === "invalid_email") return "PERMANENT";
  // Our side: missing provider, bad credentials, sender refused.
  if (reason === "not_configured") return "CONFIGURATION";
  if (/^smtp_auth_/.test(reason)) return "CONFIGURATION";
  if (/^smtp_(ehlo|mail_from)_5\d\d$/.test(reason)) return "CONFIGURATION";
  if (reason === "provider_status_401" || reason === "provider_status_403") return "CONFIGURATION";

  // SMTP reply codes: 4xx = transient by RFC 5321, 5xx = permanent.
  const smtp = /^smtp_[a-z_]+_(\d)\d\d$/.exec(reason);
  if (smtp) return smtp[1] === "4" ? "TEMPORARY" : "PERMANENT";

  // HTTP providers: 429 and 5xx transient; other 4xx (e.g. 422 bad recipient) permanent.
  const http = /^provider_status_(\d{3})$/.exec(reason);
  if (http) {
    const code = Number(http[1]);
    if (code === 429 || code >= 500) return "TEMPORARY";
    return "PERMANENT";
  }

  // Transport faults, our own rate cap, a ledger that could not be written,
  // a server that hung up or never answered (`smtp_<step>_none`).
  return "TEMPORARY";
}

/**
 * Minutes to wait after the Nth failed attempt (1-based) before attempt N+1.
 * Exponential ×6: 10 min, 1 h, 6 h. Four attempts in total (the first send
 * plus three retries) — the same three reissues `reissue_external_referral_v1`
 * allows per invitation (`resend_limit`), so the database bound and this one
 * agree and neither can be exceeded by the other.
 */
export const RETRY_BACKOFF_MINUTES: readonly number[] = [10, 60, 360];
export const MAX_DELIVERY_ATTEMPTS = RETRY_BACKOFF_MINUTES.length + 1;

/**
 * When the next automatic retry may run, or null when there must be none:
 * the failure is not TEMPORARY, or the attempts are spent (→ dead letter).
 */
export function nextRetryAt(input: {
  readonly failureClass: DeliveryFailureClass;
  /** Attempts made so far, INCLUDING the one that just failed (≥ 1). */
  readonly attempts: number;
  readonly now: Date;
}): Date | null {
  if (input.failureClass !== "TEMPORARY") return null;
  const wait = RETRY_BACKOFF_MINUTES[Math.max(1, Math.floor(input.attempts)) - 1];
  if (wait === undefined) return null;
  return new Date(input.now.getTime() + wait * 60_000);
}

export type DeliveryState =
  | "CREATED" //            stored, no send attempted (no provider / not mailable)
  | "QUEUED" //             a send is reserved and in flight, or a retry is scheduled
  | "SENT" //               the provider / SMTP server accepted it — NOT proof of delivery
  | "DELIVERED" //          the recipient opened the link or answered the invitation
  | "TEMPORARY_FAILURE" //  failed, will be retried automatically
  | "PERMANENT_FAILURE" //  failed for good (address / message refused, or our config)
  | "BOUNCED" //            accepted, then returned by the receiving server
  | "DEAD_LETTER"; //       temporary failures exhausted the retry budget

export type DeliveryRow = {
  readonly deliveryStatus: string | null;
  readonly deliveryReservedAt?: string | null;
  readonly failureClass?: DeliveryFailureClass | null;
  readonly nextRetryAt?: string | null;
  readonly deadLetteredAt?: string | null;
  readonly bouncedAt?: string | null;
  readonly firstOpenedAt?: string | null;
  readonly acceptedAt?: string | null;
  readonly declinedAt?: string | null;
};

/** The one delivery state of an invitation row. */
export function deliveryStateOf(row: DeliveryRow): DeliveryState {
  // Evidence from the recipient beats every transport state.
  if (row.acceptedAt || row.declinedAt || row.firstOpenedAt) return "DELIVERED";
  if (row.bouncedAt) return "BOUNCED";
  if (row.deliveryReservedAt) return "QUEUED";
  if (row.deliveryStatus === "sent") return "SENT";
  if (row.deliveryStatus === "delivery_failed") {
    if (row.deadLetteredAt) return row.failureClass === "TEMPORARY" ? "DEAD_LETTER" : "PERMANENT_FAILURE";
    if (row.failureClass === "PERMANENT" || row.failureClass === "CONFIGURATION") return "PERMANENT_FAILURE";
    if (row.nextRetryAt) return "TEMPORARY_FAILURE";
    // Failed before reasons were recorded: class unknown, nothing scheduled.
    return "TEMPORARY_FAILURE";
  }
  return "CREATED";
}
