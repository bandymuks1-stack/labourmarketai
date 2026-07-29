"use client";

import { useState, useTransition } from "react";
import {
  saveOpportunityAction,
  unsaveOpportunityAction,
} from "@/lib/opportunities/saved-actions";

/**
 * Save / unsave toggle for one opportunity card (P2-PR5, #723-compat).
 *
 * PRIVATE BOOKMARK: the action writes only the worker's own save-marker row
 * through the gated RPCs — the company never sees who saved (the hint line on
 * the board says so). Rendered ONLY when the owner-gated store exists
 * (savedAvailable, feature-detected server-side once per page load) — when
 * the migration is not applied this component is never mounted: honest
 * invisibility, never a dead button. Touch target ≥44px (mobile-first).
 */
export function WorkerSaveOpportunityButton({
  locale,
  requestId,
  initialSaved,
  labels,
}: {
  locale: string;
  requestId: string;
  initialSaved: boolean;
  labels: {
    save: string;
    saved: string;
    unsave: string;
    error: string;
  };
}) {
  const [saved, setSaved] = useState(initialSaved);
  const [failed, setFailed] = useState(false);
  const [pending, startTransition] = useTransition();

  const onToggle = () =>
    startTransition(async () => {
      setFailed(false);
      const r = saved
        ? await unsaveOpportunityAction(locale, requestId)
        : await saveOpportunityAction(locale, requestId);
      if (r.kind === "ok") setSaved(r.saved);
      else setFailed(true);
    });

  return (
    <div className="flex flex-wrap items-center gap-2" data-testid={`save-${requestId}`}>
      <button
        type="button"
        aria-pressed={saved}
        title={saved ? labels.unsave : labels.save}
        onClick={onToggle}
        disabled={pending}
        className={`inline-flex min-h-[2.75rem] items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50 ${
          saved
            ? "border-state-success/40 bg-state-success/10 text-state-success hover:border-state-success"
            : "border-ink-500 text-text-secondary hover:border-brand-blue hover:text-text-primary"
        }`}
        data-testid="save-toggle"
        data-saved={saved ? "true" : "false"}
      >
        <span aria-hidden className="font-mono text-meta">
          {saved ? "✓" : "+"}
        </span>
        {saved ? labels.saved : labels.save}
      </button>
      {failed ? (
        <span role="alert" className="text-meta text-state-warning">
          {labels.error}
        </span>
      ) : null}
    </div>
  );
}
