"use client";

import { useMemo } from "react";

import { SemanticIcon } from "@/components/app/semantic-icon";
import {
  playerInitials,
  PLAYER_IDENTITY_AVATAR_BORDER,
  PLAYER_IDENTITY_FALLBACK_SURFACE,
} from "@/lib/identity/player-identity";
import type { CalendarProjection, FieldProjection } from "@/lib/organization-evidence/import-projections";
import { fieldPeriodView, fieldWeekView, objectMonogram } from "@/lib/organization-evidence/import-visual";
import { cn } from "@/lib/utils";

/**
 * THE HISTORICAL FIELD — who was WHERE and WHEN, as a field of people in time
 * (LABOURMARKET_VISUAL_FIRST constitution 2026-09-16 §T, §BE).
 *
 * PEOPLE are the actors: one row per person evidenced in the selected time,
 * headed by their compact identity. TIME is the field's width: the seven days
 * of the selected week, or the ISO weeks of the whole period. OBJECTS are
 * what fills a cell: the place marks (monogram, full name on hover and in
 * the legend) the source puts the person at on that day, with the hours the
 * source attributes to each when it does — `?` when it does not. An empty
 * cell is an absence of evidence, never zero work.
 *
 * ONE field, three dials: WEEK changes the columns; PERSON focuses a row and
 * dims the others; OBJECT lights every mark of that place and dims the rest.
 * The dials are owned by the workspace, so the same selection survives a
 * switch to the calendar, the objects or the people.
 *
 * Nothing here is a team, a membership, a plan or a booking: the field says
 * "historical group ≠ team" in a token, and the projection it reads carries
 * no membership (ARCH-4). Read-only: client state over server-computed data,
 * no fetch, no action, no write. Same identity tile as the player card.
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

const TILE = cn("flex shrink-0 items-center justify-center rounded-full font-display font-semibold", PLAYER_IDENTITY_AVATAR_BORDER, PLAYER_IDENTITY_FALLBACK_SURFACE);

/** A place mark inside a cell: monogram + hours when known. A button — it
 *  selects the object across the whole field. */
