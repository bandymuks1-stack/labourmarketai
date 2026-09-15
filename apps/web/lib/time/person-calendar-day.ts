/**
 * The calendar day the PERSON is living in — the default a work-journal
 * intake offers for `work_date` (issue #1689, re-audit F10).
 *
 * A stated work day is a business date the person types, not a stored
 * instant, so its default must come from the person's own clock: at 01:30
 * in Vilnius the UTC key (`utcTodayKey`) still says yesterday, and a diary
 * that pre-fills yesterday places the shift on the wrong day unless the
 * person notices. This is the ONE place the ambient zone is read on
 * purpose. It is client-side INPUT, never display — `lib/time/display.ts`
 * keeps every label in UTC (W12) and must never read an ambient value, which
 * is why this lives in its own module. Callers must not use it during
 * server rendering: the server's ambient day is UTC's, so a value computed
 * there would hydrate differently from the person's browser.
 */
export function personCalendarDay(now: Date = new Date()): string {
  const p = (n: number) => (n < 10 ? `0${n}` : `${n}`);
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}
