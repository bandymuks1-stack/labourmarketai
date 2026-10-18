import {
  addDays,
  shiftMonth,
  startOfMonth,
  startOfWeek,
} from "@/lib/journal/journal-calendar";

import type {
  CalendarDay,
  CalendarPersonDay,
  CalendarProjection,
  FieldProjection,
  ImportProjection,
  IssueProjection,
  PersonProjection,
} from "./import-projections";

/**
 * THE VISUAL SHAPE of the historical reconstruction — pure re-shapings of the
 * ONE projection (`import-projections.ts`) into what the eye needs
 * (LABOURMARKET_VISUAL_FIRST constitution 2026-09-16 §E, §H–§T).
 *
 * NOT A SECOND MODEL. Nothing here reads, stores or invents: every function
 * takes the projection the server computed from staged rows and returns a
 * geometry over the SAME facts — a calendar grid over the same days, object
 * lanes over the same dated places, the field for one week over the same
 * person·day·place cells. Change the projection and every view changes; no
 * view can disagree with another. The calendar geometry reuses the journal
 * calendar's own day arithmetic (`startOfWeek`, `addDays`, `shiftMonth`), so
 * a week here is a week there.
 *
 * TIME SEMANTICS SURVIVE INTACT: a period aggregate is carried apart by the
 * projection and this module never places it on a day, a week, a lane or a
 * cell. UNKNOWN stays `null`, never 0 (SEP-7).
 */

// ── identity of a place ─────────────────────────────────────────────────────

/**
 * A place's monogram — the street's initial(s) and the house number, so
 * `Hoofdgracht 3` reads `H3`, `Kruisweg 19` reads `K19`, `Kantoor` reads `Ka`.
 * Deterministic, text only: a place is recognised by its short mark the way a
 * person is recognised by initials. Never colour alone (§AP).
 */
export function objectMonogram(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "?";
  const number = /(\d+[a-z]?)\s*$/i.exec(trimmed)?.[1] ?? null;
  const words = trimmed
    .replace(/\s*\d+[a-z]?\s*$/i, "")
    .split(/[\s/-]+/)
    .filter(Boolean);
  const letters =
    words.length >= 2
      ? words
          .slice(0, 2)
          .map((w) => w[0])
          .join("")
      : (words[0] ?? trimmed).slice(0, number ? 1 : 2);
  const mark = `${letters}${number ?? ""}`;
  return (mark.length > 4 ? mark.slice(0, 4) : mark).replace(/^\w/, (c) =>
    c.toUpperCase(),
  );
}

// ── the calendar: a real month / week grid over the projection's days ───────

export type HistoricalCalendarScale = "month" | "week";

export interface HistoricalCalendarCell {
  readonly iso: string;
  readonly dayOfMonth: number;
  /** False for the neighbouring days a month grid borrows to fill its rows. */
  readonly inScope: boolean;
  /** Inside the evidenced period (first → last dated day). */
  readonly inPeriod: boolean;
  readonly isSelected: boolean;
  /** The day's people as the projection holds them — DAILY hours only. */
  readonly people: readonly CalendarPersonDay[];
  /** Sum of the day's daily hours; 0 when no daily figure exists on the day. */
  readonly hours: number;
  readonly weekConflict: boolean;
}

export interface HistoricalCalendarGrid {
  readonly scale: HistoricalCalendarScale;
  readonly anchor: string;
  readonly rangeStart: string;
  readonly rangeEnd: string;
  /** Rows of exactly 7 cells, Monday first. */
  readonly weeks: readonly (readonly HistoricalCalendarCell[])[];
  readonly prevAnchor: string | null;
  readonly nextAnchor: string | null;
  /** Days in scope that carry work. */
  readonly workedDays: number;
}

function dayIndex(calendar: CalendarProjection): Map<string, CalendarDay> {
  const m = new Map<string, CalendarDay>();
  for (const w of calendar.weeks) for (const d of w.days) m.set(d.date, d);
  return m;
}

function startOfScale(iso: string, scale: HistoricalCalendarScale): string {
  return scale === "week" ? startOfWeek(iso) : startOfMonth(iso);
}

/** The anchor the calendar opens on: the selected day's period, else the
 *  period that holds the most worked days — the reader lands on work. */
