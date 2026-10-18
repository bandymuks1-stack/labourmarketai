"use client";

import { useMemo } from "react";

import {
  ObjectMark,
  PersonMark,
  UnknownToken,
} from "@/components/app/historical/historical-marks";
import { SemanticIcon } from "@/components/app/semantic-icon";
import type {
  CalendarProjection,
  FieldProjection,
  PlaceProjection,
} from "@/lib/organization-evidence/import-projections";
import {
  objectMonogram,
  objectWeeks,
} from "@/lib/organization-evidence/import-visual";
import { cn } from "@/lib/utils";

/**
 * THE OBJECTS — the real places as work-context identities
 * (LABOURMARKET_VISUAL_FIRST constitution 2026-09-16 §V, §BI; owner master
 * handoff 2026-09-17 §17: "a work object must feel like a real place where
 * work happened: identity, active period, people, actual work, hours where
 * known, unknowns, rhythm").
 *
 * Seventeen places are seventeen place identities, most-worked first: the
 * square place mark, the NAME, the place's ACTIVE PERIOD drawn on the
 * company's own time span, the people evidenced there as identity marks,
 * the days and the hours where the source split them (`?` where it did
 * not). A place that carried most of the work is larger; a place with one
 * day is small — the grid has weight, not equal rows. Selecting one focuses
 * the SAME workspace on it: its people with their days, its rhythm by week,
 * its period; the source spellings that folded into it (`Hoofdgraht`,
 * `Hoofdgrat`, …) are LEVEL 3 — behind SOURCE — unless a human decision is
 * needed, in which case the question lives in ATTENTION.
 *
 * An activity or a note in the object column is never a place here: the
 * projection already keeps those apart. Read-only.
 */

export interface ObjectsLabels {
  readonly title: string;
  readonly days: string;
  readonly hours: string;
  readonly people: string;
  readonly hoursUnknown: string;
  readonly shared: (count: number) => string;
  readonly spellings: string;
  readonly fromText: string;
  readonly source: string;
  readonly state: Readonly<Record<PlaceProjection["state"], string>>;
  readonly weeks: string;
  readonly weekShort: string;
  readonly object: string;
  readonly time: string;
  readonly clear: string;
  readonly unknown: string;
  readonly period: string;
}

const DAY_MS = 86_400_000;
/** Where a place's active period sits on the company's span, as fractions. */
function periodFractions(
  first: string | null,
  last: string | null,
  spanFirst: string | null,
  spanLast: string | null,
): { start: number; end: number } | null {
  if (!first || !last || !spanFirst || !spanLast) return null;
  const a = Date.parse(`${spanFirst}T00:00:00Z`);
  const b = Date.parse(`${spanLast}T00:00:00Z`) + DAY_MS;
  const span = Math.max(DAY_MS, b - a);
  return {
    start: Math.max(
      0,
      Math.min(1, (Date.parse(`${first}T00:00:00Z`) - a) / span),
    ),
    end: Math.max(
      0,
      Math.min(1, (Date.parse(`${last}T00:00:00Z`) + DAY_MS - a) / span),
    ),
  };
}

