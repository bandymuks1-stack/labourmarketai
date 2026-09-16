"use client";

import { useMemo } from "react";

import { SemanticIcon } from "@/components/app/semantic-icon";
import {
  playerInitials,
  PLAYER_IDENTITY_AVATAR_BORDER,
  PLAYER_IDENTITY_FALLBACK_SURFACE,
} from "@/lib/identity/player-identity";
import type { CalendarProjection, FieldProjection, PlaceProjection } from "@/lib/organization-evidence/import-projections";
import { objectMonogram, objectWeeks } from "@/lib/organization-evidence/import-visual";
import { cn } from "@/lib/utils";

/**
 * THE OBJECTS — the real places as compact work-context identities
 * (LABOURMARKET_VISUAL_FIRST constitution 2026-09-16 §V, §BI).
 *
 * Seventeen places are seventeen compact nodes: the place mark, the name, the
 * people evidenced there as identity tiles, the days, the hours the source
 * attributes there explicitly or `?`, and a mark when a decision waits. Not a
 * seventeen-row report. Selecting one focuses the SAME workspace on it: its
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

const TILE = cn("flex shrink-0 items-center justify-center rounded-full font-display font-semibold", PLAYER_IDENTITY_AVATAR_BORDER, PLAYER_IDENTITY_FALLBACK_SURFACE);
const MARK = "flex shrink-0 items-center justify-center rounded-md border border-ink-500 bg-ink-700 font-mono font-semibold text-text-primary";

function useFmt(locale: string) {
  return useMemo(() => {
    const num = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });
    const day = new Intl.DateTimeFormat(locale, { day: "numeric", month: locale === "lt" ? "long" : "short", timeZone: "UTC" });
    return { hours: (n: number) => num.format(n), day: (iso: string) => day.format(new Date(`${iso}T00:00:00Z`)) };
  }, [locale]);
}

/** The compact nodes. */
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
  const real = places.filter((p) => p.state !== "ambiguous");
  return (
    <ul className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3" data-testid="historical-objects" aria-label={labels.title}>
      {real.map((pl) => {
        const at = peopleAt.get(pl.name);
        const lit = selected === pl.name;
        const dim = (selected !== null && !lit) || (personFilter !== null && !(at?.people.some((p) => p.label === personFilter) ?? false));
        return (
          <li key={pl.name}>
            <button
              type="button"
              onClick={() => onSelect(lit ? null : pl.name)}
              aria-pressed={lit}
              data-testid="historical-object"
              data-place={pl.name}
              data-state={pl.state}
              className={cn(
                "flex min-h-11 w-full items-center gap-2.5 rounded-md border px-2 py-1.5 text-left transition-colors",
                lit ? "border-brand-blue bg-brand-blue/10" : "border-ink-600 bg-ink-800/40 hover:border-brand-blue",
                dim && !lit ? "opacity-35" : "",
              )}
            >
              <span aria-hidden className={cn(MARK, "h-9 w-9 text-meta")}>{objectMonogram(pl.name)}</span>
              <span className="sr-only">{labels.object}</span>
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="truncate text-support font-semibold text-text-primary">{pl.name}</span>
                <span className="flex items-center gap-2 font-mono text-meta tabular-nums text-text-muted">
                  <span className="inline-flex items-center gap-1"><SemanticIcon concept="calendar" label={labels.days} className="h-3 w-3" />{at?.days ?? pl.rows}</span>
                  <span className="inline-flex items-center gap-1"><SemanticIcon concept="time" label={labels.hours} className="h-3 w-3" />{pl.statedHours > 0 ? fmt.hours(pl.statedHours) : "?"}</span>
                  {pl.state === "existing" && <SemanticIcon concept="confirmed" label={labels.state.existing} className="h-3 w-3 text-state-success" />}
                  {pl.origin === "text" && <SemanticIcon concept="source" label={labels.fromText} className="h-3 w-3" />}
                </span>
              </span>
              <span className="flex -space-x-1.5" aria-label={labels.people}>
                {(at?.people ?? []).slice(0, 4).map((p) => (
                  <span key={p.label} aria-hidden className={cn(TILE, "h-6 w-6 text-meta", personFilter === p.label ? "ring-1 ring-brand-blue" : "")} title={p.label}>{playerInitials(p.label)}</span>
                ))}
                {(at?.people.length ?? 0) > 4 && <span className="ml-2.5 self-center font-mono text-meta text-text-muted">+{(at?.people.length ?? 0) - 4}</span>}
              </span>
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
        <span aria-hidden className={cn(MARK, "h-14 w-14 text-card-title")}>{objectMonogram(place.name)}</span>
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
              <span aria-hidden className={cn(TILE, "h-8 w-8 text-meta")}>{playerInitials(p.label)}</span>
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
