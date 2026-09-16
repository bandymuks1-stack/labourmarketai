import { isoWeekOf, WEEK_CONFLICT_METHOD } from "./parse-tabular";
import { countsAsDailyHours } from "./time-semantics";
import {
  committableRows,
  placeSegments,
  type ImportPreview,
  type PreviewRow,
} from "./import-core";

/**
 * PRE-COMMIT PRODUCT EFFECT — what the real product would show if this
 * preview were committed, computed from the preview ALONE (owner commands
 * 2026-09-16 §39–§40, §57 and the post-#1748 correction §2, §5–§8, §15).
 * Pure: no IO, no clock, no write. Nothing here is a record; every figure
 * is a projection of staged rows and says so at the surface.
 *
 * The projections are the PAST state of the living model the product is
 * growing into — PEOPLE as evidence-backed professional identities, the
 * TEAM as who is evidenced working where and when, the PLACES, the
 * CALENDAR of actual work, the COMPANY as this data lets it be described —
 * and the ISSUES a human must settle first. What the source does not
 * support is listed as UNKNOWN, never as zero (SEP-7).
 *
 * TIME SEMANTICS ARE RESPECTED EVERYWHERE HERE: only DAILY figures are
 * hours of a day. A period aggregate (work from home over months) and an
 * unknown figure are carried apart as `aggregateHours`, appear on no day
 * and in no week total, and are never divided across days or places.
 *
 * No score, no rating, no rank of any person exists here (§14, §28), and
 * nothing here says anything about the person's CURRENT state (§3).
 */

export type PersonProjectionState = "existing" | "new" | "ambiguous" | "unresolved";

export interface PersonPlace {
  readonly name: string;
  readonly rows: number;
  /** Hours the source attributes to this place explicitly for this person. */
  readonly hours: number;
  /** First and last dated day this person is evidenced here. */
  readonly firstDate: string | null;
  readonly lastDate: string | null;
}

export interface PersonWeek {
  readonly isoWeek: number;
  readonly days: number;
  readonly hours: number;
}

export interface PersonProjection {
  /** The source's spelling. */
  readonly label: string;
  readonly state: PersonProjectionState;
  readonly personId: string | null;
  /** The roster name when matched. */
  readonly name: string | null;
  readonly rows: number;
  /** Distinct dated days with DAILY hours or dated work. */
  readonly days: number;
  /** Sum of the stated DAILY hours. */
  readonly hours: number;
  /** Source figures classified as a period aggregate or unknown — kept apart. */
  readonly aggregateHours: number;
  readonly aggregateRows: number;
  /** Rows whose source SAYS the work was remote. */
  readonly remoteRows: number;
  readonly firstDate: string | null;
  readonly lastDate: string | null;
  /** Places, most rows first. */
  readonly places: readonly PersonPlace[];
  /** Activity segments named in the object column (not places). */
  readonly activities: readonly string[];
  /** Up to three distinct work descriptions, as written — the evidence. */
  readonly evidenceSamples: readonly string[];
  /** Per ISO week, in order. */
  readonly weeks: readonly PersonWeek[];
  /** Rows that still carry a question. */
  readonly openRows: number;
  /** Rows spanning several places with no per-place figure. */
  readonly unallocatedRows: number;
  /** Rows without a recognisable place. */
  readonly noPlaceRows: number;
  /** Interpretations the reading made, by method, with counts. */
  readonly interpretations: readonly { readonly method: string; readonly rows: number }[];
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

export interface CalendarPersonDay {
  readonly label: string;
  /** DAILY hours on this day; null when the row is not a day's figure. */
  readonly hours: number | null;
  /** Every place of the day with its explicit hours or null (unknown split). */
  readonly places: readonly { readonly name: string; readonly hours: number | null }[];
  /** `aggregate` — a period figure recorded on this date; `unknown` — a
   *  figure a day cannot hold with no classification yet. */
  readonly kind: "daily" | "aggregate" | "unknown";
  readonly weekConflict: boolean;
}

export interface CalendarDay {
  readonly date: string;
  readonly people: readonly CalendarPersonDay[];
}

export interface CalendarWeek {
  readonly isoWeek: number;
  readonly days: readonly CalendarDay[];
  /** DAILY hours only. */
  readonly hours: number;
  readonly personDays: number;
}

export interface CalendarProjection {
  readonly firstDate: string | null;
  readonly lastDate: string | null;
  readonly people: readonly string[];
  readonly weeks: readonly CalendarWeek[];
  /** Person-days the calendar would hold (daily rows only). */
  readonly personDays: number;
  /** Aggregate figures, dated to the row's date but NOT on the calendar as
   *  a day: person, date, source hours, remote if stated, period if known. */
  readonly aggregates: readonly {
    readonly label: string;
    readonly recordedOn: string;
    readonly sourceHours: number;
    readonly remote: boolean | null;
    readonly periodStart: string | null;
    readonly periodEnd: string | null;
    readonly open: boolean;
    readonly context: string | null;
  }[];
}

/** The historical TEAM / FIELD: who is evidenced working, where, when. A
 *  read-only projection — co-occurrence is evidence of co-work, never a
 *  team membership (ARCH-4). */
export interface FieldWeek {
  readonly isoWeek: number;
  readonly firstDate: string;
  readonly lastDate: string;
  readonly hours: number;
  readonly people: readonly {
    readonly label: string;
    readonly days: number;
    readonly hours: number;
    readonly places: readonly { readonly name: string; readonly days: number; readonly hours: number | null }[];
  }[];
  readonly places: readonly {
    readonly name: string;
    readonly people: readonly string[];
    readonly days: number;
    readonly hours: number | null;
  }[];
}

export interface FieldProjection {
  readonly weeks: readonly FieldWeek[];
  /** Over the whole period: each place with the people evidenced there. */
  readonly places: readonly {
    readonly name: string;
    readonly people: readonly { readonly label: string; readonly days: number; readonly hours: number | null }[];
    readonly days: number;
    readonly firstDate: string | null;
    readonly lastDate: string | null;
  }[];
}

export type IssueKind =
  | "time_semantics"
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
  /** For `time_semantics`: each open row, so the human sees what they decide. */
  readonly timeRows: readonly {
    readonly rowId: string;
    readonly label: string;
    readonly recordedOn: string | null;
    readonly sourceHours: number;
    readonly machineReading: "period_aggregate" | "unknown";
    readonly periodWords: string | null;
    readonly remote: boolean | null;
    readonly text: string | null;
    readonly context: string | null;
  }[];
}

