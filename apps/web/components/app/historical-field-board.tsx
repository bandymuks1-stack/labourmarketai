"use client";

import { useMemo } from "react";

import { PersonMark, PlaceMark } from "@/components/app/historical/historical-marks";
import { SemanticIcon } from "@/components/app/semantic-icon";
import type { CalendarProjection, FieldProjection } from "@/lib/organization-evidence/import-projections";
import { fieldPeriodView, fieldWeekView } from "@/lib/organization-evidence/import-visual";
import { cn } from "@/lib/utils";

/**
 * THE HISTORICAL FIELD — who was WHERE and WHEN, as a field of people in time
 * (LABOURMARKET_VISUAL_FIRST constitution 2026-09-16 §T, §BE; owner
 * correction 2026-09-17: "avatar, time position, place marker and duration
 * communicate the state; codes and legends are secondary").
 *
 * PEOPLE are the actors: one row per person evidenced in the selected time,
 * headed by their identity mark. TIME is the field's width: the seven days
 * of the selected week, or the ISO weeks of the whole period. PLACES fill a
 * cell as place marks — the location glyph and the NAME, with the hours the
 * source attributes there or `?` when it never split them. No code is
 * needed to read the field; the monogram lives in the tooltip only. An
 * empty cell is an absence of evidence, never zero work.
 *
 * ONE field, three dials owned by the workspace: WEEK changes the columns;
 * PERSON lights a row and dims the others; PLACE lights every mark of that
 * place and dims the rest.
 *
 * Nothing here is a team, a membership, a plan or a booking: the field says
 * "historical group ≠ team" in one token, the sentence behind it, and the
 * projection it reads carries no membership (ARCH-4). Read-only: client
 * state over server-computed data, no fetch, no action, no write.
 */

export interface FieldBoardLabels {
  readonly title: string;
  readonly allWeeks: string;
  readonly week: string;
  readonly noWork: string;
  readonly hoursUnknown: string;
  readonly days: string;
  readonly hours: string;
  readonly clear: string;
  readonly notATeam: string;
  readonly notATeamWhy: string;
  readonly person: string;
  readonly object: string;
  readonly legend: string;
  readonly weekConflict: string;
}

export interface FieldSelection {
  readonly week: number | "all";
  readonly person: string | null;
  readonly object: string | null;
}

