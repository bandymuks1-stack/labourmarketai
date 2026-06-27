import {
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
  deriveWorkerReadiness,
  missingReadinessPillars,
  type ReadinessLevel,
} from "@/lib/player-card/readiness";
import { personMonogram } from "@/lib/visual/avatar-monogram";
import { cn } from "@/lib/utils";

/**
 * Worker player-card — the premium scouting card (TASK 07 slice
 * design-soul-scouting-ui-v1; logic and honest counters from slice
 * worker-player-card-v1 unchanged).
 *
 * DESIGN_SOUL §1 (vienas kūnas): every glow on this card is the skin of a
 * real internal fact — the gold trust ring appears ONLY when the work card is
 * really confirmed; a skill badge glows green ONLY for worker_skills rows a
 * manager really verified. Zero is shown as a plain zero with a gentle next
 * step, never inflated; skills are labelled self-declared (not verified);
 * nothing here implies AI or employer interest.
 */

export interface PlayerCardLabels {
  title: string;
  subtitle: string;
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
}

// Top-accent by readiness level. NOT gold: gold stays the reserved trust accent
// (real work-card confirmation), so the readiness accent uses premium brand
// tokens instead (DESIGN_SOUL §1; today-screen-honesty guard).
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

function Stat({
  value,
  label,
  hint,
  testid,
}: {
  value: string;
  label: string;
  hint: string;
  testid: string;
}) {
  return (
    <div
      className="flex flex-col gap-0.5 rounded-md border border-ink-600 bg-ink-800/40 p-3"
      data-testid={testid}
    >
      <CountUp
        text={value}
        className="font-mono text-2xl font-bold tracking-tightest text-text-primary"
      />
      <span className="font-mono text-[10px] uppercase tracking-label text-text-muted">
        {label}
      </span>
      <span className="text-[11px] leading-relaxed text-text-secondary">{hint}</span>
    </div>
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
  return (
    <section
      className={cn(
        // Premium scouting chrome shared with the landing card (card-border +
        // glow + hover lift), with a tier corner accent driven by REAL
        // readiness level — never a fabricated rating.
        "card-border bg-card-glow glow-hover rise-in flex flex-col gap-5 border-t-2 p-5 transition-shadow hover:shadow-card-hover sm:p-6",
        LEVEL_ACCENT[readiness.level],
        // Silent-trust rule: no gold confirmation trust ring on this self-view
        // card — confirmation is an internal signal, never a visible accent.
      )}
      data-testid="worker-player-card"
    >
      {/* ── Identity: avatar + name + profession + readiness ring ── */}
      <header className="flex items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-4">
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={avatarUrl}
              alt={card.displayName ?? labels.namePlaceholder}
              data-testid="player-card-avatar-photo"
              loading="lazy"
              className={cn(
                "h-14 w-14 shrink-0 rounded-2xl border object-cover",
                "border-ink-500",
              )}
            />
          ) : (
            <span
              aria-hidden
              data-testid="player-card-avatar-monogram"
              className={cn(
                "flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border bg-ink-700 font-display text-lg font-bold text-text-primary",
                "border-ink-500",
              )}
            >
              {personMonogram(card.displayName)}
            </span>
          )}
          <div className="min-w-0 flex-col">
            <span className="font-mono text-[10px] uppercase tracking-label text-brand-cyan">
              {labels.title}
            </span>
            <h2 className="truncate font-display text-xl font-bold tracking-tightest text-text-primary">
              {card.displayName ?? labels.namePlaceholder}
            </h2>
            <p className="truncate text-xs leading-relaxed text-text-secondary">
              {labels.professionName ?? labels.subtitle}
            </p>
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
        <span className="inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-label text-text-muted">
          {labels.readiness.label}
          <span className="text-text-secondary">
            {readiness.met}/{readiness.total} {labels.readiness.signalsTemplate}
          </span>
        </span>
        {missing.length > 0 ? (
          <span className="flex flex-wrap items-center gap-1.5 text-[11px] leading-relaxed text-text-secondary">
            <span className="text-text-muted">{labels.readiness.nextLabel}</span>
            {missing.map((k) => (
              <span
                key={k}
                className="inline-flex items-center rounded-sm border border-ink-500 px-1.5 py-0.5 text-[10px] text-text-secondary"
              >
                {labels.readiness.pillars[k]}
              </span>
            ))}
          </span>
        ) : (
          <span className="text-[11px] leading-relaxed text-text-secondary">
            {labels.readiness.hint}
          </span>
        )}
      </div>

      {/* ── Real-state chips: availability + work-card confirmation ── */}
      <div className="flex flex-wrap items-center gap-2">
        {labels.availabilityLabel ? (
          <span
            className="inline-flex min-h-7 items-center gap-2 rounded-full border border-ink-500 bg-ink-800 px-3 py-1 font-mono text-[10px] uppercase tracking-label text-text-secondary"
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
            className="inline-flex min-h-7 items-center rounded-full border border-ink-500 bg-ink-800 px-3 py-1 text-[11px] text-text-secondary"
            data-testid="player-card-available-from"
          >
            {labels.availabilityFrom}
          </span>
        ) : null}
        <span
          className="inline-flex min-h-7 items-center gap-1.5 rounded-full border border-ink-500 bg-ink-800 px-3 py-1 font-mono text-[10px] uppercase tracking-label text-text-secondary"
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
        <span className="font-mono text-[10px] uppercase tracking-label text-text-muted">
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
          <p className="rounded-md border border-dashed border-ink-500 px-3 py-2 text-[11px] leading-relaxed text-text-muted">
            {labels.verifiedEmpty}
          </p>
        )}
        {/* Evidence ladder middle rung: work-journal-supported skills. Shown
            ONLY when there are any — a calm cyan tone (NOT the green
            manager-verified glow, NOT the gold trust ring), so the three
            tiers stay visually distinct and honest (DESIGN_SOUL §1). */}
        {card.journalSupportedSkills > 0 ? (
          <p
            className="inline-flex items-center gap-2 self-start rounded-md border border-brand-cyan/30 bg-brand-cyan/10 px-2.5 py-1.5 text-[11px] leading-relaxed text-brand-cyan"
            data-testid="player-card-journal-supported"
            title={labels.journalSupportedHint}
          >
            <Sparkle className="h-3.5 w-3.5 shrink-0" aria-hidden />
            <span className="font-mono font-bold">{card.journalSupportedSkills}</span>
            <span>· {labels.journalSupportedLabel}</span>
          </p>
        ) : null}
      </div>

      {/* ── Honest dimensions (real counts, plain zeros) ── */}
      <div className="grid grid-cols-2 gap-3">
        <Stat
          testid="player-card-skills"
          value={String(card.skillsDeclared)}
          label={labels.skillsLabel}
          hint={labels.skillsHint}
        />
        <Stat
          testid="player-card-candidate"
          value={String(card.candidateSkills)}
          label={labels.candidateLabel}
          hint={labels.candidateHint}
        />
        <Stat
          testid="player-card-evidence"
          value={String(card.evidenceEntries)}
          label={labels.evidenceLabel}
          hint={labels.evidenceHint}
        />
        <Stat
          testid="player-card-attention"
          value={String(card.attentionInstructions)}
          label={labels.attentionLabel}
          hint={card.attentionInstructions === 0 ? labels.attentionZero : labels.attentionHint}
        />
      </div>

      {/* ── Thermometer (S4) — owner-locked formula; a number ONLY when both
            components exist, otherwise the honest missing-data state ── */}
      {thermometer ? (
        <div
          className="flex flex-col gap-1 rounded-md border border-ink-600 bg-ink-800/40 p-3"
          data-testid="player-card-thermometer"
        >
          <span className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-label text-text-muted">
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
                  className="text-[11px] leading-relaxed text-state-warning"
                  data-testid="player-card-thermometer-small-sample"
                >
                  {labels.thermoSmallSample}
                </span>
              ) : null}
              <span className="text-[11px] leading-relaxed text-text-secondary">
                {labels.thermoHint}
              </span>
            </>
          ) : (
            <span
              className="text-[11px] leading-relaxed text-text-muted"
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
        <span className="font-mono text-[10px] uppercase tracking-label text-text-muted">
          {labels.latestEvidenceLabel}
        </span>
        <span className="text-text-primary">
          {labels.latestEvidenceValue ?? labels.latestEvidenceEmpty}
        </span>
      </div>
    </section>
  );
}