export interface CompanyProjection {
  readonly firstDate: string | null;
  readonly lastDate: string | null;
  readonly rows: number;
  readonly people: number;
  readonly places: number;
  /** Activity segments named in the object column (not places). */
  readonly activities: readonly string[];
  /** DAILY hours the source states. */
  readonly statedHours: number;
  /** Period-aggregate / unknown figures, apart. */
  readonly aggregateHours: number;
  readonly aggregateRows: number;
  readonly remoteRows: number;
  readonly personDays: number;
  /** Rows naming several places in one day. */
  readonly multiPlaceRows: number;
  /** What the source does NOT carry. Listed, never zeroed. */
  readonly unknown: readonly ("client" | "project" | "work_package" | "wage" | "output" | "team" | "aggregate_period")[];
}

export interface CommitEffect {
  readonly records: number;
  readonly notWritten: number;
  readonly createPeople: number;
  readonly createObjects: number;
  readonly evidenceState: "ORGANIZATION_REPORTED";
  /** Of `records`: written as a day's hours. */
  readonly dailyRecords: number;
  /** Of `records`: written as a period record (period known). */
  readonly periodRecords: number;
  /** Of `records`: dated, duration UNKNOWN (aggregate with unknown period, or unknown). */
  readonly undatedDurationRecords: number;
}

