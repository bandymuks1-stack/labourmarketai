/**
 * W12 — the canonical time PRESENTATION helper.
 *
 * ## The product model this encodes
 *
 *   storage  = UTC
 *   display  = UTC, localized by the app locale only
 *
 * A labour-market "work day" is a business date, not an instant. A booking on
 * the 7th is on the 7th for the worker, for the employer, and for the manager
 * reading the same row from another country. Pinning the display timezone to
 * UTC is what makes that true; it is a deliberate product choice, recorded in
 * `docs/audits/W12_TEMPORAL_INTELLIGENCE_CURRENT_TRUTH.md` §3.5.
 *
 * There is NO organisation timezone in the schema and NO user timezone
 * preference. Neither is invented here. Changing the model (UTC → viewer-local)
 * would be an owner decision; this module only makes every surface agree with
 * the model the canonical projection (`lib/planning/planning-model.ts`) already
 * computes in.
 *
 * ## Why the raw platform calls are banned in favour of this module
 *
 * `new Date(x).toLocaleDateString(locale)` and
 * `new Intl.DateTimeFormat(locale, { … })` both fall back to the AMBIENT
 * timezone when `timeZone` is omitted. That ambient zone is:
 *
 *   - in a client component → the VIEWER's browser zone, so the same row shows
 *     two different calendar days to two people;
 *   - in a server component → the SERVER process zone, which is UTC on Vercel
 *     today and therefore accidentally right, but is not pinned by anything and
 *     silently produces a one-day shift on any non-UTC runtime.
 *
 * Neither is a property worth relying on, so `lib/guards/w12-utc-time-
 * presentation.test.ts` pins that date rendering goes through this module.
 *
 * Everything here is pure and environment-free: identical output on the server
 * and on the client for the same (value, locale), which is what keeps React
 * hydration quiet.
 */

/** The one display timezone. Not configurable — see the module doc. */
export const DISPLAY_TIME_ZONE = "UTC" as const;

/** What a call site may hand us. `null` / `undefined` are first-class. */
export type DateInput = string | number | Date | null | undefined;

/**
 * A bare `YYYY-MM-DD`. ECMA-262 parses a date-ONLY ISO string as UTC midnight
 * but a date-TIME string without an offset as LOCAL time, so the two shapes
 * disagree by up to a day. We normalise the date-only shape explicitly rather
 * than depending on that asymmetry.
 */
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Coerce to a Date, or `null` when the input is absent or unparseable.
 * Never throws — a malformed timestamp renders as "no date", never as
 * "Invalid Date" and never as a crash.
 */
export function toUtcDate(value: DateInput): Date | null {
  if (value === null || value === undefined || value === "") return null;
  let d: Date;
  if (value instanceof Date) {
    d = value;
  } else if (typeof value === "number") {
    d = new Date(value);
  } else {
    const s = value.trim();
    if (s === "") return null;
    // Date-only → pin to UTC midnight so the calendar day is the stored day.
    d = new Date(DATE_ONLY.test(s) ? `${s}T00:00:00Z` : s);
  }
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * `Intl.DateTimeFormat` construction is comparatively expensive and these
 * formatters are rebuilt per render on list surfaces. The cache is keyed by the
 * full resolved option set, so two call sites asking for different shapes never
 * share an instance. Bounded by the number of (locale, shape) pairs the app
 * actually uses — a handful.
 */
const cache = new Map<string, Intl.DateTimeFormat>();

function formatter(locale: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  // `timeZone` is forced LAST so a caller cannot accidentally override it.
  const resolved: Intl.DateTimeFormatOptions = { ...options, timeZone: DISPLAY_TIME_ZONE };
  const key = `${locale}|${JSON.stringify(resolved)}`;
  let f = cache.get(key);
  if (f === undefined) {
    f = new Intl.DateTimeFormat(locale, resolved);
    cache.set(key, f);
  }
  return f;
}

/**
 * The shape `Date.prototype.toLocaleDateString(locale)` produces with no
 * options, spelled out so the migration off it is visibly behaviour-preserving.
 */
const DATE_DEFAULTS: Intl.DateTimeFormatOptions = {
  year: "numeric",
  month: "numeric",
  day: "numeric",
};

/**
 * The shape `Date.prototype.toLocaleString(locale)` produces with no options
 * (date + time INCLUDING seconds). Spelled out for the same reason.
 */
const DATE_TIME_DEFAULTS: Intl.DateTimeFormatOptions = {
  ...DATE_DEFAULTS,
  hour: "numeric",
  minute: "numeric",
  second: "numeric",
};

/**
 * Build a reusable UTC-pinned formatter for a surface that formats many values
 * with one shape (a calendar strip, a table column). Prefer this over calling
 * `formatUtcDate` in a tight loop.
 *
 * The returned function is null-safe in exactly the same way as `formatUtcDate`.
 */
export function createUtcFormatter(
  locale: string,
  options: Intl.DateTimeFormatOptions = DATE_DEFAULTS,
): (value: DateInput) => string | null {
  const f = formatter(locale, options);
  return (value: DateInput) => {
    const d = toUtcDate(value);
    return d === null ? null : f.format(d);
  };
}

/**
 * A calendar DATE in UTC, localized. The direct replacement for
 * `new Date(x).toLocaleDateString(locale)`.
 *
 * Returns `null` for absent/invalid input so the caller keeps whatever empty
 * state it already had (`null` renders as nothing in JSX; use `?? ""` when
 * interpolating into a translated string).
 */
export function formatUtcDate(
  value: DateInput,
  locale: string,
  options: Intl.DateTimeFormatOptions = DATE_DEFAULTS,
): string | null {
  const d = toUtcDate(value);
  return d === null ? null : formatter(locale, options).format(d);
}

/**
 * A DATE + TIME in UTC, localized. The direct replacement for
 * `new Date(x).toLocaleString(locale)`.
 */
export function formatUtcDateTime(
  value: DateInput,
  locale: string,
  options: Intl.DateTimeFormatOptions = DATE_TIME_DEFAULTS,
): string | null {
  const d = toUtcDate(value);
  return d === null ? null : formatter(locale, options).format(d);
}

/**
 * An inclusive date RANGE in UTC, localized. Uses `formatRange`, which lets the
 * locale elide the shared parts ("7–9 Aug 2026" rather than repeating the
 * month). Falls back to the single date when only one end exists, and to `null`
 * when neither does — an open-ended range is never rendered as a closed one.
 */
export function formatUtcDateRange(
  start: DateInput,
  end: DateInput,
  locale: string,
  options: Intl.DateTimeFormatOptions = DATE_DEFAULTS,
): string | null {
  const a = toUtcDate(start);
  const b = toUtcDate(end);
  if (a === null && b === null) return null;
  const f = formatter(locale, options);
  if (a === null) return f.format(b as Date);
  if (b === null) return f.format(a);
  return f.formatRange(a, b);
}

/**
 * The canonical `YYYY-MM-DD` day key for a timestamp — the same UTC day the
 * planning projection groups by, and the value the `?date=` navigation
 * parameter carries.
 *
 * This is the KEY counterpart to `formatUtcDate`'s LABEL: a surface that groups
 * rows by day must derive the key here and render the label there, or the group
 * header and the rows inside it can fall on different calendar days.
 */
export function utcDayKey(value: DateInput): string | null {
  const d = toUtcDate(value);
  return d === null ? null : d.toISOString().slice(0, 10);
}

/** Today's canonical UTC day key. Separated so callers can inject a clock. */
export function utcTodayKey(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}
