import { PersonMark, PlaceMark } from "@/components/app/historical/historical-marks";
import { ProvenanceEdge, ProvenanceLine } from "@/components/app/provenance/provenance-edge";
import { WorkHistoryTimeline } from "@/components/app/player-card/work-history-timeline";
import { SemanticIcon, type SemanticConcept } from "@/components/app/semantic-icon";
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
 * about a person (LABOURMARKET_VISUAL_FIRST constitution 2026-09-16 §J–§O;
 * owner correction 2026-09-17: "visually center the person / identity, the
 * professional identity, evidence-backed activity, known work contexts, the
 * rhythm and the state; unknown profession / skills / availability / pay stay
 * visibly unknown").
 *
 * Two renderings of the SAME atom, both from the same projection:
 *
 *   COMPACT  the identity among others — mark, name, days · places, the
 *            rhythm strip, ⚠ when a decision waits, Σ when a period
 *            aggregate stands apart. Selectable.
 *
 *   FOCUS    layer 1 is the person: the large identity mark, the name, the
 *            professional identity line (profession `?` — it is NOT inferred
 *            from history), the period, three real figures, and the WORK
 *            REALITY band as the dominant object — the places as lanes on
 *            the person's own time. Then the known contexts as place marks,
 *            the rhythm, and the CURRENT line where profession · skills ·
 *            availability · pay are each a `?`. Everything textual — the
 *            source's words, the interpretations, the provenance sentence,
 *            the roster state — is layer 3, behind INSPECT.
 *
 * Never: a synthesised face, a score / rating / rank / tier, gold (reserved
 * for a real confirmation), a skill (hours are not competency), a current
 * state. The same card language is meant to scale worker → team → project.
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
  /** The CURRENT line: each is a `?` — never inferred from history. */
  readonly profession: string;
  readonly skills: string;
  readonly availability: string;
  readonly pay: string;
  readonly contexts: string;
  readonly object: string;
}

const MONOGRAM = cn(
  "flex shrink-0 items-center justify-center rounded-full font-display font-semibold",
  PLAYER_IDENTITY_AVATAR_BORDER,
  PLAYER_IDENTITY_FALLBACK_SURFACE,
);

/** The person's own rhythm: one bar per evidenced week, week numbers under
 *  the bars when there is room (`labelled`). */
