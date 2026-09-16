import { ProvenanceEdge, ProvenanceLine } from "@/components/app/provenance/provenance-edge";
import { WorkHistoryTimeline } from "@/components/app/player-card/work-history-timeline";
import { SemanticIcon } from "@/components/app/semantic-icon";
import {
  playerInitials,
  PLAYER_IDENTITY_AVATAR_BORDER,
  PLAYER_IDENTITY_FALLBACK_SURFACE,
} from "@/lib/identity/player-identity";
import type { HistoryTimeline } from "@/lib/player-card/evidence-visuals";
import type { PersonProjection } from "@/lib/organization-evidence/import-projections";
import { personObjectLanes } from "@/lib/organization-evidence/import-visual";
import { cn } from "@/lib/utils";

/**
 * THE PREMIUM PLAYER IDENTITY, history-card variant — the ONE person identity
 * (lib/identity/player-identity.ts) rendered from an organization's evidence
 * about a person (LABOURMARKET_VISUAL_FIRST constitution 2026-09-16 §J–§O).
 *
 * Two renderings of the SAME atom, both from the same projection:
 *
 *   COMPACT  the identity in a group — monogram, name, the person's rhythm
 *            as a week strip, days and places as icon + number, an attention
 *            mark when a decision waits, a Σ mark when a period aggregate
 *            stands apart. Selectable. This is what a team, a field, an
 *            object and a company view show; never seven expanded cards.
 *
 *   FOCUS    the identity in front of you — the monogram with the
 *            EVIDENCE_SUPPORTED provenance edge, HISTORICAL and evidence-state
 *            tokens, the period, the real figures with their units, the
 *            person's WORK REALITY as object lanes on their own time band,
 *            the weekly rhythm, activities, the aggregate apart, UNKNOWN as a
 *            `?` token, and "current state not inferred" as a token. The
 *            source's words, the interpretations and the open questions are
 *            LEVEL 3 — behind INSPECT.
 *
 * What it never does: a synthesised face (the monogram tile is the neutral
 * professional identity), a score / rating / rank / tier of any kind, gold
 * (reserved for a real confirmation; an import is organization-reported
 * evidence, nobody has independently confirmed it), a skill (hours are not
 * competency), or a current state (employment, availability, wage, location
 * are never derived from history).
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
  readonly currentToken: string;
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
  readonly unknown: string;
  readonly person: string;
  readonly time: string;
  readonly evidenceIcon: string;
  readonly warning: string;
  readonly moreLanes: string;
}

const MONOGRAM = cn(
  "flex shrink-0 items-center justify-center rounded-full font-display font-semibold",
  PLAYER_IDENTITY_AVATAR_BORDER,
  PLAYER_IDENTITY_FALLBACK_SURFACE,
);

/** The person's own rhythm: one thin bar per evidenced week. */
function WeekStrip({ person, height, labels, formatHours }: { person: PersonProjection; height: number; labels: Pick<HistoricalPlayerCardLabels, "weeks" | "weekShort">; formatHours: (n: number) => string }) {
  if (person.weeks.length === 0) return null;
  const max = Math.max(1, ...person.weeks.map((w) => w.hours));
  return (
    <ol className="flex items-end gap-px" style={{ height }} aria-label={labels.weeks} data-testid="historical-player-weeks">
      {person.weeks.map((w) => (
        <li
          key={w.isoWeek}
          className="w-1.5 rounded-t-[1px] bg-brand-cyan/70"
          style={{ height: `${Math.max(2, Math.round((w.hours / max) * height))}px` }}
          title={`${labels.weekShort} ${w.isoWeek}: ${formatHours(w.hours)} h · ${w.days} d`}
        />
      ))}
    </ol>
  );
}

/** COMPACT — the identity among others. A button: selecting it focuses the
 *  same workspace on this person. */
