"use client";

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";

import {
  ObjectMark,
  PersonMark,
  PersonToken,
  UnknownToken,
} from "@/components/app/historical/historical-marks";
import { SemanticIcon } from "@/components/app/semantic-icon";
import type {
  CalendarProjection,
  FieldProjection,
} from "@/lib/organization-evidence/import-projections";
import {
  fieldFormationPeriod,
  fieldFormationWeek,
  type FormationToken,
} from "@/lib/organization-evidence/import-visual";
import { cn } from "@/lib/utils";

/**
 * THE HISTORICAL FIELD — the company's workforce as a FORMATION in time
 * (LABOURMARKET_VISUAL_FIRST constitution 2026-09-16 §T, §BE; frozen design
 * system §G "F1 zones as bands in time — chosen"; owner master handoff
 * 2026-09-17 §14: "a living workforce formation: WHO · WHERE · WHEN · WITH
 * WHOM · HOW MUCH · WHAT CHANGED").
 *
 * The field is OBJECTS × TIME with PEOPLE as tokens — the one grammar every
 * historical view is drawn in. LANES are the places worked in the shown
 * time, most person-days first; COLUMNS are the seven days of the selected
 * week or the ISO weeks of the whole period; a TOKEN is a person standing on
 * a place on a day: solid when the source states the hours there, dashed
 * (`?`) when it never split them. A person with a dated day but no
 * recognisable place stands on the dashed `?` lane. An empty cell is an
 * absence of evidence, never zero work.
 *
 * ONE field, four dials owned by the workspace, each transforming the same
 * field: WEEK changes the columns; PERSON lights their tokens and draws
 * their WORK PATH through the lanes; OBJECT lights its lane and dims the
 * rest; DAY lights the column and opens that day's formation beside it.
 *
 * Nothing here is a team, a membership, a plan or a booking: the field says
 * "historical group ≠ team" in one token, the sentence behind it, and the
 * projection it reads carries no membership (ARCH-4). Read-only: client
 * state over server-computed data, no fetch, no action, no write. Motion is
 * semantic only (the path draws, the selection settles) and honours
 * prefers-reduced-motion.
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
  readonly formation: string;
  readonly unplaced: string;
  readonly path: string;
  readonly people: string;
  readonly dayLabel: string;
}

export interface FieldSelection {
  readonly week: number | "all";
  readonly person: string | null;
  readonly object: string | null;
  readonly day: string | null;
}

// A phone shows the lane as its mark alone; the name lives in the mark's tooltip
// and the aria-label — the seven day columns keep their room.
const LANE_HEAD = "w-12 shrink-0 md:w-52";

export function HistoricalFieldBoard({
  calendar,
  field,
  labels,
  locale,
  selection,
  onSelectWeek,
  onSelectPerson,
  onSelectObject,
  onSelectDay,
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
  onSelectDay: (iso: string | null) => void;
}) {
  const fmt = useMemo(() => {
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
    const parse = (iso: string) => new Date(`${iso}T00:00:00Z`);
    return {
      day: (iso: string) => day.format(parse(iso)),
      weekday: (iso: string) => weekday.format(parse(iso)).replace(/\.$/, ""),
      hours: (n: number) => num.format(n),
    };
  }, [locale]);
  const reduce = useReducedMotion();

  const { week, person, object, day } = selection;
  const weekView = useMemo(
    () => (week === "all" ? null : fieldFormationWeek(calendar, week)),
    [calendar, week],
  );
  const periodView = useMemo(
    () => (week === "all" ? fieldFormationPeriod(calendar) : null),
    [calendar, week],
  );
  const maxWeekHours = Math.max(1, ...field.weeks.map((w) => w.hours));
  const currentWeek =
    week === "all" ? null : field.weeks.find((w) => w.isoWeek === week);

  const togglePerson = (label: string) =>
    onSelectPerson(person === label ? null : label);
  const toggleObject = (name: string) =>
    onSelectObject(object === name ? null : name);
  const toggleDay = (iso: string) => onSelectDay(day === iso ? null : iso);

  const columns: readonly {
    key: string;
    head: string;
    sub: string | null;
    iso: string | null;
  }[] = weekView
    ? weekView.days.map((iso) => ({
        key: iso,
        head: fmt.weekday(iso),
        sub: String(Number(iso.slice(8, 10))),
        iso,
      }))
    : (periodView?.weeks ?? []).map((w) => ({
        key: String(w),
        head: labels.week,
        sub: String(w),
        iso: null,
      }));
  const lanes = useMemo(
    () => weekView?.lanes ?? periodView?.lanes ?? [],
    [weekView, periodView],
  );
  const people = weekView?.people ?? periodView?.people ?? [];
  const hasUnplaced = weekView
    ? weekView.unplaced.some((c) => c.length > 0)
    : false;

  // ── the work path: through the selected person's tokens, measured after layout ──
  const gridRef = useRef<HTMLDivElement>(null);
  const [path, setPath] = useState<string | null>(null);
  useLayoutEffect(() => {
    const grid = gridRef.current;
    if (!grid || !person) {
      setPath(null);
      return;
    }
    const box = grid.getBoundingClientRect();
    const points = [
      ...grid.querySelectorAll<HTMLElement>(
        `[data-person-token="${CSS.escape(person)}"][data-path-step]`,
      ),
    ]
      .map((el) => ({
        step: Number(el.dataset.pathStep),
        r: el.getBoundingClientRect(),
      }))
      .sort((a, b) => a.step - b.step)
      .map(
        ({ r }) =>
          `${r.left - box.left + r.width / 2},${r.top - box.top + r.height / 2}`,
      );
    setPath(points.length > 1 ? `M ${points.join(" L ")}` : null);
  }, [person, week, lanes, columns.length]);

  const tokenTitle = (t: FormationToken, iso: string | null) =>
    `${t.label}${iso ? ` · ${fmt.day(iso)}` : ""} · ${t.hours !== null ? `${fmt.hours(t.hours)} h` : `? ${labels.hoursUnknown}`}${t.dayHours !== null && t.hours !== t.dayHours ? ` (${fmt.hours(t.dayHours)} h ${labels.dayLabel})` : ""}${t.weekConflict ? ` · ${labels.weekConflict}` : ""}`;

  return (
    <section
      className="flex flex-col gap-4"
      data-testid="historical-field-board"
      data-week={String(week)}
      aria-label={labels.title}
    >
      {/* TIME — the week dial: one chip per ISO week, its rhythm as the bar */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div
          className="flex flex-wrap items-end gap-1"
          role="group"
          aria-label={labels.week}
        >
          <button
            type="button"
            onClick={() => onSelectWeek("all")}
            aria-pressed={week === "all"}
            data-testid="field-week-all"
            className={cn(
              "inline-flex min-h-11 items-center rounded-md px-3 font-mono text-meta uppercase tracking-label transition-colors duration-fast",
              week === "all"
                ? "bg-brand-blue/15 text-text-primary ring-1 ring-brand-blue/60"
                : "text-text-secondary hover:bg-ink-800 hover:text-text-primary",
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
              title={`${fmt.day(w.firstDate)} – ${fmt.day(w.lastDate)} · ${fmt.hours(w.hours)} h`}
              className={cn(
                "flex min-h-11 min-w-10 flex-col items-center justify-end gap-1 rounded-md px-1.5 pb-1 pt-1.5 font-mono text-meta tabular-nums transition-colors duration-fast",
                week === w.isoWeek
                  ? "bg-brand-blue/15 text-text-primary ring-1 ring-brand-blue/60"
                  : "text-text-secondary hover:bg-ink-800 hover:text-text-primary",
              )}
            >
              <span
                aria-hidden
                className={cn(
                  "w-4 rounded-t-[1px]",
                  week === w.isoWeek ? "bg-brand-blue" : "bg-brand-cyan/60",
                )}
                style={{
                  height: `${Math.max(2, Math.round((w.hours / maxWeekHours) * 16))}px`,
                }}
              />
              <span>{w.isoWeek}</span>
            </button>
          ))}
        </div>
        <span
          className="font-display text-card-title font-semibold text-text-primary"
          data-testid="field-scope"
        >
          {currentWeek
            ? `${fmt.day(currentWeek.firstDate)} – ${fmt.day(currentWeek.lastDate)}`
            : labels.formation}
        </span>
      </div>

      {/* THE FORMATION — lanes of places, columns of time, people as tokens */}
      {lanes.length === 0 && !hasUnplaced ? (
        <p className="text-support text-text-muted">{labels.noWork}</p>
      ) : (
        <div
          ref={gridRef}
          className="relative flex flex-col"
          role="table"
          aria-label={labels.formation}
          data-testid="field-grid"
          data-lanes={lanes.length}
        >
          {/* column heads: the days or the weeks; a day is selectable */}
          <div className="flex items-end" role="row">
            <div
              className={LANE_HEAD}
              role="columnheader"
              aria-label={labels.object}
            />
            <div
              className="grid flex-1"
              style={{
                gridTemplateColumns: `repeat(${columns.length}, minmax(0, 1fr))`,
              }}
            >
              {columns.map((c) => {
                const selectable = c.iso !== null;
                const lit = c.iso !== null && day === c.iso;
                const inner = (
                  <>
                    <span className="font-mono text-meta uppercase tracking-label text-text-muted">
                      {c.head}
                    </span>
                    {c.sub && (
                      <span
                        className={cn(
                          "font-display text-support font-semibold",
                          lit ? "text-brand-blue" : "text-text-primary",
                        )}
                      >
                        {c.sub}
                      </span>
                    )}
                  </>
                );
                return (
                  <div
                    key={c.key}
                    role="columnheader"
                    className="flex justify-center border-b border-ink-600 pb-1.5"
                  >
                    {selectable ? (
                      <button
                        type="button"
                        onClick={() => toggleDay(c.iso!)}
                        aria-pressed={lit}
                        data-testid="field-day"
                        data-day={c.iso}
                        className={cn(
                          "flex min-h-9 items-baseline gap-1 rounded-md px-2 transition-colors duration-fast",
                          lit ? "bg-brand-blue/15" : "hover:bg-ink-800",
                        )}
                      >
                        {inner}
                      </button>
                    ) : (
                      <span className="flex min-h-9 items-baseline gap-1 px-2">
                        {inner}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="relative flex flex-col">
            {/* the selected day's column, lit behind the lanes */}
            {day && weekView && (
              <div
                aria-hidden
                className="pointer-events-none absolute inset-y-0 left-0 right-0 hidden md:block md:left-52"
              >
                <div
                  className="grid h-full"
                  style={{
                    gridTemplateColumns: `repeat(${columns.length}, minmax(0, 1fr))`,
                  }}
                >
                  {columns.map((c) => (
                    <div
                      key={c.key}
                      className={cn(
                        "h-full rounded-md transition-colors duration-base",
                        c.iso === day
                          ? "bg-brand-blue/5 ring-1 ring-inset ring-brand-blue/20"
                          : "",
                      )}
                    />
                  ))}
                </div>
              </div>
            )}

            {lanes.map((lane, li) => {
              const laneLit = object === lane.name;
              const laneDim = object !== null && !laneLit;
              const personOnLane =
                person !== null &&
                lane.cells.some((c) => c.some((t) => t.label === person));
              return (
                <div
                  key={lane.name}
                  role="row"
                  className={cn(
                    "relative flex items-stretch border-b border-ink-600/50 transition-opacity duration-fast",
                    laneDim ? "opacity-30" : "",
                    person !== null && !personOnLane ? "opacity-40" : "",
                  )}
                  data-testid="field-lane"
                  data-place={lane.name}
                >
                  <div role="rowheader" className="contents">
                    <button
                      type="button"
                      onClick={() => toggleObject(lane.name)}
                      aria-pressed={laneLit}
                      data-testid="field-place"
                      data-place={lane.name}
                      aria-label={`${lane.name} · ${lane.personDays} ${labels.days}`}
                      className={cn(
                        "flex min-h-12 items-center gap-2.5 rounded-md px-1.5 py-1 text-left transition-colors duration-fast",
                        LANE_HEAD,
                        laneLit ? "bg-brand-blue/10" : "hover:bg-ink-800/70",
                      )}
                    >
                      <ObjectMark
                        name={lane.name}
                        size="sm"
                        lit={laneLit}
                        label={labels.object}
                      />
                      <span className="hidden min-w-0 flex-col leading-tight md:flex">
                        <span
                          className={cn(
                            "truncate text-support",
                            laneLit
                              ? "font-semibold text-text-primary"
                              : "text-text-primary/90",
                          )}
                        >
                          {lane.name}
                        </span>
                        <span className="font-mono text-meta tabular-nums text-text-muted">
                          {lane.personDays} {labels.days}
                        </span>
                      </span>
                    </button>
                  </div>
                  <div
                    className="grid flex-1"
                    style={{
                      gridTemplateColumns: `repeat(${columns.length}, minmax(0, 1fr))`,
                    }}
                  >
                    {lane.cells.map((cell, ci) => (
                      <div
                        key={columns[ci]?.key ?? ci}
                        role="cell"
                        className="flex min-h-12 flex-wrap content-center items-center justify-center gap-1 px-0.5 py-1.5"
                        data-testid="field-cell"
                      >
                        {cell.map((t) => {
                          const isPeriod = "days" in t;
                          const token = t as FormationToken & { days?: number };
                          const lit = person === token.label;
                          const dim = person !== null && !lit;
                          const iso = columns[ci]?.iso ?? null;
                          const step =
                            weekView && iso
                              ? (weekView.paths
                                  .get(token.label)
                                  ?.findIndex(
                                    (s) => s.day === ci && s.lane === li,
                                  ) ?? -1)
                              : -1;
                          return (
                            <button
                              key={token.label}
                              type="button"
                              onClick={() => togglePerson(token.label)}
                              aria-pressed={lit}
                              aria-label={
                                isPeriod
                                  ? `${token.label} · ${token.days} ${labels.days}`
                                  : tokenTitle(token, iso)
                              }
                              data-testid="field-person"
                              data-label={token.label}
                              className="inline-flex min-h-8 items-center gap-0.5 rounded-full"
                            >
                              {isPeriod ? (
                                <span
                                  className={cn(
                                    "inline-flex items-center gap-1 rounded-full pr-1.5 transition-opacity duration-fast",
                                    lit ? "bg-brand-blue/15" : "bg-ink-800/80",
                                    dim ? "opacity-25" : "",
                                  )}
                                  title={`${token.label} · ${token.days} ${labels.days}`}
                                >
                                  <PersonMark
                                    label={token.label}
                                    size="xs"
                                    lit={lit}
                                  />
                                  <span className="font-mono text-meta tabular-nums text-text-secondary">
                                    {token.days}
                                  </span>
                                </span>
                              ) : (
                                <span
                                  data-person-token={token.label}
                                  data-path-step={step >= 0 ? step : undefined}
                                  className="inline-flex"
                                >
                                  <PersonToken
                                    label={token.label}
                                    hours={token.hours}
                                    title={tokenTitle(token, iso)}
                                    size="sm"
                                    lit={lit}
                                    dim={dim}
                                    warning={token.weekConflict}
                                  />
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}

            {/* the `?` lane — dated work with no recognisable place */}
            {weekView && hasUnplaced && (
              <div
                role="row"
                className="relative flex items-stretch border-b border-dashed border-ink-600/60"
                data-testid="field-lane"
                data-place="?"
              >
                <div
                  role="rowheader"
                  className={cn(
                    "flex min-h-12 items-center gap-2.5 px-1.5 py-1",
                    LANE_HEAD,
                  )}
                >
                  <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-dashed border-ink-500 text-text-muted">
                    <SemanticIcon
                      concept="unknown"
                      label={labels.unplaced}
                      className="h-3.5 w-3.5"
                    />
                  </span>
                  <span className="hidden truncate text-support text-text-secondary md:inline">
                    {labels.unplaced}
                  </span>
                </div>
                <div
                  className="grid flex-1"
                  style={{
                    gridTemplateColumns: `repeat(${columns.length}, minmax(0, 1fr))`,
                  }}
                >
                  {weekView.unplaced.map((cell, ci) => (
                    <div
                      key={columns[ci]?.key ?? ci}
                      role="cell"
                      className="flex min-h-12 flex-wrap content-center items-center justify-center gap-1 px-0.5 py-1.5"
                    >
                      {cell.map((t) => (
                        <button
                          key={t.label}
                          type="button"
                          onClick={() => togglePerson(t.label)}
                          aria-pressed={person === t.label}
                          aria-label={tokenTitle(t, columns[ci]?.iso ?? null)}
                          data-testid="field-person"
                          data-label={t.label}
                          className="inline-flex min-h-8 items-center rounded-full"
                        >
                          <span
                            data-person-token={t.label}
                            className="inline-flex"
                          >
                            <PersonToken
                              label={t.label}
                              hours={t.hours}
                              title={tokenTitle(t, columns[ci]?.iso ?? null)}
                              size="sm"
                              lit={person === t.label}
                              dim={person !== null && person !== t.label}
                              warning={t.weekConflict}
                            />
                          </span>
                        </button>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* THE WORK PATH — the selected person's steps through the lanes, drawn once */}
          {path && (
            <svg
              aria-hidden
              className="pointer-events-none absolute inset-0 h-full w-full overflow-visible"
              data-testid="field-path"
              data-person={person ?? undefined}
            >
              <motion.path
                key={`${person}:${week}`}
                d={path}
                fill="none"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="stroke-brand-blue/70"
                initial={{ pathLength: 0, opacity: 0.4 }}
                animate={{ pathLength: 1, opacity: 1 }}
                transition={{
                  duration: reduce ? 0 : 0.42,
                  ease: [0.16, 1, 0.3, 1],
                }}
              />
            </svg>
          )}
        </div>
      )}

      {/* WHO — the people of the shown time, as the selector; the one thing the field is NOT — a token */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <ul
          className="flex flex-wrap items-center gap-1"
          aria-label={labels.people}
          data-testid="field-people"
        >
          {people.map((p) => {
            const lit = person === p.label;
            return (
              <li key={p.label}>
                <button
                  type="button"
                  onClick={() => togglePerson(p.label)}
                  aria-pressed={lit}
                  data-testid="field-person-chip"
                  data-label={p.label}
                  title={`${p.label} · ${p.days} ${labels.days} · ${fmt.hours(p.hours)} h`}
                  className={cn(
                    "inline-flex min-h-11 items-center gap-2 rounded-full py-1 pl-1 pr-3 transition-colors duration-fast",
                    lit
                      ? "bg-brand-blue/15 ring-1 ring-brand-blue/60"
                      : "hover:bg-ink-800",
                    person !== null && !lit ? "opacity-50" : "",
                  )}
                >
                  <PersonMark label={p.label} size="sm" lit={lit} />
                  <span className="flex flex-col leading-none">
                    <span className="text-support font-semibold text-text-primary">
                      {p.label}
                    </span>
                    <span className="font-mono text-meta tabular-nums text-text-muted">
                      {p.days} {labels.days} · {fmt.hours(p.hours)} h
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
        <span
          className="ml-auto inline-flex items-center gap-1 rounded-full border border-ink-600 px-2 py-0.5 font-mono text-meta uppercase tracking-label text-text-muted"
          data-testid="field-not-a-team"
          title={labels.notATeamWhy}
        >
          <SemanticIcon
            concept="team"
            label={labels.notATeam}
            className="h-3 w-3"
          />
          {labels.notATeam}
        </span>
        {(person || object || day) && (
          <button
            type="button"
            onClick={() => {
              onSelectPerson(null);
              onSelectObject(null);
              onSelectDay(null);
            }}
            className="min-h-11 font-mono text-meta uppercase tracking-label text-text-secondary underline"
            data-testid="field-clear"
          >
            {labels.clear}
          </button>
        )}
        {weekView && (
          <span
            className="inline-flex items-center gap-1.5 font-mono text-meta text-text-muted"
            aria-label={labels.legend}
          >
            <UnknownToken what={labels.hoursUnknown} />
            <span aria-hidden>{labels.hoursUnknown}</span>
          </span>
        )}
      </div>
    </section>
  );
}
