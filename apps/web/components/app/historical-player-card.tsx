import {
  ObjectMark,
  PersonMark,
  UnknownToken,
} from "@/components/app/historical/historical-marks";
import {
  ProvenanceEdge,
  ProvenanceLine,
} from "@/components/app/provenance/provenance-edge";
import { WorkHistoryTimeline } from "@/components/app/player-card/work-history-timeline";
import {
  SemanticIcon,
  type SemanticConcept,
} from "@/components/app/semantic-icon";
import type { HistoryTimeline } from "@/lib/player-card/evidence-visuals";
import type { PersonProjection } from "@/lib/organization-evidence/import-projections";
import {
  personObjectLanes,
  type PersonDay,
  type RingSegment,
} from "@/lib/organization-evidence/import-visual";
import { cn } from "@/lib/utils";

/**
 * THE PREMIUM PLAYER IDENTITY, history-card variant — the ONE person identity
 * (lib/identity/player-identity.ts) rendered from an organization's evidence
 * about a person (LABOURMARKET_VISUAL_FIRST constitution 2026-09-16 §J–§O;
 * owner correction 2026-09-17: "visually center the person / identity, the
 * professional identity, evidence-backed activity, known work contexts, the
 * rhythm and the state; unknown profession / skills / availability / pay stay
 * visibly unknown"; owner master handoff 2026-09-17 §12: "a large initials
 * circle + three figures is still a profile summary").
 *
 * The identity is a SHAPE made of evidence, not a summary of it:
 *
 *   the EVIDENCE RING around the monogram — one arc per week of the period,
 *   as long as the days evidenced that week, so no two people's identities
 *   look alike and none is a score;
 *   the DAILY RHYTHM — every dated day as a bar of its hours, on the
 *   person's own span, an unknown day as a dashed tick;
 *   the WORK REALITY — the places as lanes on the same span (the existing
 *   player-card band, evidence tone);
 *   the FOOTPRINT — the places as square marks with their days;
 *   the CURRENT line — profession · skills · availability · pay, each a `?`
 *   token: nothing about NOW is inferred from history.
 *
 * Two renderings of the SAME atom, both from the same projection:
 *   COMPACT — among others: ring mark, name, rhythm, days · places, ⚠, Σ.
 *   FOCUS   — the identity in front of you, the four shapes above, then
 *             INSPECT (level 3): the source's words, interpretations,
 *             unknowns, the provenance sentence.
 *
 * Never: a synthesised face, a score / rating / rank / tier, gold (reserved
 * for a real confirmation), a skill (hours are not competency), a current
 * state. The same card language scales worker → team → project.
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
  /** "+ {hours} h period aggregate ({rows} rows) …" — interpolated by the caller's translator. */
  readonly aggregate: (hours: string, rows: number) => string;
  readonly aggregateRemote: string;
  readonly aggregatePeriodUnknown: string;
  readonly currentNotInferred: string;
  readonly currentToken: string;
  readonly openQuestions: (count: number) => string;
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
  readonly unknownAllocation: (count: number) => string;
  readonly unknownPlace: (count: number) => string;
  readonly noActivities: string;
  readonly unknown: string;
  readonly person: string;
  readonly time: string;
  readonly evidenceIcon: string;
  readonly warning: string;
  readonly moreLanes: (count: number) => string;
  /** The CURRENT line: each is a `?` — never inferred from history. */
  readonly profession: string;
  readonly skills: string;
  readonly availability: string;
  readonly pay: string;
  readonly contexts: string;
  readonly object: string;
  readonly rhythm: string;
  readonly ring: (weeks: number, total: number) => string;
}

const DAY_MS = 86_400_000;

/** The person's daily rhythm: one bar per dated day on the person's own
 *  span, height = the day's hours; a day with no daily figure is a dashed
 *  tick (UNKNOWN, never 0). Drawn in SVG at a fixed height, the width fluid. */