export interface ImportProjection {
  readonly people: readonly PersonProjection[];
  readonly places: readonly PlaceProjection[];
  readonly calendar: CalendarProjection;
  readonly field: FieldProjection;
  readonly issues: readonly IssueProjection[];
  readonly company: CompanyProjection;
  readonly commit: CommitEffect;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Only a DAILY figure is a day's hours. */
function dailyHours(r: PreviewRow): number | null {
  if (r.hours === null) return null;
  return countsAsDailyHours(r.timeSemantics) ? r.hours : null;
}

function isAggregate(r: PreviewRow): boolean {
  return !!r.timeSemantics && r.timeSemantics.value !== "daily";
}

function isWeekConflict(r: PreviewRow): boolean {
  return (r.derived.calendarWeek as { method?: string } | undefined)?.method === WEEK_CONFLICT_METHOD;
}

function rowDate(r: PreviewRow): string | null {
  return r.activityDate ?? r.periodStart ?? null;
}

function rowOpen(r: PreviewRow): boolean {
  return (
    r.timeSemanticsOpen ||
    r.personState === "ambiguous" ||
    r.contextState === "ambiguous" ||
    r.duplicateState === "duplicate"
  );
}

function bump(map: Map<string, number>, key: string, by = 1): void {
  map.set(key, (map.get(key) ?? 0) + by);
}

// ── people ──────────────────────────────────────────────────────────────────

export function projectPeople(rows: readonly PreviewRow[]): readonly PersonProjection[] {
  type Acc = {
    label: string; state: PersonProjectionState; personId: string | null; name: string | null;
    rows: number; days: Set<string>; hours: number; aggregateHours: number; aggregateRows: number; remoteRows: number;
    first: string | null; last: string | null;
    places: Map<string, { rows: number; hours: number; first: string | null; last: string | null }>;
    activities: Set<string>; samples: string[]; weeks: Map<number, { days: Set<string>; hours: number }>;
    openRows: number; unallocatedRows: number; noPlaceRows: number; interpretations: Map<string, number>;
  };
  const byKey = new Map<string, Acc>();
  for (const r of rows) {
    const label = r.personLabel?.trim();
    if (!label) continue;
    const key = label.toLowerCase();
    const entry: Acc = byKey.get(key) ?? {
      label,
      // A person is NEW when the source names them and nobody on the roster
      // is them — whether or not their rows commit today (an open question
      // holds the ROW, not the person). UNRESOLVED is an empty name.
      state:
        r.personState === "matched" || r.personState === "created"
          ? "existing"
          : r.personState === "ambiguous"
            ? "ambiguous"
            : "new",
      personId: r.personId, name: r.personName,
      rows: 0, days: new Set(), hours: 0, aggregateHours: 0, aggregateRows: 0, remoteRows: 0,
      first: null, last: null, places: new Map(), activities: new Set(), samples: [], weeks: new Map(),
      openRows: 0, unallocatedRows: 0, noPlaceRows: 0, interpretations: new Map(),
    };
    entry.rows += 1;
    const d = rowDate(r);
    const daily = dailyHours(r);
    if (isAggregate(r)) {
      entry.aggregateRows += 1;
      entry.aggregateHours += r.timeSemantics?.sourceHours ?? r.hours ?? 0;
      if (r.timeSemantics?.remote === true) entry.remoteRows += 1;
    } else if (d) {
      entry.days.add(d);
      if (!entry.first || d < entry.first) entry.first = d;
      if (!entry.last || d > entry.last) entry.last = d;
      const week = isoWeekOf(d);
      if (week !== null) {
        const w = entry.weeks.get(week) ?? { days: new Set<string>(), hours: 0 };
        w.days.add(d);
        w.hours += daily ?? 0;
        entry.weeks.set(week, w);
      }
    }
    if (daily !== null) entry.hours += daily;
    const places = placeSegments(r.contexts);
    if (places.length === 0) entry.noPlaceRows += 1;
    for (const p of places) {
      const name = p.name ?? p.label;
      const e = entry.places.get(name) ?? { rows: 0, hours: 0, first: null, last: null };
      e.rows += 1;
      if (p.hours !== null && daily !== null) e.hours += p.hours;
      if (d && !isAggregate(r)) {
        if (!e.first || d < e.first) e.first = d;
        if (!e.last || d > e.last) e.last = d;
      }
      entry.places.set(name, e);
      if (p.method && p.method !== "exact_label" && p.method !== "human_choice") bump(entry.interpretations, p.method);
    }
    for (const sgm of r.contexts?.segments ?? []) if (sgm.kind === "activity") entry.activities.add(sgm.label);
    if (r.contexts?.method === "site_from_work_text") bump(entry.interpretations, "site_from_work_text");
    if (r.contexts?.allocation?.method === "unknown_split") entry.unallocatedRows += 1;
    if (r.contexts?.allocation?.method === "explicit_in_text") bump(entry.interpretations, "hours_from_text");
    if (rowOpen(r)) entry.openRows += 1;
    const text = r.activityText?.trim();
    if (text && text.toLowerCase() !== label.toLowerCase() && entry.samples.length < 3 && !entry.samples.includes(text)) {
      entry.samples.push(text.length > 140 ? `${text.slice(0, 137)}…` : text);
    }
    byKey.set(key, entry);
  }
  return [...byKey.values()]
    .sort((a, b) => b.rows - a.rows || a.label.localeCompare(b.label))
    .map((e) => ({
      label: e.label, state: e.state, personId: e.personId, name: e.name,
      rows: e.rows, days: e.days.size, hours: round2(e.hours),
      aggregateHours: round2(e.aggregateHours), aggregateRows: e.aggregateRows, remoteRows: e.remoteRows,
      firstDate: e.first, lastDate: e.last,
      places: [...e.places.entries()]
        .sort((a, b) => b[1].rows - a[1].rows || a[0].localeCompare(b[0]))
        .map(([name, v]) => ({ name, rows: v.rows, hours: round2(v.hours), firstDate: v.first, lastDate: v.last })),
      activities: [...e.activities].sort(),
      evidenceSamples: e.samples,
      weeks: [...e.weeks.entries()].sort((a, b) => a[0] - b[0]).map(([isoWeek, w]) => ({ isoWeek, days: w.days.size, hours: round2(w.hours) })),
      openRows: e.openRows, unallocatedRows: e.unallocatedRows, noPlaceRows: e.noPlaceRows,
      interpretations: [...e.interpretations.entries()].sort((a, b) => b[1] - a[1]).map(([method, n]) => ({ method, rows: n })),
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
    const daily = dailyHours(r);
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
      if (p.hours !== null && daily !== null) e.statedHours += p.hours;
      else if (allocation && allocation.method !== "single_place") e.sharedRows += 1;
      const d = rowDate(r);
      if (d && !isAggregate(r)) {
        if (!e.first || d < e.first) e.first = d;
        if (!e.last || d > e.last) e.last = d;
      }
      byKey.set(key, e);
    }
  }
  return [...byKey.values()]
    .sort((a, b) => b.rows - a.rows || a.name.localeCompare(b.name))
    .map((e) => ({
      name: e.name, state: e.state, workObjectId: e.workObjectId, rows: e.rows, people: e.people.size,
      statedHours: round2(e.statedHours), sharedRows: e.sharedRows, spellings: [...e.spellings],
      origin: e.origin, firstDate: e.first, lastDate: e.last,
    }));
}

// ── calendar ────────────────────────────────────────────────────────────────

export function projectCalendar(rows: readonly PreviewRow[]): CalendarProjection {
  type Cell = { hours: number | null; places: Map<string, number | null>; kind: CalendarPersonDay["kind"]; weekConflict: boolean };
  const days = new Map<string, Map<string, Cell>>();
  const people = new Set<string>();
  const aggregates: CalendarProjection["aggregates"][number][] = [];
  let first: string | null = null;
  let last: string | null = null;
  for (const r of rows) {
    const d = rowDate(r);
    const label = r.personLabel?.trim();
    if (!d || !label) continue;
    people.add(label);
    if (isAggregate(r)) {
      const ts = r.timeSemantics!;
      aggregates.push({
        label, recordedOn: d, sourceHours: ts.sourceHours, remote: ts.remote,
        periodStart: ts.periodStart, periodEnd: ts.periodEnd, open: r.timeSemanticsOpen,
        context: r.contexts?.segments.map((sg) => sg.label).join(" · ") ?? r.contextLabel,
      });
      continue;
    }
    if (!first || d < first) first = d;
    if (!last || d > last) last = d;
    const day = days.get(d) ?? new Map<string, Cell>();
    const cur = day.get(label) ?? { hours: null, places: new Map(), kind: "daily" as const, weekConflict: false };
    const daily = dailyHours(r);
    cur.hours = daily === null ? cur.hours : round2((cur.hours ?? 0) + daily);
    for (const p of placeSegments(r.contexts)) {
      const name = p.name ?? p.label;
      const prev = cur.places.get(name);
      cur.places.set(name, p.hours === null ? (prev ?? null) : round2((prev ?? 0) + p.hours));
    }
    cur.weekConflict = cur.weekConflict || isWeekConflict(r);
    day.set(label, cur);
    days.set(d, day);
  }
  const byWeek = new Map<string, CalendarDay[]>();
  for (const date of [...days.keys()].sort()) {
    const week = isoWeekOf(date);
    const key = `${date.slice(0, 4)}-${String(week).padStart(2, "0")}`;
    const list = byWeek.get(key) ?? [];
    list.push({
      date,
      people: [...(days.get(date) ?? new Map<string, Cell>()).entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([label, v]) => ({
          label, hours: v.hours, kind: v.kind, weekConflict: v.weekConflict,
          places: [...v.places.entries()].map(([name, hours]) => ({ name, hours })),
        })),
    });
    byWeek.set(key, list);
  }
  const weeks: CalendarWeek[] = [...byWeek.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([key, list]) => ({
      isoWeek: Number(key.slice(5)),
      days: list,
      hours: round2(list.reduce((s, d) => s + d.people.reduce((t, p) => t + (p.hours ?? 0), 0), 0)),
      personDays: list.reduce((s, d) => s + d.people.length, 0),
    }));
  return {
    firstDate: first, lastDate: last, people: [...people].sort(), weeks,
    personDays: weeks.reduce((s, w) => s + w.personDays, 0),
    aggregates: aggregates.sort((a, b) => a.recordedOn.localeCompare(b.recordedOn) || a.label.localeCompare(b.label)),
  };
}

// ── the field (team) ────────────────────────────────────────────────────────

export function projectField(calendar: CalendarProjection): FieldProjection {
  const weeks: FieldWeek[] = calendar.weeks.map((w) => {
    const people = new Map<string, { days: Set<string>; hours: number; places: Map<string, { days: Set<string>; hours: number | null }> }>();
    const places = new Map<string, { people: Set<string>; days: Set<string>; hours: number | null }>();
    for (const d of w.days) {
      for (const p of d.people) {
        const pe = people.get(p.label) ?? { days: new Set(), hours: 0, places: new Map() };
        pe.days.add(d.date);
        pe.hours += p.hours ?? 0;
        for (const pl of p.places) {
          const pp = pe.places.get(pl.name) ?? { days: new Set(), hours: 0 };
          pp.days.add(d.date);
          pp.hours = pl.hours === null || pp.hours === null ? null : pp.hours + pl.hours;
          pe.places.set(pl.name, pp);
          const pc = places.get(pl.name) ?? { people: new Set(), days: new Set(), hours: 0 };
          pc.people.add(p.label);
          pc.days.add(d.date);
          pc.hours = pl.hours === null || pc.hours === null ? null : pc.hours + pl.hours;
          places.set(pl.name, pc);
        }
        people.set(p.label, pe);
      }
    }
    return {
      isoWeek: w.isoWeek,
      firstDate: w.days[0].date,
      lastDate: w.days[w.days.length - 1].date,
      hours: w.hours,
      people: [...people.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([label, v]) => ({
        label, days: v.days.size, hours: round2(v.hours),
        places: [...v.places.entries()].sort((a, b) => b[1].days.size - a[1].days.size).map(([name, pp]) => ({ name, days: pp.days.size, hours: pp.hours === null ? null : round2(pp.hours) })),
      })),
      places: [...places.entries()].sort((a, b) => b[1].days.size - a[1].days.size || a[0].localeCompare(b[0])).map(([name, v]) => ({
        name, people: [...v.people].sort(), days: v.days.size, hours: v.hours === null ? null : round2(v.hours),
      })),
    };
  });
  const overall = new Map<string, { people: Map<string, { days: Set<string>; hours: number | null }>; days: Set<string>; first: string | null; last: string | null }>();
  for (const w of calendar.weeks) {
    for (const d of w.days) {
      for (const p of d.people) {
        for (const pl of p.places) {
          const o = overall.get(pl.name) ?? { people: new Map(), days: new Set(), first: null, last: null };
          const pe = o.people.get(p.label) ?? { days: new Set(), hours: 0 };
          pe.days.add(d.date);
          pe.hours = pl.hours === null || pe.hours === null ? null : pe.hours + pl.hours;
          o.people.set(p.label, pe);
          o.days.add(d.date);
          if (!o.first || d.date < o.first) o.first = d.date;
          if (!o.last || d.date > o.last) o.last = d.date;
          overall.set(pl.name, o);
        }
      }
    }
  }
  return {
    weeks,
    places: [...overall.entries()].sort((a, b) => b[1].days.size - a[1].days.size || a[0].localeCompare(b[0])).map(([name, o]) => ({
      name,
      people: [...o.people.entries()].sort((a, b) => b[1].days.size - a[1].days.size).map(([label, pe]) => ({ label, days: pe.days.size, hours: pe.hours === null ? null : round2(pe.hours) })),
      days: o.days.size, firstDate: o.first, lastDate: o.last,
    })),
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
      timeRows: [],
    });
  };

