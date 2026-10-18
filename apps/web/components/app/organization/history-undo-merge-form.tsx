"use client";

import { useActionState } from "react";

import { revertConsolidationAction, type RevertResult } from "@/lib/organization-evidence/history-quality-actions";

/** Undo ONE recorded merge: a reason is required (it goes to the ledger and the audit log). */
export function HistoryUndoMergeForm({
  decisionId,
  labels,
}: {
  decisionId: string;
  labels: { reason: string; undo: string; pending: string; done: string; failed: string };
}) {
  const [state, action, pending] = useActionState<RevertResult | null, FormData>(revertConsolidationAction, null);
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="decision" value={decisionId} />
      <input
        name="reason"
        required
        minLength={3}
        maxLength={500}
        placeholder={labels.reason}
        aria-label={labels.reason}
        className="min-h-9 w-48 rounded-md border border-ink-600 bg-ink-800 px-2 text-meta text-text-primary"
      />
      <button
        type="submit"
        disabled={pending || state?.ok === true}
        aria-busy={pending}
        className="inline-flex min-h-9 items-center rounded-md border border-ink-500 px-2 text-meta text-text-secondary hover:text-text-primary disabled:opacity-60"
      >
        {pending ? labels.pending : labels.undo}
      </button>
      {state?.ok ? (
        <span role="status" className="text-meta text-state-success">{labels.done}</span>
      ) : state ? (
        <span role="alert" className="text-meta text-state-danger">{labels.failed}</span>
      ) : null}
    </form>
  );
}
