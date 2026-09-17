"use client";

import { useMemo, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";

import { ObjectMark } from "@/components/app/historical/historical-marks";
import {
  HistoricalPlayerCompact,
  type HistoricalPlayerCardLabels,
} from "@/components/app/historical-player-card";
import {
  SemanticIcon,
  type SemanticConcept,
} from "@/components/app/semantic-icon";
import type {
  CompanyProjection,
  ImportProjection,
} from "@/lib/organization-evidence/import-projections";
import {
  objectStreams,
  personRing,
} from "@/lib/organization-evidence/import-visual";
import { cn } from "@/lib/utils";

/**
 * OVERVIEW — the company's HISTORICAL FOOTPRINT: who did what, where, when
 * (LABOURMARKET_VISUAL_FIRST constitution 2026-09-16 §H, §W, §BJ; frozen
 * design system §I "C1 projects in time × capacity — chosen"; owner master
 * handoff 2026-09-17 §16: "not a KPI dashboard; people, places, time, hours,
 * rhythm, relationships; no permanent all-to-all spaghetti").
 *
 * The footprint is OBJECTS × TIME — the one grammar of every historical
 * view, at the period's scale. WHEN: the weeks as columns, the company's
 * rhythm (daily hours, stacked by person) above them. WHERE: each object as
 * a BAND across the weeks, thick where many person-days were evidenced
 * there, absent where none. WHO: the people as evidence-ring identities.
 * A relationship is never drawn as a line: focusing a person (hover, select
 * or keyboard) RE-WEIGHTS the bands to that person's own days, and focusing
 * an object lights its band — the relation is seen as the footprint
 * changing shape. UNKNOWN: what the source does not say (client, project,
 * wage, team …) as `?` tokens, never as zero and never as a paragraph.
 *
 * Nothing here is fabricated: no client, no hierarchy, no team, no wage, no
 * capacity, no performance. Selecting a person or a place focuses the same
 * workspace. Read-only. Motion: the bands settle to the focus, once, and
 * honour prefers-reduced-motion.
 */

export interface OverviewLabels {
  readonly rhythm: string;
  readonly people: string;
  readonly objects: string;
  readonly footprint: string;
  readonly unknownTitle: string;
  readonly unknownItem: (key: CompanyProjection["unknown"][number]) => string;
  readonly weekShort: string;
  readonly personDaysShort: string;
  readonly days: string;
  readonly activities: string;
  readonly object: string;
  readonly card: Pick<
    HistoricalPlayerCardLabels,
    | "weeks"
    | "weekShort"
    | "days"
    | "places"
    | "warning"
    | "aggregate"
    | "person"
    | "ring"
  >;
}

const UNKNOWN_ICON: Record<
  CompanyProjection["unknown"][number],
  SemanticConcept
> = {
  client: "company",
  project: "project",
  work_package: "work",
  wage: "money",
  output: "evidence",
  team: "team",
  aggregate_period: "time",
};

const BAND_H = 30;

/** The band as a RIDGE: one symmetric hump per week, its half-height the
 *  week's person-days over the shown maximum, joined by straight segments
 *  through the week centres; a week with nothing collapses to the axis. */
function ridge(values: readonly number[], max: number): string {
  const n = values.length;
  if (n === 0) return "";
  const mid = BAND_H / 2;
  const x = (i: number) => i * 10 + 5;
  const half = (v: number) =>
    v > 0 ? Math.max(1.5, (v / max) * (BAND_H / 2 - 2)) : 0;
  const top = values.map((v, i) => `${x(i)} ${mid - half(v)}`);
  const bottom = values.map((v, i) => `${x(i)} ${mid + half(v)}`).reverse();
  return `M 0 ${mid} L ${top.join(" L ")} L ${n * 10} ${mid} L ${bottom.join(" L ")} Z`;
}

export function HistoricalOverview({
  projection,
  locale,
  labels,
  selectedPerson,
  selectedObject,
  onSelectPerson,
  onSelectObject,
  onSelectWeek,
}: {
  projection: ImportProjection;
  locale: string;
  labels: OverviewLabels;
  selectedPerson: string | null;
  selectedObject: string | null;
  onSelectPerson: (label: string) => void;
  onSelectObject: (name: string) => void;
  onSelectWeek: (week: number) => void;
}) {
  const { people, calendar, company } = projection;
  const reduce = useReducedMotion();
  const [hovered, setHovered] = useState<string | null>(null);
  const fmt = useMemo(() => {
    const num = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });
    const day = new Intl.DateTimeFormat(locale, {
      day: "numeric",
      month: locale === "lt" ? "long" : "short",
      timeZone: "UTC",
    });
    return {
      hours: (n: number) => num.format(n),
      day: (iso: string) => day.format(new Date(`${iso}T00:00:00Z`)),
    };
  }, [locale]);
  const maxWeek = Math.max(1, ...calendar.weeks.map((w) => w.hours));
  const focusPerson = selectedPerson ?? hovered;
  const all = useMemo(() => objectStreams(calendar), [calendar]);
  const focused = useMemo(
    () => (focusPerson ? objectStreams(calendar, focusPerson) : null),
    [calendar, focusPerson],
  );
  const rings = useMemo(
    () =>
      new Map(
        people.map((p) => [p.label, personRing(calendar, p.label)] as const),
      ),
    [calendar, people],
  );
  const weeks = calendar.weeks.map((w) => w.isoWeek);
  // The bands are scaled to the shown footprint: the company's busiest week
  // when nothing is focused, the focused person's own busiest week when one
  // is — so a person's shape is legible against the objects, not a hairline
  // under the company's total.
  const maxBand = Math.max(
    1,
    ...(focused ?? all).flatMap((o) => o.weeks.map((w) => w.personDays)),
  );
  const spring = {
    type: "spring" as const,
    duration: reduce ? 0 : 0.42,
    bounce: 0,
  };

  return (
    <div
      className="flex flex-col gap-6"
      data-testid="historical-overview"
      data-focus={focusPerson ?? selectedObject ?? "none"}
    >
      {/* WHO — the people as evidence-ring identities */}
      <ul
        className="grid gap-x-3 gap-y-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
        data-testid="evidence-people"
        aria-label={labels.people}
      >
        {people.map((p) => (
          <li
            key={p.label}
            data-testid="evidence-person-card"
            data-state={p.state}
          >
            <HistoricalPlayerCompact
              person={p}
              ring={rings.get(p.label)}
              labels={labels.card}
              formatHours={fmt.hours}
              selected={selectedPerson === p.label}
              dimmed={focusPerson !== null && focusPerson !== p.label}
              onSelect={() => onSelectPerson(p.label)}
              onHover={setHovered}
            />
          </li>
        ))}
      </ul>

      {/* WHEN × WHERE — the footprint: objects as bands over the weeks, the rhythm above */}
      <section
        className="flex flex-col gap-1"
        aria-label={labels.footprint}
        data-testid="historical-footprint"
      >
        <div className="flex items-baseline justify-between gap-3">
          <span className="font-mono text-meta uppercase tracking-label text-text-muted">
            {labels.footprint} · {labels.objects} {company.places}
          </span>
          <span className="font-mono text-meta uppercase tracking-label text-text-muted">
            {labels.rhythm}
          </span>
        </div>
        <div
          className="flex flex-col"
          data-testid="historical-footprint-map"
          data-focus={
            focusPerson
              ? `person:${focusPerson}`
              : selectedObject
                ? `object:${selectedObject}`
                : "none"
          }
        >
          {/* the rhythm — one column per week, daily hours stacked by person, a door into that week's field */}
          {calendar.weeks.length > 0 && (
            <div
              className="flex items-end"
              data-testid="evidence-time-spine"
              aria-label={labels.rhythm}
            >
              <div className="hidden w-52 shrink-0 md:block" />
              <ol
                className="grid flex-1 items-end gap-1"
                style={{
                  gridTemplateColumns: `repeat(${weeks.length}, minmax(0, 1fr))`,
                }}
              >
                {calendar.weeks.map((w) => {
                  const byPerson = new Map<string, number>();
                  for (const d of w.days)
                    for (const p of d.people)
                      byPerson.set(
                        p.label,
                        (byPerson.get(p.label) ?? 0) + (p.hours ?? 0),
                      );
                  const stack = [...byPerson.entries()].sort((a, b) =>
                    a[0].localeCompare(b[0]),
                  );
                  return (
                    <li
                      key={w.isoWeek}
                      className="flex min-w-0 flex-col items-stretch justify-end"
                      data-testid="evidence-spine-week"
                      data-iso-week={w.isoWeek}
                    >
                      <button
                        type="button"
                        onClick={() => onSelectWeek(w.isoWeek)}
                        title={`${labels.weekShort} ${w.isoWeek} · ${fmt.day(w.days[0].date)} – ${fmt.day(w.days[w.days.length - 1].date)} · ${fmt.hours(w.hours)} h · ${w.personDays} ${labels.personDaysShort}`}
                        className="flex min-h-11 w-full flex-col items-stretch justify-end gap-1 rounded-md px-0.5 pt-1 transition-colors duration-fast hover:bg-ink-800/70"
                      >
                        <span className="text-center font-mono text-meta tabular-nums text-text-secondary">
                          {fmt.hours(w.hours)}
                        </span>
                        <span
                          className="flex w-full flex-col-reverse overflow-hidden rounded-[2px]"
                          style={{
                            height: `${Math.max(4, Math.round((w.hours / maxWeek) * 40))}px`,
                          }}
                          aria-hidden
                        >
                          {stack.map(([label, h], si) => (
                            <span
                              key={label}
                              className={cn(
                                "w-full flex-none transition-colors duration-fast",
                                focusPerson === null || focusPerson === label
                                  ? si % 2 === 0
                                    ? "bg-brand-cyan/80"
                                    : "bg-brand-cyan/55"
                                  : "bg-brand-cyan/10",
                              )}
                              style={{
                                height: `${w.hours > 0 ? Math.max(1, (h / w.hours) * 100) : 0}%`,
                              }}
                            />
                          ))}
                        </span>
                        <span className="text-center font-mono text-meta tabular-nums text-text-muted">
                          {w.isoWeek}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ol>
            </div>
          )}

          {/* the objects as bands across the same weeks */}
          <ul
            className="flex flex-col"
            aria-label={labels.objects}
            data-testid="historical-object-bands"
          >
            {all.map((o) => {
              const f = focused?.find((x) => x.name === o.name) ?? null;
              const onFocus = focusPerson === null || f !== null;
              const lit = selectedObject === o.name;
              const dim = (selectedObject !== null && !lit) || !onFocus;
              const shown = f ?? o;
              return (
                <li
                  key={o.name}
                  className={cn(
                    "flex items-center border-t border-ink-600/40 transition-opacity duration-fast",
                    dim ? "opacity-30" : "",
                  )}
                  data-testid="historical-object-band"
                  data-place={o.name}
                  data-person-days={shown.personDays}
                >
                  <button
                    type="button"
                    onClick={() => onSelectObject(o.name)}
                    aria-pressed={lit}
                    aria-label={`${o.name} · ${shown.personDays} ${labels.days}`}
                    className={cn(
                      "flex min-h-10 w-full items-center gap-2.5 rounded-md px-1.5 text-left transition-colors duration-fast md:w-52 md:shrink-0",
                      lit ? "bg-brand-blue/10" : "hover:bg-ink-800/70",
                    )}
                  >
                    <ObjectMark
                      name={o.name}
                      size="sm"
                      lit={lit}
                      label={labels.object}
                    />
                    <span className="flex min-w-0 flex-1 flex-col leading-tight">
                      <span
                        className={cn(
                          "truncate text-support",
                          lit
                            ? "font-semibold text-text-primary"
                            : "text-text-primary/90",
                        )}
                      >
                        {o.name}
                      </span>
                      <span className="font-mono text-meta tabular-nums text-text-muted">
                        {shown.personDays} {labels.days} · {shown.people.length}{" "}
                        <span className="sr-only">{labels.people}</span>
                        <SemanticIcon
                          concept="person"
                          label={labels.people}
                          className="inline h-3 w-3 align-[-2px]"
                        />
                      </span>
                    </span>
                  </button>
                  <svg
                    aria-hidden
                    className="hidden flex-1 md:block"
                    viewBox={`0 0 ${weeks.length * 10} ${BAND_H}`}
                    preserveAspectRatio="none"
                    style={{ height: BAND_H }}
                  >
                    <motion.path
                      initial={false}
                      animate={{
                        d: ridge(
                          shown.weeks.map((w) => w.personDays),
                          maxBand,
                        ),
                      }}
                      transition={spring}
                      className={cn(
                        lit
                          ? "fill-brand-blue/80"
                          : f
                            ? "fill-brand-cyan/85"
                            : "fill-brand-cyan/55",
                      )}
                    >
                      <title>
                        {shown.weeks
                          .filter((w) => w.personDays > 0)
                          .map(
                            (w) =>
                              `${labels.weekShort} ${w.isoWeek} · ${w.personDays} ${labels.days} · ${w.people} ${labels.people}`,
                          )
                          .join(" | ")}
                      </title>
                    </motion.path>
                  </svg>
                </li>
              );
            })}
          </ul>
        </div>
      </section>

      {/* a phone shows the places as compact marks, each a door into its focus */}
      <ul
        className="flex flex-wrap gap-1 md:hidden"
        aria-label={labels.objects}
      >
        {all.map((o) => (
          <li key={o.name}>
            <button
              type="button"
              onClick={() => onSelectObject(o.name)}
              aria-pressed={selectedObject === o.name}
              className={cn(
                "inline-flex min-h-11 max-w-full items-center gap-1.5 rounded-md px-2 font-mono text-meta tabular-nums",
                selectedObject === o.name
                  ? "bg-brand-blue/10 text-text-primary"
                  : "text-text-secondary",
              )}
            >
              <span className="truncate">{o.name}</span>
              <span className="text-text-muted">{o.personDays}</span>
              <span className="sr-only">
                {o.personDays} {labels.days}
              </span>
            </button>
          </li>
        ))}
      </ul>

      {/* UNKNOWN — what the source does not say */}
      <ul
        className="flex flex-wrap gap-1.5"
        data-testid="evidence-company-unknown"
        aria-label={labels.unknownTitle}
      >
        {company.unknown.map((u) => (
          <li
            key={u}
            className="inline-flex items-center gap-1 rounded-full border border-ink-600 px-2 py-0.5 font-mono text-meta uppercase tracking-label text-text-muted"
            title={labels.unknownItem(u)}
          >
            <SemanticIcon
              concept="unknown"
              label={labels.unknownTitle}
              className="h-3 w-3"
            />
            <SemanticIcon
              concept={UNKNOWN_ICON[u]}
              label={labels.unknownItem(u)}
              className="h-3 w-3"
            />
            <span className="sr-only">{labels.unknownItem(u)}</span>
            <span aria-hidden>{labels.unknownItem(u).split(" ")[0]}</span>
          </li>
        ))}
        {company.activities.map((a) => (
          <li
            key={a}
            className="inline-flex items-center gap-1 rounded-full border border-dashed border-ink-600 px-2 py-0.5 font-mono text-meta text-text-secondary"
            title={labels.activities}
          >
            <SemanticIcon
              concept="work"
              label={labels.activities}
              className="h-3 w-3"
            />
            {a}
          </li>
        ))}
      </ul>
    </div>
  );
}
