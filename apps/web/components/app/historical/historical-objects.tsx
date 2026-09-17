"use client";

import { useMemo } from "react";

import { PersonMark } from "@/components/app/historical/historical-marks";
import { SemanticIcon } from "@/components/app/semantic-icon";
import type { CalendarProjection, FieldProjection, PlaceProjection } from "@/lib/organization-evidence/import-projections";
import { objectMonogram, objectWeeks } from "@/lib/organization-evidence/import-visual";
import { cn } from "@/lib/utils";

/**
 * THE OBJECTS — the real places as compact work-context identities
 * (LABOURMARKET_VISUAL_FIRST constitution 2026-09-16 §V, §BI).
 *
 * Seventeen places are seventeen place identities, most-worked first: the
 * location glyph, the NAME, the place's active period drawn on the company's
 * own time span, the people evidenced there as identity marks, and the days
 * (hours where the source split them, `?` where it did not). The monogram is
 * a tooltip. Not a seventeen-row report, not a catalogue of equal rows: the
 * period bar and the marks make each place look like itself. Selecting one focuses the SAME workspace on it: its
 * people with their days, its rhythm by week, its period; the source
 * spellings that folded into it (`Hoofdgraht`, `Hoofdgrat`, …) are LEVEL 3 —
 * behind SOURCE — unless a human decision is needed, in which case the
 * question lives in ATTENTION.
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
  readonly shared: string;
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
}

const MARK = "flex shrink-0 items-center justify-center rounded-md border border-ink-500 bg-ink-700 text-text-primary";

const DAY_MS = 86_400_000;
/** Where a place's active period sits on the company's span, as fractions. */
function periodFractions(first: string | null, last: string | null, spanFirst: string | null, spanLast: string | null): { start: number; end: number } | null {
  if (!first || !last || !spanFirst || !spanLast) return null;
  const a = Date.parse(`${spanFirst}T00:00:00Z`);
  const b = Date.parse(`${spanLast}T00:00:00Z`) + DAY_MS;
  const span = Math.max(DAY_MS, b - a);
  return {
    start: Math.max(0, Math.min(1, (Date.parse(`${first}T00:00:00Z`) - a) / span)),
    end: Math.max(0, Math.min(1, (Date.parse(`${last}T00:00:00Z`) + DAY_MS - a) / span)),
  };
}