function useFmt(locale: string) {
  return useMemo(() => {
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
}

/** The place identities, most-worked first. */
export function HistoricalObjects({
  places,
  field,
  locale,
  labels,
  selected,
  personFilter,
  onSelect,
}: {
  places: readonly PlaceProjection[];
  field: FieldProjection;
  locale: string;
  labels: ObjectsLabels;
  selected: string | null;
  personFilter: string | null;
  onSelect: (name: string | null) => void;
}) {
  const fmt = useFmt(locale);
  const peopleAt = useMemo(
    () => new Map(field.places.map((p) => [p.name, p] as const)),
    [field],
  );
  const spanFirst = field.weeks[0]?.firstDate ?? null;
  const spanLast = field.weeks[field.weeks.length - 1]?.lastDate ?? null;
  const real = places.filter((p) => p.state !== "ambiguous");
  const maxDays = Math.max(
    1,
    ...real.map((p) => peopleAt.get(p.name)?.days ?? p.rows),
  );
  return (
    <div className="flex flex-col gap-2">
      {/* the one time scale every period band is drawn on */}
      {spanFirst && spanLast && (
        <div
          aria-hidden
          className="flex items-center gap-2 font-mono text-meta uppercase tracking-label text-text-muted"
        >
          <span>{fmt.day(spanFirst)}</span>
          <span className="h-px flex-1 bg-ink-600" />
          <span>{fmt.day(spanLast)}</span>
        </div>
      )}
      <ul
        className="grid gap-x-3 gap-y-1 sm:grid-cols-2 xl:grid-cols-3"
        data-testid="historical-objects"
        aria-label={labels.title}
      >
        {real.map((pl, i) => {
          const at = peopleAt.get(pl.name);
          const days = at?.days ?? pl.rows;
          const lit = selected === pl.name;
          const dim =
            (selected !== null && !lit) ||
            (personFilter !== null &&
              !(at?.people.some((p) => p.label === personFilter) ?? false));
          const period = periodFractions(
            pl.firstDate,
            pl.lastDate,
            spanFirst,
            spanLast,
          );
          const weight = days / maxDays;
          const big = weight > 0.5;
          return (
            <li
              key={pl.name}
              className={cn(
                "rise-in",
                big ? "sm:col-span-2 xl:col-span-1" : "",
              )}
              style={{ animationDelay: `${Math.min(300, i * 25)}ms` }}
            >
              <button
                type="button"
                onClick={() => onSelect(lit ? null : pl.name)}
                aria-pressed={lit}
                data-testid="historical-object"
                data-place={pl.name}
                data-state={pl.state}
                title={`${pl.name} (${objectMonogram(pl.name)})`}
                className={cn(
                  "flex min-h-11 w-full flex-col gap-2.5 rounded-lg p-2.5 text-left transition-[background-color,opacity] duration-fast",
                  lit
                    ? "bg-brand-blue/10 ring-1 ring-brand-blue/60"
                    : "hover:bg-ink-800/70",
                  dim && !lit ? "opacity-35" : "",
                )}
              >
                <span className="flex items-center gap-3">
                  <ObjectMark
                    name={pl.name}
                    size={big ? "md" : "sm"}
                    lit={lit}
                    label={labels.object}
                  />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span
                      className={cn(
                        "truncate font-display font-semibold text-text-primary",
                        big ? "text-card-title" : "text-support",
                      )}
                    >
                      {pl.name}
                    </span>
                    <span className="flex items-center gap-2.5 font-mono text-meta tabular-nums text-text-muted">
                      <span className="inline-flex items-center gap-1">
                        <SemanticIcon
                          concept="calendar"
                          label={labels.days}
                          className="h-3 w-3"
                        />
                        {days}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <SemanticIcon
                          concept="time"
                          label={labels.hours}
                          className="h-3 w-3"
                        />
                        {pl.statedHours > 0 ? (
                          `${fmt.hours(pl.statedHours)} h`
                        ) : (
                          <UnknownToken what={labels.hoursUnknown} />
                        )}
                      </span>
                      {pl.state === "existing" && (
                        <SemanticIcon
                          concept="confirmed"
                          label={labels.state.existing}
                          className="h-3 w-3 text-state-success"
                        />
                      )}
                    </span>
                  </span>
                  <span
                    className="flex items-center gap-1.5"
                    aria-label={labels.people}
                  >
                    <span className="flex gap-0.5">
                      {(at?.people ?? []).slice(0, 5).map((p) => (
                        <PersonMark
                          key={p.label}
                          label={p.label}
                          size="xs"
                          lit={personFilter === p.label}
                        />
                      ))}
                    </span>
                    {(at?.people.length ?? 0) > 5 && (
                      <span className="font-mono text-meta text-text-muted">
                        +{(at?.people.length ?? 0) - 5}
                      </span>
                    )}
                  </span>
                </span>
                {/* WHEN — the place's active period on the company's span */}
                {period && (
                  <span
                    className="relative block h-1 w-full rounded-full bg-ink-700/80"
                    aria-hidden
                    title={
                      pl.firstDate && pl.lastDate
                        ? `${labels.period}: ${fmt.day(pl.firstDate)} → ${fmt.day(pl.lastDate)}`
                        : undefined
                    }
                  >
                    <span
                      className={cn(
                        "absolute inset-y-0 rounded-full",
                        lit ? "bg-brand-blue" : "bg-brand-cyan/70",
                      )}
                      style={{
                        left: `${period.start * 100}%`,
                        width: `${Math.max(1.5, (period.end - period.start) * 100)}%`,
                      }}
                    />
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** ONE object in focus: who, when, how much — and the source behind it. */
export function HistoricalObjectFocus({
  place,
  field,
  calendar,
  locale,
  labels,
  personFilter,
  onSelectPerson,
  onSelectWeek,
}: {
  place: PlaceProjection;
  field: FieldProjection;
  calendar: CalendarProjection;
  locale: string;
  labels: ObjectsLabels;
  personFilter: string | null;
  onSelectPerson: (label: string) => void;
  onSelectWeek: (week: number) => void;
}) {
  const fmt = useFmt(locale);
  const at = field.places.find((p) => p.name === place.name);
  const weeks = useMemo(
    () => objectWeeks(calendar, place.name),
    [calendar, place.name],
  );
  const maxDays = Math.max(1, ...weeks.map((w) => w.days));
  const maxPersonDays = Math.max(1, ...(at?.people ?? []).map((p) => p.days));
  return (
    <section
      className="flex flex-col gap-5"
      data-testid="historical-object-focus"
      data-place={place.name}
    >
      <header className="flex items-center gap-3">
        <ObjectMark name={place.name} size="lg" lit label={labels.object} />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h3 className="truncate font-display text-title font-semibold tracking-tightest text-text-primary">
            {place.name}
          </h3>
          <div className="flex flex-wrap items-center gap-2 font-mono text-meta">
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 uppercase tracking-label",
                place.state === "existing"
                  ? "border-state-success/40 text-state-success"
                  : "border-brand-cyan/40 text-brand-cyan",
              )}
            >
              <SemanticIcon
                concept={place.state === "existing" ? "confirmed" : "object"}
                label={labels.state[place.state]}
                className="h-3 w-3"
              />
              {labels.state[place.state]}
            </span>
            {place.firstDate && place.lastDate && (
              <span className="inline-flex items-center gap-1 tabular-nums text-text-secondary">
                <SemanticIcon
                  concept="time"
                  label={labels.time}
                  className="h-3 w-3"
                />
                {fmt.day(place.firstDate)} → {fmt.day(place.lastDate)}
              </span>
            )}
          </div>
        </div>
      </header>

      <dl className="flex flex-wrap items-baseline gap-x-5 gap-y-1">
        <div className="flex items-baseline gap-1.5 font-display text-title font-bold tabular-nums text-text-primary">
          <dt className="sr-only">{labels.days}</dt>
          <dd className="flex items-baseline gap-1.5">
            <SemanticIcon
              concept="calendar"
              label={labels.days}
              className="h-3.5 w-3.5 self-center text-text-muted"
            />
            {at?.days ?? place.rows}
            <span className="font-mono text-meta font-normal uppercase tracking-label text-text-muted">
              {labels.days}
            </span>
          </dd>
        </div>
        <div className="flex items-baseline gap-1.5 font-display text-title font-bold tabular-nums text-text-primary">
          <dt className="sr-only">{labels.hours}</dt>
          <dd className="flex items-baseline gap-1.5">
            <SemanticIcon
              concept="time"
              label={labels.hours}
              className="h-3.5 w-3.5 self-center text-text-muted"
            />
            {place.statedHours > 0 ? (
              fmt.hours(place.statedHours)
            ) : (
              <UnknownToken what={labels.hoursUnknown} className="text-title" />
            )}
            <span className="font-mono text-meta font-normal uppercase tracking-label text-text-muted">
              h
            </span>
          </dd>
        </div>
        <div className="flex items-baseline gap-1.5 font-display text-title font-bold tabular-nums text-text-primary">
          <dt className="sr-only">{labels.people}</dt>
          <dd className="flex items-baseline gap-1.5">
            <SemanticIcon
              concept="person"
              label={labels.people}
              className="h-3.5 w-3.5 self-center text-text-muted"
            />
            {at?.people.length ?? place.people}
            <span className="font-mono text-meta font-normal uppercase tracking-label text-text-muted">
              {labels.people}
            </span>
          </dd>
        </div>
        {place.sharedRows > 0 && (
          <div
            className="flex items-baseline gap-1.5 font-mono text-meta tabular-nums text-text-secondary"
            title={labels.shared(place.sharedRows)}
          >
            <dt className="sr-only">{labels.shared(place.sharedRows)}</dt>
            <dd className="inline-flex items-center gap-1">
              <UnknownToken what={labels.shared(place.sharedRows)} />
              {place.sharedRows} d
            </dd>
          </div>
        )}
      </dl>

      {/* WHO — the people evidenced here, each with the bar of their days */}
      <ul
        className="flex flex-col"
        aria-label={labels.people}
        data-testid="historical-object-people"
      >
        {(at?.people ?? []).map((p) => (
          <li key={p.label}>
            <button
              type="button"
              onClick={() => onSelectPerson(p.label)}
              aria-pressed={personFilter === p.label}
              className={cn(
                "flex min-h-11 w-full items-center gap-2.5 rounded-md px-1.5 text-left transition-colors duration-fast",
                personFilter === p.label
                  ? "bg-brand-blue/10"
                  : "hover:bg-ink-800/70",
              )}
            >
              <PersonMark
                label={p.label}
                size="sm"
                lit={personFilter === p.label}
              />
              <span className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-support font-semibold text-text-primary">
                    {p.label}
                  </span>
                  <span className="font-mono text-meta tabular-nums text-text-muted">
                    {p.days} {labels.days} ·{" "}
                    {p.hours !== null ? `${fmt.hours(p.hours)} h` : "?"}
                  </span>
                </span>
                <span
                  aria-hidden
                  className="block h-1 w-full rounded-full bg-ink-700/80"
                >
                  <span
                    className={cn(
                      "block h-full rounded-full",
                      personFilter === p.label
                        ? "bg-brand-blue"
                        : "bg-brand-cyan/60",
                    )}
                    style={{
                      width: `${Math.max(3, (p.days / maxPersonDays) * 100)}%`,
                    }}
                  />
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>

      {/* WHEN — the object's rhythm by week */}
      {weeks.length > 0 && (
        <div className="flex flex-col gap-1">
          <span className="font-mono text-meta uppercase tracking-label text-text-muted">
            {labels.weeks}
          </span>
          <ol className="flex h-14 items-end gap-1.5" aria-label={labels.weeks}>
            {weeks.map((w) => (
              <li
                key={w.isoWeek}
                className="flex flex-col items-center justify-end gap-1"
              >
                <button
                  type="button"
                  onClick={() => onSelectWeek(w.isoWeek)}
                  title={`${labels.weekShort} ${w.isoWeek} · ${w.days} ${labels.days} · ${w.people} ${labels.people}`}
                  className="flex min-h-11 flex-col items-center justify-end gap-1 rounded-md px-1 hover:bg-ink-800/70"
                >
                  <span
                    aria-hidden
                    className="w-3.5 rounded-t-[1px] bg-brand-cyan/70"
                    style={{
                      height: `${Math.max(2, Math.round((w.days / maxDays) * 30))}px`,
                    }}
                  />
                  <span className="font-mono text-meta tabular-nums text-text-muted">
                    {w.isoWeek}
                  </span>
                </button>
              </li>
            ))}
          </ol>
        </div>
      )}

      {/* SOURCE — LEVEL 3 */}
      {(place.spellings.length > 0 || place.origin === "text") && (
        <details
          className="group/details"
          data-testid="historical-object-source"
        >
          <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 text-support text-text-secondary hover:text-text-primary [&::-webkit-details-marker]:hidden">
            <SemanticIcon
              concept="source"
              label={labels.source}
              className="h-4 w-4"
            />
            {labels.source}
            <span
              aria-hidden
              className="ml-auto font-mono text-meta text-text-muted transition-transform group-open/details:rotate-90"
            >
              ›
            </span>
          </summary>
          <div className="flex flex-col gap-1 pb-2 pt-1 text-meta text-text-secondary">
            {place.spellings.length > 0 && (
              <p data-testid="evidence-place-spellings">
                {labels.spellings}: {place.spellings.join(", ")}
              </p>
            )}
            {place.origin === "text" && <p>{labels.fromText}</p>}
          </div>
        </details>
      )}
    </section>
  );
}
