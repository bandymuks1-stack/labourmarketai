import {
  MapPin,
  Shield,
  CalendarCheck2,
  Sparkle,
  Thermometer,
} from "lucide-react";

import type { WorkerPlayerCard as WorkerPlayerCardData } from "@/lib/player-card/player-card";
import { CountUp } from "@/components/app/today/count-up";
import { SkillIcon } from "@/components/app/today/skill-icon";
import { ReadinessRing } from "@/components/app/readiness-ring";
import {
  EvidenceTimelineChart,
  type EvidenceChartLabels,
} from "@/components/app/player-card/evidence-timeline-chart";
import {
  SkillEvidenceChart,
  type SkillEvidenceLabels,
} from "@/components/app/player-card/skill-evidence-chart";
import {
  WorkHistoryTimeline,
  type HistoryTimelineLabels,
} from "@/components/app/player-card/work-history-timeline";
import { deriveWorkHistoryTimeline } from "@/lib/player-card/evidence-visuals";
import {
  deriveWorkerReadiness,
  missingReadinessPillars,
  type ReadinessLevel,
} from "@/lib/player-card/readiness";
import { buildPlayerCardMinimum } from "@/lib/identity/player-card-minimum";
import { ProvenanceEdge, ProvenanceLine } from "@/components/app/provenance/provenance-edge";
import type { ProvenanceClass } from "@/lib/evidence/provenance";
import { cn } from "@/lib/utils";
import { Link } from "@/lib/i18n/navigation";

/**
 * Worker player-card — the premium scouting card (TASK 07 slice
 * design-soul-scouting-ui-v1; logic and honest counters from slice
 * worker-player-card-v1 unchanged).
 *
 * DESIGN_SOUL §1 (vienas kūnas): every glow on this card is the skin of a
 * real internal fact — a skill badge glows ONLY for worker_skills rows a
 * manager really verified. Zero is shown as a plain zero with a gentle next
 * step, never inflated; skills are labelled self-declared (not verified);
 * nothing here implies AI or employer interest.
 *
 * P6 (frozen design contract 2026-09-05 §2.9, §5 P6-subset; design system
 * F "K1 passport with an edge", M): the card carries the person's PROVENANCE
 * EDGE — the ONE place gold may appear on a person, and only for the
 * EMPLOYER_CONFIRMED class DERIVED from a real confirmation row (scorecard
 * X.28 "gold only for a confirmation"). The material lives in ONE component
 * (`ProvenanceEdge`); this file never names a gold class itself, and the edge
 * is always paired with its text equivalent (`ProvenanceLine`).
 */

