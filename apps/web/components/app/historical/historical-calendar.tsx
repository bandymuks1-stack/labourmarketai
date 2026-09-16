"use client";

import { useMemo } from "react";

import { SemanticIcon } from "@/components/app/semantic-icon";
import {
  playerInitials,
  PLAYER_IDENTITY_AVATAR_BORDER,
  PLAYER_IDENTITY_FALLBACK_SURFACE,
} from "@/lib/identity/player-identity";
import { WEEKDAY_ANCHOR_ISO } from "@/lib/journal/journal-calendar";
import type { CalendarProjection } from "@/lib/organization-evidence/import-projections";
import {
  buildHistoricalCalendar,
  objectMonogram,
  type HistoricalCalendarScale,
} from "@/lib/organization-evidence/import-visual";
import { cn } from "@/lib/utils";

/**
 * THE HISTORICAL CALENDAR — a calendar that IS a calendar
 * (LABOURMARKET_VISUAL_FIRST constitution 2026-09-16 §P–§Q, §BF).
 *
 * Month or week, Monday first, real dates in real positions; on each day the
 * people evidenced working (their identity tiles) and the day's daily hours.
 * Selecting a day opens that day's actual reality in the workspace's detail
 * slot — who, at which places, how many hours where the source split them,
 * `?` where it did not. This is PERFORMED work: the past state of the
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
  readonly remote: string;
  readonly open: string;
  readonly weekConflict: string;
  readonly performed: string;
  readonly noWork: string;
  readonly dayLabel: string;
  readonly sum: string;
}

const TILE = cn("flex shrink-0 items-center justify-center rounded-full font-display font-semibold", PLAYER_IDENTITY_AVATAR_BORDER, PLAYER_IDENTITY_FALLBACK_SURFACE);

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
    const month = new Intl.DateTimeFormat(locale, { month: "long", year: "numeric", timeZone: "UTC" });
    const day = new Intl.DateTimeFormat(locale, { day: "numeric", month: locale === "lt" ? "long" : "short", timeZone: "UTC" });
    const weekday = new Intl.DateTimeFormat(locale, { weekday: "short", timeZone: "UTC" });
    const num = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });
    return {
      month: (iso: string) => month.format(parse(iso)),
      day: (iso: string) => day.format(parse(iso)),
      weekday: (iso: string) => weekday.format(parse(iso)).replace(/\.$/, "").slice(0, 2),
      hours: (n: number) => num.format(n),
    };
  }, [locale]);

  const grid = useMemo(() => buildHistoricalCalendar({ calendar, scale, anchor, selected: selectedDay }), [calendar, scale, anchor, selectedDay]);
  const periodLabel = scale === "week" ? `${fmt.day(grid.rangeStart)} – ${fmt.day(grid.rangeEnd)}` : fmt.month(grid.anchor);

  const dayMatches = (people: readonly { label: string; places: readonly { name: string }[] }[]) => {
    if (personFilter && !people.some((p) => p.label === personFilter)) return false;
    if (objectFilter && !people.some((p) => p.places.some((pl) => pl.name === objectFilter))) return false;
    return true;
  };

  return (
    <section className="flex flex-col gap-3" data-testid="historical-calendar" data-scale={scale} data-anchor={grid.anchor} data-view={view} aria-label={labels.title}>
      {/* period · scale · optional table */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => grid.prevAnchor && onAnchor(grid.prevAnchor)} disabled={!grid.prevAnchor} aria-label={labels.prev} data-testid="historical-calendar-prev" className="inline-flex size-11 items-center justify-center rounded-md border border-ink-500 text-text-secondary hover:border-brand-blue disabled:opacity-30">‹</button>
          <span className="min-w-40 text-center font-display text-card-title font-semibold text-text-primary" data-testid="historical-calendar-period">{periodLabel}</span>
          <button type="button" onClick={() => grid.nextAnchor && onAnchor(grid.nextAnchor)} disabled={!grid.nextAnchor} aria-label={labels.next} data-testid="historical-calendar-next" className="inline-flex size-11 items-center justify-center rounded-md border border-ink-500 text-text-secondary hover:border-brand-blue disabled:opacity-30">›</button>
        </div>
        <div className="flex items-center gap-1" role="group" aria-label={labels.calendar}>
          {(["month", "week"] as const).map((s) => (
            <button key={s} type="button" onClick={() => { onView("calendar"); onScale(s); }} aria-pressed={view === "calendar" && scale === s} data-testid={`historical-calendar-scale-${s}`} className={cn("inline-flex min-h-11 items-center rounded-full border px-3 font-mono text-meta uppercase tracking-label", view === "calendar" && scale === s ? "border-brand-blue bg-brand-blue/10 text-text-primary" : "border-ink-500 text-text-secondary hover:border-brand-blue")}>
              {s === "month" ? labels.month : labels.week}
            </button>
          ))}
          <button type="button" onClick={() => onView("table")} aria-pressed={view === "table"} data-testid="historical-calendar-view-table" className={cn("inline-flex min-h-11 items-center gap-1 rounded-full border px-3 font-mono text-meta uppercase tracking-label", view === "table" ? "border-brand-blue bg-brand-blue/10 text-text-primary" : "border-ink-500 text-text-secondary hover:border-brand-blue")}>
            <SemanticIcon concept="source" label={labels.table} className="h-3 w-3" />
            {labels.table}
          </button>
        </div>
      </div>

      {view === "calendar" ? (
        <>
          <div className="grid grid-cols-7 gap-1" role="grid" aria-label={labels.title} data-testid="historical-calendar-grid">
            {WEEKDAY_ANCHOR_ISO.map((iso) => (
              <span key={iso} aria-hidden className="py-1 text-center font-mono text-meta uppercase tracking-label text-text-muted">{fmt.weekday(iso)}</span>
            ))}
            {grid.weeks.flat().map((cell) => {
              const worked = cell.people.length > 0;
              const lit = worked && dayMatches(cell.people);
              const dimmed = worked && !lit;
              const state = cell.isSelected ? "selected" : worked ? "worked" : cell.inPeriod ? "empty" : "outside";
              const title = `${fmt.day(cell.iso)}${worked ? ` · ${cell.people.length} ${labels.people} · ${fmt.hours(cell.hours)} h` : ""}`;
              if (!cell.inScope) {
                return <span key={cell.iso} aria-hidden data-testid="historical-calendar-day" data-day={cell.iso} data-state="outside" className="min-h-14 rounded-md text-center font-mono text-meta text-text-muted/30">{cell.dayOfMonth}</span>;
              }
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
                    "flex min-h-14 flex-col gap-1 rounded-md border p-1 text-left transition-colors sm:min-h-[4.5rem]",
                    cell.isSelected ? "border-brand-blue bg-brand-blue/15" : worked ? "border-brand-cyan/30 bg-brand-cyan/5 hover:border-brand-blue" : cell.inPeriod ? "border-ink-600/60" : "border-transparent",
                    dimmed && !cell.isSelected ? "opacity-30" : "",
                  )}
                >
                  <span className="flex items-center justify-between font-mono text-meta tabular-nums">
                    <span className={worked ? "text-text-primary" : "text-text-muted"}>{cell.dayOfMonth}</span>
                    {worked && (
                      <span className="flex items-center gap-0.5 text-text-secondary">
                        {cell.weekConflict && <SemanticIcon concept="warning" label={labels.weekConflict} className="h-3 w-3 text-state-amber" />}
                        {cell.hours > 0 ? fmt.hours(cell.hours) : "?"}
                      </span>
                    )}
                  </span>
                  {worked && (
                    <span className="flex flex-wrap gap-0.5" aria-hidden>
                      {cell.people.slice(0, 6).map((p) => (
                        <span key={p.label} className={cn(TILE, "h-5 w-5 text-meta", personFilter === p.label ? "ring-1 ring-brand-blue" : "")} title={`${p.label} · ${p.hours !== null ? `${fmt.hours(p.hours)} h` : "?"}`}>{playerInitials(p.label)}</span>
                      ))}
                      {cell.people.length > 6 && <span className="font-mono text-meta text-text-muted">+{cell.people.length - 6}</span>}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-meta text-text-muted">
            <span className="inline-flex items-center gap-1">
              <span aria-hidden className="h-2.5 w-4 rounded-sm border border-brand-cyan/40 bg-brand-cyan/10" />
              {labels.performed}
            </span>
            <span className="tabular-nums">{grid.workedDays} {labels.days}</span>
          </p>
        </>
      ) : (
        <WeekTable calendar={calendar} labels={labels} fmt={fmt} />
      )}

      {/* APART — period aggregates: on no day, in no total */}
      {calendar.aggregates.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" data-testid="evidence-calendar-aggregates" aria-label={labels.apart}>
          {calendar.aggregates.map((a, i) => (
            <li key={`${a.label}:${a.recordedOn}:${i}`} className="inline-flex items-center gap-2 rounded-md border border-state-amber/40 bg-state-amber/5 px-2 py-1 font-mono text-meta tabular-nums text-text-secondary" data-testid="evidence-calendar-aggregate" data-open={a.open ? "true" : "false"}>
              <span aria-hidden className={cn(TILE, "h-5 w-5 text-meta")}>{playerInitials(a.label)}</span>
              <span className="text-text-primary">{a.label}</span>
              <span className="font-display text-support font-bold text-state-amber">{labels.sum} {fmt.hours(a.sourceHours)} h</span>
              <span className="inline-flex items-center gap-1">
                <SemanticIcon concept="time" label={labels.periodUnknown} className="h-3 w-3" />
                {a.periodStart ? `${fmt.day(a.periodStart)} – ${fmt.day(a.periodEnd ?? a.periodStart)}` : "?"}
              </span>
              <span className="inline-flex items-center gap-1" title={labels.remote}>
                <SemanticIcon concept="remote" label={labels.remote} className="h-3 w-3" />
                {a.remote === true ? "✓" : a.remote === false ? "✕" : "?"}
              </span>
              {a.open && (
                <span className="inline-flex items-center gap-1 text-brand-orange" title={labels.open}>
                  <SemanticIcon concept="warning" label={labels.open} className="h-3 w-3" />
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** The optional REPORT view: week × person, the same figures. */
function WeekTable({ calendar, labels, fmt }: { calendar: CalendarProjection; labels: HistoricalCalendarLabels; fmt: { hours: (n: number) => string; day: (iso: string) => string } }) {
  return (
    <div className="overflow-x-auto" data-testid="historical-calendar-table">
      <table className="w-full border-collapse text-meta">
        <thead>
          <tr className="border-b border-ink-500 text-left">
            <th className="px-2 py-1 font-mono uppercase tracking-label text-text-muted">{labels.weekShort}</th>
            {calendar.people.map((p) => (
              <th key={p} className="px-2 py-1 font-mono uppercase tracking-label text-text-muted">{p}</th>
            ))}
            <th className="px-2 py-1 text-right font-mono uppercase tracking-label text-text-muted">{labels.sum}</th>
          </tr>
        </thead>
        <tbody>
          {calendar.weeks.map((w) => {
            const byPerson = new Map<string, { hours: number; days: number; conflict: boolean }>();
            for (const d of w.days) for (const p of d.people) {
              const cur = byPerson.get(p.label) ?? { hours: 0, days: 0, conflict: false };
              byPerson.set(p.label, { hours: cur.hours + (p.hours ?? 0), days: cur.days + 1, conflict: cur.conflict || p.weekConflict });
            }
            return (
              <tr key={w.isoWeek} className="border-b border-ink-500/50" data-testid="evidence-calendar-week" data-week={w.isoWeek}>
                <td className="px-2 py-1 text-text-secondary">{w.isoWeek} <span className="text-text-muted">{fmt.day(w.days[0].date)}</span></td>
                {calendar.people.map((p) => {
                  const c = byPerson.get(p);
                  return (
                    <td key={p} className={cn("px-2 py-1 tabular-nums", c?.conflict ? "text-state-amber" : "text-text-primary")}>
                      {c ? `${fmt.hours(c.hours)} h · ${c.days} d${c.conflict ? " ⚠" : ""}` : <span className="text-text-muted">—</span>}
                    </td>
                  );
                })}
                <td className="px-2 py-1 text-right tabular-nums text-text-primary">{fmt.hours(w.hours)} h</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** THE DAY — what actually happened on one date: each person, their places
 *  with the hours the source attributes there (`?` when it did not split),
 *  and their day total. Rendered in the workspace's detail slot. */
export function HistoricalDayReality({
  calendar,
  iso,
  locale,
  labels,
  onSelectPerson,
  onSelectObject,
}: {
  calendar: CalendarProjection;
  iso: string;
  locale: string;
  labels: Pick<HistoricalCalendarLabels, "hours" | "people" | "weekConflict" | "noWork" | "dayLabel" | "performed">;
  onSelectPerson: (label: string) => void;
  onSelectObject: (name: string) => void;
}) {
  const fmt = useMemo(() => {
    const num = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });
    const day = new Intl.DateTimeFormat(locale, { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
    return { hours: (n: number) => num.format(n), day: (d: string) => day.format(new Date(`${d}T00:00:00Z`)) };
  }, [locale]);
  const day = calendar.weeks.flatMap((w) => w.days).find((d) => d.date === iso);
  const total = day ? day.people.reduce((s, p) => s + (p.hours ?? 0), 0) : 0;
  return (
    <section className="flex flex-col gap-3" data-testid="historical-day" data-day={iso}>
      <header className="flex items-baseline justify-between gap-2">
        <h3 className="font-display text-card-title font-semibold text-text-primary">{fmt.day(iso)}</h3>
        {day && (
          <span className="font-mono text-meta tabular-nums text-text-secondary">
            {day.people.length} {labels.people} · {fmt.hours(total)} h
          </span>
        )}
      </header>
      {!day ? (
        <p className="text-support text-text-muted">{labels.noWork}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {day.people.map((p) => (
            <li key={p.label} className="flex flex-col gap-1 rounded-md border border-ink-600 bg-ink-800/40 p-2" data-testid="historical-day-person" data-label={p.label}>
              <button type="button" onClick={() => onSelectPerson(p.label)} className="flex min-h-11 items-center gap-2 text-left">
                <span aria-hidden className={cn(TILE, "h-8 w-8 text-meta")}>{playerInitials(p.label)}</span>
                <span className="flex-1 truncate text-support font-semibold text-text-primary">{p.label}</span>
                <span className="flex items-center gap-1 font-display text-card-title font-bold tabular-nums text-text-primary">
                  {p.weekConflict && <SemanticIcon concept="warning" label={labels.weekConflict} className="h-3.5 w-3.5 text-state-amber" />}
                  {p.hours !== null ? fmt.hours(p.hours) : "?"}
                  <span className="font-mono text-meta font-normal text-text-muted">h</span>
                </span>
              </button>
              {p.places.length > 0 && (
                <ul className="flex flex-col gap-0.5 pl-10">
                  {p.places.map((pl) => (
                    <li key={pl.name}>
                      <button type="button" onClick={() => onSelectObject(pl.name)} className="flex min-h-8 w-full items-center gap-2 text-left font-mono text-meta tabular-nums">
                        <span className="w-8 shrink-0 font-semibold text-text-secondary">{objectMonogram(pl.name)}</span>
                        <span className="flex-1 truncate text-text-primary">{pl.name}</span>
                        <span className="text-text-secondary">{pl.hours !== null ? `${fmt.hours(pl.hours)} h` : "?"}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