export function HistoricalFieldBoard({
  calendar,
  field,
  labels,
  locale,
  selection,
  onSelectWeek,
  onSelectPerson,
  onSelectObject,
}: {
  calendar: CalendarProjection;
  field: FieldProjection;
  labels: FieldBoardLabels;
  /**
   * The locale, NOT formatter functions. This is a Client Component: every
   * prop crosses the server→client boundary and must be serialisable. Passing
   * formatter functions from a server component threw "Functions cannot be
   * passed directly to Client Components" on production (build f3e090ef) and
   * the whole history door fell to the error fallback. Formatters are built
   * here, from the locale.
   */
  locale: string;
  selection: FieldSelection;
  onSelectWeek: (week: number | "all") => void;
  onSelectPerson: (label: string | null) => void;
  onSelectObject: (name: string | null) => void;
}) {
  const { formatDay, formatWeekday, formatHours } = useMemo(() => {
    const day = new Intl.DateTimeFormat(locale, { day: "numeric", month: locale === "lt" ? "long" : "short", timeZone: "UTC" });
    const weekday = new Intl.DateTimeFormat(locale, { weekday: "short", timeZone: "UTC" });
    const num = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });
    const parse = (iso: string) => new Date(`${iso}T00:00:00Z`);
    return {
      formatDay: (iso: string) => day.format(parse(iso)),
      formatWeekday: (iso: string) => weekday.format(parse(iso)).replace(/\.$/, ""),
      formatHours: (n: number) => num.format(n),
    };
  }, [locale]);

  const { week, person, object } = selection;
  const weekView = useMemo(() => (week === "all" ? null : fieldWeekView(calendar, week)), [calendar, week]);
  const periodView = useMemo(() => (week === "all" ? fieldPeriodView(field) : null), [field, week]);
  const maxWeekHours = Math.max(1, ...field.weeks.map((w) => w.hours));

  const togglePerson = (label: string) => onSelectPerson(person === label ? null : label);
  const toggleObject = (name: string) => onSelectObject(object === name ? null : name);

  const rows = weekView?.rows ?? periodView?.rows ?? [];
  const columns: readonly { key: string; head: string; sub: string | null }[] = weekView
    ? weekView.days.map((iso) => ({ key: iso, head: formatWeekday(iso), sub: String(Number(iso.slice(8, 10))) }))
    : (periodView?.weeks ?? []).map((w) => ({ key: String(w), head: `${labels.week} ${w}`, sub: null }));
  const currentWeek = week === "all" ? null : field.weeks.find((w) => w.isoWeek === week);

  return (
    <section className="flex flex-col gap-3" data-testid="historical-field-board" data-week={String(week)} aria-label={labels.title}>
      {/* TIME — the week dial: one chip per ISO week, its rhythm as the bar */}
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div className="flex flex-wrap items-end gap-1" role="group" aria-label={labels.week}>
          <button
            type="button"
            onClick={() => onSelectWeek("all")}
            aria-pressed={week === "all"}
            data-testid="field-week-all"
            className={cn(
              "inline-flex min-h-11 items-center rounded-md border px-3 font-mono text-meta uppercase tracking-label",
              week === "all" ? "border-brand-blue bg-brand-blue/10 text-text-primary" : "border-ink-600 text-text-secondary hover:border-brand-blue",
            )}
          >
            {labels.allWeeks}
          </button>
          {field.weeks.map((w) => (
            <button
              key={w.isoWeek}
              type="button"
              onClick={() => onSelectWeek(w.isoWeek)}
              aria-pressed={week === w.isoWeek}
              data-testid="field-week"
              data-iso-week={w.isoWeek}
              title={`${formatDay(w.firstDate)} – ${formatDay(w.lastDate)} · ${formatHours(w.hours)} h`}
              className={cn(
                "flex min-h-11 min-w-11 flex-col items-center justify-end gap-1 rounded-md border px-2 pb-1 pt-1.5 font-mono text-meta tabular-nums",
                week === w.isoWeek ? "border-brand-blue bg-brand-blue/10 text-text-primary" : "border-ink-600 text-text-secondary hover:border-brand-blue",
              )}
            >
              <span aria-hidden className="w-4 rounded-t-[1px] bg-brand-cyan/70" style={{ height: `${Math.max(2, Math.round((w.hours / maxWeekHours) * 14))}px` }} />
              <span>{w.isoWeek}</span>
            </button>
          ))}
        </div>
        {currentWeek && (
          <span className="font-display text-card-title font-semibold text-text-primary" data-testid="field-scope">
            {formatDay(currentWeek.firstDate)} – {formatDay(currentWeek.lastDate)}
          </span>
        )}
      </div>

      {/* THE FIELD — rows of people, columns of time, place marks in the cells */}
      {rows.length === 0 ? (
        <p className="text-support text-text-muted">{labels.noWork}</p>
      ) : (
        <div className="flex flex-col gap-1.5" role="table" aria-label={labels.title} data-testid="field-grid">
          <div className="flex flex-col gap-1 md:flex-row md:items-end" role="row">
            <div className="hidden w-48 shrink-0 md:block" role="columnheader" aria-label={labels.person} />
            <div className="grid flex-1 gap-1.5" style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(0, 1fr))` }}>
              {columns.map((c) => (
                <div key={c.key} role="columnheader" className="flex items-baseline justify-center gap-1 border-b border-ink-600 pb-1">
                  <span className="font-mono text-meta uppercase tracking-label text-text-muted">{c.head}</span>
                  {c.sub && <span className="font-display text-support font-semibold text-text-primary">{c.sub}</span>}
                </div>
              ))}
            </div>
          </div>
          {rows.map((r) => {
            const rowLit = person === r.label;
            const rowDim = person !== null && !rowLit;
            const cells = r.cells as readonly (
              | { hours: number | null; days?: number; places: readonly { name: string; hours?: number | null; days?: number }[]; weekConflict?: boolean }
              | null
            )[];
            return (
              <div
                key={r.label}
                role="row"
                className={cn("flex flex-col gap-1 rounded-md md:flex-row md:items-stretch", rowLit ? "bg-brand-blue/5" : "", rowDim ? "opacity-35" : "")}
                data-testid="field-row"
                data-person={r.label}
              >
                <button
                  type="button"
                  role="rowheader"
                  onClick={() => togglePerson(r.label)}
                  aria-pressed={rowLit}
                  data-testid="field-person"
                  data-label={r.label}
                  className={cn(
                    "flex min-h-11 w-full items-center gap-2.5 rounded-md border px-2 text-left md:w-48 md:shrink-0",
                    rowLit ? "border-brand-blue" : "border-transparent hover:border-ink-500",
                  )}
                >
                  <PersonMark label={r.label} size="md" lit={rowLit} />
                  <span className="flex min-w-0 flex-col leading-tight">
                    <span className="truncate text-support font-semibold text-text-primary">{r.label}</span>
                    <span className="font-mono text-meta tabular-nums text-text-muted">
                      {r.days} {labels.days} · {formatHours(r.hours)} h
                    </span>
                  </span>
                  <span className="sr-only">{labels.person}</span>
                </button>
                <div className="grid flex-1 gap-1.5" style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(0, 1fr))` }}>
                  {cells.map((c, i) => (
                    <div
                      key={columns[i]?.key ?? i}
                      role="cell"
                      className={cn("flex min-h-12 flex-col gap-1 rounded-md p-1", c ? "bg-ink-800/60" : "")}
                      data-testid="field-cell"
                    >
                      {c ? (
                        <>
                          {c.places.map((p) => (
                            <button
                              key={p.name}
                              type="button"
                              onClick={() => toggleObject(p.name)}
                              aria-pressed={object === p.name}
                              data-testid="field-place"
                              data-place={p.name}
                              className="flex w-full min-w-0 rounded text-left"
                            >
                              <PlaceMark
                                name={p.name}
                                figure={p.days !== undefined ? `${p.days} d` : p.hours !== null && p.hours !== undefined ? formatHours(p.hours) : "?"}
                                lit={object === p.name}
                                dim={object !== null}
                                dense
                                label={labels.object}
                                className="w-full"
                              />
                            </button>
                          ))}
                          <span className="mt-auto flex items-center justify-end gap-1 font-mono text-meta tabular-nums text-text-secondary">
                            {c.weekConflict && <SemanticIcon concept="warning" label={labels.weekConflict} className="h-3 w-3 text-state-amber" />}
                            {c.hours !== null ? `${formatHours(c.hours)} h` : <span title={labels.hoursUnknown}>?</span>}
                          </span>
                        </>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* the one thing the field is NOT — a token, the sentence behind it */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="inline-flex items-center gap-1 rounded-full border border-ink-600 px-2 py-0.5 font-mono text-meta uppercase tracking-label text-text-muted" data-testid="field-not-a-team" title={labels.notATeamWhy}>
          <SemanticIcon concept="team" label={labels.notATeam} className="h-3 w-3" />
          {labels.notATeam}
        </span>
        {(person || object) && (
          <button type="button" onClick={() => { onSelectPerson(null); onSelectObject(null); }} className="min-h-11 font-mono text-meta uppercase tracking-label text-text-secondary underline" data-testid="field-clear">
            {labels.clear}
          </button>
        )}
      </div>
    </section>
  );
}
