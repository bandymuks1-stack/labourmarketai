/**
 * PLATFORM E-MAIL DELIVERY CONTROL (owner P0 2026-11-13): one record per EVENT, so
 * an e-mail is sent once, a failure is kept, a failed send is retried a bounded
 * number of times, and what still failed after the last try stays visible.
 *
 * PURE CORE: the store, the sender and the clock are passed in. The Supabase store
 * and the mailbox sender live in `platform-email-delivery-store.ts` (server-only).
 *
 * THE RULES, in one place:
 *   ONCE      The record's `event_key` is unique and inserting it IS the claim.
 *             Whoever does not get the claim sends nothing.
 *   RECORDED  Every attempt ends in a stored status: `sent`, `retry_wait`
 *             (will be tried again), `failed` (will not), `suppressed` (must not
 *             be sent: a synthetic QA address).
 *   BOUNDED   At most MAX_ATTEMPTS tries, spaced by RETRY_DELAYS_MS. Never a loop.
 *   VISIBLE   `failed` is terminal and is never deleted or hidden; the admin home
 *             counts it. A row found still `sending` long after its attempt began
 *             has an UNKNOWN outcome (the process died between "send" and
 *             "record"): it is NOT sent again — that could be a second e-mail —
 *             it becomes `failed / outcome_unknown` for a person to decide.
 *   NO RECORD The record itself can be unavailable (migration not applied, DB
 *             down). Then an INTERNAL alert is still sent once, unrecorded and
 *             loudly logged — a stored request must not go unnoticed, and a
 *             repeat in our own mailbox harms nobody — while an e-mail to a
 *             COMPANY is NOT sent: without the record nothing could prove it
 *             would not be sent twice.
 *
 * NO PERSONAL DATA is stored or logged here: the record holds the event kind and
 * the id of the organization or request; the message is composed from the live
 * row at send time; an error is a short machine code.
 */

export const DELIVERY_KINDS = ["company_registration_notice", "company_welcome", "intake_alert"] as const;
export type DeliveryKind = (typeof DELIVERY_KINDS)[number];
export type DeliveryAudience = "internal" | "company";
export type DeliveryStatus = "sending" | "sent" | "retry_wait" | "failed" | "suppressed";

export const DELIVERY_AUDIENCE: Record<DeliveryKind, DeliveryAudience> = {
  company_registration_notice: "internal",
  company_welcome: "company",
  intake_alert: "internal",
};

/** Tries in total (the first one included). */
export const MAX_ATTEMPTS = 5;
/** Wait before try 2, 3, 4, 5. */
export const RETRY_DELAYS_MS = [5 * 60_000, 30 * 60_000, 2 * 3_600_000, 12 * 3_600_000] as const;
/** A `sending` row older than this has an unknown outcome (the SMTP timeout is 20 s). */
export const STALE_SENDING_MS = 15 * 60_000;

/** Greppable marker: the delivery record was unreadable. */
export const DELIVERY_RECORD_UNAVAILABLE = "[email/delivery] RECORD UNAVAILABLE";

export type DeliveryEvent = {
  readonly kind: DeliveryKind;
  /** The organization (registration notice, welcome) or the stored request (alert). */
  readonly subjectId: string;
  readonly locale?: string | null;
};

export type DeliveryRow = {
  readonly id: string;
  readonly eventKey: string;
  readonly kind: DeliveryKind;
  readonly audience: DeliveryAudience;
  readonly subjectId: string;
  readonly locale: string | null;
  readonly status: DeliveryStatus;
  readonly attempts: number;
  readonly lastError: string | null;
  readonly nextAttemptAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
};

export type DeliveryFinish = {
  readonly status: Exclude<DeliveryStatus, "sending">;
  readonly lastError: string | null;
  readonly messageId: string | null;
  readonly nextAttemptAt: string | null;
  readonly sentAt: string | null;
};

/** Thrown by a store when the record cannot be read or written at all. */
export class DeliveryRecordUnavailable extends Error {
  constructor(readonly code: string) {
    super(`delivery record unavailable: ${code}`);
  }
}

