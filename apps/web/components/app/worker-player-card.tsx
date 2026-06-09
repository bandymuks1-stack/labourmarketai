import type { WorkerPlayerCard } from "@/lib/player-card/player-card";

/**
 * Worker player-card (slice worker-player-card-v1). A calm worker-first summary
 * of the worker's OWN real dimensions. Honest by construction: zero is shown as a
 * plain zero with a gentle next step, never inflated; skills are labelled
 * self-declared (not verified); nothing here implies AI or employer interest.
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
    <div className="flex flex-col gap-0.5 rounded-md border border-ink-600 bg-ink-800/40 p-3" data-testid={testid}>
      <span className="font-display text-2xl font-bold tracking-tightest text-text-primary">
        {value}
      </span>
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
  card: WorkerPlayerCard;
  labels: PlayerCardLabels;
}) {
  return (
    <section
      className="card-border flex flex-col gap-4 p-5"
      data-testid="worker-player-card"
    >
      <header className="flex flex-col gap-0.5">
        <span className="font-mono text-[10px] uppercase tracking-label text-brand-cyan">
          {labels.title}
        </span>
        <h2 className="font-display text-xl font-bold tracking-tightest text-text-primary">
          {card.displayName ?? labels.namePlaceholder}
        </h2>
        <p className="text-xs leading-relaxed text-text-secondary">{labels.subtitle}</p>
      </header>

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
        <div
          className="flex flex-col gap-0.5 rounded-md border border-ink-600 bg-ink-800/40 p-3"
          data-testid="player-card-workcard"
        >
          <span
            className={`font-display text-base font-semibold ${
              card.workCardConfirmed ? "text-state-success" : "text-text-secondary"
            }`}
          >
            {card.workCardConfirmed ? labels.workCardConfirmed : labels.workCardPending}
          </span>
          <span className="font-mono text-[10px] uppercase tracking-label text-text-muted">
            {labels.workCardLabel}
          </span>
        </div>
      </div>
    </section>
  );
}
