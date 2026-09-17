"use client";

import { PeriodMonthlyShare } from "@/components/app/period-monthly-share";
import { useMemo } from "react";

import {
  ObjectMark,
  PersonMark,
  PersonToken,
  PlaceMark,
  UnknownToken,
} from "@/components/app/historical/historical-marks";
import { SemanticIcon } from "@/components/app/semantic-icon";
import { WEEKDAY_ANCHOR_ISO } from "@/lib/journal/journal-calendar";
import type {
  CalendarPersonDay,
  CalendarProjection,
} from "@/lib/organization-evidence/import-projections";
import {
  buildHistoricalCalendar,
  dayFormation,
  type HistoricalCalendarScale,
} from "@/lib/organization-evidence/import-visual";
import { cn } from "@/lib/utils";

/**
 * THE HISTORICAL CALENDAR — a calendar that IS a calendar
 * (LABOURMARKET_VISUAL_FIRST constitution 2026-09-16 §P–§Q, §BF; owner
 * master handoff 2026-09-17 §15: "dense days should not become walls of
 * text; PAST = ACTUAL").
 *
 * Month or week, Monday first, real dates in real positions. A MONTH day is
 * read before it is read: the day's hours as a density bar along its foot,
 * the people as tokens (solid = hours stated, dashed = split unknown), a
 * week/date conflict as a mark — no place names, no lists; the day's places
 * open on select. A WEEK day has the room: each person with their places and
 * hours. Selecting a day opens that day's FORMATION in the workspace's
 * detail slot — who stood where, how many hours where the source split
 * them, `?` where it did not. This is PERFORMED work: the past state of the
 * product's time engine, never a booking and never a plan.
 *
 * PERIOD AGGREGATES NEVER BECOME A DAY. A figure the source states over a
 * period (800 h, 165 h) is carried apart by the projection; it appears here
 * in the "apart" band under the grid with its period UNKNOWN, and never in a
 * cell. The WEEKLY TABLE the previous reconstruction showed as "Calendar" is
 * kept — as the optional report view — not as the calendar.
 *
 * Read-only, client state over server-computed data; the geometry comes
 * from the journal calendar's day arithmetic, so a week here is a week there.
 */

export interface HistoricalCalendarLabels {
  readonly title: string;
  readonly prev: string;
  readonly next: string;
  readonly month: string;
  readonly week: string;
  readonly table: string;
  readonly calendar: string;
  readonly people: string;
  readonly hours: string;
  readonly days: string;
  readonly weekShort: string;
  readonly apart: string;
  readonly periodUnknown: string;
  /** "Derived equal monthly share · not source days" (owner 2026-09-17). */
  readonly monthlyShare: string;
  readonly remote: string;
  readonly open: string;
  readonly weekConflict: string;
  readonly performed: string;
  readonly noWork: string;
  readonly dayLabel: string;
  readonly sum: string;
  readonly object: string;
  readonly actual: string;
  readonly hoursUnknown: string;
  readonly unplaced: string;
}

/** The place a day's entry is SHOWN under in the week grid: the one with the
 *  most attributed hours, else the first the source names. */
function primaryPlace(
  p: CalendarPersonDay,
): { name: string; more: number } | null {
  if (p.places.length === 0) return null;
  const known = p.places
    .filter((pl) => pl.hours !== null)
    .sort((a, b) => (b.hours ?? 0) - (a.hours ?? 0));
  const first = known[0] ?? p.places[0];
  return { name: first.name, more: p.places.length - 1 };
}

