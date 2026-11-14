/**
 * INVITATION DELIVERY RELIABILITY — the pure rules (owner P0, 2026-11-13; owner corrections
 * 2026-11-13 on PR #3318).
 *
 * Incident: partner referral invitation 862a91f4 (lead_5d5f567d) was stored, its send-ledger
 * slot was reserved, the SMTP conversation failed, and the row became `delivery_failed`. The
 * transport returned a reason code but no caller kept it, so the cause was unrecoverable.
 *
 * This module decides, from the transport's structured diagnostics:
 *   - the failure CLASS:
 *       TEMPORARY       — CONFIRMED not accepted and retryable: an explicit 4xx reply, or a
 *                         fault BEFORE the message body was transmitted (nothing can have left);
 *       PERMANENT       — an explicit 5xx about this recipient / message, or an invalid address;
 *       CONFIGURATION   — our own mailbox / provider setup is wrong (auth, sender, no provider);
 *       UNKNOWN_OUTCOME — the message MAY have been accepted (the connection broke after the
 *                         body was transmitted, an HTTP provider failed after the request was
 *                         sent, or the code is not recognised). NEVER retried automatically:
 *                         it is reconciled first (a bounce for its Message-ID, or the owner).
 *   - WHEN the next automatic retry may happen (TEMPORARY only; exponential, bounded);
 *   - the DELIVERY STATE. SMTP_ACCEPTED is the strongest fact SMTP gives. DELIVERED_CONFIRMED
 *     needs a positive delivery report (DSN `Action: delivered`). LINK_OPENED is reported
 *     SEPARATELY and is NEVER proof that the e-mail arrived: the partner hands the same link to
 *     the person directly (incident 862a91f4 was opened 21 s after creation without any mail).
 *
 * Diagnostics are codes only — step, reply code, enhanced status code, our own Message-ID,
 * timing. Never the recipient address, never server reply text, never a credential.
 */

export type DeliveryFailureClass = "TEMPORARY" | "PERMANENT" | "CONFIGURATION" | "UNKNOWN_OUTCOME";

export type SmtpStep = "connect" | "greeting" | "ehlo" | "auth" | "mail_from" | "rcpt_to" | "data" | "data_end";

/** Structured, personal-data-free facts about one send attempt. */
export type SendDiagnostics = {
  readonly provider: "smtp" | "resend" | "postmark" | "guard";
  /** SMTP: the step that failed (or the last one, on success). HTTP providers: "http". */
  readonly step?: SmtpStep | "http" | null;
  /** The 3-digit reply / HTTP status code, when the server answered. */
  readonly replyCode?: string | null;
  /** RFC 3463 enhanced status code (e.g. 5.1.1), when the reply carried one. */
  readonly enhancedCode?: string | null;
  /** True once the whole message (SMTP DATA body / HTTP request) was handed to the server. */
  readonly messageTransmitted: boolean;
  /** Our own generated Message-ID (`<uuid@domain>`) — the handle a bounce refers to. */
  readonly messageId?: string | null;
  readonly durationMs?: number | null;
};

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

/** Only well-formed codes survive into storage (anything else becomes null). */
export function sanitiseDiagnostics(d: SendDiagnostics | null | undefined): SendDiagnostics | null {
  if (!d) return null;
  const steps = ["connect", "greeting", "ehlo", "auth", "mail_from", "rcpt_to", "data", "data_end", "http"];
  return {
    provider: (["smtp", "resend", "postmark", "guard"] as const).includes(d.provider) ? d.provider : "smtp",
    step: d.step && steps.includes(d.step) ? d.step : null,
    replyCode: d.replyCode && /^[1-5]\d\d$/.test(d.replyCode) ? d.replyCode : null,
    enhancedCode: d.enhancedCode && /^[245]\.\d{1,3}\.\d{1,3}$/.test(d.enhancedCode) ? d.enhancedCode : null,
    messageTransmitted: d.messageTransmitted === true,
    messageId: d.messageId && /^<[A-Za-z0-9._-]{1,80}@[A-Za-z0-9.-]{1,80}>$/.test(d.messageId) ? d.messageId : null,
    durationMs:
      typeof d.durationMs === "number" && Number.isFinite(d.durationMs) && d.durationMs >= 0
        ? Math.min(Math.round(d.durationMs), 3_600_000)
        : null,
  };
}

/** Reasons produced by our own guards BEFORE any provider call: nothing can have left. */
const NOTHING_SENT_GUARDS = new Set(["rate_limited", "ledger_unavailable"]);

/** The class of one failed attempt. */
export function classifyDeliveryFailure(
  rawReason: string | null | undefined,
  detail?: SendDiagnostics | null,
): ClassifiedFailure {
  const reason = normaliseReason(rawReason);
  return { reason, failureClass: classOf(reason, sanitiseDiagnostics(detail)) };
}