function DailyRhythm({
  days,
  first,
  last,
  height,
  label,
  formatHours,
  formatDate,
  className,
}: {
  days: readonly PersonDay[];
  first: string;
  last: string;
  height: number;
  label: string;
  formatHours: (n: number) => string;
  formatDate: (iso: string) => string;
  className?: string;
}) {
  const start = Date.parse(`${first}T00:00:00Z`);
  const span = Math.max(
    1,
    (Date.parse(`${last}T00:00:00Z`) - start) / DAY_MS + 1,
  );
  const max = Math.max(1, ...days.map((d) => d.hours ?? 0));
  const W = 1000;
  const bar = Math.max(2, Math.min(14, (W / span) * 0.72));
  return (
    <svg
      viewBox={`0 0 ${W} ${height}`}
      preserveAspectRatio="none"
      className={cn("block w-full", className)}
      style={{ height }}
      role="img"
      aria-label={label}
      data-testid="historical-player-rhythm"
      data-days={days.length}
    >
      <line
        x1={0}
        x2={W}
        y1={height - 0.5}
        y2={height - 0.5}
        className="stroke-ink-600"
        strokeWidth={1}
      />
      {days.map((d) => {
        const x =
          ((Date.parse(`${d.iso}T00:00:00Z`) - start) / DAY_MS / span) * W +
          (W / span - bar) / 2;
        if (d.hours === null) {
          return (
            <line
              key={d.iso}
              x1={x + bar / 2}
              x2={x + bar / 2}
              y1={2}
              y2={height - 2}
              strokeDasharray="2 3"
              className="stroke-text-muted"
              strokeWidth={Math.max(1.5, bar / 2)}
            >
              <title>{`${formatDate(d.iso)} · ?`}</title>
            </line>
          );
        }
        const h = Math.max(2, (d.hours / max) * (height - 3));
        return (
          <rect
            key={d.iso}
            x={x}
            y={height - 1 - h}
            width={bar}
            height={h}
            rx={1}
            className={
              d.places > 1 ? "fill-brand-cyan/55" : "fill-brand-cyan/85"
            }
          >
            <title>{`${formatDate(d.iso)} · ${formatHours(d.hours)} h`}</title>
          </rect>
        );
      })}
    </svg>
  );
}

/** COMPACT — the identity among others. A button: selecting it focuses the
 *  same workspace on this person. */
export function HistoricalPlayerCompact({
  person,
  ring,
  labels,
  formatHours,
  selected,
  dimmed,
  onSelect,
  onHover,
}: {
  person: PersonProjection;
  ring?: readonly RingSegment[];
  labels: Pick<
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
  formatHours: (n: number) => string;
  selected: boolean;
  dimmed?: boolean;
  onSelect: () => void;
  onHover?: (label: string | null) => void;
}) {
  const name = person.name ?? person.label;
  const max = Math.max(1, ...person.weeks.map((w) => w.hours));
  const weeksEvidenced = ring
    ? ring.filter((r) => r.days > 0).length
    : person.weeks.length;
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
        "group flex min-h-14 w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left transition-[background-color,opacity] duration-fast ease-out",
        selected ? "bg-brand-blue/10" : "hover:bg-ink-800/70",
        dimmed && !selected ? "opacity-40" : "",
      )}
    >
      <span className="relative shrink-0">
        <PersonMark
          label={name}
          size="md"
          lit={selected}
          ring={ring}
          ringLabel={
            ring ? labels.ring(weeksEvidenced, ring.length) : undefined
          }
        />
        <span className="sr-only">{labels.person}</span>
        {person.openRows > 0 && (
          <span
            className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-brand-orange text-ink-900 ring-2 ring-ink-900"
            title={labels.warning}
          >
            <SemanticIcon
              concept="warning"
              label={labels.warning}
              className="h-2.5 w-2.5"
              strokeWidth={2.5}
            />
          </span>
        )}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span
          className={cn(
            "truncate font-display text-support font-semibold",
            selected ? "text-text-primary" : "text-text-primary/90",
          )}
        >
          {name}
        </span>
        <span className="flex items-center gap-2.5 font-mono text-meta tabular-nums text-text-muted">
          <span className="inline-flex items-center gap-1">
            <SemanticIcon
              concept="calendar"
              label={labels.days}
              className="h-3 w-3"
            />
            {person.days}
          </span>
          <span className="inline-flex items-center gap-1">
            <SemanticIcon
              concept="object"
              label={labels.places}
              className="h-3 w-3"
            />
            {person.places.length}
          </span>
          {person.aggregateRows > 0 && (
            <span
              className="text-state-amber"
              title={labels.aggregate(
                formatHours(person.aggregateHours),
                person.aggregateRows,
              )}
            >
              Σ
            </span>
          )}
        </span>
      </span>
      {/* the rhythm by week — one thin bar per evidenced week */}
      {person.weeks.length > 0 && (
        <span
          className="flex h-6 items-end gap-px"
          aria-label={labels.weeks}
          data-testid="historical-player-weeks"
        >
          {person.weeks.map((w) => (
            <span
              key={w.isoWeek}
              aria-hidden
              title={`${labels.weekShort} ${w.isoWeek}: ${formatHours(w.hours)} h · ${w.days} d`}
              className={cn(
                "w-1.5 rounded-t-[1px]",
                selected
                  ? "bg-brand-blue/80"
                  : "bg-brand-cyan/60 group-hover:bg-brand-cyan/80",
              )}
              style={{
                height: `${Math.max(2, Math.round((w.hours / max) * 24))}px`,
              }}
            />
          ))}
        </span>
      )}
    </button>
  );
}

