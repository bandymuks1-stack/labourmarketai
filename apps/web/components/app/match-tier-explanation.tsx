import type {
  MatchCriterionResult,
  MatchMissingFact,
} from "@/lib/market/match-v1";

/**
 * Matching contract v2 tier explanation (Marketplace Precision PR 4).
 * Presentational + server-safe: renders the per-criterion tiers the ONE
 * deterministic engine produced — blocking (hard failures), strengths,
 * negotiables ("discussion points") and missing facts ("X has not stated Y").
 *
 * §19 discipline: explanation first, no standalone %, no score, no AI claim.
 * All copy arrives via label callbacks so each surface localizes in its own
 * namespace and perspective (worker board vs company scouting).
 */

export interface MatchTierLabels {
  readonly blockingTitle: string;
  readonly strengthsTitle: string;
  readonly negotiablesTitle: string;
  readonly missingTitle: string;
  readonly criterionLabel: (criterion: string) => string;
  readonly missingLabel: (side: "worker" | "demand", criterionLabel: string) => string;
}

const CHIP =
  "rounded-md border px-2 py-0.5 text-[11px]";

function TierGroup({
  title,
  chipTone,
  items,
  criterionLabel,
  testId,
}: {
  title: string;
  chipTone: string;
  items: readonly MatchCriterionResult[];
  criterionLabel: (criterion: string) => string;
  testId: string;
}) {
  if (items.length === 0) return null;
  return (
    <div className="flex flex-col gap-1" data-testid={testId}>
      <span className="font-mono text-[10px] uppercase tracking-label text-text-muted">
        {title}
      </span>
      <div className="flex flex-wrap gap-1.5">
        {items.map((c) => (
          <span
            key={c.criterion}
            className={`${CHIP} ${chipTone}`}
            data-criterion={c.criterion}
            data-class={c.class}
            data-outcome={c.outcome}
            title={c.source}
          >
            {criterionLabel(c.criterion)}
          </span>
        ))}
      </div>
    </div>
  );
}

export function MatchTierExplanation({
  blocking,
  strengths,
  negotiables,
  missingFacts,
  labels,
  testId,
}: {
  blocking: readonly MatchCriterionResult[];
  strengths: readonly MatchCriterionResult[];
  negotiables: readonly MatchCriterionResult[];
  missingFacts: readonly MatchMissingFact[];
  labels: MatchTierLabels;
  testId?: string;
}) {
  const empty =
    blocking.length === 0 &&
    strengths.length === 0 &&
    negotiables.length === 0 &&
    missingFacts.length === 0;
  if (empty) return null;
  return (
    <div className="flex flex-col gap-2" data-testid={testId}>
      {/* Blocking first — a hard failure is the headline, never buried. */}
      <TierGroup
        title={labels.blockingTitle}
        chipTone="border-state-danger/40 bg-state-danger/10 text-state-danger"
        items={blocking}
        criterionLabel={labels.criterionLabel}
        testId={`${testId ?? "match-tiers"}-blocking`}
      />
      <TierGroup
        title={labels.strengthsTitle}
        chipTone="border-state-success/30 bg-state-success/10 text-state-success"
        items={strengths}
        criterionLabel={labels.criterionLabel}
        testId={`${testId ?? "match-tiers"}-strengths`}
      />
      <TierGroup
        title={labels.negotiablesTitle}
        chipTone="border-brand-blue/30 bg-brand-blue/5 text-brand-blue"
        items={negotiables}
        criterionLabel={labels.criterionLabel}
        testId={`${testId ?? "match-tiers"}-negotiables`}
      />
      {missingFacts.length > 0 ? (
        <div
          className="flex flex-col gap-1"
          data-testid={`${testId ?? "match-tiers"}-missing`}
        >
          <span className="font-mono text-[10px] uppercase tracking-label text-text-muted">
            {labels.missingTitle}
          </span>
          <ul className="flex flex-col gap-0.5">
            {missingFacts.map((m) => (
              <li
                key={`${m.criterion}-${m.side}`}
                className="text-[11px] text-text-muted"
                data-criterion={m.criterion}
                data-side={m.side}
                title={m.source}
              >
                {labels.missingLabel(m.side, labels.criterionLabel(m.criterion))}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
