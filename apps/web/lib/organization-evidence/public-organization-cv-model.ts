import type { CompanyWorkHistory } from "./company-work-history";
import type { OrganizationJournal } from "./organization-journal";
import type { OrganizationProjects } from "./organization-projects";

/**
 * The public company Living CV as pure data (register 3.36). Owner decision
 * 2026-11-16: aggregated data only, a minimum group of 5 people, shown only
 * while the public profile is on, no personal data.
 *
 * Every figure here is a count, an hour total or a month. There is no field
 * for an id, a name, a place, a title or a text, so none can leak through it.
 */
export const PUBLIC_CV_MIN_PEOPLE = 5;

/** Published hours are rounded to this step (R2 P3-2 on #3464): two
 *  snapshots taken around one person's change cannot be subtracted to recover
 *  that person's hours to the hour. */
export const PUBLIC_CV_HOURS_STEP = 10;
const coarse = (h: number): number => Math.round(h / PUBLIC_CV_HOURS_STEP) * PUBLIC_CV_HOURS_STEP;

export type PublicOrganizationCv = {
  /** Shown only beside at least one people-backed block that passed the gate. */
  readonly projects: { readonly running: number; readonly completed: number } | null;
  /** Work its people recorded in the journal under this organization. */
  readonly journal: {
    readonly people: number;
    readonly hours: number;
    readonly confirmedHours: number;
    readonly firstMonth: string | null;
    readonly lastMonth: string | null;
  } | null;
  /** Its own imported records: single-day hours only (period totals are a
   *  separate figure and never added in, the member view's rule). */
  readonly history: {
    readonly people: number;
    readonly dayHours: number;
    readonly firstMonth: string | null;
    readonly lastMonth: string | null;
  } | null;
};

/** A people-backed block passes the gate: k >= 5 and something to show. */
export const journalPasses = (j: OrganizationJournal | null): boolean =>
  !!j && j.people >= PUBLIC_CV_MIN_PEOPLE && j.entries > 0;
export const historyPasses = (h: CompanyWorkHistory | null): boolean =>
  !!h && h.peopleCount >= PUBLIC_CV_MIN_PEOPLE && h.totalRecords > 0;

/**
 * The projects the public count may include (R2 P3-3 on #3464): only those a
 * block that PASSED the gate points at — the journal's engagement contexts,
 * the imported records' projects. An internal project with no such work is
 * not counted publicly.
 */
export function publicProjectIds(input: {
  readonly journal: OrganizationJournal | null;
  readonly history: CompanyWorkHistory | null;
  readonly journalProjectIds: Iterable<string>;
  readonly historyProjectIds: Iterable<string>;
}): Set<string> {
  const ids = new Set<string>();
  if (journalPasses(input.journal)) for (const id of input.journalProjectIds) ids.add(id);
  if (historyPasses(input.history)) for (const id of input.historyProjectIds) ids.add(id);
  return ids;
}

const month = (iso: string | null): string | null => (iso && /^\d{4}-\d{2}/.test(iso) ? iso.slice(0, 7) : null);

/**
 * The gate. Null — nothing at all on the public page — when the profile is
 * off, or when no block has at least PUBLIC_CV_MIN_PEOPLE people behind it.
 * A block below the minimum is dropped whole: never shown, never rounded.
 */
export function buildPublicOrganizationCv(input: {
  readonly enabled: boolean;
  readonly projects: OrganizationProjects | null;
  readonly journal: OrganizationJournal | null;
  readonly history: CompanyWorkHistory | null;
}): PublicOrganizationCv | null {
  if (input.enabled !== true) return null;

  const j = input.journal;
  const journal =
    j && journalPasses(j)
      ? {
          people: j.people,
          hours: coarse(j.hours),
          confirmedHours: coarse(j.confirmedHours),
          firstMonth: j.firstMonth,
          lastMonth: j.lastMonth,
        }
      : null;

  const h = input.history;
  const history =
    h && historyPasses(h)
      ? { people: h.peopleCount, dayHours: coarse(h.dayHours), firstMonth: month(h.firstDate), lastMonth: month(h.lastDate) }
      : null;

  if (!journal && !history) return null;

  const p = input.projects;
  const projects = p && p.total > 0 ? { running: p.running, completed: p.completed } : null;

  return { projects, journal, history };
}
