/**
 * The public company Living CV as pure data (register 3.36). Owner rulings
 * 2026-11-16 / 2026-11-17: aggregated data only, a minimum group of 5 people,
 * shown only while the public profile is on, no personal data.
 *
 * The figures are computed inside the database (`get_public_organization_cv_v1`,
 * migration 20261117060000), which applies every gate. This module re-checks
 * the row it returns — defence in depth, so a widened or mis-shaped function
 * cannot widen the page — and has no field for an id, a name, a place, a
 * title or a text, so none can leak through it.
 */
export const PUBLIC_CV_MIN_PEOPLE = 5;
/** Published hours are multiples of this (the database rounds; this re-checks). */
export const PUBLIC_CV_HOURS_STEP = 10;

export type PublicOrganizationCv = {
  /** Shown only beside at least one people-backed block. */
  readonly projects: { readonly running: number; readonly completed: number } | null;
  /** Work its people recorded in the journal under this organization. */
  readonly journal: {
    readonly people: number;
    readonly hours: number;
    readonly firstMonth: string | null;
    readonly lastMonth: string | null;
  } | null;
  /** Its own imported records: single-day hours only. */
  readonly history: {
    readonly people: number;
    readonly dayHours: number;
    readonly firstMonth: string | null;
    readonly lastMonth: string | null;
  } | null;
};

const MONTH_RX = /^\d{4}-\d{2}$/;
const count = (v: unknown): number | null =>
  typeof v === "number" && Number.isInteger(v) && v >= 0 ? v : null;
const hours = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n / PUBLIC_CV_HOURS_STEP) * PUBLIC_CV_HOURS_STEP;
};
const month = (v: unknown): string | null => (typeof v === "string" && MONTH_RX.test(v) ? v : null);

/**
 * The database row → the public CV, or null. A block whose people count is
 * missing or below PUBLIC_CV_MIN_PEOPLE is dropped whole; no passing block →
 * null (nothing on the page); project counts never stand alone.
 */
export function publicCvFromRow(row: Record<string, unknown> | null | undefined): PublicOrganizationCv | null {
  if (!row) return null;

  const jp = count(row.journal_people);
  const jh = hours(row.journal_hours);
  const journal =
    jp !== null && jp >= PUBLIC_CV_MIN_PEOPLE && jh !== null
      ? { people: jp, hours: jh, firstMonth: month(row.journal_first_month), lastMonth: month(row.journal_last_month) }
      : null;

  const hp = count(row.history_people);
  const hh = hours(row.history_day_hours);
  const history =
    hp !== null && hp >= PUBLIC_CV_MIN_PEOPLE && hh !== null
      ? { people: hp, dayHours: hh, firstMonth: month(row.history_first_month), lastMonth: month(row.history_last_month) }
      : null;

  if (!journal && !history) return null;

  const running = count(row.projects_running);
  const completed = count(row.projects_completed);
  const projects =
    running !== null && completed !== null && running + completed > 0 ? { running, completed } : null;

  return { projects, journal, history };
}