export function defaultCalendarAnchor(
  calendar: CalendarProjection,
  scale: HistoricalCalendarScale,
): string | null {
  if (!calendar.firstDate) return null;
  const count = new Map<string, number>();
  for (const w of calendar.weeks)
    for (const d of w.days) {
      const k = startOfScale(d.date, scale);
      count.set(k, (count.get(k) ?? 0) + 1);
    }
  let best: string | null = null;
  for (const [k, n] of count)
    if (best === null || n > (count.get(best) ?? 0)) best = k;
  return best ?? startOfScale(calendar.firstDate, scale);
}

export function buildHistoricalCalendar({
  calendar,
  scale,
  anchor,
  selected,
}: {
  readonly calendar: CalendarProjection;
  readonly scale: HistoricalCalendarScale;
  readonly anchor: string;
  readonly selected: string | null;
}): HistoricalCalendarGrid {
  const periodStart = startOfScale(anchor, scale);
  const periodEnd =
    scale === "week"
      ? addDays(periodStart, 6)
      : addDays(shiftMonth(periodStart, 1), -1);
  const gridStart = startOfWeek(periodStart);
  const gridEnd = addDays(startOfWeek(periodEnd), 6);
  const days = dayIndex(calendar);
  const first = calendar.firstDate;
  const last = calendar.lastDate;

  const weeks: HistoricalCalendarCell[][] = [];
  let row: HistoricalCalendarCell[] = [];
  let workedDays = 0;
  for (let cursor = gridStart; cursor <= gridEnd; cursor = addDays(cursor, 1)) {
    const day = days.get(cursor);
    const inScope = cursor >= periodStart && cursor <= periodEnd;
    const people = day?.people ?? [];
    if (inScope && people.length > 0) workedDays += 1;
    row.push({
      iso: cursor,
      dayOfMonth: Number(cursor.slice(8, 10)),
      inScope,
      inPeriod:
        first !== null && last !== null && cursor >= first && cursor <= last,
      isSelected: selected === cursor,
      people,
      hours:
        Math.round(people.reduce((s, p) => s + (p.hours ?? 0), 0) * 100) / 100,
      weekConflict: people.some((p) => p.weekConflict),
    });
    if (row.length === 7) {
      weeks.push(row);
      row = [];
    }
  }
  if (row.length > 0) weeks.push(row);

  // Navigation stays inside the evidenced period: there is nothing to look at
  // before the first dated day or after the last, and a calendar that pages
  // into empty months invites the reader to mistake "not shown" for "nothing".
  const prev =
    scale === "week" ? addDays(periodStart, -7) : shiftMonth(periodStart, -1);
  const next =
    scale === "week" ? addDays(periodStart, 7) : shiftMonth(periodStart, 1);
  const prevEnd =
    scale === "week" ? addDays(prev, 6) : addDays(periodStart, -1);
  return {
    scale,
    anchor: periodStart,
    rangeStart: periodStart,
    rangeEnd: periodEnd,
    weeks,
    prevAnchor: first !== null && prevEnd >= first ? prev : null,
    nextAnchor: last !== null && next <= last ? next : null,
    workedDays,
  };
}

// ── a person's work reality: object lanes over the period ───────────────────

export interface ObjectLane {
  readonly name: string;
  readonly monogram: string;
  /** Fractions of the person's own span. */
  readonly startFraction: number;
  readonly endFraction: number;
  readonly days: number;
  /** Explicitly attributed hours; null when the source never split them. */
  readonly hours: number | null;
  readonly firstDate: string;
  readonly lastDate: string;
}

const DAY_MS = 86_400_000;

/** One lane per dated place, positioned on the person's own first→last span.
 *  A place with no dated day (aggregate-only) has no lane — it is not placed
 *  on time the source never dated. */
export function personObjectLanes(
  person: PersonProjection,
): readonly ObjectLane[] {
  if (!person.firstDate || !person.lastDate) return [];
  const start = Date.parse(`${person.firstDate}T00:00:00Z`);
  const end = Math.max(
    Date.parse(`${person.lastDate}T00:00:00Z`) + DAY_MS,
    start + DAY_MS,
  );
  const span = end - start;
  return person.places
    .filter(
      (p): p is typeof p & { firstDate: string; lastDate: string } =>
        !!p.firstDate && !!p.lastDate,
    )
    .map((p) => {
      const a = Date.parse(`${p.firstDate}T00:00:00Z`);
      const b = Date.parse(`${p.lastDate}T00:00:00Z`) + DAY_MS;
      return {
        name: p.name,
        monogram: objectMonogram(p.name),
        startFraction: Math.max(0, Math.min(1, (a - start) / span)),
        endFraction: Math.max(0, Math.min(1, (b - start) / span)),
        days: p.rows,
        hours: p.hours > 0 ? p.hours : null,
        firstDate: p.firstDate,
        lastDate: p.lastDate,
      };
    });
}

