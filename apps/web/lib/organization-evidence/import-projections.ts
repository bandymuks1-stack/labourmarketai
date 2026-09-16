import { isoWeekOf, HOURS_EXCEED_DAY_METHOD, WEEK_CONFLICT_METHOD } from "./parse-tabular";
import {
  committableRows,
  placeSegments,
  type ImportPreview,
  type PreviewRow,
} from "./import-core";

/**
 * PRE-COMMIT PRODUCT EFFECT — what the real product would show if this
 * preview were committed, computed from the preview ALONE (owner command
 * §39–§40, §57). Pure: no IO, no clock, no write. Nothing here is a record;
 * every figure is a projection of staged rows and says so at the surface.
 *
 * The projections are the surfaces the data will reach once committed —
 * PEOPLE, PLACES, the CALENDAR of actual work, the COMPANY in numbers —
 * and the ISSUES a human must settle first. What the source does not
 * support is listed as UNKNOWN, never as zero (SEP-7).
 *
 * No score, no rating, no rank of any person exists here (§14, §28).
 */

export type PersonProjectionState = "existing" | "new" | "ambiguous" | "unresolved";

export interface PersonProjection {
  /** The source's spelling. */
  readonly label: string;
  readonly state: PersonProjectionState;
  readonly personId: string | null;
  /** The roster name when matched. */
  readonly name: string | null;
  readonly rows: number;
  /** Distinct dated days. */
  readonly days: number;
  /** Sum of the STATED hours on plausible rows. */
  readonly hours: number;
  /** Stated hours on rows flagged as impossible for a day — kept apart. */
  readonly flaggedHours: number;
  readonly firstDate: string | null;
  readonly lastDate: string | null;
  /** Canonical place names, most rows first. */
  readonly places: readonly string[];
  readonly issues: number;
}

export type PlaceProjectionState = "existing" | "new" | "ambiguous";

export interface PlaceProjection {
  readonly name: string;
  readonly state: PlaceProjectionState;
  readonly workObjectId: string | null;
  readonly rows: number;
  readonly people: number;
  /** Hours the source attributes to this place explicitly: single-place
   *  days and per-place figures written in the text. */
  readonly statedHours: number;
  /** Rows that also name other places with no per-place figure. */
  readonly sharedRows: number;
  readonly spellings: readonly string[];
  readonly origin: "cell" | "text";
  readonly firstDate: string | null;
  readonly lastDate: string | null;
}

export interface CalendarDay {
  readonly date: string;
  /** Person label → the day's stated hours and place count. */
  readonly people: readonly {
    readonly label: string;
    readonly hours: number | null;
    readonly places: number;
    readonly flagged: boolean;
  }[];
}

export interface CalendarWeek {
  readonly isoWeek: number;
  readonly days: readonly CalendarDay[];
  readonly hours: number;
}

export interface CalendarProjection {
  readonly firstDate: string | null;
  readonly lastDate: string | null;
  readonly people: readonly string[];
  readonly weeks: readonly CalendarWeek[];
  /** Person-days the calendar would hold. */
  readonly personDays: number;
}

export type IssueKind =
  | "impossible_hours"
  | "week_conflicts"
  | "ambiguous_place"
  | "ambiguous_person"
  | "site_unknown"
  | "duplicates"
  | "conflicts"
  | "allocation_unknown"
  | "allocation_inconsistent"
  /** A place read from the text (not the cell) that nothing folded — one
   *  question per such place: create, alias to another place, or ignore. */
  | "place_from_text";

export interface IssueProjection {
  readonly kind: IssueKind;
  readonly count: number;
  /** True when the rows cannot commit until a human settles it. */
  readonly blocking: boolean;
  /** For a label-level question: the segment key and its source spelling. */
  readonly key: string | null;
  readonly label: string | null;
  readonly candidates: readonly { readonly id: string; readonly name: string }[];
  /** Other places THIS FILE names, for an alias decision before anything exists. */
  readonly siblings: readonly string[];
  readonly rowIds: readonly string[];
  /** A short example from the source, for the human's eye. */
  readonly sample: string | null;
}

export interface CompanyProjection {
  readonly firstDate: string | null;
  readonly lastDate: string | null;
  readonly rows: number;
  readonly people: number;
  readonly places: number;
  /** Activity segments named in the object column (not places). */
  readonly activities: readonly string[];
  readonly statedHours: number;
  readonly flaggedHours: number;
  readonly personDays: number;
  /** What the source does NOT carry. Listed, never zeroed. */
  readonly unknown: readonly ("client" | "project" | "work_package" | "wage" | "output" | "team")[];
}

export interface CommitEffect {
  readonly records: number;
  readonly notWritten: number;
  readonly createPeople: number;
  readonly createObjects: number;
  readonly evidenceState: "ORGANIZATION_REPORTED";
}

