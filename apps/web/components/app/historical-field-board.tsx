"use client";

import { useMemo, useState } from "react";

import {
  playerInitials,
  PLAYER_IDENTITY_AVATAR_BORDER,
  PLAYER_IDENTITY_FALLBACK_SURFACE,
} from "@/lib/identity/player-identity";
import type { FieldProjection, FieldWeek } from "@/lib/organization-evidence/import-projections";
import { cn } from "@/lib/utils";

/**
 * HISTORICAL FIELD BOARD — the organization as it actually worked, read from
 * the same projection the player cards read (owner command 2026-09-16 §6,
 * §9): pick a WEEK, and the field shows every place with the people
 * evidenced there that week; pick a PERSON and their places light up; pick
 * a PLACE and its people do. Nothing here is a team, a membership, a plan
 * or a booking — the heading says "people evidenced working", and
 * co-occurrence in one file never becomes a canonical team (ARCH-4).
 *
 * READ-ONLY and purely client-side state over server-computed data: no
 * action, no fetch, no write. The same identity tile as the player card
 * (initials, never a synthesised face). Hours shown are DAILY hours the
 * source states; a place whose split is unknown shows a dash, never a
 * divided guess.
 */

export interface FieldBoardLabels {
  readonly title: string;
  readonly subtitle: string;
  readonly allWeeks: string;
  readonly week: string;
  readonly peopleEvidenced: string;
  readonly noWork: string;
  readonly hoursUnknown: string;
  /** One sentence under the field: hours appear only where the source split them. */
  readonly hoursUnknownNote: string;
  readonly days: string;
  readonly clear: string;
  readonly selectedPerson: string;
  readonly selectedPlace: string;
  readonly notATeam: string;
}

type Selection = { kind: "person"; label: string } | { kind: "place"; name: string } | null;

function Tile({
  label,
  active,
  dim,
  onClick,
  detail,
  summary,
  testId,
}: {
  label: string;
  active: boolean;
  dim: boolean;
  onClick: () => void;
  /** The full line (tooltip): days, hours or "hours not split". */
  detail: string;
  /** The short tail beside the name: days, and hours only when known. */
  summary: string;
  testId: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      data-testid={testId}
      title={detail}
      className={cn(
        "flex items-center gap-1.5 rounded-full border py-0.5 pl-0.5 pr-2.5 text-left transition-colors",
        active ? "border-brand-cyan bg-brand-cyan/10" : "border-ink-500 bg-ink-900 hover:border-brand-blue",
        dim && !active ? "opacity-40" : "",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-meta font-semibold",
          PLAYER_IDENTITY_AVATAR_BORDER,
          PLAYER_IDENTITY_FALLBACK_SURFACE,
        )}
      >
        {playerInitials(label)}
      </span>
      <span className="flex min-w-0 items-baseline gap-1 leading-tight">
        <span className="truncate text-xs font-semibold text-text-primary">{label}</span>
        <span className="text-meta tabular-nums text-text-muted">{summary}</span>
      </span>
    </button>
  );
}