// ── the field for one week: people × days × places ──────────────────────────

export interface FieldCell {
  readonly iso: string;
  /** The person's daily hours on the day; null when the day carries no daily figure. */
  readonly hours: number | null;
  readonly places: readonly {
    readonly name: string;
    readonly monogram: string;
    readonly hours: number | null;
  }[];
  readonly weekConflict: boolean;
}

export interface FieldRow {
  readonly label: string;
  readonly days: number;
  readonly hours: number;
  readonly cells: readonly (FieldCell | null)[];
}

export interface FieldWeekView {
  readonly isoWeek: number;
  /** The seven ISO days of the week, Monday first. */
  readonly days: readonly string[];
  readonly rows: readonly FieldRow[];
}

/** The week as a field: one row per person evidenced that week, one column
 *  per weekday, a cell = where they were. Empty cells are real absences of
 *  evidence for that day, never zeros of work. */
export function fieldWeekView(
  calendar: CalendarProjection,
  isoWeek: number,
): FieldWeekView | null {
  const week = calendar.weeks.find((w) => w.isoWeek === isoWeek);
  if (!week) return null;
  const monday = startOfWeek(week.days[0].date);
  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  const byDay = new Map(week.days.map((d) => [d.date, d] as const));
  const people = new Map<
    string,
    { hours: number; days: Set<string>; cells: Map<string, FieldCell> }
  >();
  for (const iso of days) {
    const d = byDay.get(iso);
    if (!d) continue;
    for (const p of d.people) {
      const e = people.get(p.label) ?? {
        hours: 0,
        days: new Set<string>(),
        cells: new Map<string, FieldCell>(),
      };
      e.hours += p.hours ?? 0;
      e.days.add(iso);
      e.cells.set(iso, {
        iso,
        hours: p.hours,
        places: p.places.map((pl) => ({
          name: pl.name,
          monogram: objectMonogram(pl.name),
          hours: pl.hours,
        })),
        weekConflict: p.weekConflict,
      });
      people.set(p.label, e);
    }
  }
  return {
    isoWeek,
    days,
    rows: [...people.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([label, e]) => ({
        label,
        days: e.days.size,
        hours: Math.round(e.hours * 100) / 100,
        cells: days.map((iso) => e.cells.get(iso) ?? null),
      })),
  };
}

/** The whole period as a field: one row per person, one column per ISO week,
 *  a cell = the places evidenced that week (most days first). */
export interface FieldPeriodCell {
  readonly isoWeek: number;
  readonly days: number;
  readonly hours: number;
  readonly places: readonly {
    readonly name: string;
    readonly monogram: string;
    readonly days: number;
  }[];
}

export interface FieldPeriodView {
  readonly weeks: readonly number[];
  readonly rows: readonly {
    readonly label: string;
    readonly days: number;
    readonly hours: number;
    readonly cells: readonly (FieldPeriodCell | null)[];
  }[];
}

export function fieldPeriodView(field: FieldProjection): FieldPeriodView {
  const weeks = field.weeks.map((w) => w.isoWeek);
  const labels = new Set<string>();
  for (const w of field.weeks) for (const p of w.people) labels.add(p.label);
  return {
    weeks,
    rows: [...labels].sort().map((label) => ({
      label,
      days: field.weeks.reduce(
        (s, w) => s + (w.people.find((x) => x.label === label)?.days ?? 0),
        0,
      ),
      hours:
        Math.round(
          field.weeks.reduce(
            (s, w) => s + (w.people.find((x) => x.label === label)?.hours ?? 0),
            0,
          ) * 100,
        ) / 100,
      cells: field.weeks.map((w) => {
        const p = w.people.find((x) => x.label === label);
        if (!p) return null;
        return {
          isoWeek: w.isoWeek,
          days: p.days,
          hours: p.hours,
          places: p.places.map((pl) => ({
            name: pl.name,
            monogram: objectMonogram(pl.name),
            days: pl.days,
          })),
        };
      }),
    })),
  };
}

// ── attention ───────────────────────────────────────────────────────────────

/** How many DECISIONS wait — a question asked once counts once, however
 *  many rows it settles (the owner reads "⚠ 1 DECISION", not "2 rows"). */
