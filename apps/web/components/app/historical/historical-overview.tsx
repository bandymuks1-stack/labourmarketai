"use client";

import { useMemo, useState } from "react";

import { HistoricalPlayerCompact, type HistoricalPlayerCardLabels } from "@/components/app/historical-player-card";
import { SemanticIcon, type SemanticConcept } from "@/components/app/semantic-icon";
import type { CompanyProjection, FieldProjection, ImportProjection } from "@/lib/organization-evidence/import-projections";
import { playerInitials } from "@/lib/identity/player-identity";
import { cn } from "@/lib/utils";

/**
 * OVERVIEW — the company as a living picture of its own history
 * (LABOURMARKET_VISUAL_FIRST constitution 2026-09-16 §H, §W, §BJ).
 *
 * WHEN: the period's rhythm, one stacked bar per ISO week (the people's
 * daily hours), each a door into that week of the field. WHO: the people as
 * compact identities. WHERE: the places as a FOOTPRINT — each place with the
 * bar of its evidenced days. The relationships between them are drawn only
 * for ONE focused person or place (hover or selection): the owner's walk
 * showed that every relationship at equal weight is spaghetti. UNKNOWN:
 * what the source does not say (client, project, wage, team …) as `?`
 * tokens, never as zero and never as a paragraph.
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
  const [hovered, setHovered] = useState<{ kind: "person" | "object"; id: string } | null>(null);
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

      {/* WHO ↔ WHERE — the footprint: people on the left, places with their
          days on the right; a relationship is drawn only for the focused one */}
      <section className="flex flex-col gap-1" aria-label={labels.footprint} data-testid="historical-footprint">
        <span className="font-mono text-meta uppercase tracking-label text-text-muted">{labels.footprint} · {labels.people} {people.length} · {labels.objects} {company.places}</span>
        <div className="hidden sm:block">
          <Footprint field={field} people={people.map((p) => p.label)} selectedPerson={selectedPerson} selectedObject={selectedObject} hovered={hovered} onHover={setHovered} onSelectPerson={onSelectPerson} onSelectObject={onSelectObject} labels={labels} formatHours={fmt.hours} />
        </div>
        {/* A phone shows one context at a time: the people, then the places
            as compact marks, each a door into its focus. */}
        <div className="flex flex-col gap-2 sm:hidden">
          <ul className="flex flex-col" data-testid="evidence-people">
            {people.map((p) => (
              <li key={p.label} data-testid="evidence-person-card" data-state={p.state}>
                <HistoricalPlayerCompact person={p} labels={labels.card} formatHours={fmt.hours} selected={selectedPerson === p.label} dimmed={selectedPerson !== null} onSelect={() => onSelectPerson(p.label)} />
              </li>
            ))}
          </ul>
          <ul className="flex flex-wrap gap-1" aria-label={labels.objects}>
            {field.places.map((pl) => (
              <li key={pl.name}>
                <button
                  type="button"
                  onClick={() => onSelectObject(pl.name)}
                  aria-pressed={selectedObject === pl.name}
                  className={cn(
                    "inline-flex min-h-11 max-w-full items-center gap-1.5 rounded-md border px-2 font-mono text-meta tabular-nums",
                    selectedObject === pl.name ? "border-brand-blue bg-brand-blue/10 text-text-primary" : "border-ink-600 text-text-secondary",
                  )}
                >
                  <span className="truncate">{pl.name}</span>
                  <span className="text-text-muted">{pl.days}</span>
                  <span className="sr-only">{pl.days} {labels.days}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </section>

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

/** The footprint: people on the left as identity marks, places on the right
 *  with the bar of their evidenced days. Edges — the person → place links
 *  weighted by days — are drawn ONLY for the focused person or place (hover
 *  or selection), so the default reads as a clean footprint and a focus reads
 *  as one story. Nothing invented. */
function Footprint({
  field,
  people,
  selectedPerson,
  selectedObject,
  hovered,
  onHover,
  onSelectPerson,
  onSelectObject,
  labels,
  formatHours,
}: {
  field: FieldProjection;
  people: readonly string[];
  selectedPerson: string | null;
  selectedObject: string | null;
  hovered: { kind: "person" | "object"; id: string } | null;
  onHover: (h: { kind: "person" | "object"; id: string } | null) => void;
  onSelectPerson: (label: string) => void;
  onSelectObject: (name: string) => void;
  labels: OverviewLabels;
  formatHours: (n: number) => string;
}) {
  const places = field.places;
  // Drawn at ~1:1 in a ~960 px column, so the 12 px labels stay 12 px.
  const ROW = 26;
  const H = Math.max(people.length, places.length) * ROW + 12;
  const W = 960;
  const LEFT = 170;
  const RIGHT = 470;
  const BAR = 190; // the days bar after the name; the figure sits after the bar
  const py = (i: number) => 6 + ROW / 2 + (people.length === 1 ? (H - 12) / 2 : (i * (H - 12 - ROW)) / Math.max(1, people.length - 1));
  const oy = (i: number) => 6 + ROW / 2 + i * ROW;
  const maxDays = Math.max(1, ...places.map((p) => p.days));
  const maxLink = Math.max(1, ...places.flatMap((p) => p.people.map((pp) => pp.days)));

  const focus = selectedPerson ? { kind: "person" as const, id: selectedPerson } : selectedObject ? { kind: "object" as const, id: selectedObject } : hovered;
  const links = places.flatMap((pl, oi) =>
    pl.people
      .filter((pp) => people.includes(pp.label))
      .filter((pp) => focus !== null && ((focus.kind === "person" && focus.id === pp.label) || (focus.kind === "object" && focus.id === pl.name)))
      .map((pp) => ({ person: pp.label, place: pl.name, days: pp.days, hours: pp.hours, x1: LEFT, y1: py(people.indexOf(pp.label)), x2: RIGHT, y2: oy(oi) })),
  );
  const personLit = (label: string) => focus === null || (focus.kind === "person" ? focus.id === label : places.find((p) => p.name === focus.id)?.people.some((pp) => pp.label === label));
  const placeLit = (name: string) => focus === null || (focus.kind === "object" ? focus.id === name : places.find((p) => p.name === name)?.people.some((pp) => pp.label === focus.id));
  const key = (fn: () => void) => (e: React.KeyboardEvent) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fn(); } };

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full max-w-[60rem]" role="img" aria-label={labels.footprint} data-testid="historical-footprint-map" data-focus={focus ? `${focus.kind}:${focus.id}` : "none"} onMouseLeave={() => onHover(null)}>
      <g aria-hidden>
        {links.map((l) => (
          <path
            key={`${l.person}→${l.place}`}
            d={`M ${l.x1 + 14} ${l.y1} C ${(l.x1 + l.x2) / 2} ${l.y1}, ${(l.x1 + l.x2) / 2} ${l.y2}, ${l.x2 - 6} ${l.y2}`}
            fill="none"
            className="stroke-brand-cyan opacity-70"
            strokeWidth={Math.max(1.5, (l.days / maxLink) * 7)}
          />
        ))}
      </g>
      {people.map((label, i) => {
        const lit = personLit(label);
        const y = py(i);
        return (
          <g key={label} className={cn("cursor-pointer transition-opacity", lit ? "opacity-100" : "opacity-25")} onClick={() => onSelectPerson(label)} onMouseEnter={() => onHover({ kind: "person", id: label })} role="button" tabIndex={0} onKeyDown={key(() => onSelectPerson(label))} onFocus={() => onHover({ kind: "person", id: label })} aria-label={label} aria-pressed={selectedPerson === label}>
            <circle cx={LEFT} cy={y} r={13} className={cn("stroke-ink-500", selectedPerson === label ? "fill-brand-blue/30" : "fill-ink-700")} strokeWidth={1} />
            <text x={LEFT} y={y + 4} textAnchor="middle" className="fill-current font-display text-meta font-semibold text-text-primary">{playerInitials(label)}</text>
            <text x={LEFT - 20} y={y + 4} textAnchor="end" className={cn("fill-current font-sans text-support", selectedPerson === label ? "text-text-primary font-semibold" : "text-text-primary")}>{label}</text>
          </g>
        );
      })}
      {places.map((pl, i) => {
        const lit = placeLit(pl.name);
        const y = oy(i);
        const at = focus?.kind === "person" ? pl.people.find((pp) => pp.label === focus.id) : null;
        const days = at ? at.days : pl.days;
        const w = Math.max(3, (days / maxDays) * BAR);
        return (
          <g key={pl.name} className={cn("cursor-pointer transition-opacity", lit ? "opacity-100" : "opacity-25")} onClick={() => onSelectObject(pl.name)} onMouseEnter={() => onHover({ kind: "object", id: pl.name })} role="button" tabIndex={0} onKeyDown={key(() => onSelectObject(pl.name))} onFocus={() => onHover({ kind: "object", id: pl.name })} aria-label={`${pl.name} · ${days} ${labels.days}`} aria-pressed={selectedObject === pl.name}>
            <rect x={RIGHT - 5} y={y - 5} width={10} height={10} rx={2} className={cn(selectedObject === pl.name ? "fill-brand-blue" : "fill-text-muted")} />
            <text x={RIGHT + 12} y={y + 4} className={cn("fill-current font-sans text-support", selectedObject === pl.name ? "text-text-primary font-semibold" : "text-text-primary")}>{pl.name}</text>
            <rect x={RIGHT + 200} y={y - 4} width={w} height={8} rx={2} className={cn(at ? "fill-brand-cyan/80" : "fill-brand-cyan/40")} />
            <text x={RIGHT + 206 + w} y={y + 4} className="fill-current font-mono text-meta text-text-muted">{days} d{at && at.hours !== null ? ` · ${formatHours(at.hours)} h` : ""}</text>
          </g>
        );
      })}
    </svg>
  );
}