function classOf(reason: string, d: SendDiagnostics | null): DeliveryFailureClass {
  if (reason === "invalid_address" || reason === "invalid_email") return "PERMANENT";
  if (reason === "not_configured") return "CONFIGURATION";
  if (NOTHING_SENT_GUARDS.has(reason)) return "TEMPORARY";

  // Our own side: credentials, greeting/ehlo refused, sender refused.
  if (/^smtp_auth_/.test(reason)) return "CONFIGURATION";
  if (/^smtp_(ehlo|mail_from)_5\d\d$/.test(reason)) return "CONFIGURATION";
  if (reason === "provider_status_401" || reason === "provider_status_403") return "CONFIGURATION";

  // An explicit SMTP reply: 4xx transient, 5xx permanent (RFC 5321). The server ANSWERED,
  // so the outcome is known even at end-of-data (a 4xx/5xx there means "not accepted").
  const smtp = /^smtp_[a-z_]+_([45])\d\d$/.exec(reason);
  if (smtp) return smtp[1] === "4" ? "TEMPORARY" : "PERMANENT";

  // HTTP providers: 429 / 503 are explicit "not now"; other 4xx explicit refusals;
  // 500 / 502 / 504 may have been processed before the error → unknown.
  const http = /^provider_status_(\d{3})$/.exec(reason);
  if (http) {
    const code = Number(http[1]);
    if (code === 429 || code === 503) return "TEMPORARY";
    if (code >= 400 && code < 500) return "PERMANENT";
    return "UNKNOWN_OUTCOME";
  }

  // No reply code: a timeout, a dropped connection, a transport error, or a step with no
  // answer (`smtp_<step>_none`). Safe to retry ONLY when the diagnostics prove the message
  // body was never handed over. Without diagnostics there is no proof → unknown.
  if (d && d.provider === "smtp" && d.step && d.step !== "data_end" && !d.messageTransmitted) {
    return "TEMPORARY";
  }
  return "UNKNOWN_OUTCOME";
}

/**
 * Minutes to wait after the Nth failed attempt (1-based) before attempt N+1. Exponential ×6:
 * 10 min, 1 h, 6 h. Four attempts in total — the same three reissues
 * `reissue_external_referral_v1` allows (`resend_limit`), so neither bound can exceed the other.
 */
export const RETRY_BACKOFF_MINUTES: readonly number[] = [10, 60, 360];
export const MAX_DELIVERY_ATTEMPTS = RETRY_BACKOFF_MINUTES.length + 1;

/** When the next automatic retry may run, or null: not TEMPORARY, or attempts spent. */
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
  | "CREATED" //               stored, no send attempted
  | "QUEUED" //                a send is reserved and in flight, or a retry is scheduled
  | "SMTP_ACCEPTED" //         our mail server / provider accepted it — NOT proof of delivery
  | "DELIVERED_CONFIRMED" //   a positive delivery report (DSN Action: delivered) for its Message-ID
  | "TEMPORARY_FAILURE" //     confirmed not accepted; an automatic retry is scheduled
  | "PERMANENT_FAILURE" //     refused for good (address / message)
  | "CONFIGURATION_FAILURE" // our mailbox / provider setup refused it
  | "UNKNOWN_OUTCOME" //       may have been accepted: reconcile, never retry blindly
  | "BOUNCED" //               accepted, then returned by the receiving side (DSN Action: failed)
  | "DEAD_LETTER"; //          temporary failures exhausted the retry budget

export type DeliveryRow = {
  readonly deliveryStatus: string | null;
  readonly deliveryReservedAt?: string | null;
  readonly failureClass?: DeliveryFailureClass | null;
  readonly nextRetryAt?: string | null;
  readonly deadLetteredAt?: string | null;
  readonly bouncedAt?: string | null;
  readonly deliveryConfirmedAt?: string | null;
  readonly firstOpenedAt?: string | null;
};

/** The e-mail delivery state of an invitation row. Link opens never enter it. */
export function deliveryStateOf(row: DeliveryRow): DeliveryState {
  if (row.bouncedAt) return "BOUNCED";
  if (row.deliveryConfirmedAt) return "DELIVERED_CONFIRMED";
  if (row.deliveryReservedAt) return "QUEUED";
  if (row.deliveryStatus === "sent") return "SMTP_ACCEPTED";
  if (row.deliveryStatus === "delivery_failed") {
    switch (row.failureClass) {
      case "PERMANENT":
        return "PERMANENT_FAILURE";
      case "CONFIGURATION":
        return "CONFIGURATION_FAILURE";
      case "TEMPORARY":
        return row.deadLetteredAt ? "DEAD_LETTER" : "TEMPORARY_FAILURE";
      default:
        // UNKNOWN_OUTCOME, or a failure recorded before reasons were kept (incident 862a91f4):
        // nobody can say whether it left. Never treated as retryable.
        return "UNKNOWN_OUTCOME";
    }
  }
  return "CREATED";
}

/** Recipient engagement, reported beside — never inside — the delivery state. */
export function linkOpened(row: Pick<DeliveryRow, "firstOpenedAt">): boolean {
  return Boolean(row.firstOpenedAt);
}