export function HistoricalPlayerCompact({
  person,
  labels,
  formatHours,
  selected,
  dimmed,
  onSelect,
}: {
  person: PersonProjection;
  labels: Pick<HistoricalPlayerCardLabels, "weeks" | "weekShort" | "days" | "places" | "warning" | "aggregate" | "person">;
  formatHours: (n: number) => string;
  selected: boolean;
  dimmed?: boolean;
  onSelect: () => void;
}) {
  const name = person.name ?? person.label;
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      data-testid="historical-player-compact"
      data-identity-variant="history-card"
      data-label={person.label}
      data-open={person.openRows}
      className={cn(
        "flex min-h-11 w-full items-center gap-3 rounded-md border px-2 py-1.5 text-left transition-colors",
        selected ? "border-brand-blue bg-brand-blue/10" : "border-transparent hover:border-ink-500",
        dimmed && !selected ? "opacity-40" : "",
      )}
    >
      <span className="relative">
        <span aria-hidden className={cn(MONOGRAM, "h-10 w-10 text-support")}>
          {playerInitials(name)}
        </span>
        <span className="sr-only">{labels.person}</span>
        {person.openRows > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-brand-orange text-ink-900" title={labels.warning}>
            <SemanticIcon concept="warning" label={labels.warning} className="h-2.5 w-2.5" strokeWidth={2.5} />
          </span>
        )}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-support font-semibold text-text-primary">{name}</span>
        <span className="flex items-center gap-2 font-mono text-meta tabular-nums text-text-muted">
          <span className="inline-flex items-center gap-1">
            <SemanticIcon concept="calendar" label={labels.days} className="h-3 w-3" />
            {person.days}
          </span>
          <span className="inline-flex items-center gap-1">
            <SemanticIcon concept="object" label={labels.places} className="h-3 w-3" />
            {person.places.length}
          </span>
          {person.aggregateRows > 0 && (
            <span className="text-state-amber" title={labels.aggregate.replace("{hours}", formatHours(person.aggregateHours)).replace("{rows}", String(person.aggregateRows))}>
              Σ
            </span>
          )}
        </span>
      </span>
      <WeekStrip person={person} height={18} labels={labels} formatHours={formatHours} />
    </button>
  );
}