export function HistoricalFieldBoard({
  field,
  labels,
  locale,
}: {
  field: FieldProjection;
  labels: FieldBoardLabels;
  /**
   * The locale, NOT formatter functions. This is a Client Component: every
   * prop crosses the server→client boundary and must be serialisable. Passing
   * `formatDate`/`formatHours` functions from the server component threw
   * "Functions cannot be passed directly to Client Components" on production
   * (build f3e090ef, digest 1624882775) and the whole history door fell to the
   * error fallback. The formatters are built here, from the locale.
   */
  locale: string;
}) {
  const [week, setWeek] = useState<number | "all">("all");
  const { formatDate, formatHours } = useMemo(() => {
    // Lithuanian has no textual short month ("10-22"); the long month reads
    // as a date in every active locale — the same rule the server side uses.
    const day = new Intl.DateTimeFormat(locale, { day: "numeric", month: locale === "lt" ? "long" : "short", timeZone: "UTC" });
    const num = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });
    return {
      formatDate: (iso: string) => {
        const d = new Date(`${iso}T00:00:00Z`);
        return Number.isNaN(d.getTime()) ? iso : day.format(d);
      },
      formatHours: (n: number) => num.format(n),
    };
  }, [locale]);
  const [selection, setSelection] = useState<Selection>(null);

  const scope = useMemo(() => {
    if (week === "all") {
      return {
        places: field.places.map((p) => ({
          name: p.name,
          days: p.days,
          hours: null as number | null,
          people: p.people.map((pp) => ({ label: pp.label, days: pp.days, hours: pp.hours })),
        })),
        firstDate: field.weeks[0]?.firstDate ?? null,
        lastDate: field.weeks[field.weeks.length - 1]?.lastDate ?? null,
      };
    }
    const w: FieldWeek | undefined = field.weeks.find((x) => x.isoWeek === week);
    if (!w) return { places: [], firstDate: null, lastDate: null };
    return {
      places: w.places.map((p) => ({
        name: p.name,
        days: p.days,
        hours: p.hours,
        people: p.people.map((label) => {
          const person = w.people.find((pp) => pp.label === label);
          const at = person?.places.find((pl) => pl.name === p.name);
          return { label, days: at?.days ?? 0, hours: at?.hours ?? null };
        }),
      })),
      firstDate: w.firstDate,
      lastDate: w.lastDate,
    };
  }, [field, week]);

  const highlightedPlaces = useMemo(() => {
    if (selection?.kind !== "person") return null;
    return new Set(scope.places.filter((p) => p.people.some((pp) => pp.label === selection.label)).map((p) => p.name));
  }, [scope, selection]);

  const togglePerson = (label: string) =>
    setSelection((s) => (s?.kind === "person" && s.label === label ? null : { kind: "person", label }));
  const togglePlace = (name: string) =>
    setSelection((s) => (s?.kind === "place" && s.name === name ? null : { kind: "place", name }));

  return (
    <section className="flex flex-col gap-3" data-testid="historical-field-board" data-week={String(week)}>
      <header className="flex flex-col gap-1">
        <h2 className="font-display text-lg font-semibold tracking-tightest text-text-primary">{labels.title}</h2>
        <p className="text-xs text-text-secondary">{labels.subtitle}</p>
      </header>

      {/* TIME — the week selector is the time machine's first dial */}
      <div className="flex flex-wrap gap-1.5" role="group" aria-label={labels.week}>
        <button
          type="button"
          onClick={() => setWeek("all")}
          aria-pressed={week === "all"}
          data-testid="field-week-all"
          className={cn(
            "rounded-full border px-3 py-1 text-xs font-semibold",
            week === "all" ? "border-brand-orange bg-brand-orange/10 text-brand-orange" : "border-ink-500 text-text-secondary hover:border-brand-blue",
          )}
        >
          {labels.allWeeks}
        </button>
        {field.weeks.map((w) => (
          <button
            key={w.isoWeek}
            type="button"
            onClick={() => setWeek(w.isoWeek)}
            aria-pressed={week === w.isoWeek}
            data-testid="field-week"
            data-iso-week={w.isoWeek}
            title={`${formatDate(w.firstDate)} – ${formatDate(w.lastDate)} · ${formatHours(w.hours)} h`}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-semibold tabular-nums",
              week === w.isoWeek ? "border-brand-orange bg-brand-orange/10 text-brand-orange" : "border-ink-500 text-text-secondary hover:border-brand-blue",
            )}
          >
            {labels.week} {w.isoWeek}
          </button>
        ))}
      </div>

      <p className="text-xs text-text-muted" data-testid="field-scope">
        {labels.peopleEvidenced}
        {scope.firstDate && scope.lastDate ? ` · ${formatDate(scope.firstDate)} – ${formatDate(scope.lastDate)}` : ""}
        {selection?.kind === "person" ? ` · ${labels.selectedPerson}: ${selection.label}` : ""}
        {selection?.kind === "place" ? ` · ${labels.selectedPlace}: ${selection.name}` : ""}
        {selection && (
          <>
            {" "}
            <button type="button" onClick={() => setSelection(null)} className="underline" data-testid="field-clear">
              {labels.clear}
            </button>
          </>
        )}
      </p>

      {/* THE FIELD — places as blocks, people as identity tiles inside them */}
      {scope.places.length === 0 ? (
        <p className="text-sm text-text-muted">{labels.noWork}</p>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3" data-testid="field-places">
          {scope.places.map((p) => {
            const placeActive = selection?.kind === "place" && selection.name === p.name;
            const dimmed =
              (highlightedPlaces !== null && !highlightedPlaces.has(p.name)) ||
              (selection?.kind === "place" && !placeActive);
            return (
              <li
                key={p.name}
                className={cn(
                  "flex flex-col gap-2 rounded-card border p-3 transition-opacity",
                  placeActive ? "border-brand-cyan bg-brand-cyan/5" : "border-ink-600 bg-ink-800/40",
                  dimmed ? "opacity-40" : "",
                )}
                data-testid="field-place"
                data-place={p.name}
              >
                <button
                  type="button"
                  onClick={() => togglePlace(p.name)}
                  aria-pressed={placeActive}
                  className="flex items-baseline justify-between gap-2 text-left"
                  data-testid="field-place-toggle"
                >
                  <span className="truncate font-semibold text-text-primary">{p.name}</span>
                  <span className="shrink-0 text-xs tabular-nums text-text-muted">
                    {p.days} {labels.days}
                    {p.hours !== null ? ` · ${formatHours(p.hours)} h` : ""}
                  </span>
                </button>
                <ul className="flex flex-wrap gap-1.5">
                  {p.people.map((pp) => {
                    const active = selection?.kind === "person" && selection.label === pp.label;
                    const dimPerson = selection?.kind === "person" && !active;
                    return (
                      <li key={pp.label}>
                        <Tile
                          label={pp.label}
                          active={active}
                          dim={dimPerson}
                          onClick={() => togglePerson(pp.label)}
                          testId="field-person"
                          detail={`${pp.days} ${labels.days}${pp.hours !== null ? ` · ${formatHours(pp.hours)} h` : ` · ${labels.hoursUnknown}`}`}
                          summary={`${pp.days} ${labels.days}${pp.hours !== null ? ` · ${formatHours(pp.hours)} h` : ""}`}
                        />
                      </li>
                    );
                  })}
                </ul>
              </li>
            );
          })}
        </ul>
      )}
      <p className="text-xs text-text-muted">{labels.hoursUnknownNote}</p>
      <p className="text-xs text-text-muted" data-testid="field-not-a-team">{labels.notATeam}</p>
    </section>
  );
}
