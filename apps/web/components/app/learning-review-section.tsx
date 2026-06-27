"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, X, Sparkles } from "lucide-react";
import {
  applyAutoConfirmation,
  setReviewItemStatus,
} from "@/lib/learning/learning";
import type { LearningPolicyRow, ReviewItemRow, ReviewStatus } from "@/lib/learning/learning-shared";

/**
 * W6 — Human-in-loop learning review surface (Phase 1). Real data only — every
 * row comes from the caller's own RLS-scoped rows (worker sees own; manager sees
 * org). There are NO seed/demo rows. When the migration is not applied yet the
 * parent passes `needsMigration` and we show a calm "not available yet" state,
 * never an error.
 *
 * A queue item is a SUGGESTION, never a confirmation. Approving marks intent; the
 * actual confirmation only happens through the audited spine RPC
 * (applyAutoConfirmation), which re-checks live manager authority server-side.
 * Worker-facing copy stays neutral; manager-only controls live under labels.manager.
 */

export type LearningLabels = {
  title: string;
  lead: string;
  notAvailable: string;
  empty: string;
  workerHeading: string;
  workerIntro: string;
  manager: {
    queueHeading: string;
    approve: string;
    reject: string;
    applyPolicy: string;
    policyHeading: string;
    policyState: string;
    policyOff: string;
    policyOn: string;
    note: string;
    statusLabel: Record<ReviewStatus, string>;
  };
  errorGeneric: string;
};

const STATUS_RING: Record<ReviewStatus, string> = {
  pending: "border-ink-500 bg-ink-800/40 text-text-muted",
  approved: "border-brand-blue/40 bg-brand-blue/5 text-brand-blue",
  rejected: "border-state-warning/40 bg-state-warning/5 text-state-warning",
  superseded: "border-ink-500 bg-ink-800/40 text-text-muted",
  auto_actioned: "border-ink-500 bg-ink-800/40 text-text-secondary",
};

export function LearningReviewSection({
  initialItems,
  policies,
  needsMigration,
  labels,
}: {
  initialItems: ReviewItemRow[];
  policies: LearningPolicyRow[];
  needsMigration: boolean;
  labels: LearningLabels;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (needsMigration) {
    return (
      <div
        data-testid="learning-not-available"
        className="rounded-lg border border-ink-500 bg-ink-800/40 p-6 text-sm text-text-muted"
      >
        {labels.notAvailable}
      </div>
    );
  }

  function review(id: string, status: "approved" | "rejected") {
    setError(null);
    startTransition(async () => {
      const res = await setReviewItemStatus(id, status);
      if (res.kind !== "ok") setError(labels.errorGeneric);
      router.refresh();
    });
  }

  function applyPolicy(id: string) {
    setError(null);
    startTransition(async () => {
      const res = await applyAutoConfirmation(id);
      if (res.kind !== "ok") setError(labels.errorGeneric);
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h2 className="text-lg font-semibold text-text-primary">{labels.title}</h2>
        <p className="text-sm text-text-muted">{labels.lead}</p>
      </header>

      {/* Manager auto-confirmation policy state — DEFAULT OFF, shown honestly. */}
      <section className="rounded-lg border border-ink-500 bg-ink-800/30 p-4">
        <h3 className="text-sm font-medium text-text-secondary">{labels.manager.policyHeading}</h3>
        <ul className="mt-2 space-y-1 text-sm text-text-muted">
          {policies.map((p) => (
            <li key={p.id} data-testid="learning-policy-row">
              {labels.manager.policyState}:{" "}
              <span className={p.enabled ? "text-brand-blue" : "text-text-muted"}>
                {p.enabled ? labels.manager.policyOn : labels.manager.policyOff}
              </span>
            </li>
          ))}
          {policies.length === 0 && <li>{labels.manager.policyOff}</li>}
        </ul>
        <p className="mt-2 text-xs text-text-muted">{labels.manager.note}</p>
      </section>

      {/* Review queue */}
      <section className="space-y-2">
        <h3 className="text-sm font-medium text-text-secondary">{labels.manager.queueHeading}</h3>
        {initialItems.length === 0 ? (
          <div
            data-testid="learning-empty"
            className="rounded-lg border border-ink-500 bg-ink-800/40 p-6 text-sm text-text-muted"
          >
            {labels.empty}
          </div>
        ) : (
          <ul className="space-y-2">
            {initialItems.map((item) => (
              <li
                key={item.id}
                data-testid="learning-review-row"
                className="flex items-center justify-between gap-3 rounded-lg border border-ink-500 bg-ink-800/30 p-3"
              >
                <div className="min-w-0">
                  <span
                    className={`inline-block rounded-full border px-2 py-0.5 text-xs ${STATUS_RING[item.status]}`}
                  >
                    {labels.manager.statusLabel[item.status]}
                  </span>
                </div>
                {item.status === "pending" && (
                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => review(item.id, "approved")}
                      className="inline-flex items-center gap-1 rounded-md border border-brand-blue/40 px-2 py-1 text-xs text-brand-blue disabled:opacity-50"
                    >
                      <Check className="h-3 w-3" /> {labels.manager.approve}
                    </button>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => review(item.id, "rejected")}
                      className="inline-flex items-center gap-1 rounded-md border border-ink-500 px-2 py-1 text-xs text-text-muted disabled:opacity-50"
                    >
                      <X className="h-3 w-3" /> {labels.manager.reject}
                    </button>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => applyPolicy(item.id)}
                      className="inline-flex items-center gap-1 rounded-md border border-ink-500 px-2 py-1 text-xs text-text-secondary disabled:opacity-50"
                    >
                      <Sparkles className="h-3 w-3" /> {labels.manager.applyPolicy}
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {error && <p className="text-sm text-state-warning">{error}</p>}
    </div>
  );
}
