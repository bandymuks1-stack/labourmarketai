import { ProvenanceEdge, ProvenanceLine } from "@/components/app/provenance/provenance-edge";
import { WorkHistoryTimeline } from "@/components/app/player-card/work-history-timeline";
import {
  playerInitials,
  PLAYER_IDENTITY_AVATAR_BORDER,
  PLAYER_IDENTITY_FALLBACK_SURFACE,
} from "@/lib/identity/player-identity";
import type { HistoryTimeline } from "@/lib/player-card/evidence-visuals";
import type { PersonProjection } from "@/lib/organization-evidence/import-projections";
import { cn } from "@/lib/utils";

/**
 * HISTORICAL PLAYER CARD — the `history-card` variant of the ONE person
 * identity (lib/identity/player-identity.ts), rendered from an
 * organization's evidence about a person (owner command 2026-09-16 §3–§5).
 *
 * It is the same atom as the worker's own player card, with the same rules:
 * the monogram tile, never a synthesised face; the provenance EDGE and its
 * text equivalent as the ONE "why believe this" (EVIDENCE_SUPPORTED — the
 * organization reported it, nobody has independently confirmed it; gold is
 * reserved for a real confirmation and never appears here); real figures
 * with their unit; no score, rating, rank or tier of any kind.
 *
 * What it shows is what the evidence supports and nothing more: a
 * HISTORICAL period, days and hours of work the source states as a day's
 * work, period aggregates kept apart, places, activities, the source's own
 * words, the interpretations the reading made, and the questions still
 * open. It says out loud that the person's CURRENT state is not inferred
 * from history (§3: employment, availability, wage, skill, location are
 * never derived here).
 */

export interface HistoricalPlayerCardLabels {
  readonly historical: string;
  readonly state: string;
  readonly relationship: string;
  readonly provenance: string;
  readonly provenanceText: string;
  readonly hours: string;
  readonly days: string;
  readonly places: string;
  readonly aggregate: string;
  readonly aggregateRemote: string;
  readonly aggregatePeriodUnknown: string;
  readonly currentNotInferred: string;
  readonly openQuestions: string;
  readonly weeks: string;
  readonly weekShort: string;
  readonly details: string;
  readonly timeline: {
    readonly title: string;
    readonly current: string;
    readonly empty: string;
    readonly ariaLabel: string;
  };
  readonly activities: string;
  readonly evidence: string;
  readonly interpretations: string;
  readonly interpretationNames: Readonly<Record<string, string>>;
  readonly unknowns: string;
  readonly unknownAllocation: string;
  readonly unknownPlace: string;
  readonly noActivities: string;
}

function historyTimelineFor(person: PersonProjection, fmt: (iso: string) => string): {
  timeline: HistoryTimeline;
  laneDetails: string[];
  range: string | null;
} {
  const from = person.firstDate;
  const to = person.lastDate;
  if (!from || !to) {
    return { timeline: { lanes: [], ticks: [], undatedCount: 0, fromIso: null, toIso: null }, laneDetails: [], range: null };
  }
  const start = Date.parse(`${from}T00:00:00Z`);
  const end = Math.max(Date.parse(`${to}T00:00:00Z`), start + 86_400_000);
  const span = end - start;
  // One lane per place, spanning the person's first and last dated day
  // THERE. A place without a dated day (aggregates only) is not placed.
  const placed = person.places.slice(0, 8).filter((p) => p.firstDate && p.lastDate);
  const lanes = placed.map((p, i) => {
    const a = Date.parse(`${p.firstDate}T00:00:00Z`);
    const b = Date.parse(`${p.lastDate}T00:00:00Z`) + 86_400_000;
    return {
      id: `${i}:${p.name}`,
      label: p.name,
      startFraction: Math.max(0, Math.min(1, (a - start) / span)),
      endFraction: Math.max(0, Math.min(1, (b - start) / span)),
      current: false,
    };
  });
  return {
    timeline: { lanes, ticks: [], undatedCount: 0, fromIso: from, toIso: to },
    laneDetails: placed.map((p) => `${fmt(p.firstDate as string)} – ${fmt(p.lastDate as string)} · ${p.rows} d.${p.hours > 0 ? ` · ${p.hours} h` : ""}`),
    range: `${fmt(from)} – ${fmt(to)}`,
  };
}

