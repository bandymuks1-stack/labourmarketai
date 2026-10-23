/**
 * DATA-SUBJECT REQUEST DEADLINE (GDPR Art. 12(3)) — pure, no IO.
 *
 * Audit 2026-10-16 (G-5): the intake stored no due date, the admin queue had
 * no deadline and no overdue flag, while the public page promises "a person
 * answers within one month". The one month runs from receipt; this helper
 * derives it so the queue can show it and sort by it. Extensions (Art.
 * 12(3), up to two further months for complex requests) are a human
 * decision recorded in the review note — never computed here.
 */

export const DSR_RESPONSE_DAYS = 30;

/** ISO instant of the statutory one-month response deadline. */
export function dsrDueAtIso(createdAtIso: string): string {
  const created = new Date(createdAtIso);
  if (Number.isNaN(created.getTime())) return createdAtIso;
  return new Date(created.getTime() + DSR_RESPONSE_DAYS * 24 * 60 * 60 * 1000).toISOString();
}

/** True when the deadline has passed and the request is still open. */
export function dsrOverdue(
  createdAtIso: string,
  status: string,
  now: Date = new Date(),
): boolean {
  if (status === "closed") return false;
  const due = new Date(dsrDueAtIso(createdAtIso));
  if (Number.isNaN(due.getTime())) return false;
  return now.getTime() > due.getTime();
}