export interface DeliveryStore {
  /** Insert the event as attempt 1 in `sending`. `null` = the event already exists. */
  claimNew(e: { eventKey: string; kind: DeliveryKind; audience: DeliveryAudience; subjectId: string; locale: string | null; nowIso: string }): Promise<DeliveryRow | null>;
  /** `retry_wait` with exactly `attempts` tries → `sending`, attempts + 1. `null` = someone else took it. */
  claimRetry(id: string, attempts: number, nowIso: string): Promise<DeliveryRow | null>;
  /** Close the attempt this caller holds (the row is `sending` with `attempts` tries). */
  finish(id: string, attempts: number, f: DeliveryFinish, nowIso: string): Promise<void>;
  listDue(nowIso: string, limit: number): Promise<readonly DeliveryRow[]>;
  /** `sending` rows whose attempt began before `beforeIso`. */
  listStaleSending(beforeIso: string, limit: number): Promise<readonly DeliveryRow[]>;
}

export type OutboundEmail = {
  readonly to: string;
  readonly subject: string;
  readonly text: string;
  readonly html: string;
  readonly replyTo?: string;
  readonly headers?: Readonly<Record<string, string>>;
  /** Passed to the rate guard for an e-mail to a company. */
  readonly organizationId?: string | null;
};

/** What to send for a row, or why nothing can be sent. Reads the LIVE row each time. */
export type Compose = (row: Pick<DeliveryRow, "kind" | "subjectId" | "locale" | "audience" | "createdAt">) => Promise<
  | { readonly kind: "send"; readonly email: OutboundEmail }
  /** `retryable: false` → terminal (e.g. the organization no longer exists). */
  | { readonly kind: "cannot"; readonly reason: string; readonly retryable: boolean }
>;

export type SendResult =
  | { readonly status: "sent"; readonly messageId: string | null }
  | { readonly status: "suppressed"; readonly reason: string }
  | { readonly status: "failed"; readonly reason: string; readonly retryable: boolean };

export type Sender = (email: OutboundEmail, audience: DeliveryAudience) => Promise<SendResult>;

export type DeliveryDeps = {
  readonly store: DeliveryStore;
  readonly send: Sender;
  readonly compose: Compose;
  readonly now?: () => number;
  readonly log?: (marker: string, detail: Record<string, string | number>) => void;
};

export type DeliveryOutcome =
  | { readonly outcome: "sent" | "suppressed" | "retry_wait" | "failed"; readonly attempts: number; readonly reason: string | null }
  /** The event was already claimed — by an earlier call or another instance. Nothing sent. */
  | { readonly outcome: "duplicate" }
  /** No record available: an internal alert was sent (or failed) without one. */
  | { readonly outcome: "sent_unrecorded" | "failed_unrecorded"; readonly reason: string | null }
  /** No record available: an e-mail to a company is not sent without one. */
  | { readonly outcome: "not_sent_no_record" };

