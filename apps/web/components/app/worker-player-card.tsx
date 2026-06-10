import type { WorkerPlayerCard } from "@/lib/player-card/player-card";

/**
 * Worker player-card (slice worker-player-card-v1). A calm worker-first summary
 * of the worker's OWN real dimensions. Honest by construction: zero is shown as a
 * plain zero with a gentle next step, never inflated; skills are labelled
 * self-declared (not verified); nothing here implies AI or employer interest.
 *
 * Visual layer: low-fidelity preview, bus pakeistas TASK 07 (living-arena UI
 * po owner vizualinio užrakto). Logika ir sąžiningi skaitliukai lieka.
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
  thermoLabel: string;
  thermoHint: string;
  thermoMissingPosition: string;
  thermoMissingMarket: string;
  thermoMissingBoth: string;
  thermoSmallSample: string;
}

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
  thermometer,
}: {
  card: WorkerPlayerCard;
  labels: PlayerCardLabels;
  thermometer?: ThermometerView | null;
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

      {/* Thermometer (S4) — owner-locked formula; renders a number ONLY when
          both components exist, otherwise the honest missing-data state. */}
      {thermometer ? (
        <div
          className="flex flex-col gap-0.5 rounded-md border border-ink-600 bg-ink-800/40 p-3"
          data-testid="player-card-thermometer"
        >
          {thermometer.kind === "score" ? (
            <>
              <span className="font-display text-2xl font-bold tracking-tightest text-text-primary">
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
            </>
          ) : (
            <span
              className="font-display text-base font-semibold text-text-secondary"
              data-testid="player-card-thermometer-missing"
            >
              {thermometer.missing === "position"
                ? labels.thermoMissingPosition
                : thermometer.missing === "market"
                  ? labels.thermoMissingMarket
                  : labels.thermoMissingBoth}
            </span>
          )}
          <span className="font-mono text-[10px] uppercase tracking-label text-text-muted">
            {labels.thermoLabel}
          </span>
          <span className="text-[11px] leading-relaxed text-text-secondary">
            {labels.thermoHint}
          </span>
        </div>
      ) : null}
    </section>
  );
}
