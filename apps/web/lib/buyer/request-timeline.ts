/**
 * Buyer request derived timeline — deterministic, transparent product
 * logic (long-cycle-2 plan PR G).
 *
 * Builds a compact activity timeline from facts that ALREADY exist:
 * the request's created_at, its status, and the attachments' created_at.
 * It invents no activity, stores nothing, needs no new DB table, and
 * makes no AI/automatic claim. Same inputs → same output.
 *
 * Events (in workflow order):
 *   request_created               — always, at the request created_at
 *   file_attached                 — if ≥1 attachment, at the most recent
 *                                   attachment time, carrying the count
 *   automatic_reading_not_enabled — a state note when files exist (honest:
 *                                   files are not auto-read)
 *   manual_review_pending         — when the request is submitted and not
 *                                   yet closed/approved
 */

export type RequestTimelineEventKey =
  | "request_created"
  | "file_attached"
  | "automatic_reading_not_enabled"
  | "manual_review_pending";

export interface RequestTimelineEvent {
  readonly key: RequestTimelineEventKey;
  /** ISO timestamp when the event has a real time, else null (state note). */
  readonly at: string | null;
  /** For file_attached: how many files. Omitted otherwise. */
  readonly count?: number;
}

export interface RequestTimelineInput {
  readonly createdAt: string;
  readonly status: string | null | undefined;
  readonly attachments: readonly { readonly createdAt: string }[];
}

/** Statuses that mean a human review is awaited. */
const PENDING_REVIEW_STATUSES = new Set([
  "submitted",
  "in_review",
  "needs_followup",
]);

export function computeRequestTimeline(
  input: RequestTimelineInput,
): readonly RequestTimelineEvent[] {
  const events: RequestTimelineEvent[] = [
    { key: "request_created", at: input.createdAt },
  ];

  const attachments = input.attachments ?? [];
  if (attachments.length > 0) {
    // Most recent attachment time — deterministic max of the ISO strings.
    let latest = attachments[0].createdAt;
    for (const a of attachments) {
      if (a.createdAt > latest) latest = a.createdAt;
    }
    events.push({
      key: "file_attached",
      at: latest,
      count: attachments.length,
    });
    events.push({ key: "automatic_reading_not_enabled", at: null });
  }

  if (PENDING_REVIEW_STATUSES.has((input.status ?? "").trim())) {
    events.push({ key: "manual_review_pending", at: null });
  }

  return events;
}