export function HistoricalCalendar({
  calendar,
  locale,
  labels,
  scale,
  anchor,
  selectedDay,
  view,
  personFilter,
  objectFilter,
  onScale,
  onAnchor,
  onSelectDay,
  onView,
}: {
  calendar: CalendarProjection;
  locale: string;
  labels: HistoricalCalendarLabels;
  scale: HistoricalCalendarScale;
  anchor: string;
  selectedDay: string | null;
  view: "calendar" | "table";
  /** A selected person / object lights their days; others dim. */
  personFilter: string | null;
  objectFilter: string | null;
  onScale: (s: HistoricalCalendarScale) => void;
  onAnchor: (iso: string) => void;
  onSelectDay: (iso: string | null) => void;
  onView: (v: "calendar" | "table") => void;
}) {
  const fmt = useMemo(() => {
    const parse = (iso: string) => new Date(`${iso}T00:00:00Z`);
    const month = new Intl.DateTimeFormat(locale, {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    });
    const day = new Intl.DateTimeFormat(locale, {
      day: "numeric",
      month: locale === "lt" ? "long" : "short",
      timeZone: "UTC",
    });
    const weekday = new Intl.DateTimeFormat(locale, {
      weekday: "short",
      timeZone: "UTC",
    });
    const num = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });
    return {
      month: (iso: string) => month.format(parse(iso)),
      day: (iso: string) => day.format(parse(iso)),
      weekday: (iso: string) =>
        weekday.format(parse(iso)).replace(/\.$/, "").slice(0, 2),
      hours: (n: number) => num.format(n),
    };
  }, [locale]);

  const grid = useMemo(
    () =>
      buildHistoricalCalendar({
        calendar,
        scale,
        anchor,
        selected: selectedDay,
      }),
    [calendar, scale, anchor, selectedDay],
  );
  const periodLabel =
    scale === "week"
      ? `${fmt.day(grid.rangeStart)} – ${fmt.day(grid.rangeEnd)}`
      : fmt.month(grid.anchor);
  const maxDayHours = Math.max(
    1,
    ...grid.weeks
      .flat()
      .filter((c) => c.inScope)
      .map((c) => c.hours),
  );

  const dayMatches = (
    people: readonly { label: string; places: readonly { name: string }[] }[],
  ) => {
    if (personFilter && !people.some((p) => p.label === personFilter))
      return false;
    if (
      objectFilter &&
      !people.some((p) => p.places.some((pl) => pl.name === objectFilter))
    )
      return false;
    return true;
  };
  const personMatches = (p: CalendarPersonDay) =>
    (personFilter === null || personFilter === p.label) &&
    (objectFilter === null || p.places.some((pl) => pl.name === objectFilter));

  return (
    <section
      className="flex flex-col gap-3"
      data-testid="historical-calendar"
      data-scale={scale}
      data-anchor={grid.anchor}
      data-view={view}
      aria-label={labels.title}
    >
      {/* period · scale · optional table */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => grid.prevAnchor && onAnchor(grid.prevAnchor)}
            disabled={!grid.prevAnchor}
            aria-label={labels.prev}
            data-testid="historical-calendar-prev"
            className="inline-flex size-11 items-center justify-center rounded-md text-text-secondary transition-colors duration-fast hover:bg-ink-800 hover:text-text-primary disabled:opacity-30"
          >
            ‹
          </button>
          <span
            className="min-w-44 text-center font-display text-title font-semibold tracking-tightest text-text-primary"
            data-testid="historical-calendar-period"
          >
            {periodLabel}
          </span>
          <button
            type="button"
            onClick={() => grid.nextAnchor && onAnchor(grid.nextAnchor)}
            disabled={!grid.nextAnchor}
            aria-label={labels.next}
            data-testid="historical-calendar-next"
            className="inline-flex size-11 items-center justify-center rounded-md text-text-secondary transition-colors duration-fast hover:bg-ink-800 hover:text-text-primary disabled:opacity-30"
          >
            ›
          </button>
        </div>
        <div
          className="flex items-center gap-1 rounded-full bg-ink-800/70 p-1"
          role="group"
          aria-label={labels.calendar}
        >
          {(["month", "week"] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => {
                onView("calendar");
                onScale(s);
              }}
              aria-pressed={view === "calendar" && scale === s}
              data-testid={`historical-calendar-scale-${s}`}
              className={cn(
                "inline-flex min-h-9 items-center rounded-full px-3 font-mono text-meta uppercase tracking-label transition-colors duration-fast",
                view === "calendar" && scale === s
                  ? "bg-brand-blue/20 text-text-primary"
                  : "text-text-secondary hover:text-text-primary",
              )}
            >
              {s === "month" ? labels.month : labels.week}
            </button>
          ))}
          <button
            type="button"
            onClick={() => onView("table")}
            aria-pressed={view === "table"}
            data-testid="historical-calendar-view-table"
            className={cn(
              "inline-flex min-h-9 items-center gap-1 rounded-full px-3 font-mono text-meta uppercase tracking-label transition-colors duration-fast",
              view === "table"
                ? "bg-brand-blue/20 text-text-primary"
                : "text-text-secondary hover:text-text-primary",
            )}
          >
            <SemanticIcon
              concept="source"
              label={labels.table}
              className="h-3 w-3"
            />
            {labels.table}
          </button>
        </div>
      </div>

      {view === "calendar" ? (
        <>
          <div
            key={`${scale}:${grid.anchor}`}
            className={cn(
              "rise-in",
              "grid grid-cols-7 gap-px overflow-hidden rounded-lg bg-ink-600/60",
            )}
            role="grid"
            aria-label={labels.title}
            data-testid="historical-calendar-grid"
          >
            {WEEKDAY_ANCHOR_ISO.map((iso) => (
              <span
                key={iso}
                aria-hidden
                className="bg-ink-900 py-1.5 text-center font-mono text-meta uppercase tracking-label text-text-muted"
              >
                {fmt.weekday(iso)}
              </span>
            ))}
            {grid.weeks.flat().map((cell) => {
              const worked = cell.people.length > 0;
              const lit = worked && dayMatches(cell.people);
              const dimmed = worked && !lit;
              const state = cell.isSelected
                ? "selected"
                : worked
                  ? "worked"
                  : cell.inPeriod
                    ? "empty"
                    : "outside";
              const title = `${fmt.day(cell.iso)}${worked ? ` · ${cell.people.length} ${labels.people} · ${fmt.hours(cell.hours)} h` : ""}`;
              if (!cell.inScope) {
                return (
                  <span
                    key={cell.iso}
                    aria-hidden
                    data-testid="historical-calendar-day"
                    data-day={cell.iso}
                    data-state="outside"
                    className="min-h-16 bg-ink-900 p-1.5 font-mono text-meta text-text-muted/30"
                  >
                    {cell.dayOfMonth}
                  </span>
                );
              }
              const maxRows = scale === "week" ? 12 : 8;
              const shownPeople = cell.people.slice(0, maxRows);
              return (
                <button
                  key={cell.iso}
                  type="button"
                  onClick={() => onSelectDay(cell.isSelected ? null : cell.iso)}
                  aria-pressed={cell.isSelected}
                  aria-label={title}
                  disabled={!worked}
                  data-testid="historical-calendar-day"
                  data-day={cell.iso}
                  data-state={state}
                  data-people={cell.people.length}
                  className={cn(
                    "group relative flex min-h-16 flex-col gap-1.5 p-1.5 text-left transition-colors duration-fast",
                    scale === "week" ? "min-h-48" : "sm:min-h-24",
                    cell.isSelected
                      ? "bg-brand-blue/10 ring-2 ring-inset ring-brand-blue"
                      : worked
                        ? "bg-ink-900 hover:bg-ink-800/80"
                        : "bg-ink-900",
                    dimmed && !cell.isSelected ? "opacity-30" : "",
                  )}
                >
                  <span className="flex items-baseline justify-between">
                    <span
                      className={cn(
                        "font-display text-support font-semibold",
                        worked
                          ? "text-text-primary"
                          : cell.inPeriod
                            ? "text-text-muted"
                            : "text-text-muted/50",
                      )}
                    >
                      {cell.dayOfMonth}
                    </span>
                    {worked && (
                      <span className="flex items-center gap-1 font-mono text-meta tabular-nums text-text-secondary">
                        {cell.weekConflict && (
                          <SemanticIcon
                            concept="warning"
                            label={labels.weekConflict}
                            className="h-3 w-3 text-state-amber"
                          />
                        )}
                        {cell.hours > 0 ? (
                          `${fmt.hours(cell.hours)} h`
                        ) : (
                          <UnknownToken what={labels.hoursUnknown} />
                        )}
                      </span>
                    )}
                  </span>
                  {worked && scale === "month" && (
                    <>
                      {/* WHO — the day's people as tokens: solid = hours stated, dashed = split unknown */}
                      <span className="flex flex-wrap gap-1" aria-hidden>
                        {shownPeople.map((p) => {
                          const stated =
                            p.places.length <= 1
                              ? p.hours
                              : p.places.some((pl) => pl.hours !== null)
                                ? p.hours
                                : null;
                          return (
                            <PersonToken
                              key={p.label}
                              label={p.label}
                              hours={stated}
                              size="xs"
                              lit={personFilter === p.label}
                              dim={
                                (personFilter !== null ||
                                  objectFilter !== null) &&
                                !personMatches(p)
                              }
                              warning={p.weekConflict}
                              title={`${p.label} · ${p.hours !== null ? `${fmt.hours(p.hours)} h` : "?"} · ${p.places.map((pl) => pl.name).join(" · ") || "?"}`}
                            />
                          );
                        })}
                        {cell.people.length > shownPeople.length && (
                          <span className="font-mono text-meta text-text-muted">
                            +{cell.people.length - shownPeople.length}
                          </span>
                        )}
                      </span>
                      {/* HOW MUCH — the day's hours as a density bar along the foot */}
                      <span
                        aria-hidden
                        className="mt-auto block h-1 w-full rounded-full bg-ink-700/80"
                      >
                        <span
                          className={cn(
                            "block h-full rounded-full",
                            cell.isSelected
                              ? "bg-brand-blue"
                              : "bg-brand-cyan/70",
                          )}
                          style={{
                            width: `${Math.max(3, (cell.hours / maxDayHours) * 100)}%`,
                          }}
                        />
                      </span>
                    </>
                  )}
                  {worked && scale === "week" && (
                    <span className="flex flex-col gap-1.5" aria-hidden>
                      {shownPeople.map((p) => {
                        const primary = primaryPlace(p);
                        const lit = personMatches(p);
                        return (
                          <span
                            key={p.label}
                            className={cn(
                              "flex flex-col gap-0.5 transition-opacity duration-fast",
                              !lit &&
                                (personFilter !== null || objectFilter !== null)
                                ? "opacity-30"
                                : "",
                            )}
                            data-testid="historical-calendar-entry"
                          >
                            <span className="flex items-center gap-1.5">
                              <PersonMark
                                label={p.label}
                                size="xs"
                                lit={personFilter === p.label}
                              />
                              <span className="min-w-0 flex-1 truncate text-meta font-semibold text-text-primary">
                                {p.label}
                              </span>
                              <span className="font-mono text-meta tabular-nums text-text-secondary">
                                {p.hours !== null
                                  ? `${fmt.hours(p.hours)} h`
                                  : "?"}
                              </span>
                            </span>
                            {p.places.map((pl) => (
                              <PlaceMark
                                key={pl.name}
                                name={pl.name}
                                figure={
                                  pl.hours !== null
                                    ? fmt.hours(pl.hours)
                                    : p.places.length === 1 && p.hours !== null
                                      ? fmt.hours(p.hours)
                                      : "?"
                                }
                                lit={objectFilter === pl.name}
                                dim={objectFilter !== null}
                                dense
                                label={labels.object}
                              />
                            ))}
                            {primary === null && (
                              <UnknownToken what={labels.unplaced} />
                            )}
                          </span>
                        );
                      })}
                      {cell.people.length > shownPeople.length && (
                        <span className="font-mono text-meta text-text-muted">
                          +{cell.people.length - shownPeople.length}{" "}
                          {labels.people}
                        </span>
                      )}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          <p className="flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-meta text-text-muted">
            <span className="inline-flex items-center gap-1.5">
              <span
                aria-hidden
                className="h-1 w-5 rounded-full bg-brand-cyan/70"
              />
              <SemanticIcon
                concept="historical"
                label={labels.actual}
                className="h-3 w-3"
              />
              <span aria-hidden>
                {labels.actual} · {labels.performed}
              </span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span
                aria-hidden
                className="inline-block h-3 w-3 rounded-full outline outline-2 outline-dashed outline-text-muted/60"
              />
              {labels.hoursUnknown}
            </span>
            <span className="tabular-nums">
              {grid.workedDays} {labels.days}
            </span>
          </p>
        </>
      ) : (
        <WeekTable calendar={calendar} labels={labels} fmt={fmt} />
      )}

      {/* APART — period aggregates: on no day, in no total */}
      {calendar.aggregates.length > 0 && (
        <ul
          className="flex flex-wrap gap-2"
          data-testid="evidence-calendar-aggregates"
          aria-label={labels.apart}
        >
          {calendar.aggregates.map((a, i) => (
            <li
              key={`${a.label}:${a.recordedOn}:${i}`}
              className="inline-flex flex-wrap items-center gap-2 rounded-2xl border border-state-amber/40 py-1 pl-1 pr-3 font-mono text-meta tabular-nums text-text-secondary"
              data-testid="evidence-calendar-aggregate"
              data-open={a.open ? "true" : "false"}
            >
              <PersonMark label={a.label} size="sm" />
              <span className="text-text-primary">{a.label}</span>
              <span className="font-display text-support font-bold text-state-amber">
                {labels.sum} {fmt.hours(a.sourceHours)} h
              </span>
              <span className="inline-flex items-center gap-1">
                <SemanticIcon
                  concept="time"
                  label={labels.periodUnknown}
                  className="h-3 w-3"
                />
                {a.periodStart
                  ? `${fmt.day(a.periodStart)} – ${fmt.day(a.periodEnd ?? a.periodStart)}`
                  : "?"}
              </span>
              <span
                className="inline-flex items-center gap-1"
                title={labels.remote}
              >
                <SemanticIcon
                  concept="remote"
                  label={labels.remote}
                  className="h-3 w-3"
                />
                {a.remote === true ? "✓" : a.remote === false ? "✕" : "?"}
              </span>
              {a.open && (
                <span
                  className="inline-flex items-center gap-1 text-brand-orange"
                  title={labels.open}
                >
                  <SemanticIcon
                    concept="warning"
                    label={labels.open}
                    className="h-3 w-3"
                  />
                </span>
              )}
              {/* DERIVED — the even monthly share of a CONFIRMED period
                  (owner 2026-09-17). Beside the aggregate, in the apart band,
                  on no day and in no total; absent while the period is open. */}
              {!a.open && (
                <PeriodMonthlyShare
                  hours={a.sourceHours}
                  periodStart={a.periodStart}
                  periodEnd={a.periodEnd}
                  label={labels.monthlyShare}
                  className="flex basis-full flex-col gap-0.5 pl-1"
                />
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** The optional REPORT view: week × person, the same figures. */
function WeekTable({
  calendar,
  labels,
  fmt,
}: {
  calendar: CalendarProjection;
  labels: HistoricalCalendarLabels;
  fmt: { hours: (n: number) => string; day: (iso: string) => string };
}) {
  return (
    <div className="overflow-x-auto" data-testid="historical-calendar-table">
      <table className="w-full border-collapse text-meta">
        <thead>
          <tr className="border-b border-ink-500 text-left">
            <th className="px-2 py-1 font-mono uppercase tracking-label text-text-muted">
              {labels.weekShort}
            </th>
            {calendar.people.map((p) => (
              <th
                key={p}
                className="px-2 py-1 font-mono uppercase tracking-label text-text-muted"
              >
                {p}
              </th>
            ))}
            <th className="px-2 py-1 text-right font-mono uppercase tracking-label text-text-muted">
              {labels.sum}
            </th>
          </tr>
        </thead>
        <tbody>
          {calendar.weeks.map((w) => {
            const byPerson = new Map<
              string,
              { hours: number; days: number; conflict: boolean }
            >();
            for (const d of w.days)
              for (const p of d.people) {
                const cur = byPerson.get(p.label) ?? {
                  hours: 0,
                  days: 0,
                  conflict: false,
                };
                byPerson.set(p.label, {
                  hours: cur.hours + (p.hours ?? 0),
                  days: cur.days + 1,
                  conflict: cur.conflict || p.weekConflict,
                });
              }
            return (
              <tr
                key={w.isoWeek}
                className="border-b border-ink-500/50"
                data-testid="evidence-calendar-week"
                data-week={w.isoWeek}
              >
                <td className="px-2 py-1 text-text-secondary">
                  {w.isoWeek}{" "}
                  <span className="text-text-muted">
                    {fmt.day(w.days[0].date)}
                  </span>
                </td>
                {calendar.people.map((p) => {
                  const c = byPerson.get(p);
                  return (
                    <td
                      key={p}
                      className={cn(
                        "px-2 py-1 tabular-nums",
                        c?.conflict ? "text-state-amber" : "text-text-primary",
                      )}
                    >
                      {c ? (
                        `${fmt.hours(c.hours)} h · ${c.days} d${c.conflict ? " ⚠" : ""}`
                      ) : (
                        <span className="text-text-muted">—</span>
                      )}
                    </td>
                  );
                })}
                <td className="px-2 py-1 text-right tabular-nums text-text-primary">
                  {fmt.hours(w.hours)} h
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** THE DAY — what actually happened on one date, as that day's FORMATION:
 *  each place of the day with the people who stood there (the hours the
 *  source attributes there, `?` when it did not split), the people with no
 *  recognisable place on the `?` lane, and the day's totals. Rendered in the
 *  workspace's detail slot for the calendar and the field alike. */
export function HistoricalDayReality({
  calendar,
  iso,
  locale,
  labels,
  personFilter,
  objectFilter,
  onSelectPerson,
  onSelectObject,
}: {
  calendar: CalendarProjection;
  iso: string;
  locale: string;
  labels: Pick<
    HistoricalCalendarLabels,
    | "hours"
    | "people"
    | "weekConflict"
    | "noWork"
    | "dayLabel"
    | "performed"
    | "object"
    | "hoursUnknown"
    | "unplaced"
    | "actual"
  >;
  personFilter?: string | null;
  objectFilter?: string | null;
  onSelectPerson: (label: string) => void;
  onSelectObject: (name: string) => void;
}) {
  const fmt = useMemo(() => {
    const num = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });
    const day = new Intl.DateTimeFormat(locale, {
      weekday: "long",
      day: "numeric",
      month: "long",
      timeZone: "UTC",
    });
    return {
      hours: (n: number) => num.format(n),
      day: (d: string) => day.format(new Date(`${d}T00:00:00Z`)),
    };
  }, [locale]);
  const day = useMemo(() => dayFormation(calendar, iso), [calendar, iso]);
  return (
    <section
      className="flex flex-col gap-4"
      data-testid="historical-day"
      data-day={iso}
    >
      <header className="flex flex-col gap-1">
        <h3 className="font-display text-card-title font-semibold text-text-primary">
          {fmt.day(iso)}
        </h3>
        {day && (
          <span className="flex items-center gap-3 font-mono text-meta tabular-nums text-text-secondary">
            <span className="inline-flex items-center gap-1">
              <SemanticIcon
                concept="historical"
                label={labels.actual}
                className="h-3 w-3"
              />
              {labels.actual}
            </span>
            <span>
              {day.people.length} {labels.people}
            </span>
            <span>{fmt.hours(day.hours)} h</span>
          </span>
        )}
      </header>
      {!day ? (
        <p className="text-support text-text-muted">{labels.noWork}</p>
      ) : (
        <ul className="flex flex-col gap-3" data-testid="historical-day-places">
          {day.places.map((pl, i) => (
            <li
              key={pl.name}
              className={cn("rise-in", "flex flex-col gap-1.5")}
              style={{ animationDelay: `${Math.min(240, i * 40)}ms` }}
              data-testid="historical-day-place"
              data-place={pl.name}
            >
              <button
                type="button"
                onClick={() => onSelectObject(pl.name)}
                aria-pressed={objectFilter === pl.name}
                className={cn(
                  "flex min-h-10 w-full items-center gap-2.5 rounded-md text-left transition-colors duration-fast hover:bg-ink-800/70",
                  objectFilter === pl.name ? "bg-brand-blue/10" : "",
                )}
              >
                <ObjectMark
                  name={pl.name}
                  size="sm"
                  lit={objectFilter === pl.name}
                  label={labels.object}
                />
                <span className="min-w-0 flex-1 truncate text-support font-semibold text-text-primary">
                  {pl.name}
                </span>
                <span className="font-mono text-meta tabular-nums text-text-muted">
                  {pl.people.length} {labels.people}
                </span>
              </button>
              <ul className="flex flex-col gap-1 pl-9">
                {pl.people.map((p) => (
                  <li
                    key={p.label}
                    data-testid="historical-day-person"
                    data-label={p.label}
                  >
                    <button
                      type="button"
                      onClick={() => onSelectPerson(p.label)}
                      aria-pressed={personFilter === p.label}
                      className={cn(
                        "flex min-h-9 w-full items-center gap-2 rounded-md text-left transition-colors duration-fast hover:bg-ink-800/70",
                        personFilter === p.label ? "bg-brand-blue/10" : "",
                      )}
                    >
                      <PersonToken
                        label={p.label}
                        hours={p.hours}
                        size="xs"
                        lit={personFilter === p.label}
                        warning={p.weekConflict}
                        title={`${p.label} · ${p.hours !== null ? `${fmt.hours(p.hours)} h` : `? ${labels.hoursUnknown}`}`}
                      />
                      <span className="flex-1 truncate text-support text-text-primary">
                        {p.label}
                      </span>
                      <span className="flex items-center gap-1 font-mono text-support tabular-nums text-text-primary">
                        {p.weekConflict && (
                          <SemanticIcon
                            concept="warning"
                            label={labels.weekConflict}
                            className="h-3.5 w-3.5 text-state-amber"
                          />
                        )}
                        {p.hours !== null ? (
                          `${fmt.hours(p.hours)} h`
                        ) : (
                          <UnknownToken what={labels.hoursUnknown} />
                        )}
                        {p.dayHours !== null && p.hours !== p.dayHours && (
                          <span className="text-meta text-text-muted">
                            / {fmt.hours(p.dayHours)}
                          </span>
                        )}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </li>
          ))}
          {day.unplaced.length > 0 && (
            <li
              className="rise-in flex flex-col gap-1.5"
              style={{
                animationDelay: `${Math.min(240, day.places.length * 40)}ms`,
              }}
              data-testid="historical-day-place"
              data-place="?"
            >
              <span className="flex min-h-10 items-center gap-2.5">
                <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-dashed border-ink-500 text-text-muted">
                  <SemanticIcon
                    concept="unknown"
                    label={labels.unplaced}
                    className="h-3.5 w-3.5"
                  />
                </span>
                <span className="flex-1 truncate text-support text-text-secondary">
                  {labels.unplaced}
                </span>
              </span>
              <ul className="flex flex-col gap-1 pl-9">
                {day.unplaced.map((p) => (
                  <li
                    key={p.label}
                    data-testid="historical-day-person"
                    data-label={p.label}
                  >
                    <button
                      type="button"
                      onClick={() => onSelectPerson(p.label)}
                      className="flex min-h-9 w-full items-center gap-2 rounded-md text-left hover:bg-ink-800/70"
                    >
                      <PersonToken
                        label={p.label}
                        hours={p.hours}
                        size="xs"
                        lit={personFilter === p.label}
                        title={`${p.label} · ${p.hours !== null ? `${fmt.hours(p.hours)} h` : "?"}`}
                      />
                      <span className="flex-1 truncate text-support text-text-primary">
                        {p.label}
                      </span>
                      <span className="font-mono text-support tabular-nums text-text-primary">
                        {p.hours !== null ? `${fmt.hours(p.hours)} h` : "?"}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </li>
          )}
        </ul>
      )}
    </section>
  );
}