const CURRENT: readonly {
  key: "profession" | "skills" | "availability" | "pay";
  icon: SemanticConcept;
}[] = [
  { key: "profession", icon: "work" },
  { key: "skills", icon: "evidence" },
  { key: "availability", icon: "calendar" },
  { key: "pay", icon: "money" },
];

/** FOCUS — the identity in front of you. */
export function HistoricalPlayerCard({
  person,
  ring,
  days,
  labels,
  formatDate,
  formatHours,
  personId,
  onSelectObject,
}: {
  person: PersonProjection;
  /** The evidence ring over the whole period's weeks. */
  ring: readonly RingSegment[];
  /** The person's dated days, for the daily rhythm. */
  days: readonly PersonDay[];
  labels: HistoricalPlayerCardLabels;
  formatDate: (iso: string) => string;
  formatHours: (n: number) => string;
  /** A stable DOM id so the field can deep-link to the card. */
  personId: string;
  onSelectObject?: (name: string) => void;
}) {
  const name = person.name ?? person.label;
  const lanes = personObjectLanes(person);
  const shown = lanes.slice(0, 7);
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
  const range =
    person.firstDate && person.lastDate
      ? `${formatDate(person.firstDate)} → ${formatDate(person.lastDate)}`
      : null;
  const openQuestions = person.openRows;
  const weeksEvidenced = ring.filter((r) => r.days > 0).length;
  const aggregateText = labels.aggregate(
    formatHours(person.aggregateHours),
    person.aggregateRows,
  );

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
      <div className="flex min-w-0 flex-1 flex-col gap-6">
        {/* ── LAYER 1: the person ─────────────────────────────────────── */}
        <header className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:gap-6">
          <span className="relative shrink-0 p-2">
            <PersonMark
              label={name}
              size="xl"
              ring={ring}
              ringLabel={labels.ring(weeksEvidenced, ring.length)}
            />
            {openQuestions > 0 && (
              <span
                className="absolute right-0 top-0 flex h-6 w-6 items-center justify-center rounded-full bg-brand-orange text-ink-900 ring-2 ring-ink-900"
                title={labels.openQuestions(openQuestions)}
              >
                <SemanticIcon
                  concept="warning"
                  label={labels.warning}
                  className="h-3.5 w-3.5"
                  strokeWidth={2.5}
                />
              </span>
            )}
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <h3 className="truncate font-display text-title-lg font-semibold tracking-tightest text-text-primary">
                {name}
              </h3>
              <span className="inline-flex items-center gap-1 rounded-full border border-brand-orange/40 px-2 py-0.5 font-mono text-meta uppercase tracking-label text-brand-orange">
                <SemanticIcon
                  concept="historical"
                  label={labels.historical}
                  className="h-3 w-3"
                />
                {labels.historical}
              </span>
            </div>
            {/* professional identity: profession is a `?` — history does not say */}
            <span
              className="inline-flex items-center gap-1.5 text-support text-text-secondary"
              title={labels.currentNotInferred}
            >
              <SemanticIcon
                concept="work"
                label={labels.profession}
                className="h-4 w-4 text-text-muted"
              />
              {labels.profession}
              <UnknownToken what={labels.profession} />
            </span>
            {range && (
              <span className="inline-flex flex-wrap items-center gap-x-1.5 gap-y-0.5 font-mono text-support tabular-nums text-text-secondary">
                <SemanticIcon
                  concept="time"
                  label={labels.time}
                  className="h-4 w-4 text-text-muted"
                />
                {range}
                <span className="text-text-muted">
                  · {weeksEvidenced}/{ring.length} {labels.weeks.toLowerCase()}
                </span>
              </span>
            )}
          </div>
        </header>

        {/* the work, in real figures — icon · value · unit — over the daily rhythm */}
        <div className="flex flex-col gap-2">
          <dl
            className="flex flex-wrap items-baseline gap-x-7 gap-y-1"
            data-testid="historical-player-figures"
          >
            <Figure
              icon="calendar"
              value={String(person.days)}
              unit={labels.days}
            />
            <Figure
              icon="time"
              value={formatHours(person.hours)}
              unit="h"
              label={labels.hours}
            />
            <Figure
              icon="object"
              value={String(person.places.length)}
              unit={labels.places}
            />
            {person.aggregateRows > 0 && (
              <div
                className="flex items-baseline gap-1.5"
                data-testid="historical-player-aggregate"
                title={aggregateText}
              >
                <dt className="sr-only">{aggregateText}</dt>
                <dd className="flex items-baseline gap-1.5 font-display text-title font-bold tabular-nums text-state-amber">
                  Σ {formatHours(person.aggregateHours)}
                  <span className="font-mono text-meta font-normal uppercase tracking-label text-state-amber">
                    h ·{" "}
                    {person.remoteRows > 0
                      ? labels.aggregateRemote
                      : `? ${labels.aggregatePeriodUnknown}`}
                  </span>
                </dd>
              </div>
            )}
          </dl>
          {person.firstDate && person.lastDate && days.length > 0 && (
            <div className="flex flex-col gap-1">
              <DailyRhythm
                days={days}
                first={person.firstDate}
                last={person.lastDate}
                height={44}
                label={labels.rhythm}
                formatHours={formatHours}
                formatDate={formatDate}
              />
              <span
                className="flex justify-between font-mono text-meta uppercase tracking-label text-text-muted"
                aria-hidden
              >
                <span>{labels.rhythm}</span>
                <span className="hidden sm:inline">
                  {formatDate(person.firstDate)} → {formatDate(person.lastDate)}
                </span>
              </span>
            </div>
          )}
        </div>

        {/* ── THE DOMINANT OBJECT: work reality — places on the person's time.
               A phone has no width for lanes: there the footprint list below
               is the same places, so the band steps aside (recomposed, not
               shrunk into "Kr…"). ── */}
        <div className="hidden sm:block">
          <WorkHistoryTimeline
            appearance="bare"
            tone="evidence"
            timeline={timeline}
            labels={{
              title: labels.timeline.title,
              current: labels.timeline.current,
              undated:
                lanes.length > shown.length
                  ? labels.moreLanes(lanes.length - shown.length)
                  : null,
              range: null,
              laneDetails: [],
              empty: labels.timeline.empty,
              ariaLabel: labels.timeline.ariaLabel,
            }}
          />
        </div>

        {/* the footprint — places as square marks with their days */}
        <div className="flex flex-col gap-1.5">
          <span className="font-mono text-meta uppercase tracking-label text-text-muted">
            {labels.contexts}
          </span>
          <ul
            className="flex flex-wrap gap-x-4 gap-y-2"
            data-testid="historical-player-places"
            aria-label={labels.places}
          >
            {person.places.slice(0, 6).map((p) => {
              const inner = (
                <>
                  <ObjectMark name={p.name} size="sm" label={labels.object} />
                  <span className="flex min-w-0 flex-col leading-tight">
                    <span className="truncate text-support text-text-primary">
                      {p.name}
                    </span>
                    <span className="font-mono text-meta tabular-nums text-text-muted">
                      {p.rows} d
                      {p.hours > 0 ? ` · ${formatHours(p.hours)} h` : ""}
                    </span>
                  </span>
                </>
              );
              return (
                <li key={p.name} className="min-w-0">
                  {onSelectObject ? (
                    <button
                      type="button"
                      onClick={() => onSelectObject(p.name)}
                      className="flex min-h-9 max-w-52 items-center gap-2 rounded-md text-left hover:bg-ink-800/70"
                    >
                      {inner}
                    </button>
                  ) : (
                    <span className="flex min-h-9 max-w-52 items-center gap-2">
                      {inner}
                    </span>
                  )}
                </li>
              );
            })}
            {person.places.length > 6 && (
              <li className="self-center font-mono text-meta text-text-muted">
                +{person.places.length - 6}
              </li>
            )}
            {person.activities.map((a) => (
              <li
                key={a}
                className="inline-flex min-h-9 items-center gap-1.5 text-support text-text-secondary"
              >
                <span className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-dashed border-ink-500">
                  <SemanticIcon
                    concept="work"
                    label={labels.activities}
                    className="h-3.5 w-3.5 text-text-muted"
                  />
                </span>
                {a}
              </li>
            ))}
          </ul>
        </div>

        {/* CURRENT — each a `?`, visibly. Nothing here is inferred from history. */}
        <ul
          className="flex flex-wrap items-center gap-x-5 gap-y-1.5 border-t border-ink-600 pt-3"
          data-testid="historical-player-current"
          aria-label={labels.currentToken}
          title={labels.currentNotInferred}
        >
          <li className="inline-flex items-center gap-1 font-mono text-meta uppercase tracking-label text-text-muted">
            <SemanticIcon
              concept="current"
              label={labels.currentToken}
              className="h-3 w-3"
            />
            {labels.currentToken.replace(/[:：]?\s*\?$/, "")}
          </li>
          {CURRENT.map((c) => (
            <li
              key={c.key}
              className="inline-flex items-center gap-1.5 text-support text-text-secondary"
            >
              <SemanticIcon
                concept={c.icon}
                label={labels[c.key]}
                className="h-3.5 w-3.5 text-text-muted"
              />
              {labels[c.key]}
              <UnknownToken what={labels[c.key]} />
            </li>
          ))}
          <li
            className="ml-auto"
            data-testid="historical-player-unknowns"
            aria-label={labels.unknowns}
          >
            <span className="flex flex-wrap gap-2">
              {person.unallocatedRows > 0 && (
                <span
                  className="inline-flex items-center gap-1 font-mono text-meta tabular-nums text-text-muted"
                  title={labels.unknownAllocation(person.unallocatedRows)}
                >
                  <UnknownToken
                    what={labels.unknownAllocation(person.unallocatedRows)}
                  />
                  <SemanticIcon
                    concept="object"
                    label={labels.places}
                    className="h-3 w-3"
                  />
                  {person.unallocatedRows} d
                </span>
              )}
              {person.noPlaceRows > 0 && (
                <span
                  className="inline-flex items-center gap-1 font-mono text-meta tabular-nums text-text-muted"
                  title={labels.unknownPlace(person.noPlaceRows)}
                >
                  <UnknownToken
                    what={labels.unknownPlace(person.noPlaceRows)}
                  />
                  <SemanticIcon
                    concept="location"
                    label={labels.places}
                    className="h-3 w-3"
                  />
                  {person.noPlaceRows} d
                </span>
              )}
            </span>
          </li>
        </ul>

        {/* ── LAYER 3: INSPECT — the evidence behind the identity ─────── */}
        <details
          className="group/details"
          data-testid="historical-player-details"
        >
          <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 text-support text-text-secondary hover:text-text-primary [&::-webkit-details-marker]:hidden">
            <SemanticIcon
              concept="source"
              label={labels.details}
              className="h-4 w-4"
            />
            {labels.details}
            <span
              aria-hidden
              className="ml-auto font-mono text-meta text-text-muted transition-transform group-open/details:rotate-90"
            >
              ›
            </span>
          </summary>
          <div className="flex flex-col gap-4 pb-2 pt-2">
            <ProvenanceLine
              provenanceClass="EVIDENCE_SUPPORTED"
              text={`${labels.provenance}: ${labels.provenanceText} · ${labels.state} · ${labels.relationship}`}
              testid="historical-player-provenance"
              className="text-meta"
            />
            {person.evidenceSamples.length > 0 && (
              <section
                className="flex flex-col gap-1"
                data-testid="historical-player-evidence"
              >
                <h4 className="font-mono text-meta uppercase tracking-label text-text-muted">
                  {labels.evidence}
                </h4>
                <ul className="flex flex-col gap-1">
                  {person.evidenceSamples.map((s) => (
                    <li
                      key={s}
                      className="border-l border-brand-cyan/50 pl-3 text-support italic leading-relaxed text-text-secondary"
                    >
                      “{s}”
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {person.activities.length === 0 && (
              <p className="text-meta text-text-muted">{labels.noActivities}</p>
            )}
            {person.interpretations.length > 0 && (
              <section
                className="flex flex-col gap-1"
                data-testid="historical-player-interpretations"
              >
                <h4 className="font-mono text-meta uppercase tracking-label text-text-muted">
                  {labels.interpretations}
                </h4>
                <ul className="flex flex-col gap-0.5 text-meta text-text-secondary">
                  {person.interpretations.map((i) => (
                    <li key={i.method}>
                      {labels.interpretationNames[i.method] ?? i.method} ·{" "}
                      {i.rows}
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {(person.unallocatedRows > 0 || person.noPlaceRows > 0) && (
              <section className="flex flex-col gap-1">
                <h4 className="font-mono text-meta uppercase tracking-label text-text-muted">
                  {labels.unknowns}
                </h4>
                <ul className="flex flex-col gap-0.5 text-meta text-text-secondary">
                  {person.unallocatedRows > 0 && (
                    <li>{labels.unknownAllocation(person.unallocatedRows)}</li>
                  )}
                  {person.noPlaceRows > 0 && (
                    <li>{labels.unknownPlace(person.noPlaceRows)}</li>
                  )}
                </ul>
              </section>
            )}
            {person.aggregateRows > 0 && (
              <p className="text-meta text-state-amber">{aggregateText}</p>
            )}
            <p className="text-meta text-text-muted">
              {labels.currentNotInferred}
            </p>
          </div>
        </details>
      </div>
    </article>
  );
}

function Figure({
  icon,
  value,
  unit,
  label,
}: {
  icon: SemanticConcept;
  value: string;
  unit: string;
  label?: string;
}) {
  return (
    <div className="flex items-baseline gap-1.5">
      <dt className="sr-only">{label ?? unit}</dt>
      <dd className="flex items-baseline gap-1.5 font-display text-title font-bold tabular-nums text-text-primary">
        <SemanticIcon
          concept={icon}
          label={label ?? unit}
          className="h-4 w-4 self-center text-text-muted"
        />
        {value}
        <span className="font-mono text-meta font-normal uppercase tracking-label text-text-muted">
          {unit}
        </span>
      </dd>
    </div>
  );
}