export interface PlayerCardLabels {
  title: string;
  subtitle: string;
  /** P6 — the provenance class + its already-localised text equivalent
   *  ("patvirtino <org>, <date>" / "iš CV, nepatvirtinta" …). The class rides
   *  with the text so the edge and the words can never disagree. */
  provenance: {
    class: ProvenanceClass;
    /** The small eyebrow word ("Kilmė" / "Source"). */
    label: string;
    text: string;
  };
  skillsLabel: string;
  skillsHint: string;
  candidateLabel: string;
  candidateHint: string;
  evidenceLabel: string;
  evidenceHint: string;
  attentionLabel: string;
  attentionHint: string;
  attentionZero: string;
  workCardLabel: string;
  workCardConfirmed: string;
  workCardPending: string;
  namePlaceholder: string;
  /** Resolved profession name, or null when none is set yet. */
  professionName: string | null;
  /** Resolved availability label, or null when not saved yet. */
  availabilityLabel: string | null;
  /** "Available from {date}" with a locale-formatted date, or null when no
   *  available-from date is set. Real `workers.available_from` only. */
  availabilityFrom: string | null;
  /** §5.2 LOCATION — resolved country NAME for the worker's stated country
   *  code, or null when no location is stated. Country precision only. */
  locationName: string | null;
  /** §5.2 DOCUMENTS — resolved status line, or null when the documents
   *  surface is unavailable for this account (honest absence). */
  documentsLabel: string | null;
  documentsValue: string | null;
  /** §5.2 REPUTATION — what other people really confirmed about this work.
   *  `reputationValue` is null when nothing has been confirmed yet, and the
   *  empty copy states that instead of showing a zero as a verdict. */
  reputationLabel: string;
  reputationValue: string | null;
  reputationEmpty: string;
  reputationHint: string;
  /** §5.2 WORK HISTORY — section label + the two fallbacks it may need. */
  workHistoryLabel: string;
  workHistoryUnnamed: string;
  workHistoryCurrent: string;
  verifiedTitle: string;
  verifiedEmpty: string;
  journalSupportedLabel: string;
  journalSupportedHint: string;
  /** Resolved names for the verified skill badges (parallel to card data). */
  verifiedSkillNames: string[];
  latestEvidenceLabel: string;
  /** Formatted date of the newest entry, or null when there is none yet. */
  latestEvidenceValue: string | null;
  latestEvidenceEmpty: string;
  thermoLabel: string;
  thermoHint: string;
  thermoMissingPosition: string;
  thermoMissingMarket: string;
  thermoMissingBoth: string;
  thermoSmallSample: string;
  /** Readiness ring + signal line (real met/total signals, never a rating). */
  readiness: {
    label: string;
    hint: string;
    levelReady: string;
    levelBuilding: string;
    levelStart: string;
    /** "{met}/{total} signals met" with values interpolated by the caller-free
     *  component — stored as a template the component fills. */
    signalsTemplate: string;
    pillars: {
      profession: string;
      availability: string;
      skills: string;
      journal: string;
      evidence: string;
      workCard: string;
    };
    nextLabel: string;
  };
  /**
   * §5.2 VISUALIZATIONS — resolved copy for the three real data views. Built
   * in ONE place (`buildPlayerCardLabels`) so every mount of the card carries
   * the same charts with the same words.
   */
  visuals: {
    evidence: EvidenceChartLabels;
    skills: SkillEvidenceLabels;
    history: HistoryTimelineLabels;
  };
}

// Top-accent by readiness level. NOT gold: gold stays the reserved trust accent
// (real work-card confirmation), so the readiness accent uses premium brand
// tokens instead (DESIGN_SOUL §1; player-card-honesty guard).
const LEVEL_ACCENT: Record<ReadinessLevel, string> = {
  ready: "border-brand-cyan/40",
  building: "border-brand-blue/30",
  start: "border-ink-500",
};

/** Thermometer view-model (S4). A score renders ONLY when both formula
 *  components existed server-side; otherwise the honest insufficient-data
 *  state names the missing component. Never an invented number. */
export type ThermometerView =
  | { kind: "score"; scoreEur: number; smallSample: boolean }
  | { kind: "insufficient_data"; missing: "position" | "market" | "both" };

/** Dead-UI rule D (owner smoke 2026-07-05): every counter tile NAVIGATES to
 *  the surface it counts — a real Link with hover/focus affordance. */
function Stat({
  value,
  label,
  hint,
  testid,
  href,
}: {
  value: string;
  label: string;
  hint: string;
  testid: string;
  href: string;
}) {
  return (
    <Link
      href={href as "/dashboard"}
      className="flex min-h-11 flex-col gap-0.5 rounded-md border border-ink-600 bg-ink-800/40 p-3 transition-colors hover:border-brand-blue focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue"
      data-testid={testid}
    >
      <CountUp
        text={value}
        className="font-mono text-2xl font-bold tracking-tightest text-text-primary"
      />
      <span className="font-mono text-meta uppercase tracking-label text-text-muted">
        {label}
      </span>
      <span className="text-meta leading-relaxed text-text-secondary">{hint}</span>
    </Link>
  );
}

