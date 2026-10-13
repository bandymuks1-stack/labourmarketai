"use client";

import { useActionState } from "react";

import {
  applyConsolidationGroupAction,
  type ConsolidationApplyResult,
} from "@/lib/projects/historical-consolidation-actions";

/**
 * One group's merge control: a deliberate press (plus an explicit "same
 * object" decision for a B group), a pending state, and an announced outcome.
 */
export function HistoricalConsolidationApplyForm({
  groupKey,
  needsDecision,
  labels,
}: {
  groupKey: string;
  needsDecision: boolean;
  labels: { apply: string; decide: string; pending: string; done: string; failed: string };
}) {
  const [state, action, pending] = useActionState<ConsolidationApplyResult | null, FormData>(
    applyConsolidationGroupAction,
    null,
  );
  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="group" value={groupKey} />
      <span className="flex flex-wrap items-center gap-3">
        {needsDecision ? (
          <label className="inline-flex items-center gap-2 text-meta text-text-secondary">
            <input type="checkbox" name="decided" value="1" required />
            {labels.decide}
          </label>
        ) : null}
        <button
          type="submit"
          disabled={pending || state?.ok === true}
          aria-busy={pending}
          className="inline-flex min-h-11 items-center rounded-md border border-brand-blue/60 px-3 text-sm font-medium text-brand-blue hover:bg-brand-blue/10 disabled:opacity-60"
          data-testid="historical-consolidation-apply"
        >
          {pending ? labels.pending : labels.apply}
        </button>
      </span>
      {state?.ok ? (
        <p role="status" className="text-meta text-state-success" data-testid="historical-consolidation-result">
          {labels.done}
        </p>
      ) : state ? (
        <p role="alert" className="text-meta text-state-danger" data-testid="historical-consolidation-result">
          {labels.failed}
        </p>
      ) : null}
    </form>
  );
}