function WeekStrip({
  person,
  height,
  labels,
  formatHours,
  labelled,
}: {
  person: PersonProjection;
  height: number;
  labels: Pick<HistoricalPlayerCardLabels, "weeks" | "weekShort">;
  formatHours: (n: number) => string;
  labelled?: boolean;
}) {
  if (person.weeks.length === 0) return null;
  const max = Math.max(1, ...person.weeks.map((w) => w.hours));
  return (
    <ol className={cn("flex items-end", labelled ? "gap-1.5" : "gap-px")} aria-label={labels.weeks} data-testid="historical-player-weeks">
      {person.weeks.map((w) => (
        <li key={w.isoWeek} className="flex flex-col items-center gap-1" title={`${labels.weekShort} ${w.isoWeek}: ${formatHours(w.hours)} h · ${w.days} d`}>
          <span aria-hidden className={cn("rounded-t-[1px] bg-brand-cyan/70", labelled ? "w-4" : "w-1.5")} style={{ height: `${Math.max(2, Math.round((w.hours / max) * height))}px` }} />
          {labelled && <span className="font-mono text-meta tabular-nums text-text-muted">{w.isoWeek}</span>}
        </li>
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
  onHover,
}: {
  person: PersonProjection;
  labels: Pick<HistoricalPlayerCardLabels, "weeks" | "weekShort" | "days" | "places" | "warning" | "aggregate" | "person">;
  formatHours: (n: number) => string;
  selected: boolean;
  dimmed?: boolean;
  onSelect: () => void;
  onHover?: (label: string | null) => void;
}) {
  const name = person.name ?? person.label;
  return (
    <button
      type="button"
      onClick={onSelect}
      onMouseEnter={onHover ? () => onHover(person.label) : undefined}
      onMouseLeave={onHover ? () => onHover(null) : undefined}
      onFocus={onHover ? () => onHover(person.label) : undefined}
      onBlur={onHover ? () => onHover(null) : undefined}
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
        <PersonMark label={name} size="md" lit={selected} />
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

const CURRENT: readonly { key: "profession" | "skills" | "availability" | "pay"; icon: SemanticConcept }[] = [
  { key: "profession", icon: "work" },
  { key: "skills", icon: "evidence" },
  { key: "availability", icon: "calendar" },
  { key: "pay", icon: "money" },
];

/** FOCUS — the identity in front of you. */
export function HistoricalPlayerCard({
  person,
  labels,
  formatDate,
  formatHours,
  personId,
  onSelectObject,
}: {
  person: PersonProjection;
  labels: HistoricalPlayerCardLabels;
  formatDate: (iso: string) => string;
  formatHours: (n: number) => string;
  /** A stable DOM id so the field can deep-link to the card. */
  personId: string;
  onSelectObject?: (name: string) => void;
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
  const aggregateText = labels.aggregate.replace("{hours}", formatHours(person.aggregateHours)).replace("{rows}", String(person.aggregateRows));

  return (
    <article
      id={personId}
      className="flex gap-4"
      data-testid="historical-player-card"
      data-identity-variant="history-card"
      data-state={person.state}
      data-open={openQuestions}
    >
      <ProvenanceEdge provenanceClass="EVIDENCE_SUPPORTED" />
      <div className="flex min-w-0 flex-1 flex-col gap-5">
        {/* ── LAYER 1: the person ─────────────────────────────────────── */}
        <header className="flex items-center gap-5">
          <span className="relative shrink-0">
            <span aria-hidden data-testid="historical-player-monogram" className={cn(MONOGRAM, "h-24 w-24 text-title-lg ring-2 ring-brand-cyan/50 ring-offset-4 ring-offset-ink-800")}>
              {playerInitials(name)}
            </span>
            {openQuestions > 0 && (
              <span className="absolute -right-1 -top-1 flex h-6 w-6 items-center justify-center rounded-full bg-brand-orange text-ink-900" title={labels.openQuestions.replace("{count}", String(openQuestions))}>
                <SemanticIcon concept="warning" label={labels.warning} className="h-3.5 w-3.5" strokeWidth={2.5} />
              </span>
            )}
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <h3 className="truncate font-display text-title-lg font-semibold tracking-tightest text-text-primary">{name}</h3>
            {/* professional identity: profession is a `?` — history does not say */}
            <div className="flex flex-wrap items-center gap-2 text-support">
              <span className="inline-flex items-center gap-1.5 text-text-secondary" title={labels.currentNotInferred}>
                <SemanticIcon concept="work" label={labels.profession} className="h-4 w-4 text-text-muted" />
                {labels.profession}
                <span className="font-mono text-text-muted">?</span>
              </span>
              <span className="inline-flex items-center gap-1 rounded-full border border-brand-orange/40 px-2 py-0.5 font-mono text-meta uppercase tracking-label text-brand-orange">
                <SemanticIcon concept="historical" label={labels.historical} className="h-3 w-3" />
                {labels.historical}
              </span>
            </div>
            {range && (
              <span className="inline-flex items-center gap-1.5 font-mono text-support tabular-nums text-text-secondary">
                <SemanticIcon concept="time" label={labels.time} className="h-4 w-4 text-text-muted" />
                {range}
              </span>
            )}
          </div>
        </header>

        {/* the work, in real figures — icon · value · unit */}
        <dl className="flex flex-wrap items-baseline gap-x-6 gap-y-1" data-testid="historical-player-figures">
          <Figure icon="calendar" value={String(person.days)} unit={labels.days} />
          <Figure icon="time" value={formatHours(person.hours)} unit="h" label={labels.hours} />
          <Figure icon="object" value={String(person.places.length)} unit={labels.places} />
          {person.aggregateRows > 0 && (
            <div className="flex items-baseline gap-1.5" data-testid="historical-player-aggregate" title={aggregateText}>
              <dt className="sr-only">{aggregateText}</dt>
              <dd className="flex items-baseline gap-1.5 font-display text-title font-bold tabular-nums text-state-amber">
                Σ {formatHours(person.aggregateHours)}
                <span className="font-mono text-meta font-normal uppercase tracking-label text-state-amber">
                  h · {person.remoteRows > 0 ? labels.aggregateRemote : `? ${labels.aggregatePeriodUnknown}`}
                </span>
              </dd>
            </div>
          )}
        </dl>

        {/* ── THE DOMINANT OBJECT: work reality — places on the person's time ── */}
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

        {/* known work contexts · rhythm */}
        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto]">
          <div className="flex flex-col gap-1.5">
            <span className="font-mono text-meta uppercase tracking-label text-text-muted">{labels.contexts}</span>
            <ul className="flex flex-wrap gap-1.5" data-testid="historical-player-places" aria-label={labels.places}>
              {person.places.slice(0, 5).map((p) => (
                <li key={p.name}>
                  {onSelectObject ? (
                    <button type="button" onClick={() => onSelectObject(p.name)} className="min-h-7 rounded">
                      <PlaceMark name={p.name} figure={`${p.rows} d`} label={labels.object} />
                    </button>
                  ) : (
                    <PlaceMark name={p.name} figure={`${p.rows} d`} label={labels.object} />
                  )}
                </li>
              ))}
              {person.places.length > 5 && <li className="self-center font-mono text-meta text-text-muted">+{person.places.length - 5}</li>}
              {person.activities.map((a) => (
                <li key={a} className="inline-flex min-h-7 items-center gap-1 rounded border border-dashed border-ink-500 px-1.5 text-support text-text-secondary">
                  <SemanticIcon concept="work" label={labels.activities} className="h-3 w-3 text-text-muted" />
                  {a}
                </li>
              ))}
            </ul>
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="font-mono text-meta uppercase tracking-label text-text-muted">{labels.weeks}</span>
            <WeekStrip person={person} height={28} labels={labels} formatHours={formatHours} labelled />
          </div>
        </div>

        {/* CURRENT — each a `?`, visibly. Nothing here is inferred from history. */}
        <ul className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-ink-600 pt-3" data-testid="historical-player-current" aria-label={labels.currentToken} title={labels.currentNotInferred}>
          <li className="inline-flex items-center gap-1 font-mono text-meta uppercase tracking-label text-text-muted">
            <SemanticIcon concept="current" label={labels.currentToken} className="h-3 w-3" />
            {labels.currentToken.replace(/[:：]?\s*\?$/, "")}
          </li>
          {CURRENT.map((c) => (
            <li key={c.key} className="inline-flex items-center gap-1.5 text-support text-text-secondary">
              <SemanticIcon concept={c.icon} label={labels[c.key]} className="h-3.5 w-3.5 text-text-muted" />
              {labels[c.key]}
              <span className="font-mono text-text-muted">?</span>
            </li>
          ))}
          <li className="ml-auto hidden sm:block" data-testid="historical-player-unknowns" aria-label={labels.unknowns}>
            <span className="flex flex-wrap gap-1.5">
              {person.unallocatedRows > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full border border-ink-600 px-2 py-0.5 font-mono text-meta text-text-muted" title={labels.unknownAllocation.replace("{count}", String(person.unallocatedRows))}>
                  <SemanticIcon concept="unknown" label={labels.unknown} className="h-3 w-3" />
                  {person.unallocatedRows} d
                </span>
              )}
              {person.noPlaceRows > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full border border-ink-600 px-2 py-0.5 font-mono text-meta text-text-muted" title={labels.unknownPlace.replace("{count}", String(person.noPlaceRows))}>
                  <SemanticIcon concept="unknown" label={labels.unknown} className="h-3 w-3" />
                  <SemanticIcon concept="location" label={labels.places} className="h-3 w-3" />
                  {person.noPlaceRows} d
                </span>
              )}
            </span>
          </li>
        </ul>

        {/* ── LAYER 3: INSPECT — the evidence behind the identity ─────── */}
        <details className="rounded-md border border-ink-600" data-testid="historical-player-details">
          <summary className="flex min-h-11 cursor-pointer items-center gap-2 px-3 text-support text-text-secondary">
            <SemanticIcon concept="source" label={labels.details} className="h-4 w-4" />
            {labels.details}
          </summary>
          <div className="flex flex-col gap-4 px-3 pb-3 pt-1">
            <ProvenanceLine provenanceClass="EVIDENCE_SUPPORTED" text={`${labels.provenance}: ${labels.provenanceText} · ${labels.state} · ${labels.relationship}`} testid="historical-player-provenance" className="text-meta" />
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
            {person.aggregateRows > 0 && <p className="text-meta text-state-amber">{aggregateText}</p>}
            <p className="text-meta text-text-muted">{labels.currentNotInferred}</p>
          </div>
        </details>
      </div>
    </article>
  );
}

function Figure({ icon, value, unit, label }: { icon: SemanticConcept; value: string; unit: string; label?: string }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <dt className="sr-only">{label ?? unit}</dt>
      <dd className="flex items-baseline gap-1.5 font-display text-title font-bold tabular-nums text-text-primary">
        <SemanticIcon concept={icon} label={label ?? unit} className="h-4 w-4 self-center text-text-muted" />
        {value}
        <span className="font-mono text-meta font-normal uppercase tracking-label text-text-muted">{unit}</span>
      </dd>
    </div>
  );
}
