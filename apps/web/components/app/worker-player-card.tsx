import { ShieldCheck, Shield, CalendarCheck2, Sparkle } from "lucide-react";

import type { WorkerPlayerCard as WorkerPlayerCardData } from "@/lib/player-card/player-card";
import { CountUp } from "@/components/app/today/count-up";
import { SkillIcon } from "@/components/app/today/skill-icon";
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
  verifiedTitle: string;
  verifiedEmpty: string;
  /** Resolved names for the verified skill badges (parallel to card data). */
  verifiedSkillNames: string[];
  latestEvidenceLabel: string;
  /** Formatted date of the newest entry, or null when there is none yet. */
  latestEvidenceValue: string | null;
  latestEvidenceEmpty: string;
}

function initialsOf(name: string | null): string {
  if (!name) return "•";
  const parts = name.trim().split(/\s+/).slice(0, 2);
  const letters = parts.map((p) => p[0]?.toUpperCase() ?? "").join("");
  return letters || "•";
}

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
}: {
  card: WorkerPlayerCardData;
  labels: PlayerCardLabels;
}) {
  const confirmed = card.workCardConfirmed;
  return (
    <section
      className={cn(
        "card-border rise-in flex flex-col gap-5 p-5 sm:p-6",
        // Gold ONLY as the real-confirmation trust accent (DESIGN_SOUL §1).
        confirmed && "trust-ring",
      )}
      data-testid="worker-player-card"
    >
      {/* ── Identity: avatar initials + name + profession ── */}
      <header className="flex items-center gap-4">
        <span
          aria-hidden
          className={cn(
            "flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border bg-ink-700 font-display text-lg font-bold text-text-primary",
            confirmed ? "border-trust-accent/50" : "border-ink-500",
          )}
        >
          {initialsOf(card.displayName)}
        </span>
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
      </header>

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
        <span
          className={cn(
            "inline-flex min-h-7 items-center gap-1.5 rounded-full border px-3 py-1 font-mono text-[10px] uppercase tracking-label",
            confirmed
              ? "border-trust-accent/40 bg-trust-accent/10 text-trust-accent"
              : "border-ink-500 bg-ink-800 text-text-secondary",
          )}
          data-testid="player-card-workcard"
        >
          {confirmed ? (
            <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
          ) : (
            <Shield className="h-3.5 w-3.5" aria-hidden />
          )}
          {confirmed ? labels.workCardConfirmed : labels.workCardPending}
          <span className="sr-only">{labels.workCardLabel}</span>
        </span>
      </div>

      {/* ── Verified skills: green glow ONLY for manager-verified rows ── */}
      <div className="flex flex-col gap-2" data-testid="player-card-verified-skills">
        <span className="font-mono text-[10px] uppercase tracking-label text-text-muted">
          {labels.verifiedTitle}
        </span>
        {card.verifiedSkills.length > 0 ? (
          <ul className="flex flex-wrap gap-2">
            {card.verifiedSkills.map((s, i) => (
              <li
                key={s.slug}
                className="verified-pop inline-flex min-h-8 items-center gap-1.5 rounded-md border border-state-success/30 bg-state-success/10 px-2.5 py-1.5 text-xs font-medium text-state-success"
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