export function WorkerPlayerCard({
  card,
  labels,
  thermometer,
  avatarUrl = null,
}: {
  card: WorkerPlayerCardData;
  labels: PlayerCardLabels;
  thermometer?: ThermometerView | null;
  /** Short-lived signed URL of the worker's own consented photo. When present
   *  the scouting card shows the real face; otherwise the honest initials
   *  monogram — never a synthesised or placeholder face (DESIGN_SOUL §1). */
  avatarUrl?: string | null;
}) {
  const confirmed = card.workCardConfirmed;
  // Honest readiness signals (real met/total), drives the status ring + line.
  const readiness = deriveWorkerReadiness(card);
  const levelLabel =
    readiness.level === "ready"
      ? labels.readiness.levelReady
      : readiness.level === "building"
        ? labels.readiness.levelBuilding
        : labels.readiness.levelStart;
  const missing = missingReadinessPillars(readiness);
  // Identity tile (avatar + name + initials) sourced through the ONE minimum
  // Player Card contract, so the fallback rules are identical to every other
  // surface — no private monogram copy, no fabricated identity. Initials still
  // resolve to the shared personMonogram (playerInitials), so the visual output
  // is unchanged.
  const identity = buildPlayerCardMinimum({
    avatarUrl,
    fullName: card.displayName,
    headline: labels.professionName,
    skillsDeclared: card.skillsDeclared,
    skillsVerified: card.verifiedSkills.length,
  });
  const name = identity.displayName ?? labels.namePlaceholder;
  /**
   * §5.2 work history, premium self-check (production screenshot): rows with
   * NO organization name and NO title rendered the generic fallback word, so
   * the card showed "Work context" twice — repeated placeholder nouns, which
   * is exactly the empty-row pattern the owner rejected. A row that cannot
   * name where the work happened carries no information, so it is dropped;
   * the section disappears entirely when none of them can.
   */
  const namedHistory = card.workHistory.filter(
    (h) => (h.organizationName ?? h.title ?? "").trim().length > 0,
  );
  /**
   * §5.2 the work history also becomes a real time band. Derived here from the
   * SAME rows the text list uses, so the picture and the list can never
   * disagree; the deriver is pure and unit-tested.
   */
  const historyTimeline = deriveWorkHistoryTimeline(card.workHistory, new Date());
  /**
   * Premium self-check (owner post-deploy review): the card used to print the
   * work history twice — once as a text list and, after this stage, once as a
   * time band. The list now carries ONLY what the band cannot place (a named
   * engagement with no start date), so no fact is stated twice and no row is
   * filler.
   */
  const placedHistoryIds = new Set(historyTimeline.lanes.map((l) => l.id));
  const unplacedHistory = namedHistory.filter((h) => !placedHistoryIds.has(h.id));
  return (
    <section
      className={cn(
        // Premium scouting chrome shared with the landing card — but NO hover
        // lift on the card itself (dead-UI rule B: the section is not
        // clickable; the stat tiles inside now are).
        "card-border bg-card-glow rise-in flex flex-col gap-5 border-t-2 p-5 sm:p-6",
        LEVEL_ACCENT[readiness.level],
        // No gold trust ring or gold accent on the card chrome itself: the
        // only gold a person may carry is the provenance EDGE below, and only
        // when a real confirmation row derives EMPLOYER_CONFIRMED (P6).
      )}
      data-testid="worker-player-card"
      data-provenance={card.provenance.class}
    >
      {/* ── Identity: provenance edge + avatar + name + profession + readiness ring ── */}
      <header className="flex items-center justify-between gap-4">
        <div className="flex min-w-0 items-stretch gap-3">
          {/* P6 — the provenance edge (design M): dashed grey = self-declared,
              cyan = evidence, gold = employer-confirmed. Derived class only;
              the text equivalent sits under the name. */}
          <ProvenanceEdge provenanceClass={card.provenance.class} />
          <div className="flex min-w-0 items-center gap-4">
          {identity.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={identity.avatarUrl}
              alt={name}
              data-testid="player-card-avatar-photo"
              loading="lazy"
              className={cn(
                "h-14 w-14 shrink-0 rounded-card border object-cover",
                "border-ink-500",
              )}
            />
          ) : (
            <span
              aria-hidden
              data-testid="player-card-avatar-monogram"
              className={cn(
                "flex h-14 w-14 shrink-0 items-center justify-center rounded-card border bg-ink-700 font-display text-lg font-bold text-text-primary",
                "border-ink-500",
              )}
            >
              {identity.initials}
            </span>
          )}
          <div className="min-w-0 flex-col">
            <span className="font-mono text-meta uppercase tracking-label text-brand-cyan">
              {labels.title}
            </span>
            <h2 className="truncate font-display text-xl font-bold tracking-tightest text-text-primary">
              {name}
            </h2>
            <p className="truncate text-xs leading-relaxed text-text-secondary">
              {labels.professionName ?? labels.subtitle}
            </p>
            {/* P6 — the SAME fact as the edge, in words (a11y: state is never
                colour alone). "Kilmė · patvirtino E2E Walker UAB, 2026-09-05". */}
            <p className="flex min-w-0 items-baseline gap-1.5">
              <span className="shrink-0 font-mono text-meta uppercase tracking-label text-text-muted">
                {labels.provenance.label}
              </span>
              <ProvenanceLine
                provenanceClass={card.provenance.class}
                text={labels.provenance.text}
                testid="player-card-provenance"
                className="truncate"
              />
            </p>
          </div>
          </div>
        </div>
        {/* Status ring — same premium gauge as the landing card, honest signals */}
        <ReadinessRing
          met={readiness.met}
          total={readiness.total}
          level={readiness.level}
          levelLabel={levelLabel}
          size="md"
        />
      </header>

      {/* ── Readiness signal line: what is met + what to do next (honest) ── */}
      <div
        className="flex flex-col gap-1.5 rounded-md border border-ink-600 bg-ink-800/40 p-3"
        data-testid="player-card-readiness"
        data-readiness-level={readiness.level}
      >
        <span className="inline-flex items-center gap-2 font-mono text-meta uppercase tracking-label text-text-muted">
          {labels.readiness.label}
          <span className="text-text-secondary">
            {readiness.met}/{readiness.total} {labels.readiness.signalsTemplate}
          </span>
        </span>
        {missing.length > 0 ? (
          <span className="flex flex-wrap items-center gap-1.5 text-meta leading-relaxed text-text-secondary">
            <span className="text-text-muted">{labels.readiness.nextLabel}</span>
            {missing.map((k) => (
              <span
                key={k}
                className="inline-flex items-center rounded-sm border border-ink-500 px-1.5 py-0.5 text-meta text-text-secondary"
              >
                {labels.readiness.pillars[k]}
              </span>
            ))}
          </span>
        ) : (
          <span className="text-meta leading-relaxed text-text-secondary">
            {labels.readiness.hint}
          </span>
        )}
      </div>

      {/* ── Real-state chips: availability + work-card confirmation ── */}
      <div className="flex flex-wrap items-center gap-2">
        {labels.availabilityLabel ? (
          <span
            className="inline-flex min-h-7 items-center gap-2 rounded-full border border-ink-500 bg-ink-800 px-3 py-1 font-mono text-meta uppercase tracking-label text-text-secondary"
            data-testid="player-card-availability"
          >
            {card.availabilityStatus === "available" ? (
              <span className="live-dot" aria-hidden />
            ) : null}
            {labels.availabilityLabel}
          </span>
        ) : null}
        {labels.availabilityFrom ? (
          <span
            className="inline-flex min-h-7 items-center rounded-full border border-ink-500 bg-ink-800 px-3 py-1 text-meta text-text-secondary"
            data-testid="player-card-available-from"
          >
            {labels.availabilityFrom}
          </span>
        ) : null}
        {/* §5.2 LOCATION — the worker's own stated country, country
            precision only (the card never implies an address). */}
        {labels.locationName ? (
          <span
            className="inline-flex min-h-7 items-center gap-1.5 rounded-full border border-ink-500 bg-ink-800 px-3 py-1 text-meta text-text-secondary"
            data-testid="player-card-location"
          >
            <MapPin className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
            {labels.locationName}
          </span>
        ) : null}
        <span
          className="inline-flex min-h-7 items-center gap-1.5 rounded-full border border-ink-500 bg-ink-800 px-3 py-1 font-mono text-meta uppercase tracking-label text-text-secondary"
          data-testid="player-card-workcard"
        >
          <Shield className="h-3.5 w-3.5" aria-hidden />
          {confirmed ? labels.workCardConfirmed : labels.workCardPending}
          <span className="sr-only">{labels.workCardLabel}</span>
        </span>
      </div>

      {/* ── Skill signals: neutral list (silent-trust rule). No green
          "verified" glow, no certification badge — confirmation stays an
          internal signal and is never advertised on this self-view card. ── */}
      <div className="flex flex-col gap-2" data-testid="player-card-skill-signals">
        <span className="font-mono text-meta uppercase tracking-label text-text-muted">
          {labels.verifiedTitle}
        </span>
        {card.verifiedSkills.length > 0 ? (
          <ul className="flex flex-wrap gap-2">
            {card.verifiedSkills.map((s, i) => (
              <li
                key={s.slug}
                className="inline-flex min-h-8 items-center gap-1.5 rounded-md border border-ink-500 bg-ink-800 px-2.5 py-1.5 text-xs font-medium text-text-secondary"
              >
                <SkillIcon slug={s.iconSlug} className="h-3.5 w-3.5" />
                {labels.verifiedSkillNames[i] ?? s.slug}
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-md border border-dashed border-ink-500 px-3 py-2 text-meta leading-relaxed text-text-muted">
            {labels.verifiedEmpty}
          </p>
        )}
        {/* Evidence ladder middle rung: work-journal-supported skills. Shown
            ONLY when there are any — a calm cyan tone (NOT the green
            manager-verified glow, NOT the gold trust ring), so the three
            tiers stay visually distinct and honest (DESIGN_SOUL §1). */}
        {card.journalSupportedSkills > 0 ? (
          <p
            className="inline-flex items-center gap-2 self-start rounded-md border border-brand-cyan/30 bg-brand-cyan/10 px-2.5 py-1.5 text-meta leading-relaxed text-brand-cyan"
            data-testid="player-card-journal-supported"
            title={labels.journalSupportedHint}
          >
            <Sparkle className="h-3.5 w-3.5 shrink-0" aria-hidden />
            <span className="font-mono font-bold">{card.journalSupportedSkills}</span>
            <span>· {labels.journalSupportedLabel}</span>
          </p>
        ) : null}
      </div>

      {/* ── §5.2 EVIDENCE VIEWS — the card's real data visualizations.
            Growth over time and per-skill strength sit side by side on wide
            screens and stack on a phone; both read from the worker's OWN rows
            and both state an honest empty case instead of an empty frame. ── */}
      <div
        className="grid gap-3 lg:grid-cols-2"
        data-testid="player-card-visualizations"
      >
        <EvidenceTimelineChart
          months={card.evidenceTimeline}
          labels={labels.visuals.evidence}
        />
        <SkillEvidenceChart
          skills={card.skillEvidence}
          labels={labels.visuals.skills}
          // W5 slice 3: this card renders the worker's OWN rows only, so the
          // drill-down never widens visibility — it opens their own journal.
          linkBarsToJournal
        />
      </div>

      {/* ── §5.2 WORK HISTORY as a real time band (the text list follows) ── */}
      <WorkHistoryTimeline timeline={historyTimeline} labels={labels.visuals.history} />

      {/* ── Honest dimensions (real counts, plain zeros) ── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat
          testid="player-card-skills"
          value={String(card.skillsDeclared)}
          label={labels.skillsLabel}
          hint={labels.skillsHint}
          href="/dashboard/profile#capabilities"
        />
        <Stat
          testid="player-card-candidate"
          value={String(card.candidateSkills)}
          label={labels.candidateLabel}
          hint={labels.candidateHint}
          href="/dashboard/profile#candidate-skills"
        />
        <Stat
          testid="player-card-evidence"
          value={String(card.evidenceEntries)}
          label={labels.evidenceLabel}
          hint={labels.evidenceHint}
          href="/dashboard/journal#journal-entries"
        />
        <Stat
          testid="player-card-attention"
          value={String(card.attentionInstructions)}
          label={labels.attentionLabel}
          hint={card.attentionInstructions === 0 ? labels.attentionZero : labels.attentionHint}
          href="/dashboard/communication"
        />
      </div>

      {/* ── §5.2 WORK HISTORY — WHERE the work happened, from the canonical
            engagement spine. Newest first, bounded to the most recent few:
            the card states a history, it does not become a CV page. An empty
            history renders nothing (it is a fact, not a gap to pad). */}
      {unplacedHistory.length > 0 ? (
        <div className="flex flex-col gap-1.5" data-testid="player-card-work-history">
          <span className="font-mono text-meta uppercase tracking-label text-text-muted">
            {labels.workHistoryLabel}
          </span>
          <ul className="flex flex-col gap-1">
            {unplacedHistory.slice(0, 3).map((h) => (
              <li
                key={h.id}
                className="flex flex-wrap items-baseline gap-x-2 text-basis text-text-primary"
              >
                <span className="font-medium">
                  {h.organizationName ?? h.title}
                </span>
                {h.startedAt ? (
                  <span className="font-mono text-meta uppercase tracking-label text-text-muted">
                    {h.startedAt}
                    {h.current ? ` — ${labels.workHistoryCurrent}` : h.endedAt ? ` — ${h.endedAt}` : ""}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* ── §5.2 DOCUMENTS + REPUTATION ──────────────────────────────────
            Two facts other people actually care about, both from real rows:
            how many of the worker's documents are currently valid (with the
            genuinely-expiring ones called out), and what other people have
            really CONFIRMED about this work. There is no universal human
            score here and no medal tier — a reputation with nothing
            confirmed yet says exactly that. */}
      <div className="grid gap-3 sm:grid-cols-2">
        {labels.documentsLabel && labels.documentsValue ? (
          <div
            className="flex flex-col gap-1 rounded-md border border-ink-600 bg-ink-800/40 p-3"
            data-testid="player-card-documents"
          >
            <span className="font-mono text-meta uppercase tracking-label text-text-muted">
              {labels.documentsLabel}
            </span>
            <span className="text-sm text-text-primary">{labels.documentsValue}</span>
          </div>
        ) : null}
        <div
          className="flex flex-col gap-1 rounded-md border border-ink-600 bg-ink-800/40 p-3"
          data-testid="player-card-reputation"
        >
          <span className="font-mono text-meta uppercase tracking-label text-text-muted">
            {labels.reputationLabel}
          </span>
          <span className="text-sm text-text-primary">
            {labels.reputationValue ?? labels.reputationEmpty}
          </span>
          <span className="text-meta leading-relaxed text-text-muted">
            {labels.reputationHint}
          </span>
        </div>
      </div>

      {/* ── Thermometer (S4) — owner-locked formula; a number ONLY when both
            components exist, otherwise the honest missing-data state ── */}
      {thermometer ? (
        <div
          className="flex flex-col gap-1 rounded-md border border-ink-600 bg-ink-800/40 p-3"
          data-testid="player-card-thermometer"
        >
          <span className="inline-flex items-center gap-1.5 font-mono text-meta uppercase tracking-label text-text-muted">
            <Thermometer className="h-3.5 w-3.5" aria-hidden />
            {labels.thermoLabel}
          </span>
          {thermometer.kind === "score" ? (
            <>
              <span className="font-mono text-2xl font-bold tracking-tightest text-text-primary">
                ~{thermometer.scoreEur} €
              </span>
              {thermometer.smallSample ? (
                <span
                  className="text-meta leading-relaxed text-state-warning"
                  data-testid="player-card-thermometer-small-sample"
                >
                  {labels.thermoSmallSample}
                </span>
              ) : null}
              <span className="text-meta leading-relaxed text-text-secondary">
                {labels.thermoHint}
              </span>
            </>
          ) : (
            <span
              className="text-meta leading-relaxed text-text-muted"
              data-testid="player-card-thermometer-missing"
            >
              {thermometer.missing === "position"
                ? labels.thermoMissingPosition
                : thermometer.missing === "market"
                  ? labels.thermoMissingMarket
                  : labels.thermoMissingBoth}
            </span>
          )}
        </div>
      ) : null}

      {/* ── Latest work proof (real entry or honest emptiness) ── */}
      <div
        className="flex items-center gap-2 border-t border-ink-600 pt-4 text-xs text-text-secondary"
        data-testid="player-card-latest-evidence"
      >
        {labels.latestEvidenceValue ? (
          <CalendarCheck2 className="h-4 w-4 shrink-0 text-brand-cyan" aria-hidden />
        ) : (
          <Sparkle className="h-4 w-4 shrink-0 text-text-muted" aria-hidden />
        )}
        <span className="font-mono text-meta uppercase tracking-label text-text-muted">
          {labels.latestEvidenceLabel}
        </span>
        <span className="text-text-primary">
          {labels.latestEvidenceValue ?? labels.latestEvidenceEmpty}
        </span>
      </div>
    </section>
  );
}
