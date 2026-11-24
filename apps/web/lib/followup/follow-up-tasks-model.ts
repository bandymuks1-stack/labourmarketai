/**
 * Pure follow-up task model (branch 24, §8.13) — shared by the server read
 * service, the server actions and the client queue panel. No server-only
 * imports.
 *
 * The status set is deliberately a plain HONEST lifecycle: pending / done /
 * dismissed. No priority, no urgency score, no 'contacted' claim — this is
 * an INTERNAL operator memory of next actions, never an outreach engine
 * (§8.13: no external sending, no AI pretending to contact people).
 */

export const FOLLOW_UP_STATUSES = ["pending", "done", "dismissed"] as const;
export type FollowUpStatus = (typeof FOLLOW_UP_STATUSES)[number];

export type FollowUpTask = {
  readonly id: string;
  /** Subject pointer — ids only, never copied PII. At most one is set. */
  readonly subjectProfileId: string | null;
  readonly subjectCompanyId: string | null;
  readonly note: string;
  readonly status: FollowUpStatus;
  readonly createdAt: string;
  readonly resolvedAt: string | null;
};

export type FollowUpQueueData =
  | { readonly applied: false }
  | {
      readonly applied: true;
      /** Oldest first — a queue, real rows only (never fabricated). */
      readonly pending: readonly FollowUpTask[];
      /** Recently resolved (done/dismissed), newest resolution first. */
      readonly resolved: readonly FollowUpTask[];
      readonly error: string | null;
    };
