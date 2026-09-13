/**
 * WORK-CARD PLAUSIBILITY CHECKS — owner #1689 HUMAN_ACCEPTANCE defect on the
 * printable CV: a salary expectation of "150–500 EUR/month" printed as a
 * plain fact. The `workers.salary_*_eur` columns are read everywhere as a
 * MONTHLY figure (the CV prints "EUR/mėn.", matching compares them with a
 * vacancy's monthly offer), while the card editor used to label the inputs
 * "Tarifas nuo (€)" — a rate, of nothing in particular. A person who typed
 * a daily or hourly rate was never told the field means a month.
 *
 * Pure: no IO, no AI, no clock (the caller passes today's ISO day).
 *
 * WARN, NEVER CORRUPT — same contract as `work-time-plausibility.ts`. A
 * check changes NO stored value and blocks NO save: the person's figure is
 * the figure. A check is one sentence beside the value that says what it
 * READS AS and how to change it if that was not the meaning. The person may
 * keep it exactly as it is ("Palikti kaip yra") — that is the confirmation,
 * and nothing is written for it (no column carries such an acknowledgement;
 * a per-viewer dismissal lives in the browser only and is not truth).
 *
 * WHAT IS CHECKED (each code is a plain fact about the number, never a
 * judgement of the person):
 *
 *   salary_below_monthly_floor   the higher stated figure is under
 *                                MONTHLY_FLOOR_EUR — as a MONTH that is below
 *                                any full-time wage in the EU; it reads like
 *                                an hourly or daily rate typed into a monthly
 *                                field. Part-time months exist, so this is a
 *                                prompt to check, not a rule.
 *   salary_reads_annual          the lower stated figure is above
 *                                ANNUAL_SUSPECT_EUR — as a MONTH that is
 *                                beyond any wage the platform's demand side
 *                                states; it reads like a yearly figure.
 *   available_from_past          "can start from" is more than
 *                                PAST_GRACE_DAYS before today — the date has
 *                                passed and is read as "now"; the person may
 *                                want to say so or set a new date.
 *   available_from_far           "can start from" is more than FAR_DAYS ahead
 *                                — possible (a contract that ends next year),
 *                                worth a second look for a typo in the year.
 *   unavailable_with_start_date  status says "cannot work now" AND a start
 *                                date is set — consistent only if the date is
 *                                when that changes; the sentence says so.
 *
 * WHAT IS NOT CHECKED: the salary range order (min > max) — that is already
 * refused by `saveWorkerCardCore` as `salary_range`, before any write.
 */

export const WORK_CARD_CHECK_CODES = [
  "salary_below_monthly_floor",
  "salary_reads_annual",
  "available_from_past",
  "available_from_far",
  "unavailable_with_start_date",
] as const;
export type WorkCardCheckCode = (typeof WORK_CARD_CHECK_CODES)[number];

/** Under this, a MONTHLY figure reads like an hourly/daily rate. Chosen well
 *  below every EU statutory minimum monthly wage for full-time work (the
 *  lowest in 2026 is above 700 EUR) so a genuine part-time month near the
 *  floor is not nagged. A prompt to check, not a rule about pay. */
export const MONTHLY_FLOOR_EUR = 700;
/** Above this, a MONTHLY figure reads like an annual one. */
export const ANNUAL_SUSPECT_EUR = 30_000;
/** A start date this many days in the past is stale, not wrong. */
export const PAST_GRACE_DAYS = 30;
/** A start date this many days ahead is worth a second look. */
export const FAR_DAYS = 365;

export type WorkCardCheckInput = {
  readonly salaryMin: number | null;
  readonly salaryMax: number | null;
  /** `available` | `busy` | `unavailable` | null */
  readonly availabilityStatus: string | null;
  /** YYYY-MM-DD */
  readonly availableFrom: string | null;
};

export type WorkCardCheck = {
  readonly code: WorkCardCheckCode;
  /** The stated figures the sentence is about — for the copy's placeholders. */
  readonly salaryMin: number | null;
  readonly salaryMax: number | null;
  readonly availableFrom: string | null;
  /** Days between today and `availableFrom` (negative = past); null when the
   *  check is not about a date. */
  readonly daysFromToday: number | null;
  /** Stable key for a per-viewer "keep as is" dismissal: the check plus the
   *  exact values it was about — a changed value is a new check. */
  readonly fingerprint: string;
};

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

function daysBetween(fromIso: string, toIso: string): number | null {
  if (!ISO_DAY.test(fromIso) || !ISO_DAY.test(toIso)) return null;
  const a = Date.parse(`${fromIso}T00:00:00.000Z`);
  const b = Date.parse(`${toIso}T00:00:00.000Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.round((b - a) / 86_400_000);
}

function fingerprintOf(code: WorkCardCheckCode, v: WorkCardCheckInput): string {
  return `${code}:${v.salaryMin ?? ""}-${v.salaryMax ?? ""}:${v.availabilityStatus ?? ""}:${v.availableFrom ?? ""}`;
}

/**
 * Every check the stated card values trip, in a fixed order (salary first,
 * then dates). `todayIso` is the caller's UTC calendar day. Empty when
 * nothing reads oddly — the common case.
 */
export function deriveWorkCardChecks(
  values: WorkCardCheckInput,
  todayIso: string,
): WorkCardCheck[] {
  const out: WorkCardCheck[] = [];
  const push = (code: WorkCardCheckCode, daysFromToday: number | null = null) =>
    out.push({
      code,
      salaryMin: values.salaryMin,
      salaryMax: values.salaryMax,
      availableFrom: values.availableFrom,
      daysFromToday,
      fingerprint: fingerprintOf(code, values),
    });

  const min = finite(values.salaryMin);
  const max = finite(values.salaryMax);
  // The HIGHER stated figure decides "too low for a month": a range whose
  // ceiling is under the floor cannot be a month; a range whose floor is
  // low but whose ceiling is a wage is just a wide range.
  const upper = max ?? min;
  const lower = min ?? max;
  if (upper !== null && upper > 0 && upper < MONTHLY_FLOOR_EUR) {
    push("salary_below_monthly_floor");
  } else if (lower !== null && lower > ANNUAL_SUSPECT_EUR) {
    push("salary_reads_annual");
  }

  const from = values.availableFrom?.trim() || null;
  if (from) {
    const days = daysBetween(todayIso, from);
    if (days !== null) {
      if (days < -PAST_GRACE_DAYS) push("available_from_past", days);
      else if (days > FAR_DAYS) push("available_from_far", days);
      else if (values.availabilityStatus === "unavailable") {
        push("unavailable_with_start_date", days);
      }
    }
  }
  return out;
}

function finite(n: number | null): number | null {
  return typeof n === "number" && Number.isFinite(n) ? n : null;
}
