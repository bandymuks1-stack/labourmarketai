/**
 * Work-date validation for the canonical journal write — pure, no I/O.
 *
 * The `work_date` metric is the day the work was DONE. It is never invented:
 * a document-drafted entry (the document rarely says which day) must carry a
 * date the worker chose, and a document import cannot claim work that has
 * not happened yet. The composer's own free-form entries keep their existing
 * behaviour (optional date, no future rule) — only the format is checked.
 */

const ISO_DATE_RX = /^(\d{4})-(\d{2})-(\d{2})$/;

/** True for a real calendar day written as YYYY-MM-DD (rejects 2026-02-30). */
export function isValidIsoDate(value: string): boolean {
  const m = ISO_DATE_RX.exec(value);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return (
    dt.getUTCFullYear() === y &&
    dt.getUTCMonth() === mo - 1 &&
    dt.getUTCDate() === d
  );
}

export type WorkDateProblem =
  | { code: "work_date_required" }
  | { code: "work_date_invalid"; reason: "format" | "future" };

/**
 * `null` = acceptable. The future bound is the UTC date plus one day, so a
 * worker in any timezone (up to UTC+14) can still record "today".
 */
export function checkWorkDate(
  raw: string,
  opts: { requireDate: boolean; rejectFuture: boolean },
  now: Date = new Date(),
): WorkDateProblem | null {
  const value = raw.trim();
  if (value === "") {
    return opts.requireDate ? { code: "work_date_required" } : null;
  }
  if (!isValidIsoDate(value)) {
    return { code: "work_date_invalid", reason: "format" };
  }
  if (opts.rejectFuture) {
    const bound = new Date(now.getTime() + 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
    if (value > bound) return { code: "work_date_invalid", reason: "future" };
  }
  return null;
}