function useFmt(locale: string) {
  return useMemo(() => {
    const num = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });
    const day = new Intl.DateTimeFormat(locale, { day: "numeric", month: locale === "lt" ? "long" : "short", timeZone: "UTC" });
    return { hours: (n: number) => num.format(n), day: (iso: string) => day.format(new Date(`${iso}T00:00:00Z`)) };
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
  const peopleAt = useMemo(() => new Map(field.places.map((p) => [p.name, p] as const)), [field]);
  const spanFirst = field.weeks[0]?.firstDate ?? null;
  const spanLast = field.weeks[field.weeks.length - 1]?.lastDate ?? null;
  const real = places.filter((p) => p.state !== "ambiguous");
  const maxDays = Math.max(1, ...real.map((p) => peopleAt.get(p.name)?.days ?? p.rows));
  return (
    <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3" data-testid="historical-objects" aria-label={labels.title}>
      {real.map((pl) => {
        const at = peopleAt.get(pl.name);
        const days = at?.days ?? pl.rows;
        const lit = selected === pl.name;
        const dim = (selected !== null && !lit) || (personFilter !== null && !(at?.people.some((p) => p.label === personFilter) ?? false));
        const period = periodFractions(pl.firstDate, pl.lastDate, spanFirst, spanLast);
        const weight = days / maxDays;
        return (
          <li key={pl.name}>
            <button
              type="button"
              onClick={() => onSelect(lit ? null : pl.name)}
              aria-pressed={lit}
              data-testid="historical-object"
              data-place={pl.name}
              data-state={pl.state}
              title={`${pl.name} (${objectMonogram(pl.name)})`}
              className={cn(
                "flex min-h-11 w-full flex-col gap-2 rounded-md border p-2.5 text-left transition-colors",
                lit ? "border-brand-blue bg-brand-blue/10" : "border-ink-600 bg-ink-800/40 hover:border-brand-blue",
                dim && !lit ? "opacity-35" : "",
              )}
            >
              <span className="flex items-center gap-2.5">
                <span aria-hidden className={cn(MARK, weight > 0.5 ? "h-11 w-11" : "h-9 w-9")}>
                  <SemanticIcon concept="object" label={labels.object} className={weight > 0.5 ? "h-5 w-5" : "h-4 w-4"} strokeWidth={2} />
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className={cn("truncate font-display font-semibold text-text-primary", weight > 0.5 ? "text-card-title" : "text-support")}>{pl.name}</span>
                  <span className="flex items-center gap-2 font-mono text-meta tabular-nums text-text-muted">
                    <span className="inline-flex items-center gap-1"><SemanticIcon concept="calendar" label={labels.days} className="h-3 w-3" />{days} {labels.days}</span>
                    <span className="inline-flex items-center gap-1"><SemanticIcon concept="time" label={labels.hours} className="h-3 w-3" />{pl.statedHours > 0 ? `${fmt.hours(pl.statedHours)} h` : "?"}</span>
                    {pl.state === "existing" && <SemanticIcon concept="confirmed" label={labels.state.existing} className="h-3 w-3 text-state-success" />}
                  </span>
                </span>
                <span className="flex items-center gap-1.5" aria-label={labels.people}>
                  <span className="flex -space-x-1.5">
                    {(at?.people ?? []).slice(0, 4).map((p) => (
                      <PersonMark key={p.label} label={p.label} size="sm" lit={personFilter === p.label} />
                    ))}
                  </span>
                  {(at?.people.length ?? 0) > 4 && <span className="font-mono text-meta text-text-muted">+{(at?.people.length ?? 0) - 4}</span>}
                </span>
              </span>
              {/* WHEN — the place's active period on the company's span */}
              {period && (
                <span className="relative block h-1.5 w-full rounded-full bg-ink-700" aria-hidden title={pl.firstDate && pl.lastDate ? `${fmt.day(pl.firstDate)} → ${fmt.day(pl.lastDate)}` : undefined}>
                  <span className={cn("absolute inset-y-0 rounded-full", lit ? "bg-brand-blue" : "bg-brand-cyan/70")} style={{ left: `${period.start * 100}%`, width: `${Math.max(2, (period.end - period.start) * 100)}%` }} />
                </span>
              )}
            </button>
          </li>
        );
      })}
    </ul>
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
  const weeks = useMemo(() => objectWeeks(calendar, place.name), [calendar, place.name]);
  const maxDays = Math.max(1, ...weeks.map((w) => w.days));
  return (
    <section className="flex flex-col gap-4" data-testid="historical-object-focus" data-place={place.name}>
      <header className="flex items-center gap-3">
        <span aria-hidden className={cn(MARK, "h-14 w-14")} title={objectMonogram(place.name)}>
          <SemanticIcon concept="object" label={labels.object} className="h-7 w-7" strokeWidth={1.75} />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h3 className="truncate font-display text-title font-semibold tracking-tightest text-text-primary">{place.name}</h3>
          <div className="flex flex-wrap items-center gap-1.5 font-mono text-meta">
            <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 uppercase tracking-label", place.state === "existing" ? "border-state-success/40 text-state-success" : "border-brand-cyan/40 text-brand-cyan")}>
              <SemanticIcon concept={place.state === "existing" ? "confirmed" : "object"} label={labels.state[place.state]} className="h-3 w-3" />
              {labels.state[place.state]}
            </span>
            {place.firstDate && place.lastDate && (
              <span className="inline-flex items-center gap-1 tabular-nums text-text-secondary">
                <SemanticIcon concept="time" label={labels.time} className="h-3 w-3" />
                {fmt.day(place.firstDate)} → {fmt.day(place.lastDate)}
              </span>
            )}
          </div>
        </div>
      </header>

      <dl className="flex flex-wrap items-baseline gap-x-5 gap-y-1">
        <div className="flex items-baseline gap-1.5 font-display text-card-title font-bold tabular-nums text-text-primary">
          <dt className="sr-only">{labels.days}</dt>
          <dd className="flex items-baseline gap-1.5"><SemanticIcon concept="calendar" label={labels.days} className="h-3.5 w-3.5 self-center text-text-muted" />{at?.days ?? place.rows}<span className="font-mono text-meta font-normal uppercase tracking-label text-text-muted">{labels.days}</span></dd>
        </div>
        <div className="flex items-baseline gap-1.5 font-display text-card-title font-bold tabular-nums text-text-primary">
          <dt className="sr-only">{labels.hours}</dt>
          <dd className="flex items-baseline gap-1.5"><SemanticIcon concept="time" label={labels.hours} className="h-3.5 w-3.5 self-center text-text-muted" />{place.statedHours > 0 ? fmt.hours(place.statedHours) : "?"}<span className="font-mono text-meta font-normal uppercase tracking-label text-text-muted">h</span></dd>
        </div>
        <div className="flex items-baseline gap-1.5 font-display text-card-title font-bold tabular-nums text-text-primary">
          <dt className="sr-only">{labels.people}</dt>
          <dd className="flex items-baseline gap-1.5"><SemanticIcon concept="person" label={labels.people} className="h-3.5 w-3.5 self-center text-text-muted" />{at?.people.length ?? place.people}<span className="font-mono text-meta font-normal uppercase tracking-label text-text-muted">{labels.people}</span></dd>
        </div>
        {place.sharedRows > 0 && (
          <div className="flex items-baseline gap-1.5 font-mono text-meta tabular-nums text-text-secondary" title={labels.shared.replace("{count}", String(place.sharedRows))}>
            <dt className="sr-only">{labels.shared.replace("{count}", String(place.sharedRows))}</dt>
            <dd className="inline-flex items-center gap-1"><SemanticIcon concept="unknown" label={labels.unknown} className="h-3 w-3" />{place.sharedRows} d</dd>
          </div>
        )}
      </dl>

      {/* WHO — the people evidenced here, compact */}
      <ul className="flex flex-col gap-0.5" aria-label={labels.people} data-testid="historical-object-people">
        {(at?.people ?? []).map((p) => (
          <li key={p.label}>
            <button type="button" onClick={() => onSelectPerson(p.label)} aria-pressed={personFilter === p.label} className={cn("flex min-h-11 w-full items-center gap-2 rounded-md border px-2 text-left", personFilter === p.label ? "border-brand-blue bg-brand-blue/10" : "border-transparent hover:border-ink-500")}>
              <PersonMark label={p.label} size="sm" lit={personFilter === p.label} />
              <span className="flex-1 truncate text-support font-semibold text-text-primary">{p.label}</span>
              <span className="font-mono text-meta tabular-nums text-text-muted">{p.days} {labels.days} · {p.hours !== null ? `${fmt.hours(p.hours)} h` : "?"}</span>
            </button>
          </li>
        ))}
      </ul>

      {/* WHEN — the object's rhythm by week */}
      {weeks.length > 0 && (
        <div className="flex flex-col gap-1">
          <span className="font-mono text-meta uppercase tracking-label text-text-muted">{labels.weeks}</span>
          <ol className="flex h-12 items-end gap-1.5" aria-label={labels.weeks}>
            {weeks.map((w) => (
              <li key={w.isoWeek} className="flex flex-col items-center justify-end gap-1">
                <button type="button" onClick={() => onSelectWeek(w.isoWeek)} title={`${labels.weekShort} ${w.isoWeek} · ${w.days} ${labels.days} · ${w.people} ${labels.people}`} className="flex flex-col items-center gap-1">
                  <span aria-hidden className="w-3 rounded-t-[1px] bg-brand-cyan/70" style={{ height: `${Math.max(2, Math.round((w.days / maxDays) * 28))}px` }} />
                  <span className="font-mono text-meta tabular-nums text-text-muted">{w.isoWeek}</span>
                </button>
              </li>
            ))}
          </ol>
        </div>
      )}

      {/* SOURCE — LEVEL 3 */}
      {(place.spellings.length > 0 || place.origin === "text") && (
        <details className="rounded-md border border-ink-600" data-testid="historical-object-source">
          <summary className="flex min-h-11 cursor-pointer items-center gap-2 px-3 text-support text-text-secondary">
            <SemanticIcon concept="source" label={labels.source} className="h-4 w-4" />
            {labels.source}
          </summary>
          <div className="flex flex-col gap-1 px-3 pb-3 pt-1 text-meta text-text-secondary">
            {place.spellings.length > 0 && (
              <p data-testid="evidence-place-spellings">{labels.spellings}: {place.spellings.join(", ")}</p>
            )}
            {place.origin === "text" && <p>{labels.fromText}</p>}
          </div>
        </details>
      )}
    </section>
  );
}
