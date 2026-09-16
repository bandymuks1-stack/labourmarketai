"use client";

import { useMemo } from "react";

import { HistoricalPlayerCompact, type HistoricalPlayerCardLabels } from "@/components/app/historical-player-card";
import { SemanticIcon, type SemanticConcept } from "@/components/app/semantic-icon";
import type { CompanyProjection, FieldProjection, ImportProjection } from "@/lib/organization-evidence/import-projections";
import { objectMonogram } from "@/lib/organization-evidence/import-visual";
import { cn } from "@/lib/utils";

/**
 * OVERVIEW — the company as a living picture of its own history
 * (LABOURMARKET_VISUAL_FIRST constitution 2026-09-16 §H, §W, §BJ).
 *
 * WHEN: the period's rhythm, one stacked bar per ISO week (the people's
 * daily hours), each a door into that week of the field. WHO: the people as
 * compact identities. WHERE: the places, and the WORK FOOTPRINT between
 * them — a people ↔ places map whose links are the evidenced days, so the
 * eye reads at once who worked where and how much. UNKNOWN: what the source
 * does not say (client, project, wage, team …) as `?` tokens, never as zero
 * and never as a paragraph.
 *
 * Nothing here is fabricated: no client, no hierarchy, no team, no wage, no
 * capacity, no performance. Selecting a person or a place focuses the same
 * workspace. Read-only.
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
  readonly card: Pick<HistoricalPlayerCardLabels, "weeks" | "weekShort" | "days" | "places" | "warning" | "aggregate" | "person">;
}

const UNKNOWN_ICON: Record<CompanyProjection["unknown"][number], SemanticConcept> = {
  client: "company",
  project: "project",
  work_package: "work",
  wage: "money",
  output: "evidence",
  team: "team",
  aggregate_period: "time",
};

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
  const { people, calendar, field, company } = projection;
  const fmt = useMemo(() => {
    const num = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });
    const day = new Intl.DateTimeFormat(locale, { day: "numeric", month: locale === "lt" ? "long" : "short", timeZone: "UTC" });
    return { hours: (n: number) => num.format(n), day: (iso: string) => day.format(new Date(`${iso}T00:00:00Z`)) };
  }, [locale]);
  const maxWeek = Math.max(1, ...calendar.weeks.map((w) => w.hours));

  return (
    <div className="flex flex-col gap-5" data-testid="historical-overview">
      {/* WHEN — the rhythm */}
      {calendar.weeks.length > 0 && (
        <section className="flex flex-col gap-1" data-testid="evidence-time-spine" aria-label={labels.rhythm}>
          <span className="font-mono text-meta uppercase tracking-label text-text-muted">{labels.rhythm}</span>
          <ol className="flex h-16 items-end gap-1.5">
            {calendar.weeks.map((w) => {
              const byPerson = new Map<string, number>();
              for (const d of w.days) for (const p of d.people) byPerson.set(p.label, (byPerson.get(p.label) ?? 0) + (p.hours ?? 0));
              const stack = [...byPerson.entries()].sort((a, b) => a[0].localeCompare(b[0]));
              return (
                <li key={w.isoWeek} className="flex min-w-0 flex-1 flex-col items-stretch justify-end gap-0.5" data-testid="evidence-spine-week" data-iso-week={w.isoWeek}>
                  <button
                    type="button"
                    onClick={() => onSelectWeek(w.isoWeek)}
                    title={`${labels.weekShort} ${w.isoWeek} · ${fmt.day(w.days[0].date)} – ${fmt.day(w.days[w.days.length - 1].date)} · ${fmt.hours(w.hours)} h · ${w.personDays} ${labels.personDaysShort}`}
                    className="flex min-h-11 w-full flex-col items-stretch justify-end gap-0.5 rounded-sm hover:bg-ink-800/60"
                  >
                    <span className="hidden text-center font-mono text-meta tabular-nums text-text-secondary sm:block">{fmt.hours(w.hours)}</span>
                    <span className="flex w-full flex-col-reverse gap-px" style={{ height: `${Math.max(4, Math.round((w.hours / maxWeek) * 32))}px` }} aria-hidden>
                      {stack.map(([label, h]) => (
                        <span
                          key={label}
                          className={cn("w-full flex-none", selectedPerson === null || selectedPerson === label ? "bg-brand-cyan/75" : "bg-brand-cyan/20")}
                          style={{ height: `${w.hours > 0 ? Math.max(1, (h / w.hours) * 100) : 0}%` }}
                        />
                      ))}
                    </span>
                    <span className="text-center font-mono text-meta tabular-nums text-text-muted">{w.isoWeek}</span>
                  </button>
                </li>
              );
            })}
          </ol>
        </section>
      )}

      <div className="grid gap-5 lg:grid-cols-[18rem_minmax(0,1fr)]">
        {/* WHO */}
        <section className="flex flex-col gap-1" aria-label={labels.people} data-testid="evidence-people">
          <span className="font-mono text-meta uppercase tracking-label text-text-muted">{labels.people} · {people.length}</span>
          <ul className="flex flex-col">
            {people.map((p) => (
              <li key={p.label} data-testid="evidence-person-card" data-state={p.state}>
                <HistoricalPlayerCompact person={p} labels={labels.card} formatHours={fmt.hours} selected={selectedPerson === p.label} dimmed={selectedPerson !== null} onSelect={() => onSelectPerson(p.label)} />
              </li>
            ))}
          </ul>
        </section>

        {/* WHO ↔ WHERE — the footprint */}
        <section className="flex flex-col gap-1" aria-label={labels.footprint} data-testid="historical-footprint">
          <span className="font-mono text-meta uppercase tracking-label text-text-muted">{labels.footprint} · {labels.objects} {company.places}</span>
          <div className="hidden sm:block">
            <Footprint field={field} people={people.map((p) => p.label)} selectedPerson={selectedPerson} selectedObject={selectedObject} onSelectPerson={onSelectPerson} onSelectObject={onSelectObject} labels={labels} />
          </div>
          {/* A phone shows one context at a time: the places as compact marks,
              each a door into the object's focus. */}
          <ul className="flex flex-wrap gap-1 sm:hidden" aria-label={labels.objects}>
            {field.places.map((pl) => (
              <li key={pl.name}>
                <button
                  type="button"
                  onClick={() => onSelectObject(pl.name)}
                  aria-pressed={selectedObject === pl.name}
                  className={cn(
                    "inline-flex min-h-11 items-center gap-1.5 rounded-md border px-2 font-mono text-meta tabular-nums",
                    selectedObject === pl.name ? "border-brand-blue bg-brand-blue/10 text-text-primary" : "border-ink-600 text-text-secondary",
                  )}
                >
                  <span className="font-semibold">{objectMonogram(pl.name)}</span>
                  <span className="text-text-muted">{pl.days}</span>
                  <span className="sr-only">{pl.name} · {pl.days} {labels.days}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      </div>

      {/* UNKNOWN — what the source does not say */}
      <ul className="flex flex-wrap gap-1.5" data-testid="evidence-company-unknown" aria-label={labels.unknownTitle}>
        {company.unknown.map((u) => (
          <li key={u} className="inline-flex items-center gap-1 rounded-full border border-ink-500 px-2 py-0.5 font-mono text-meta uppercase tracking-label text-text-muted" title={labels.unknownItem(u)}>
            <SemanticIcon concept="unknown" label={labels.unknownTitle} className="h-3 w-3" />
            <SemanticIcon concept={UNKNOWN_ICON[u]} label={labels.unknownItem(u)} className="h-3 w-3" />
            <span className="sr-only">{labels.unknownItem(u)}</span>
            <span aria-hidden>{labels.unknownItem(u).split(" ")[0]}</span>
          </li>
        ))}
        {company.activities.map((a) => (
          <li key={a} className="inline-flex items-center gap-1 rounded-full border border-dashed border-ink-500 px-2 py-0.5 font-mono text-meta text-text-secondary" title={labels.activities}>
            <SemanticIcon concept="work" label={labels.activities} className="h-3 w-3" />
            {a}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** The people ↔ places map: a link per (person, place) with the evidenced
 *  days as its weight. SVG, text labels on both sides, nothing invented. */
function Footprint({
  field,
  people,
  selectedPerson,
  selectedObject,
  onSelectPerson,
  onSelectObject,
  labels,
}: {
  field: FieldProjection;
  people: readonly string[];
  selectedPerson: string | null;
  selectedObject: string | null;
  onSelectPerson: (label: string) => void;
  onSelectObject: (name: string) => void;
  labels: OverviewLabels;
}) {
  const places = field.places;
  // Drawn at ~1:1 in a ~960 px column, so the 12 px labels stay 12 px.
  const ROW = 22;
  const H = Math.max(people.length, places.length) * ROW + 8;
  const W = 960;
  const LEFT = 130;
  const RIGHT = W - 290;
  const py = (i: number) => 4 + ROW / 2 + (people.length === 1 ? (H - 8) / 2 : (i * (H - 8 - ROW)) / Math.max(1, people.length - 1));
  const oy = (i: number) => 4 + ROW / 2 + i * ROW;
  const maxDays = Math.max(1, ...places.flatMap((p) => p.people.map((pp) => pp.days)));
  const links = places.flatMap((pl, oi) =>
    pl.people.filter((pp) => people.includes(pp.label)).map((pp) => ({
      person: pp.label,
      place: pl.name,
      days: pp.days,
      x1: LEFT,
      y1: py(people.indexOf(pp.label)),
      x2: RIGHT,
      y2: oy(oi),
    })),
  );
  const lit = (person: string, place: string) =>
    (selectedPerson === null && selectedObject === null) || selectedPerson === person || selectedObject === place;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full max-w-[60rem]" role="img" aria-label={labels.footprint} data-testid="historical-footprint-map">
      <g aria-hidden>
        {links.map((l) => (
          <path
            key={`${l.person}→${l.place}`}
            d={`M ${l.x1} ${l.y1} C ${(l.x1 + l.x2) / 2} ${l.y1}, ${(l.x1 + l.x2) / 2} ${l.y2}, ${l.x2} ${l.y2}`}
            fill="none"
            className={cn("stroke-brand-cyan transition-opacity", lit(l.person, l.place) ? "opacity-60" : "opacity-10")}
            strokeWidth={Math.max(1, (l.days / maxDays) * 6)}
          />
        ))}
      </g>
      {people.map((label, i) => (
        <g key={label} transform={`translate(0 ${py(i)})`} className="cursor-pointer" onClick={() => onSelectPerson(label)} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelectPerson(label); } }} aria-label={label} aria-pressed={selectedPerson === label}>
          <circle cx={LEFT} cy={0} r={4} className={cn(selectedPerson === label ? "fill-brand-blue" : "fill-brand-cyan")} />
          <text x={LEFT - 10} y={4} textAnchor="end" className={cn("fill-current font-sans text-meta", selectedPerson === label ? "text-text-primary font-semibold" : "text-text-secondary")}>{label}</text>
        </g>
      ))}
      {places.map((pl, i) => (
        <g key={pl.name} transform={`translate(0 ${oy(i)})`} className="cursor-pointer" onClick={() => onSelectObject(pl.name)} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelectObject(pl.name); } }} aria-label={`${pl.name} · ${pl.days} ${labels.days}`} aria-pressed={selectedObject === pl.name}>
          <rect x={RIGHT - 4} y={-4} width={8} height={8} rx={2} className={cn(selectedObject === pl.name ? "fill-brand-blue" : "fill-text-muted")} />
          <text x={RIGHT + 10} y={4} className={cn("fill-current font-sans text-meta", selectedObject === pl.name ? "text-text-primary font-semibold" : "text-text-secondary")}>
            <tspan className="font-mono text-text-muted">{objectMonogram(pl.name)}</tspan>
            <tspan dx={6}>{pl.name}</tspan>
          </text>
        </g>
      ))}
    </svg>
  );
}