export interface ImportProjection {
  readonly people: readonly PersonProjection[];
  readonly places: readonly PlaceProjection[];
  readonly calendar: CalendarProjection;
  readonly issues: readonly IssueProjection[];
  readonly company: CompanyProjection;
  readonly commit: CommitEffect;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function isImpossible(r: PreviewRow): boolean {
  return (r.derived.hoursPlausibility as { method?: string } | undefined)?.method === HOURS_EXCEED_DAY_METHOD;
}

function isWeekConflict(r: PreviewRow): boolean {
  return (r.derived.calendarWeek as { method?: string } | undefined)?.method === WEEK_CONFLICT_METHOD;
}

function rowDate(r: PreviewRow): string | null {
  return r.activityDate ?? r.periodStart ?? null;
}

function rowIssues(r: PreviewRow): number {
  let n = 0;
  if (isImpossible(r)) n += 1;
  if (isWeekConflict(r)) n += 1;
  if (r.personState === "ambiguous") n += 1;
  if (r.contextState === "ambiguous") n += 1;
  if (r.duplicateState !== "new") n += 1;
  return n;
}

// ── people ──────────────────────────────────────────────────────────────────

export function projectPeople(rows: readonly PreviewRow[]): readonly PersonProjection[] {
  const byKey = new Map<string, {
    label: string; state: PersonProjectionState; personId: string | null; name: string | null;
    rows: number; days: Set<string>; hours: number; flaggedHours: number;
    first: string | null; last: string | null; places: Map<string, number>; issues: number;
  }>();
  for (const r of rows) {
    const label = r.personLabel?.trim();
    if (!label) continue;
    const key = label.toLowerCase();
    const entry = byKey.get(key) ?? {
      label,
      // A person is NEW when the source names them and nobody on the roster
      // is them — whether or not their rows commit today (an impossible
      // figure holds the ROW, not the person). UNRESOLVED is an empty name.
      state:
        r.personState === "matched" || r.personState === "created"
          ? "existing"
          : r.personState === "ambiguous"
            ? "ambiguous"
            : "new",
      personId: r.personId,
      name: r.personName,
      rows: 0, days: new Set<string>(), hours: 0, flaggedHours: 0,
      first: null, last: null, places: new Map<string, number>(), issues: 0,
    };
    entry.rows += 1;
    const d = rowDate(r);
    if (d) {
      entry.days.add(d);
      if (!entry.first || d < entry.first) entry.first = d;
      if (!entry.last || d > entry.last) entry.last = d;
    }
    if (r.hours !== null) {
      if (isImpossible(r)) entry.flaggedHours += r.hours;
      else entry.hours += r.hours;
    }
    for (const p of placeSegments(r.contexts)) {
      const name = p.name ?? p.label;
      entry.places.set(name, (entry.places.get(name) ?? 0) + 1);
    }
    entry.issues += rowIssues(r);
    byKey.set(key, entry);
  }
  return [...byKey.values()]
    .sort((a, b) => b.rows - a.rows || a.label.localeCompare(b.label))
    .map((e) => ({
      label: e.label,
      state: e.state,
      personId: e.personId,
      name: e.name,
      rows: e.rows,
      days: e.days.size,
      hours: round2(e.hours),
      flaggedHours: round2(e.flaggedHours),
      firstDate: e.first,
      lastDate: e.last,
      places: [...e.places.entries()].sort((a, b) => b[1] - a[1]).map(([n]) => n),
      issues: e.issues,
    }));
}

// ── places ──────────────────────────────────────────────────────────────────

export function projectPlaces(rows: readonly PreviewRow[]): readonly PlaceProjection[] {
  const byKey = new Map<string, {
    name: string; state: PlaceProjectionState; workObjectId: string | null;
    rows: number; people: Set<string>; statedHours: number; sharedRows: number;
    spellings: Set<string>; origin: "cell" | "text"; first: string | null; last: string | null;
  }>();
  for (const r of rows) {
    const places = placeSegments(r.contexts);
    const allocation = r.contexts?.allocation ?? null;
    for (const p of places) {
      if (p.state === "ambiguous") {
        const key = `?${p.key}`;
        const e = byKey.get(key) ?? {
          name: p.label, state: "ambiguous" as const, workObjectId: null, rows: 0, people: new Set<string>(),
          statedHours: 0, sharedRows: 0, spellings: new Set<string>(), origin: "cell" as const, first: null, last: null,
        };
        e.rows += 1;
        if (r.personLabel) e.people.add(r.personLabel.toLowerCase());
        byKey.set(key, e);
        continue;
      }
      const name = p.name ?? p.label;
      const key = name.toLowerCase();
      const e = byKey.get(key) ?? {
        name,
        state: (p.workObjectId ? "existing" : "new") as PlaceProjectionState,
        workObjectId: p.workObjectId,
        rows: 0, people: new Set<string>(), statedHours: 0, sharedRows: 0,
        spellings: new Set<string>(),
        origin: (r.contexts?.method === "site_from_work_text" ? "text" : "cell") as "cell" | "text",
        first: null, last: null,
      };
      e.rows += 1;
      if (p.workObjectId && !e.workObjectId) {
        e.workObjectId = p.workObjectId;
        e.state = "existing";
      }
      if (r.personLabel) e.people.add(r.personLabel.toLowerCase());
      if (p.label.toLowerCase() !== name.toLowerCase()) e.spellings.add(p.label);
      if (p.hours !== null) e.statedHours += p.hours;
      else if (allocation && allocation.method !== "single_place") e.sharedRows += 1;
      const d = rowDate(r);
      if (d) {
        if (!e.first || d < e.first) e.first = d;
        if (!e.last || d > e.last) e.last = d;
      }
      byKey.set(key, e);
    }
  }
  return [...byKey.values()]
    .sort((a, b) => b.rows - a.rows || a.name.localeCompare(b.name))
    .map((e) => ({
      name: e.name,
      state: e.state,
      workObjectId: e.workObjectId,
      rows: e.rows,
      people: e.people.size,
      statedHours: round2(e.statedHours),
      sharedRows: e.sharedRows,
      spellings: [...e.spellings],
      origin: e.origin,
      firstDate: e.first,
      lastDate: e.last,
    }));
}

// ── calendar ────────────────────────────────────────────────────────────────

export function projectCalendar(rows: readonly PreviewRow[]): CalendarProjection {
  const days = new Map<string, Map<string, { hours: number | null; places: number; flagged: boolean }>>();
  const people = new Set<string>();
  let first: string | null = null;
  let last: string | null = null;
  for (const r of rows) {
    const d = rowDate(r);
    const label = r.personLabel?.trim();
    if (!d || !label) continue;
    people.add(label);
    if (!first || d < first) first = d;
    if (!last || d > last) last = d;
    const day = days.get(d) ?? new Map();
    const cur = day.get(label) ?? { hours: null, places: 0, flagged: false };
    const flagged = isImpossible(r) || isWeekConflict(r);
    day.set(label, {
      hours: r.hours === null ? cur.hours : round2((cur.hours ?? 0) + r.hours),
      places: Math.max(cur.places, placeSegments(r.contexts).length),
      flagged: cur.flagged || flagged,
    });
    days.set(d, day);
  }
  const byWeek = new Map<string, CalendarDay[]>();
  for (const date of [...days.keys()].sort()) {
    const week = isoWeekOf(date);
    const year = date.slice(0, 4);
    const key = `${year}-${String(week).padStart(2, "0")}`;
    const list = byWeek.get(key) ?? [];
    list.push({
      date,
      people: [...(days.get(date) ?? new Map()).entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([label, v]) => ({ label, ...v })),
    });
    byWeek.set(key, list);
  }
  const weeks: CalendarWeek[] = [...byWeek.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([key, list]) => ({
      isoWeek: Number(key.slice(5)),
      days: list,
      hours: round2(list.reduce((s, d) => s + d.people.reduce((t, p) => t + (p.flagged ? 0 : (p.hours ?? 0)), 0), 0)),
    }));
  return {
    firstDate: first,
    lastDate: last,
    people: [...people].sort(),
    weeks,
    personDays: [...days.values()].reduce((s, m) => s + m.size, 0),
  };
}

// ── issues ──────────────────────────────────────────────────────────────────

export function projectIssues(rows: readonly PreviewRow[]): readonly IssueProjection[] {
  const issues: IssueProjection[] = [];
  const push = (kind: IssueKind, list: readonly PreviewRow[], blocking: boolean, sample: string | null = null) => {
    if (list.length === 0) return;
    issues.push({
      kind, count: list.length, blocking, key: null, label: null, candidates: [], siblings: [],
      rowIds: list.map((r) => r.id),
      sample: sample ?? list[0].activityText?.slice(0, 80) ?? null,
    });
  };

  const impossible = rows.filter((r) => isImpossible(r) && !r.acknowledged);
  push("impossible_hours", impossible, true,
    impossible[0] ? `${impossible[0].personLabel ?? ""} · ${impossible[0].activityDate ?? ""} · ${impossible[0].hours} h` : null);

  const week = rows.filter(isWeekConflict);
  push("week_conflicts", week, false,
    week[0] ? `${week[0].activityDate ?? ""} · ${String((week[0].derived.calendarWeek as { note?: string })?.note ?? "")}` : null);

  // One question per ambiguous LABEL, not per row.
  const ambiguousPlaces = new Map<string, { label: string; rows: PreviewRow[]; candidates: readonly { id: string; name: string }[] }>();
  for (const r of rows) {
    for (const p of placeSegments(r.contexts)) {
      if (p.state !== "ambiguous") continue;
      const e = ambiguousPlaces.get(p.key) ?? { label: p.label, rows: [] as PreviewRow[], candidates: p.candidates };
      e.rows.push(r);
      ambiguousPlaces.set(p.key, e);
    }
  }
  for (const [key, e] of ambiguousPlaces) {
    issues.push({
      kind: "ambiguous_place", count: e.rows.length, blocking: true, key, label: e.label,
      candidates: e.candidates, siblings: [], rowIds: e.rows.map((r) => r.id), sample: e.label,
    });
  }

  // A NEW place that only the text named (a typo the resolver could not fold,
  // a town) — shown as a question, not blocking: the default is to create it.
  const allNames = new Set<string>();
  for (const r of rows) for (const p of placeSegments(r.contexts)) if (p.name) allNames.add(p.name);
  const fromText = new Map<string, { label: string; name: string; rows: PreviewRow[] }>();
  for (const r of rows) {
    if (r.contexts?.method !== "site_from_work_text") continue;
    for (const p of placeSegments(r.contexts)) {
      if (p.state !== "new" || p.method === "human_choice") continue;
      // A spelling that folded into another place (`Hofdracht3` → `Hoofdgracht 3`)
      // is answered already; only a place that stands on its own is a question.
      if (p.name && p.name.toLowerCase() !== p.label.toLowerCase()) continue;
      const e = fromText.get(p.key) ?? { label: p.label, name: p.name ?? p.label, rows: [] as PreviewRow[] };
      e.rows.push(r);
      fromText.set(p.key, e);
    }
  }
  for (const [key, e] of fromText) {
    issues.push({
      kind: "place_from_text", count: e.rows.length, blocking: false, key, label: e.label,
      candidates: [], siblings: [...allNames].filter((n) => n !== e.name).sort(),
      rowIds: e.rows.map((r) => r.id), sample: e.rows[0].activityText?.slice(0, 80) ?? null,
    });
  }

  const ambiguousPeople = rows.filter((r) => r.personState === "ambiguous");
  push("ambiguous_person", ambiguousPeople, true, ambiguousPeople[0]?.personLabel ?? null);

  const noSite = rows.filter((r) => placeSegments(r.contexts).length === 0);
  push("site_unknown", noSite, false);

  push("duplicates", rows.filter((r) => r.duplicateState === "duplicate" || r.duplicateState === "probable_duplicate"), false);
  push("conflicts", rows.filter((r) => r.duplicateState === "conflict"), false);
  push("allocation_unknown", rows.filter((r) => r.contexts?.allocation?.method === "unknown_split"), false);
  push("allocation_inconsistent", rows.filter((r) => r.contexts?.allocation?.consistent === false), false);
  return issues;
}

// ── company ─────────────────────────────────────────────────────────────────

export function projectCompany(
  rows: readonly PreviewRow[],
  people: readonly PersonProjection[],
  places: readonly PlaceProjection[],
  calendar: CalendarProjection,
): CompanyProjection {
  const activities = new Set<string>();
  let stated = 0;
  let flagged = 0;
  for (const r of rows) {
    for (const s of r.contexts?.segments ?? []) if (s.kind === "activity") activities.add(s.label);
    if (r.hours !== null) {
      if (isImpossible(r)) flagged += r.hours;
      else stated += r.hours;
    }
  }
  return {
    firstDate: calendar.firstDate,
    lastDate: calendar.lastDate,
    rows: rows.length,
    people: people.length,
    places: places.filter((p) => p.state !== "ambiguous").length,
    activities: [...activities].sort(),
    statedHours: round2(stated),
    flaggedHours: round2(flagged),
    personDays: calendar.personDays,
    // A timesheet proves person · date · place · hours · words. It does not
    // name the client, the project above the site, a work package, a wage
    // or an output — and no team is inferred from co-presence (ARCH-4).
    unknown: ["client", "project", "work_package", "wage", "output", "team"],
  };
}

// ── the whole projection ────────────────────────────────────────────────────

export function projectImport(preview: ImportPreview): ImportProjection {
  const rows = preview.rows;
  const people = projectPeople(rows);
  const places = projectPlaces(rows);
  const calendar = projectCalendar(rows);
  const issues = projectIssues(rows);
  const company = projectCompany(rows, people, places, calendar);
  const committable = committableRows(preview).length;
  return {
    people,
    places,
    calendar,
    issues,
    company,
    commit: {
      records: committable,
      notWritten: rows.length - committable,
      createPeople: preview.plan.people.length,
      createObjects: preview.plan.objects.length,
      evidenceState: "ORGANIZATION_REPORTED",
    },
  };
}
