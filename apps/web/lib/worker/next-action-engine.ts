/**
 * S9 — „kitas veiksmas" variklis. Pure, DB-free, deterministic: turns the
 * worker's REAL signals (expiring documents, today's journal state, this
 * week's unfilled days, the honest growth suggestion) into ONE prioritized
 * queue. No IO, no fabrication — every queue item is a function of a real
 * input; an empty queue means the day is genuinely clear.
 *
 * Priority (most time-critical first):
 *   1. renew_document  — a document is expiring/blocked (legal readiness).
 *   2. fill_today      — today has no journal entry yet.
 *   3. fill_week_gaps  — elapsed weekdays without any entry.
 *   4. grow_skill      — the real taxonomy suggestion exists.
 */

export type CommandAction =
  | { kind: "renew_document"; docSlug: string; validUntil: string | null }
  | { kind: "fill_today" }
  | { kind: "fill_week_gaps"; missingDays: number }
  | { kind: "grow_skill"; skillSlug: string };

export interface CommandSignals {
  /** Documents whose DERIVED status is expiring or blocked (real rows). */
  readonly expiringDocs: ReadonlyArray<{
    slug: string;
    validUntil: string | null;
  }>;
  readonly entriesToday: number;
  readonly weekDaysWithEntries: number;
  /** Days elapsed this week incl. today (Mon=1 … Sun=7). */
  readonly weekDaysElapsed: number;
  readonly skillSuggestionSlug: string | null;
}

export function deriveCommandQueue(s: CommandSignals): CommandAction[] {
  const queue: CommandAction[] = [];

  for (const d of [...s.expiringDocs].sort((a, b) =>
    (a.validUntil ?? "").localeCompare(b.validUntil ?? ""),
  )) {
    queue.push({ kind: "renew_document", docSlug: d.slug, validUntil: d.validUntil });
  }

  if (s.entriesToday === 0) queue.push({ kind: "fill_today" });

  // Unfilled days = elapsed days minus days that really have entries, minus
  // today when today is already counted as unfilled above (no double count).
  const todayUnfilled = s.entriesToday === 0 ? 1 : 0;
  const missingDays = Math.max(
    0,
    s.weekDaysElapsed - s.weekDaysWithEntries - todayUnfilled,
  );
  if (missingDays > 0) queue.push({ kind: "fill_week_gaps", missingDays });

  if (s.skillSuggestionSlug) {
    queue.push({ kind: "grow_skill", skillSlug: s.skillSuggestionSlug });
  }

  return queue;
}
