import { Check, AlertTriangle, HelpCircle } from "lucide-react";

import type { MatchSignal, MatchSignalState } from "@/lib/opportunities/match-card-view";

/**
 * MatchSignals — the reusable per-dimension Match Card breakdown. Shows WHY a
 * demand/supply pair fits and WHAT to check, honestly: each dimension is fit
 * (green ✓), check (amber !), or unknown (muted ?). No score, no percentage, no
 * "guaranteed match". Reusable across opportunities, marketplace and the command
 * center.
 *
 * Presentational: the caller passes localized dimension labels + state words.
 */

const STATE_STYLE: Record<MatchSignalState, string> = {
  fit: "border-state-success/40 bg-state-success/10 text-state-success",
  check: "border-state-amber/40 bg-state-amber/5 text-state-amber",
  unknown: "border-ink-500 bg-ink-800/40 text-text-muted",
};

function StateIcon({ state }: { state: MatchSignalState }) {
  if (state === "fit") return <Check className="h-3 w-3" aria-hidden />;
  if (state === "check") return <AlertTriangle className="h-3 w-3" aria-hidden />;
  return <HelpCircle className="h-3 w-3" aria-hidden />;
}

export function MatchSignals({
  signals,
  dimensionLabel,
  stateLabel,
  testId = "match-signals",
}: {
  signals: readonly MatchSignal[];
  /** Localized label for a dimension key. */
  dimensionLabel: (key: MatchSignal["key"]) => string;
  /** Localized word for a state. */
  stateLabel: (state: MatchSignalState) => string;
  testId?: string;
}) {
  return (
    <ul className="flex flex-wrap gap-1.5" data-testid={testId}>
      {signals.map((s) => (
        <li
          key={s.key}
          className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] ${STATE_STYLE[s.state]}`}
          data-signal={s.key}
          data-state={s.state}
        >
          <StateIcon state={s.state} />
          <span>{dimensionLabel(s.key)}</span>
          <span className="opacity-70">· {stateLabel(s.state)}</span>
        </li>
      ))}
    </ul>
  );
}
