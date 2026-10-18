/**
 * THE canonical rule for "which calendar day is it" when hours and journal
 * entries are placed on or excluded from the calendar (work-date timezone
 * fix, 2026-10-05).
 *
 * A `work_date` is the CALENDAR DAY AS THE PERSON LIVED IT — their local day,
 * stamped by the composer from the person's own clock
 * (`lib/time/person-calendar-day.ts`) and stored as a plain `date` (no zone,
 * no instant). "Future" must be judged in the SAME frame. Judging it against
 * the server's UTC day made every Lithuanian (UTC+2/+3) entry made between
 * local midnight and UTC midnight read as "tomorrow" and vanish from Work in
 * Numbers, the Living CV and the hours figures until UTC caught up.
 *
 * Order of authority for "today" in a reader:
 *   1. the viewer's IANA zone (cookie `lm_tz`, set by the browser) → their
 *      local day, exact;
 *   2. no zone known → the UTC day for window anchors (unchanged), and for
 *      the "not future" test the HORIZON: UTC today + 1 day. No place on
 *      Earth is more than 14 h ahead of UTC (Pacific/Kiritimati, UTC+14), so
 *      a day <= UTC today + 1 can never be anyone's tomorrow. The cost is
 *      that for a viewer in an unknown zone a day that is genuinely
 *      "tomorrow" for UTC could count a few hours early; the opposite error
 *      (dropping real hours) is the one that destroyed trust, so the bound
 *      leans inclusive.
 * Date-only values (evidence-import rows, a typed work date, `date`
 * columns) are calendar days, not instants, and are never shifted by a zone.
 * Display labels stay UTC (W12) — this module decides inclusion only.
 */

export const VIEWER_TZ_COOKIE = "lm_tz";

/** Largest UTC offset in use (Pacific/Kiritimati, UTC+14), rounded UP to whole days. */
export const MAX_UTC_OFFSET_DAYS = 1;

const DAY_RX = /^\d{4}-\d{2}-\d{2}$/;

/** True only for a zone name the runtime's tz database accepts. */
export function isValidTimeZone(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0 || value.length > 64) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

/** The `YYYY-MM-DD` calendar day `instant` falls on in `timeZone` (default UTC). */
export function localDayKey(instant: Date, timeZone: string = "UTC"): string {
  const zone = isValidTimeZone(timeZone) ? timeZone : "UTC";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instant);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** `YYYY-MM-DD` plus `days` calendar days (pure date arithmetic, no zone). */
export function addCalendarDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * The latest calendar day that can be somebody's "today" right now anywhere
 * on Earth: UTC today + 1 day (see MAX_UTC_OFFSET_DAYS). A work day strictly
 * after this is truly in the future for every person.
 */
export function latestPlausibleWorkDay(now: Date = new Date()): string {
  return addCalendarDays(localDayKey(now, "UTC"), MAX_UTC_OFFSET_DAYS);
}

export type WorkToday = {
  /** The day periods ("today", "this week") are anchored on. */
  readonly todayIso: string;
  /** Last day an entry may carry and still count as NOT future. Equals
   *  `todayIso` when the zone is known; the UTC+1 horizon when it is not. */
  readonly horizonIso: string;
  /** Whether `todayIso` came from the viewer's own zone. */
  readonly zoneKnown: boolean;
  /** The viewer's IANA zone when known, else null (instants are then read in UTC). */
  readonly timeZone: string | null;
};

export function resolveWorkToday(opts: {
  readonly now?: Date;
  readonly timeZone?: string | null;
}): WorkToday {
  const now = opts.now ?? new Date();
  if (isValidTimeZone(opts.timeZone)) {
    const day = localDayKey(now, opts.timeZone);
    return { todayIso: day, horizonIso: day, zoneKnown: true, timeZone: opts.timeZone };
  }
  return {
    todayIso: localDayKey(now, "UTC"),
    horizonIso: latestPlausibleWorkDay(now),
    zoneKnown: false,
    timeZone: null,
  };
}

/** True when `day` is later than the horizon (a truly future work day). */
export function isFutureWorkDay(day: string, today: Pick<WorkToday, "horizonIso">): boolean {
  return DAY_RX.test(day) && day > today.horizonIso;
}
