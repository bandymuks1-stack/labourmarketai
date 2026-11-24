/**
 * INBOX PRIORITY — pure, derived from REAL thread state only (owner audit
 * §8.1 "priority").
 *
 * The product has no priority column and inventing one would be a fabricated
 * signal (§7). What it DOES have is the honest facts a person actually
 * prioritises by:
 *
 *   - is the newest message from the counterpart and still unread?  → the
 *     other side is waiting for you;
 *   - how long has it been waiting?                                 → an
 *     unanswered day-old question outranks one from a minute ago;
 *   - did YOU write last?                                           → the
 *     ball is not in your court.
 *
 * Three levels, each one a statement the UI can defend in words:
 *   `awaiting_you` — unread, last word theirs (the only "act now" state)
 *   `waiting_them` — you replied last; nothing is expected of you
 *   `quiet`        — read and nothing new
 *
 * Pure: no IO, no clock of its own (the caller passes `nowMs`), trivially
 * testable.
 */

export type InboxPriority = "awaiting_you" | "waiting_them" | "quiet";

/** Hours after which an unanswered counterpart message is called overdue. */
export const INBOX_OVERDUE_HOURS = 24;

export interface InboxPriorityInput {
  /** True when the thread has a counterpart message the viewer has not read. */
  readonly unread: boolean;
  /** True when the newest message in the thread was written by the viewer. */
  readonly newestByViewer: boolean;
  /** ISO timestamp of the newest message, or null when unknown. */
  readonly newestAt: string | null;
}

export interface InboxPriorityResult {
  readonly level: InboxPriority;
  /** True only for `awaiting_you` older than INBOX_OVERDUE_HOURS — a real
   *  elapsed-time fact, never a guess about importance. */
  readonly overdue: boolean;
  /** Whole hours the newest message has been waiting, or null when unknown.
   *  Surfaced so the UI can say WHY something is ranked first. */
  readonly waitingHours: number | null;
}

export function deriveInboxPriority(
  input: InboxPriorityInput,
  nowMs: number,
): InboxPriorityResult {
  const ms = input.newestAt ? Date.parse(input.newestAt) : NaN;
  const waitingHours = Number.isFinite(ms)
    ? Math.max(0, Math.floor((nowMs - ms) / 3_600_000))
    : null;

  if (input.unread && !input.newestByViewer) {
    return {
      level: "awaiting_you",
      overdue: waitingHours !== null && waitingHours >= INBOX_OVERDUE_HOURS,
      waitingHours,
    };
  }
  if (input.newestByViewer) {
    return { level: "waiting_them", overdue: false, waitingHours };
  }
  return { level: "quiet", overdue: false, waitingHours };
}

/** Sort weight — awaiting-you first (oldest wait first inside that group),
 *  then threads where they owe an answer, then quiet ones. Stable and pure,
 *  so the server and any test agree on the order. */
export function inboxPriorityRank(p: InboxPriorityResult): number {
  const base =
    p.level === "awaiting_you" ? 0 : p.level === "waiting_them" ? 1 : 2;
  return base;
}

/** Order a list by priority, then by the longest wait, then by recency. */
export function sortByInboxPriority<T>(
  rows: readonly T[],
  priorityOf: (row: T) => InboxPriorityResult,
  newestAtOf: (row: T) => string | null,
): T[] {
  return [...rows].sort((a, b) => {
    const pa = priorityOf(a);
    const pb = priorityOf(b);
    const byLevel = inboxPriorityRank(pa) - inboxPriorityRank(pb);
    if (byLevel !== 0) return byLevel;
    // Inside "awaiting you", the longest-waiting question comes first.
    if (pa.level === "awaiting_you") {
      const wa = pa.waitingHours ?? 0;
      const wb = pb.waitingHours ?? 0;
      if (wa !== wb) return wb - wa;
    }
    const na = newestAtOf(a) ?? "";
    const nb = newestAtOf(b) ?? "";
    return na < nb ? 1 : na > nb ? -1 : 0;
  });
}