export function deliveryEventKey(kind: DeliveryKind, subjectId: string): string {
  return `${kind}:${subjectId.toLowerCase()}`;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A reason as the short machine code the record accepts. Never a server reply text. */
export function reasonCode(reason: string | null | undefined): string {
  const code = (reason ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60);
  return code || "unknown";
}

const iso = (ms: number) => new Date(ms).toISOString();

async function attempt(deps: DeliveryDeps, row: DeliveryRow): Promise<DeliveryOutcome> {
  const now = deps.now ?? Date.now;
  let result: SendResult;
  try {
    const composed = await deps.compose(row);
    result =
      composed.kind === "cannot"
        ? { status: "failed", reason: composed.reason, retryable: composed.retryable }
        : await deps.send(composed.email, row.audience);
  } catch {
    // Compose or transport threw: the attempt failed, the record still closes.
    result = { status: "failed", reason: "attempt_threw", retryable: true };
  }

  const at = now();
  let finish: DeliveryFinish;
  if (result.status === "sent") {
    finish = { status: "sent", lastError: null, messageId: result.messageId, nextAttemptAt: null, sentAt: iso(at) };
  } else if (result.status === "suppressed") {
    finish = { status: "suppressed", lastError: reasonCode(result.reason), messageId: null, nextAttemptAt: null, sentAt: null };
  } else {
    const delay = RETRY_DELAYS_MS[row.attempts - 1];
    const again = result.retryable && row.attempts < MAX_ATTEMPTS && delay !== undefined;
    finish = {
      status: again ? "retry_wait" : "failed",
      lastError: reasonCode(result.reason),
      messageId: null,
      nextAttemptAt: again ? iso(at + delay) : null,
      sentAt: null,
    };
  }
  await deps.store.finish(row.id, row.attempts, finish, iso(at));
  return { outcome: finish.status, attempts: row.attempts, reason: finish.lastError };
}

/**
 * Deliver one event's e-mail, at most once. Never throws: a caller that has just
 * stored a registration or a request must not fail because of its e-mail.
 */
export async function deliverEvent(deps: DeliveryDeps, event: DeliveryEvent): Promise<DeliveryOutcome> {
  const now = deps.now ?? Date.now;
  const log = deps.log ?? (() => {});
  const audience = DELIVERY_AUDIENCE[event.kind];
  if (!UUID.test(event.subjectId)) return { outcome: "failed_unrecorded", reason: "invalid_subject" };

  let row: DeliveryRow | null;
  try {
    row = await deps.store.claimNew({
      eventKey: deliveryEventKey(event.kind, event.subjectId),
      kind: event.kind,
      audience,
      subjectId: event.subjectId.toLowerCase(),
      locale: event.locale ?? null,
      nowIso: iso(now()),
    });
  } catch (e) {
    log(DELIVERY_RECORD_UNAVAILABLE, { kind: event.kind, code: e instanceof DeliveryRecordUnavailable ? e.code : "error" });
    if (audience !== "internal") return { outcome: "not_sent_no_record" };
    try {
      const composed = await deps.compose({ kind: event.kind, subjectId: event.subjectId, locale: event.locale ?? null, audience, createdAt: iso(now()) });
      if (composed.kind === "cannot") return { outcome: "failed_unrecorded", reason: reasonCode(composed.reason) };
      const sent = await deps.send(composed.email, audience);
      return sent.status === "sent"
        ? { outcome: "sent_unrecorded", reason: null }
        : { outcome: "failed_unrecorded", reason: reasonCode(sent.reason) };
    } catch {
      return { outcome: "failed_unrecorded", reason: "attempt_threw" };
    }
  }
  if (!row) return { outcome: "duplicate" };

  try {
    return await attempt(deps, row);
  } catch {
    // The attempt ran but its result could not be stored. The row stays `sending`
    // and the sweep below turns it into a visible `failed / outcome_unknown`.
    log(DELIVERY_RECORD_UNAVAILABLE, { kind: event.kind, code: "finish_failed" });
    return { outcome: "failed", attempts: row.attempts, reason: "record_write_failed" };
  }
}

export type RetrySweepReport = {
  readonly due: number;
  readonly sent: number;
  readonly retryWait: number;
  readonly failed: number;
  readonly suppressed: number;
  /** `sending` rows closed as `failed / outcome_unknown`. */
  readonly unknownClosed: number;
};

/**
 * One sweep: close attempts whose outcome is unknown, then retry what is due.
 * Bounded by `limit`; a row another instance took is skipped. Throws only
 * `DeliveryRecordUnavailable` (the route reports it; nothing was sent).
 */
export async function retryDueDeliveries(deps: DeliveryDeps, limit = 20): Promise<RetrySweepReport> {
  const now = deps.now ?? Date.now;
  const report = { due: 0, sent: 0, retryWait: 0, failed: 0, suppressed: 0, unknownClosed: 0 };

  for (const stale of await deps.store.listStaleSending(iso(now() - STALE_SENDING_MS), limit)) {
    await deps.store.finish(
      stale.id,
      stale.attempts,
      { status: "failed", lastError: "outcome_unknown", messageId: null, nextAttemptAt: null, sentAt: null },
      iso(now()),
    );
    report.unknownClosed += 1;
  }

  const due = await deps.store.listDue(iso(now()), limit);
  report.due = due.length;
  for (const waiting of due) {
    const claimed = await deps.store.claimRetry(waiting.id, waiting.attempts, iso(now()));
    if (!claimed) continue;
    let outcome: DeliveryOutcome;
    try {
      outcome = await attempt(deps, claimed);
    } catch {
      continue; // stays `sending`; the next sweep closes it as outcome_unknown
    }
    if (outcome.outcome === "sent") report.sent += 1;
    else if (outcome.outcome === "retry_wait") report.retryWait += 1;
    else if (outcome.outcome === "suppressed") report.suppressed += 1;
    else report.failed += 1;
  }
  return report;
}