/** FOCUS — the identity in front of you. */
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
  /** A stable DOM id so the field can deep-link to the card. */
  personId: string;
}) {
  const name = person.name ?? person.label;
  const lanes = personObjectLanes(person);
  const shown = lanes.slice(0, 6);
  const timeline: HistoryTimeline = {
    lanes: shown.map((l, i) => ({
      id: `${i}:${l.name}`,
      label: `${l.name} · ${l.days} d`,
      startFraction: l.startFraction,
      endFraction: l.endFraction,
      current: false,
    })),
    ticks: [],
    undatedCount: 0,
    fromIso: person.firstDate,
    toIso: person.lastDate,
  };
  const range = person.firstDate && person.lastDate ? `${formatDate(person.firstDate)} → ${formatDate(person.lastDate)}` : null;
  const openQuestions = person.openRows;

  return (
    <article
      id={personId}
      className="flex gap-3"
      data-testid="historical-player-card"
      data-identity-variant="history-card"
      data-state={person.state}
      data-open={openQuestions}
    >
      <ProvenanceEdge provenanceClass="EVIDENCE_SUPPORTED" />
      <div className="flex min-w-0 flex-1 flex-col gap-4">
        {/* identity */}
        <header className="flex items-center gap-4">
          <span aria-hidden data-testid="historical-player-monogram" className={cn(MONOGRAM, "h-16 w-16 text-title ring-2 ring-brand-cyan/40 ring-offset-2 ring-offset-ink-800")}>
            {playerInitials(name)}
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <h3 className="truncate font-display text-title font-semibold tracking-tightest text-text-primary">{name}</h3>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="inline-flex items-center gap-1 rounded-full border border-brand-orange/40 px-2 py-0.5 font-mono text-meta uppercase tracking-label text-brand-orange">
                <SemanticIcon concept="historical" label={labels.historical} className="h-3 w-3" />
                {labels.historical}
              </span>
              <span className="inline-flex items-center gap-1 rounded-full border border-brand-cyan/40 px-2 py-0.5 font-mono text-meta uppercase tracking-label text-brand-cyan" data-testid="historical-player-evidence-state">
                <SemanticIcon concept="evidence" label={labels.evidenceIcon} className="h-3 w-3" />
                {labels.state}
              </span>
              {range && (
                <span className="inline-flex items-center gap-1 font-mono text-meta tabular-nums text-text-secondary">
                  <SemanticIcon concept="time" label={labels.time} className="h-3 w-3" />
                  {range}
                </span>
              )}
            </div>
            <ProvenanceLine provenanceClass="EVIDENCE_SUPPORTED" text={labels.provenanceText} testid="historical-player-provenance" className="text-meta" />
          </div>
        </header>

        {/* the work, in real figures — icon · value · unit */}
        <dl className="flex flex-wrap items-baseline gap-x-5 gap-y-1" data-testid="historical-player-figures">
          <div className="flex items-baseline gap-1.5">
            <dt className="sr-only">{labels.days}</dt>
            <dd className="flex items-baseline gap-1.5 font-display text-card-title font-bold tabular-nums text-text-primary">
              <SemanticIcon concept="calendar" label={labels.days} className="h-3.5 w-3.5 self-center text-text-muted" />
              {person.days}
              <span className="font-mono text-meta font-normal uppercase tracking-label text-text-muted">{labels.days}</span>
            </dd>
          </div>
          <div className="flex items-baseline gap-1.5">
            <dt className="sr-only">{labels.hours}</dt>
            <dd className="flex items-baseline gap-1.5 font-display text-card-title font-bold tabular-nums text-text-primary">
              <SemanticIcon concept="time" label={labels.hours} className="h-3.5 w-3.5 self-center text-text-muted" />
              {formatHours(person.hours)}
              <span className="font-mono text-meta font-normal uppercase tracking-label text-text-muted">h</span>
            </dd>
          </div>
          <div className="flex items-baseline gap-1.5">
            <dt className="sr-only">{labels.places}</dt>
            <dd className="flex items-baseline gap-1.5 font-display text-card-title font-bold tabular-nums text-text-primary">
              <SemanticIcon concept="object" label={labels.places} className="h-3.5 w-3.5 self-center text-text-muted" />
              {person.places.length}
              <span className="font-mono text-meta font-normal uppercase tracking-label text-text-muted">{labels.places}</span>
            </dd>
          </div>
          {person.aggregateRows > 0 && (
            <div className="flex items-baseline gap-1.5" data-testid="historical-player-aggregate" title={labels.aggregate.replace("{hours}", formatHours(person.aggregateHours)).replace("{rows}", String(person.aggregateRows))}>
              <dt className="sr-only">{labels.aggregate.replace("{hours}", formatHours(person.aggregateHours)).replace("{rows}", String(person.aggregateRows))}</dt>
              <dd className="flex items-baseline gap-1.5 font-display text-card-title font-bold tabular-nums text-state-amber">
                Σ {formatHours(person.aggregateHours)}
                <span className="font-mono text-meta font-normal uppercase tracking-label text-state-amber">
                  h · {person.remoteRows > 0 ? labels.aggregateRemote : `? ${labels.aggregatePeriodUnknown}`}
                </span>
              </dd>
            </div>
          )}
        </dl>

        {/* WORK REALITY — the person's places on their own time band */}
        <WorkHistoryTimeline
          timeline={timeline}
          labels={{
            title: labels.timeline.title,
            current: labels.timeline.current,
            undated: lanes.length > shown.length ? labels.moreLanes.replace("{count}", String(lanes.length - shown.length)) : null,
            range,
            laneDetails: [],
            empty: labels.timeline.empty,
            ariaLabel: labels.timeline.ariaLabel,
          }}
        />

        {/* rhythm · places · unknown · current — tokens, not sentences */}
        <div className="flex flex-wrap items-end gap-x-5 gap-y-3">
          <div className="flex flex-col gap-1">
            <span className="font-mono text-meta uppercase tracking-label text-text-muted">{labels.weeks}</span>
            <WeekStrip person={person} height={28} labels={labels} formatHours={formatHours} />
          </div>
          <ul className="flex flex-wrap gap-1.5" data-testid="historical-player-places" aria-label={labels.places}>
            {person.places.slice(0, 5).map((p) => (
              <li key={p.name} className="inline-flex items-center gap-1 rounded-full border border-ink-500 bg-ink-900 px-2 py-0.5 text-meta text-text-primary">
                <SemanticIcon concept="object" label={labels.places} className="h-3 w-3 text-text-muted" />
                {p.name}
                <span className="font-mono tabular-nums text-text-muted">{p.rows}</span>
              </li>
            ))}
            {person.places.length > 5 && <li className="rounded-full px-2 py-0.5 text-meta text-text-muted">+{person.places.length - 5}</li>}
            {person.activities.map((a) => (
              <li key={a} className="inline-flex items-center gap-1 rounded-full border border-dashed border-ink-500 px-2 py-0.5 text-meta text-text-secondary">
                <SemanticIcon concept="work" label={labels.activities} className="h-3 w-3 text-text-muted" />
                {a}
              </li>
            ))}
          </ul>
          <ul className="flex flex-wrap gap-1.5" data-testid="historical-player-unknowns" aria-label={labels.unknowns}>
            {person.unallocatedRows > 0 && (
              <li className="inline-flex items-center gap-1 rounded-full border border-ink-500 px-2 py-0.5 font-mono text-meta text-text-secondary" title={labels.unknownAllocation.replace("{count}", String(person.unallocatedRows))}>
                <SemanticIcon concept="unknown" label={labels.unknown} className="h-3 w-3" />
                {person.unallocatedRows} d
              </li>
            )}
            {person.noPlaceRows > 0 && (
              <li className="inline-flex items-center gap-1 rounded-full border border-ink-500 px-2 py-0.5 font-mono text-meta text-text-secondary" title={labels.unknownPlace.replace("{count}", String(person.noPlaceRows))}>
                <SemanticIcon concept="unknown" label={labels.unknown} className="h-3 w-3" />
                <SemanticIcon concept="location" label={labels.places} className="h-3 w-3" />
                {person.noPlaceRows} d
              </li>
            )}
            <li
              className="inline-flex items-center gap-1 rounded-full border border-ink-600 px-2 py-0.5 font-mono text-meta uppercase tracking-label text-text-muted"
              data-testid="historical-player-current"
              title={labels.currentNotInferred}
            >
              <SemanticIcon concept="current" label={labels.currentNotInferred} className="h-3 w-3" />
              {labels.currentToken}
            </li>
            {openQuestions > 0 && (
              <li className="inline-flex items-center gap-1 rounded-full border border-brand-orange/50 px-2 py-0.5 font-mono text-meta text-brand-orange" title={labels.openQuestions.replace("{count}", String(openQuestions))}>
                <SemanticIcon concept="warning" label={labels.warning} className="h-3 w-3" />
                {openQuestions}
              </li>
            )}
          </ul>
        </div>

        {/* INSPECT — the evidence behind the identity (LEVEL 3) */}
        <details className="rounded-md border border-ink-600" data-testid="historical-player-details">
          <summary className="flex min-h-11 cursor-pointer items-center gap-2 px-3 text-support text-text-secondary">
            <SemanticIcon concept="source" label={labels.details} className="h-4 w-4" />
            {labels.details}
          </summary>
          <div className="flex flex-col gap-4 px-3 pb-3 pt-1">
            {person.evidenceSamples.length > 0 && (
              <section className="flex flex-col gap-1" data-testid="historical-player-evidence">
                <h4 className="font-mono text-meta uppercase tracking-label text-text-muted">{labels.evidence}</h4>
                <ul className="flex flex-col gap-1">
                  {person.evidenceSamples.map((s) => (
                    <li key={s} className="border-l-2 border-ink-500 pl-2 text-meta italic leading-relaxed text-text-secondary">“{s}”</li>
                  ))}
                </ul>
              </section>
            )}
            {person.activities.length === 0 && <p className="text-meta text-text-muted">{labels.noActivities}</p>}
            {person.interpretations.length > 0 && (
              <section className="flex flex-col gap-1" data-testid="historical-player-interpretations">
                <h4 className="font-mono text-meta uppercase tracking-label text-text-muted">{labels.interpretations}</h4>
                <ul className="flex flex-col gap-0.5 text-meta text-text-secondary">
                  {person.interpretations.map((i) => (
                    <li key={i.method}>
                      {labels.interpretationNames[i.method] ?? i.method} · {i.rows}
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {(person.unallocatedRows > 0 || person.noPlaceRows > 0) && (
              <section className="flex flex-col gap-1">
                <h4 className="font-mono text-meta uppercase tracking-label text-text-muted">{labels.unknowns}</h4>
                <ul className="flex flex-col gap-0.5 text-meta text-text-secondary">
                  {person.unallocatedRows > 0 && <li>{labels.unknownAllocation.replace("{count}", String(person.unallocatedRows))}</li>}
                  {person.noPlaceRows > 0 && <li>{labels.unknownPlace.replace("{count}", String(person.noPlaceRows))}</li>}
                </ul>
              </section>
            )}
            <p className="text-meta text-text-muted">{labels.currentNotInferred}</p>
            <p className="text-meta text-text-muted">
              {labels.provenance}: {labels.provenanceText} · {labels.relationship}
            </p>
          </div>
        </details>
      </div>
    </article>
  );
}