export function decisionCount(issues: readonly IssueProjection[]): number {
  return issues.filter((i) => i.blocking).length;
}

// ── the top state ───────────────────────────────────────────────────────────

export interface TopState {
  readonly firstDate: string | null;
  readonly lastDate: string | null;
  readonly people: number;
  readonly objects: number;
  readonly personDays: number;
  readonly dailyHours: number;
  readonly aggregateHours: number;
  readonly aggregateRows: number;
  readonly decisions: number;
}

export function topState(projection: ImportProjection): TopState {
  const { company, issues } = projection;
  return {
    firstDate: company.firstDate,
    lastDate: company.lastDate,
    people: company.people,
    objects: company.places,
    personDays: company.personDays,
    dailyHours: company.statedHours,
    aggregateHours: company.aggregateHours,
    aggregateRows: company.aggregateRows,
    decisions: decisionCount(issues),
  };
}

// ── an object's rhythm: days per ISO week where anyone is evidenced there ───

export interface ObjectWeek {
  readonly isoWeek: number;
  readonly days: number;
  readonly people: number;
}

export function objectWeeks(
  calendar: CalendarProjection,
  name: string,
): readonly ObjectWeek[] {
  return calendar.weeks
    .map((w) => {
      const days = new Set<string>();
      const people = new Set<string>();
      for (const d of w.days)
        for (const p of d.people)
          if (p.places.some((pl) => pl.name === name)) {
            days.add(d.date);
            people.add(p.label);
          }
      return { isoWeek: w.isoWeek, days: days.size, people: people.size };
    })
    .filter((w) => w.days > 0);
}

// ── the ONE grammar at three scales: OBJECTS × TIME, PEOPLE as tokens ──────
//
// Everything below re-shapes the same days into the shapes the eye reads on
// each surface — a person's own rhythm and evidence ring, the company's
// objects as bands over its weeks, a week as a formation of object lanes with
// people placed on days, one day as who stood where. Same facts, same rules:
// UNKNOWN stays null, absence stays absence, nothing is divided by guess.

/** A person's dated days, in order — the daily rhythm under the identity. */
export interface PersonDay {
  readonly iso: string;
  /** DAILY hours, null when the day carries no daily figure. */
  readonly hours: number | null;
  readonly places: number;
}

export function personDaySeries(
  calendar: CalendarProjection,
  label: string,
): readonly PersonDay[] {
  const out: PersonDay[] = [];
  for (const w of calendar.weeks)
    for (const d of w.days) {
      const p = d.people.find((x) => x.label === label);
      if (p) out.push({ iso: d.date, hours: p.hours, places: p.places.length });
    }
  return out;
}

/** The evidence ring: one segment per ISO week of the WHOLE period (so every
 *  person's ring shares one angular scale), each carrying the days this
 *  person is evidenced that week — 0 when absent. Days, not hours: the ring
 *  says "when there is evidence", never how good it is. */
export interface RingSegment {
  readonly isoWeek: number;
  readonly days: number;
}

export function personRing(
  calendar: CalendarProjection,
  label: string,
): readonly RingSegment[] {
  return calendar.weeks.map((w) => ({
    isoWeek: w.isoWeek,
    days: w.days.filter((d) => d.people.some((p) => p.label === label)).length,
  }));
}

/** The company's objects as bands over its weeks — per place, per week the
 *  person-days evidenced there and the distinct people. Most-worked first.
 *  With `person`, the same bands narrowed to that person's days — the
 *  person's footprint drawn on the company's objects. */
export interface ObjectStreamWeek {
  readonly isoWeek: number;
  readonly personDays: number;
  readonly people: number;
}

export interface ObjectStream {
  readonly name: string;
  readonly monogram: string;
  readonly personDays: number;
  readonly people: readonly string[];
  readonly firstDate: string | null;
  readonly lastDate: string | null;
  readonly weeks: readonly ObjectStreamWeek[];
}

