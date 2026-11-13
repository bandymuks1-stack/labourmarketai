import type { DeliveryFailureClass } from "@/lib/email/delivery-failure";
import type { TransactionalSendResult } from "@/lib/email/transactional";
import { MAX_DELIVERY_ATTEMPTS } from "@/lib/email/delivery-failure";

/**
 * AUTOMATIC RETRY OF ALREADY AUTHORISED INVITATION SENDS (owner P0 2026-11-13).
 *
 * Scope — ONLY a partner referral whose own first send was authorised (the
 * partner's consented referral reached intake and a mail was attempted) and
 * whose LAST failure was TEMPORARY. Nothing new is ever created or mailed:
 *   - candidates come from `invitation_delivery_retry_candidates_v1` (due,
 *     TEMPORARY, not dead-lettered, not reserved, never opened by the
 *     recipient, pending, consented, unexpired, no account, address not
 *     mailed or reserved elsewhere);
 *   - each send first goes through `reissue_external_referral_v1`, which
 *     re-checks every one of those rules under the ADDRESS advisory lock and
 *     reserves the row (`delivery_reserved_at`) — so two overlapping runs, or
 *     a run racing the manual reprocess, can never mail one address twice;
 *   - the database's own `resend_limit` (3 reissues) equals the retry budget
 *     here (MAX_DELIVERY_ATTEMPTS = 1 + 3); when it refuses, the row is
 *     dead-lettered with that reason, never retried again;
 *   - a recipient who already OPENED the link is never retried: a retry
 *     rotates the token and would break the link they hold.
 *
 * Circuit breaker: a CONFIGURATION failure, or two consecutive TEMPORARY
 * failures, ends the run at once — a provider outage must not burn every
 * row's attempts in one pass. The next scheduled run tries again.
 *
 * Pure apart from the injected dependencies.
 */

export const MAX_RETRIES_PER_RUN = 10;

export type RetryCandidate = {
  readonly id: string;
  readonly invitedEmail: string;
  readonly locale: string | null;
  /** Attempts already made (≥ 1 for a row that failed once). */
  readonly attempts: number;
};

export type RetryDeps = {
  readonly emailConfigured: () => boolean;
  readonly mintToken: () => { token: string; hash: string };
  readonly reissue: (invitationId: string, tokenHash: string) => Promise<string>;
  readonly buildLink: (locale: string, token: string) => string;
  readonly send: (to: string, locale: string, link: string) => Promise<TransactionalSendResult>;
  /** `mark_external_referral_delivery_v1` — throws when not stored. */
  readonly mark: (invitationId: string, outcome: "sent" | "delivery_failed") => Promise<void>;
  /** Records the attempt; returns the failure class it stored (null when sent). */
  readonly record: (
    invitationId: string,
    result: TransactionalSendResult,
    attempts: number,
  ) => Promise<DeliveryFailureClass | null>;
  readonly deadLetter: (invitationId: string, reason: string) => Promise<void>;
  readonly resolveLocale: (locale: string | null) => string;
};

export type RetryReport = {
  readonly outcome: "done" | "email_not_configured" | "nothing_due";
  readonly due: number;
  readonly attempted: number;
  readonly sent: number;
  readonly failed: Readonly<Record<DeliveryFailureClass, number>>;
  readonly deadLettered: number;
  readonly refused: Readonly<Record<string, number>>;
  /** Why the run ended before its batch was done, if it did. */
  readonly stoppedBy: "configuration_failure" | "consecutive_temporary_failures" | "mark_failed" | null;
};