export function HistoricalPlayerCard({
  person,
  labels,
  formatDate,
  formatHours,
  personId,
}: {
  person: PersonProjection;
  labels: HistoricalPlayerCardLabels;
  formatDate: (iso: string) => string;
  formatHours: (n: number) => string;
  /** A stable DOM id so the field board can deep-link to the card. */
  personId: string;
}) {
  const name = person.name ?? person.label;
  const maxWeekHours = Math.max(1, ...person.weeks.map((w) => w.hours));
  const { timeline, laneDetails, range } = historyTimelineFor(person, formatDate);
  const openQuestions = person.openRows;

  return (
    <article
      id={personId}
      className="flex gap-3 rounded-card border border-ink-600 bg-ink-800/60 p-3 sm:p-4"
      data-testid="historical-player-card"
      data-identity-variant="history-card"
      data-state={person.state}
      data-open={openQuestions}
    >
      <ProvenanceEdge provenanceClass="EVIDENCE_SUPPORTED" />
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        {/* identity */}
        <header className="flex items-start gap-3">
          <div
            aria-hidden
            data-testid="historical-player-monogram"
            className={cn(
              "flex h-14 w-14 shrink-0 items-center justify-center rounded-full font-display text-lg font-semibold",
              PLAYER_IDENTITY_AVATAR_BORDER,
              PLAYER_IDENTITY_FALLBACK_SURFACE,
            )}
          >
            {playerInitials(name)}
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <h3 className="truncate font-display text-lg font-semibold tracking-tightest text-text-primary">{name}</h3>
              <span className="rounded-full border border-brand-orange/40 px-2 py-0.5 font-mono text-meta uppercase tracking-label text-brand-orange">
                {labels.historical}
              </span>
            </div>
            <p className="text-xs text-text-secondary">
              {range ?? "—"} · {labels.state} · {labels.relationship}
            </p>
            <ProvenanceLine provenanceClass="EVIDENCE_SUPPORTED" text={`${labels.provenance}: ${labels.provenanceText}`} testid="historical-player-provenance" />
          </div>
        </header>

        {/* the work, in real figures */}
        <dl className="grid grid-cols-3 gap-2" data-testid="historical-player-figures">
          <div className="flex flex-col">
            <dt className="font-mono text-meta uppercase tracking-label text-text-muted">{labels.hours}</dt>
            <dd className="font-display text-xl font-bold tabular-nums text-text-primary">{formatHours(person.hours)} h</dd>
          </div>
          <div className="flex flex-col">
            <dt className="font-mono text-meta uppercase tracking-label text-text-muted">{labels.days}</dt>
            <dd className="font-display text-xl font-bold tabular-nums text-text-primary">{person.days}</dd>
          </div>
          <div className="flex flex-col">
            <dt className="font-mono text-meta uppercase tracking-label text-text-muted">{labels.places}</dt>
            <dd className="font-display text-xl font-bold tabular-nums text-text-primary">{person.places.length}</dd>
          </div>
        </dl>

        {/* time: one bar per week — the person's own rhythm */}
        {person.weeks.length > 0 && (
          <div className="flex flex-col gap-1" data-testid="historical-player-weeks">
            <span className="font-mono text-meta uppercase tracking-label text-text-muted">{labels.weeks}</span>
            <ol className="flex h-14 items-end gap-2 border-b border-ink-600" aria-label={labels.weeks}>
              {person.weeks.map((w) => (
                <li
                  key={w.isoWeek}
                  className="flex flex-1 flex-col items-center justify-end gap-1"
                  title={`${labels.weekShort} ${w.isoWeek}: ${formatHours(w.hours)} h · ${w.days} d.`}
                >
                  <span className="font-mono text-[10px] tabular-nums text-text-secondary">{formatHours(w.hours)}</span>
                  <span
                    className="w-3 rounded-t-[2px] bg-brand-cyan"
                    style={{ height: `${Math.max(3, Math.round((w.hours / maxWeekHours) * 28))}px` }}
                  />
                  <span className="font-mono text-[10px] tabular-nums text-text-muted">{w.isoWeek}</span>
                </li>
              ))}
            </ol>
          </div>
        )}

        {/* places */}
        {person.places.length > 0 && (
          <ul className="flex flex-wrap gap-1.5" data-testid="historical-player-places">
            {person.places.slice(0, 4).map((p) => (
              <li key={p.name} className="rounded-full border border-ink-500 bg-ink-900 px-2 py-0.5 text-xs text-text-primary">
                {p.name}
                <span className="text-text-muted"> · {p.rows} d.</span>
              </li>
            ))}
            {person.places.length > 4 && (
              <li className="rounded-full px-2 py-0.5 text-xs text-text-muted">+{person.places.length - 4}</li>
            )}
          </ul>
        )}

        {/* aggregates, apart */}
        {person.aggregateRows > 0 && (
          <p className="text-xs text-state-amber" data-testid="historical-player-aggregate">
            {labels.aggregate.replace("{hours}", formatHours(person.aggregateHours)).replace("{rows}", String(person.aggregateRows))}
            {person.remoteRows > 0 ? ` · ${labels.aggregateRemote}` : ""}
            {` · ${labels.aggregatePeriodUnknown}`}
          </p>
        )}

        <p className="text-xs text-text-muted" data-testid="historical-player-current">{labels.currentNotInferred}</p>
        {openQuestions > 0 && (
          <p className="text-xs text-state-amber">{labels.openQuestions.replace("{count}", String(openQuestions))}</p>
        )}

        {/* the evidence behind the card */}
        <details className="rounded-md border border-ink-600" data-testid="historical-player-details">
          <summary className="cursor-pointer px-3 py-2 text-sm text-text-secondary">{labels.details}</summary>
          <div className="flex flex-col gap-4 px-3 pb-3 pt-1">
            <WorkHistoryTimeline
              timeline={timeline}
              labels={{
                title: labels.timeline.title,
                current: labels.timeline.current,
                undated: null,
                range,
                laneDetails,
                empty: labels.timeline.empty,
                ariaLabel: labels.timeline.ariaLabel,
              }}
            />
            <section className="flex flex-col gap-1">
              <h4 className="font-mono text-meta uppercase tracking-label text-text-muted">{labels.activities}</h4>
              {person.activities.length > 0 ? (
                <ul className="flex flex-wrap gap-1.5">
                  {person.activities.map((a) => (
                    <li key={a} className="rounded-full border border-ink-500 px-2 py-0.5 text-xs text-text-secondary">{a}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-text-muted">{labels.noActivities}</p>
              )}
            </section>
            {person.evidenceSamples.length > 0 && (
              <section className="flex flex-col gap-1" data-testid="historical-player-evidence">
                <h4 className="font-mono text-meta uppercase tracking-label text-text-muted">{labels.evidence}</h4>
                <ul className="flex flex-col gap-1">
                  {person.evidenceSamples.map((s) => (
                    <li key={s} className="border-l-2 border-ink-500 pl-2 text-xs italic leading-relaxed text-text-secondary">“{s}”</li>
                  ))}
                </ul>
              </section>
            )}
            {person.interpretations.length > 0 && (
              <section className="flex flex-col gap-1" data-testid="historical-player-interpretations">
                <h4 className="font-mono text-meta uppercase tracking-label text-text-muted">{labels.interpretations}</h4>
                <ul className="flex flex-col gap-0.5 text-xs text-text-secondary">
                  {person.interpretations.map((i) => (
                    <li key={i.method}>
                      {labels.interpretationNames[i.method] ?? i.method} · {i.rows}
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {(person.unallocatedRows > 0 || person.noPlaceRows > 0) && (
              <section className="flex flex-col gap-1" data-testid="historical-player-unknowns">
                <h4 className="font-mono text-meta uppercase tracking-label text-text-muted">{labels.unknowns}</h4>
                <ul className="flex flex-col gap-0.5 text-xs text-text-secondary">
                  {person.unallocatedRows > 0 && <li>{labels.unknownAllocation.replace("{count}", String(person.unallocatedRows))}</li>}
                  {person.noPlaceRows > 0 && <li>{labels.unknownPlace.replace("{count}", String(person.noPlaceRows))}</li>}
                </ul>
              </section>
            )}
          </div>
        </details>
      </div>
    </article>
  );
}