  // WHAT A FIGURE MEANS — one question listing every open row, so the human
  // decides with the source's own words in front of them.
  const open = rows.filter((r) => r.timeSemanticsOpen && r.timeSemantics);
  if (open.length > 0) {
    issues.push({
      kind: "time_semantics", count: open.length, blocking: true, key: null, label: null, candidates: [], siblings: [],
      rowIds: open.map((r) => r.id),
      sample: null,
      timeRows: open.map((r) => ({
        rowId: r.id,
        label: r.personLabel ?? "",
        recordedOn: r.activityDate,
        sourceHours: r.timeSemantics!.sourceHours,
        machineReading: r.timeSemantics!.value === "period_aggregate" ? "period_aggregate" : "unknown",
        periodWords: r.timeSemantics!.note ?? null,
        remote: r.timeSemantics!.remote,
        text: r.activityText,
        context: r.contextLabel,
      })),
    });
  }

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
      candidates: e.candidates, siblings: [], rowIds: e.rows.map((r) => r.id), sample: e.label, timeRows: [],
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
      rowIds: e.rows.map((r) => r.id), sample: e.rows[0].activityText?.slice(0, 80) ?? null, timeRows: [],
    });
  }

  const ambiguousPeople = rows.filter((r) => r.personState === "ambiguous");
  push("ambiguous_person", ambiguousPeople, true, ambiguousPeople[0]?.personLabel ?? null);

  push("site_unknown", rows.filter((r) => placeSegments(r.contexts).length === 0), false);
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
  let aggregate = 0;
  let aggregateRows = 0;
  let remoteRows = 0;
  let multiPlaceRows = 0;
  let aggregatePeriodUnknown = false;
  for (const r of rows) {
    for (const s of r.contexts?.segments ?? []) if (s.kind === "activity") activities.add(s.label);
    if (isAggregate(r)) {
      aggregateRows += 1;
      aggregate += r.timeSemantics?.sourceHours ?? r.hours ?? 0;
      if (r.timeSemantics?.remote === true) remoteRows += 1;
      if (!r.timeSemantics?.periodStart) aggregatePeriodUnknown = true;
    } else {
      const daily = dailyHours(r);
      if (daily !== null) stated += daily;
    }
    if (placeSegments(r.contexts).length > 1) multiPlaceRows += 1;
  }
  const unknown: CompanyProjection["unknown"][number][] = [
    // A timesheet proves person · date · place · hours · words. It does not
    // name the client, the project above the site, a work package, a wage
    // or an output — and no team is inferred from co-presence (ARCH-4).
    "client", "project", "work_package", "wage", "output", "team",
  ];
  if (aggregatePeriodUnknown) unknown.push("aggregate_period");
  return {
    firstDate: calendar.firstDate,
    lastDate: calendar.lastDate,
    rows: rows.length,
    people: people.length,
    places: places.filter((p) => p.state !== "ambiguous").length,
    activities: [...activities].sort(),
    statedHours: round2(stated),
    aggregateHours: round2(aggregate),
    aggregateRows,
    remoteRows,
    personDays: calendar.personDays,
    multiPlaceRows,
    unknown,
  };
}

// ── the whole projection ────────────────────────────────────────────────────

export function projectImport(preview: ImportPreview): ImportProjection {
  const rows = preview.rows;
  const people = projectPeople(rows);
  const places = projectPlaces(rows);
  const calendar = projectCalendar(rows);
  const field = projectField(calendar);
  const issues = projectIssues(rows);
  const company = projectCompany(rows, people, places, calendar);
  const committable = committableRows(preview);
  let periodRecords = 0;
  let undated = 0;
  for (const r of committable) {
    if (!isAggregate(r)) continue;
    if (r.timeSemantics?.value === "period_aggregate" && r.timeSemantics.periodStart) periodRecords += 1;
    else undated += 1;
  }
  return {
    people, places, calendar, field, issues, company,
    commit: {
      records: committable.length,
      notWritten: rows.length - committable.length,
      createPeople: preview.plan.people.length,
      createObjects: preview.plan.objects.length,
      evidenceState: "ORGANIZATION_REPORTED",
      dailyRecords: committable.length - periodRecords - undated,
      periodRecords,
      undatedDurationRecords: undated,
    },
  };
}