export async function retryDueDeliveries(
  candidates: readonly RetryCandidate[],
  deps: RetryDeps,
  options: { readonly limit?: number } = {},
): Promise<RetryReport> {
  const failed: Record<DeliveryFailureClass, number> = { TEMPORARY: 0, PERMANENT: 0, CONFIGURATION: 0 };
  const refused: Record<string, number> = {};
  const limit = Math.max(0, Math.min(options.limit ?? MAX_RETRIES_PER_RUN, MAX_RETRIES_PER_RUN));
  // One row per address, whatever the candidate read returned.
  const seen = new Set<string>();
  const batch = candidates
    .filter((c) => {
      const a = c.invitedEmail.trim().toLowerCase();
      if (!a || seen.has(a)) return false;
      seen.add(a);
      return true;
    })
    .slice(0, limit);
  const base = { due: candidates.length, failed, refused };
  if (batch.length === 0) {
    return { outcome: "nothing_due", ...base, attempted: 0, sent: 0, deadLettered: 0, stoppedBy: null };
  }
  // Refuse BEFORE any token is rotated.
  if (!deps.emailConfigured()) {
    return { outcome: "email_not_configured", ...base, attempted: 0, sent: 0, deadLettered: 0, stoppedBy: null };
  }

  let attempted = 0;
  let sent = 0;
  let deadLettered = 0;
  let consecutiveTemporary = 0;
  let stoppedBy: RetryReport["stoppedBy"] = null;

  for (const row of batch) {
    if (row.attempts >= MAX_DELIVERY_ATTEMPTS) {
      await deps.deadLetter(row.id, "attempts_exhausted");
      deadLettered += 1;
      continue;
    }
    const { token, hash } = deps.mintToken();
    const verdict = await deps.reissue(row.id, hash);
    if (verdict !== "ok") {
      refused[verdict] = (refused[verdict] ?? 0) + 1;
      // The database's own reissue budget is spent: no retry can ever pass.
      if (verdict === "resend_limit") {
        await deps.deadLetter(row.id, "resend_limit");
        deadLettered += 1;
      }
      continue;
    }
    attempted += 1;
    const locale = deps.resolveLocale(row.locale);
    let result: TransactionalSendResult;
    try {
      result = await deps.send(row.invitedEmail.trim(), locale, deps.buildLink(locale, token));
    } catch {
      result = { status: "failed", reason: "transport_error" };
    }
    const ok = result.status === "sent";
    // The reservation is cleared only by mark; if it does not land, the row
    // stays reserved (no later run can mail this address) — stop here.
    try {
      await deps.mark(row.id, ok ? "sent" : "delivery_failed");
    } catch {
      refused.mark_failed = (refused.mark_failed ?? 0) + 1;
      stoppedBy = "mark_failed";
      break;
    }
    const failureClass = await deps.record(row.id, result, row.attempts + 1);
    if (ok) {
      sent += 1;
      consecutiveTemporary = 0;
      continue;
    }
    const cls: DeliveryFailureClass = failureClass ?? "TEMPORARY";
    failed[cls] += 1;
    if (cls === "CONFIGURATION") {
      stoppedBy = "configuration_failure";
      break;
    }
    if (cls === "TEMPORARY") {
      consecutiveTemporary += 1;
      if (consecutiveTemporary >= 2) {
        stoppedBy = "consecutive_temporary_failures";
        break;
      }
    } else {
      consecutiveTemporary = 0;
    }
  }
  return { outcome: "done", ...base, attempted, sent, deadLettered, stoppedBy };
}

export type DeliveryHealth = {
  readonly attempts: number;
  readonly sent: number;
  readonly failed_temporary: number;
  readonly failed_permanent: number;
  readonly failed_configuration: number;
  readonly failed_last_hour: number;
  readonly retry_due: number;
  readonly retry_scheduled: number;
  readonly dead_letter: number;
  readonly failed_unclassified: number;
  readonly stuck_reservations: number;
  readonly reasons: Readonly<Record<string, number>>;
};

export type DeliveryAlert =
  | "repeated_failures"
  | "configuration_failure"
  | "dead_letter_present"
  | "stuck_reservation"
  | "unclassified_failures"
  | "low_success_rate";

/** Alert threshold: this many failed attempts within one hour. */
export const REPEATED_FAILURES_PER_HOUR = 3;

/** Which alerts a health snapshot raises (owner-facing; no ids, no addresses). */
export function deliveryAlerts(h: DeliveryHealth): DeliveryAlert[] {
  const out: DeliveryAlert[] = [];
  if (h.failed_last_hour >= REPEATED_FAILURES_PER_HOUR) out.push("repeated_failures");
  if (h.failed_configuration > 0) out.push("configuration_failure");
  if (h.dead_letter > 0) out.push("dead_letter_present");
  if (h.stuck_reservations > 0) out.push("stuck_reservation");
  if (h.failed_unclassified > 0) out.push("unclassified_failures");
  if (h.attempts >= 5 && h.sent / h.attempts < 0.9) out.push("low_success_rate");
  return out;
}