export function objectStreams(
  calendar: CalendarProjection,
  person: string | null = null,
): readonly ObjectStream[] {
  const acc = new Map<
    string,
    {
      people: Set<string>;
      first: string | null;
      last: string | null;
      total: number;
      weeks: Map<number, { personDays: number; people: Set<string> }>;
    }
  >();
  for (const w of calendar.weeks)
    for (const d of w.days)
      for (const p of d.people)
        for (const pl of p.places) {
          if (person !== null && p.label !== person) continue;
          const e = acc.get(pl.name) ?? {
            people: new Set<string>(),
            first: null,
            last: null,
            total: 0,
            weeks: new Map(),
          };
          e.people.add(p.label);
          e.total += 1;
          e.first = e.first === null || d.date < e.first ? d.date : e.first;
          e.last = e.last === null || d.date > e.last ? d.date : e.last;
          const wk = e.weeks.get(w.isoWeek) ?? {
            personDays: 0,
            people: new Set<string>(),
          };
          wk.personDays += 1;
          wk.people.add(p.label);
          e.weeks.set(w.isoWeek, wk);
          acc.set(pl.name, e);
        }
  return [...acc.entries()]
    .sort((a, b) => b[1].total - a[1].total || a[0].localeCompare(b[0]))
    .map(([name, e]) => ({
      name,
      monogram: objectMonogram(name),
      personDays: e.total,
      people: [...e.people].sort(),
      firstDate: e.first,
      lastDate: e.last,
      weeks: calendar.weeks.map((w) => {
        const wk = e.weeks.get(w.isoWeek);
        return {
          isoWeek: w.isoWeek,
          personDays: wk?.personDays ?? 0,
          people: wk?.people.size ?? 0,
        };
      }),
    }));
}

/** A person placed on an object on a day: solid when the source states the
 *  hours there, `hours: null` (drawn dashed, read `?`) when it never split. */
export interface FormationToken {
  readonly label: string;
  readonly hours: number | null;
  /** The person's whole-day figure, for the tooltip. */
  readonly dayHours: number | null;
  readonly weekConflict: boolean;
}

export interface FormationLane {
  readonly name: string;
  readonly monogram: string;
  /** Person-days on this lane in the shown time. */
  readonly personDays: number;
  readonly cells: readonly (readonly FormationToken[])[];
}

/** The week as a FORMATION: lanes are the places worked that week (most
 *  person-days first), columns the seven days, tokens the people on each
 *  place each day; a person with a dated day but no recognisable place sits
 *  on the `unplaced` lane. `paths` are each person's steps through the lanes
 *  — the line drawn when a person is selected. */
export interface FormationWeek {
  readonly isoWeek: number;
  readonly days: readonly string[];
  readonly lanes: readonly FormationLane[];
  readonly unplaced: readonly (readonly FormationToken[])[];
  readonly people: readonly {
    readonly label: string;
    readonly days: number;
    readonly hours: number;
  }[];
  readonly paths: ReadonlyMap<
    string,
    readonly { readonly day: number; readonly lane: number }[]
  >;
}

export function fieldFormationWeek(
  calendar: CalendarProjection,
  isoWeek: number,
): FormationWeek | null {
  const week = calendar.weeks.find((w) => w.isoWeek === isoWeek);
  if (!week) return null;
  const monday = startOfWeek(week.days[0].date);
  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  const byDay = new Map(week.days.map((d) => [d.date, d] as const));
  const lanes = new Map<string, { total: number; cells: FormationToken[][] }>();
  const unplaced: FormationToken[][] = days.map(() => []);
  const people = new Map<string, { days: number; hours: number }>();
  days.forEach((iso, di) => {
    const d = byDay.get(iso);
    if (!d) return;
    for (const p of d.people) {
      const person = people.get(p.label) ?? { days: 0, hours: 0 };
      person.days += 1;
      person.hours += p.hours ?? 0;
      people.set(p.label, person);
      const token = (hours: number | null): FormationToken => ({
        label: p.label,
        hours,
        dayHours: p.hours,
        weekConflict: p.weekConflict,
      });
      if (p.places.length === 0) {
        unplaced[di].push(token(p.hours));
        continue;
      }
      for (const pl of p.places) {
        const lane = lanes.get(pl.name) ?? {
          total: 0,
          cells: days.map(() => []),
        };
        lane.total += 1;
        // a single place on the day carries the day's figure; several places carry only what the source split
        lane.cells[di].push(token(p.places.length === 1 ? p.hours : pl.hours));
        lanes.set(pl.name, lane);
      }
    }
  });
  const ordered = [...lanes.entries()].sort(
    (a, b) => b[1].total - a[1].total || a[0].localeCompare(b[0]),
  );
  const laneIndex = new Map(ordered.map(([name], i) => [name, i] as const));
  const paths = new Map<string, { day: number; lane: number }[]>();
  days.forEach((iso, di) => {
    const d = byDay.get(iso);
    if (!d) return;
    for (const p of d.people) {
      const steps = paths.get(p.label) ?? [];
      // the step of a multi-place day is the place with the most stated hours, else the first named
      const primary = [...p.places].sort(
        (a, b) => (b.hours ?? -1) - (a.hours ?? -1),
      )[0];
      if (primary)
        steps.push({ day: di, lane: laneIndex.get(primary.name) ?? -1 });
      paths.set(p.label, steps);
    }
  });
  return {
    isoWeek,
    days,
    lanes: ordered.map(([name, l]) => ({
      name,
      monogram: objectMonogram(name),
      personDays: l.total,
      cells: l.cells,
    })),
    unplaced,
    people: [...people.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([label, v]) => ({
        label,
        days: v.days,
        hours: Math.round(v.hours * 100) / 100,
      })),
    paths,
  };
}