function PlaceMark({
  name,
  monogram,
  hours,
  days,
  lit,
  dim,
  onSelect,
  labels,
  formatHours,
}: {
  name: string;
  monogram: string;
  hours: number | null;
  days?: number;
  lit: boolean;
  dim: boolean;
  onSelect: () => void;
  labels: FieldBoardLabels;
  formatHours: (n: number) => string;
}) {
  const detail = `${name}${days !== undefined ? ` · ${days} ${labels.days}` : ""}${hours !== null ? ` · ${formatHours(hours)} h` : ` · ${labels.hoursUnknown}`}`;
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={lit}
      title={detail}
      data-testid="field-place"
      data-place={name}
      className={cn(
        "inline-flex min-h-6 items-center gap-1 rounded border px-1 font-mono text-meta leading-none tabular-nums transition-colors",
        lit ? "border-brand-blue bg-brand-blue/15 text-text-primary" : "border-ink-600 bg-ink-900 text-text-secondary hover:border-brand-blue",
        dim && !lit ? "opacity-30" : "",
      )}
    >
      <span className="font-semibold">{monogram}</span>
      {days !== undefined ? <span className="text-text-muted">{days}</span> : hours !== null ? <span className="text-text-muted">{formatHours(hours)}</span> : <span className="text-text-muted">?</span>}
      <span className="sr-only">{detail}</span>
    </button>
  );
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

  // The legend lists only the places on the field right now.
  const legend = useMemo(() => {
    const names = new Set<string>();
    if (weekView) for (const r of weekView.rows) for (const c of r.cells) if (c) for (const p of c.places) names.add(p.name);
    if (periodView) for (const r of periodView.rows) for (const c of r.cells) if (c) for (const p of c.places) names.add(p.name);
    return [...names].sort((a, b) => a.localeCompare(b)).map((name) => ({ name, monogram: objectMonogram(name) }));
  }, [weekView, periodView]);

  const togglePerson = (label: string) => onSelectPerson(person === label ? null : label);
  const toggleObject = (name: string) => onSelectObject(object === name ? null : name);

  const rows = weekView?.rows ?? periodView?.rows ?? [];
  const columns: readonly { key: string; head: string; sub: string | null }[] = weekView
    ? weekView.days.map((iso) => ({ key: iso, head: formatWeekday(iso), sub: String(Number(iso.slice(8, 10))) }))
    : (periodView?.weeks ?? []).map((w) => ({ key: String(w), head: `${labels.week} ${w}`, sub: null }));

  return (
    <section className="flex flex-col gap-3" data-testid="historical-field-board" data-week={String(week)} aria-label={labels.title}>
      {/* TIME — the week dial. A chip per ISO week with its rhythm bar. */}
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

      {/* THE FIELD — rows of people, columns of time, marks of places */}
      {rows.length === 0 ? (
        <p className="text-support text-text-muted">{labels.noWork}</p>
      ) : (
        <div className="flex flex-col gap-1" role="table" aria-label={labels.title} data-testid="field-grid">
          <div className="flex flex-col gap-1 md:flex-row md:items-end" role="row">
            <div className="hidden w-44 shrink-0 md:block" role="columnheader" aria-label={labels.person} />
            <div className="grid flex-1 gap-1" style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(0, 1fr))` }}>
              {columns.map((c) => (
                <div key={c.key} role="columnheader" className="flex flex-col items-center font-mono text-meta uppercase tracking-label text-text-muted">
                  <span>{c.head}</span>
                  {c.sub && <span className="text-text-secondary">{c.sub}</span>}
                </div>
              ))}
            </div>
          </div>
          {rows.map((r) => {
            const rowLit = person === r.label;
            const rowDim = person !== null && !rowLit;
            const cells = r.cells as readonly (
              | { iso?: string; isoWeek?: number; hours: number | null; days?: number; places: readonly { name: string; monogram: string; hours?: number | null; days?: number }[]; weekConflict?: boolean }
              | null
            )[];
            return (
              <div
                key={r.label}
                role="row"
                className={cn("flex flex-col gap-1 rounded-md md:flex-row md:items-stretch", rowLit ? "bg-brand-blue/5" : "", rowDim ? "opacity-40" : "")}
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
                    "flex min-h-11 w-full items-center gap-2 rounded-md border px-2 text-left md:w-44 md:shrink-0",
                    rowLit ? "border-brand-blue" : "border-transparent hover:border-ink-500",
                  )}
                >
                  <span aria-hidden className={cn(TILE, "h-8 w-8 text-meta")}>{playerInitials(r.label)}</span>
                  <span className="flex min-w-0 flex-col leading-tight">
                    <span className="truncate text-support font-semibold text-text-primary">{r.label}</span>
                    <span className="font-mono text-meta tabular-nums text-text-muted">
                      {r.days} {labels.days} · {formatHours(r.hours)} h
                    </span>
                  </span>
                  <span className="sr-only">{labels.person}</span>
                </button>
                <div className="grid flex-1 gap-1" style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(0, 1fr))` }}>
                  {cells.map((c, i) => (
                    <div
                      key={columns[i]?.key ?? i}
                      role="cell"
                      className={cn("flex min-h-11 flex-col gap-0.5 rounded-md border p-1", c ? "border-ink-600 bg-ink-800/40" : "border-transparent")}
                      data-testid="field-cell"
                    >
                      {c ? (
                        <>
                          <div className="flex flex-wrap gap-0.5">
                            {c.places.map((p) => (
                              <PlaceMark
                                key={p.name}
                                name={p.name}
                                monogram={p.monogram}
                                hours={p.hours ?? null}
                                days={p.days}
                                lit={object === p.name}
                                dim={object !== null}
                                onSelect={() => toggleObject(p.name)}
                                labels={labels}
                                formatHours={formatHours}
                              />
                            ))}
                          </div>
                          <span className="mt-auto flex items-center gap-1 self-end font-mono text-meta tabular-nums text-text-muted">
                            {c.weekConflict && <SemanticIcon concept="warning" label={labels.weekConflict} className="h-3 w-3 text-state-amber" />}
                            {c.hours !== null ? `${formatHours(c.hours)} h` : <span title={labels.hoursUnknown}>?</span>}
                          </span>
                        </>
                      ) : (
                        <span aria-hidden className="m-auto text-text-muted/40">·</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* legend of the marks on the field · the one thing the field is NOT */}
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
        <ul className="flex flex-wrap gap-x-3 gap-y-0.5 font-mono text-meta text-text-muted" aria-label={labels.legend}>
          {legend.map((l) => (
            <li key={l.name} className={cn(object === l.name ? "text-text-primary" : "")}>
              <span className="font-semibold text-text-secondary">{l.monogram}</span> {l.name}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