/** The period as a formation: lanes are the places, columns the ISO weeks,
 *  a token a person with the days they are evidenced on that place that week. */
export interface PeriodToken {
  readonly label: string;
  readonly days: number;
}

export interface FormationPeriod {
  readonly weeks: readonly number[];
  readonly lanes: readonly {
    readonly name: string;
    readonly monogram: string;
    readonly personDays: number;
    readonly cells: readonly (readonly PeriodToken[])[];
  }[];
  readonly people: readonly {
    readonly label: string;
    readonly days: number;
    readonly hours: number;
  }[];
}

export function fieldFormationPeriod(
  calendar: CalendarProjection,
): FormationPeriod {
  const weeks = calendar.weeks.map((w) => w.isoWeek);
  const lanes = new Map<
    string,
    { total: number; cells: Map<string, number>[] }
  >();
  const people = new Map<string, { days: number; hours: number }>();
  calendar.weeks.forEach((w, wi) => {
    for (const d of w.days)
      for (const p of d.people) {
        const person = people.get(p.label) ?? { days: 0, hours: 0 };
        person.days += 1;
        person.hours += p.hours ?? 0;
        people.set(p.label, person);
        for (const pl of p.places) {
          const lane = lanes.get(pl.name) ?? {
            total: 0,
            cells: weeks.map(() => new Map<string, number>()),
          };
          lane.total += 1;
          lane.cells[wi].set(p.label, (lane.cells[wi].get(p.label) ?? 0) + 1);
          lanes.set(pl.name, lane);
        }
      }
  });
  return {
    weeks,
    lanes: [...lanes.entries()]
      .sort((a, b) => b[1].total - a[1].total || a[0].localeCompare(b[0]))
      .map(([name, l]) => ({
        name,
        monogram: objectMonogram(name),
        personDays: l.total,
        cells: l.cells.map((c) =>
          [...c.entries()]
            .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
            .map(([label, days]) => ({ label, days })),
        ),
      })),
    people: [...people.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([label, v]) => ({
        label,
        days: v.days,
        hours: Math.round(v.hours * 100) / 100,
      })),
  };
}

/** One day as who stood where: the places of the day with their people (the
 *  hours the source attributes there, `null` where it did not split), the
 *  people without a recognisable place, and the day's totals. */
export interface DayFormation {
  readonly iso: string;
  readonly places: readonly {
    readonly name: string;
    readonly monogram: string;
    readonly people: readonly FormationToken[];
  }[];
  readonly unplaced: readonly FormationToken[];
  readonly people: readonly CalendarPersonDay[];
  readonly hours: number;
}

export function dayFormation(
  calendar: CalendarProjection,
  iso: string,
): DayFormation | null {
  const day = calendar.weeks.flatMap((w) => w.days).find((d) => d.date === iso);
  if (!day) return null;
  const places = new Map<string, FormationToken[]>();
  const unplaced: FormationToken[] = [];
  for (const p of day.people) {
    const token = (hours: number | null): FormationToken => ({
      label: p.label,
      hours,
      dayHours: p.hours,
      weekConflict: p.weekConflict,
    });
    if (p.places.length === 0) unplaced.push(token(p.hours));
    for (const pl of p.places) {
      const list = places.get(pl.name) ?? [];
      list.push(token(p.places.length === 1 ? p.hours : pl.hours));
      places.set(pl.name, list);
    }
  }
  return {
    iso,
    places: [...places.entries()]
      .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))
      .map(([name, people]) => ({
        name,
        monogram: objectMonogram(name),
        people,
      })),
    unplaced,
    people: day.people,
    hours:
      Math.round(day.people.reduce((s, p) => s + (p.hours ?? 0), 0) * 100) /
      100,
  };
}
