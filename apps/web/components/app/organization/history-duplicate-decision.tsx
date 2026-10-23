"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  markRecordDuplicateAction,
  reinstateRecordAction,
  type DuplicateDecisionResult,
} from "@/lib/organization-evidence/duplicate-review-actions";

/** One reversible decision on a possible duplicate (see duplicate-review-model). */
export function HistoryDuplicateDecision({
  recordId,
  keptRecordId,
  kind,
  label,
  errorLabels,
}: {
  recordId: string;
  /** Required for "mark": the record this one duplicates (kept, counted). */
  keptRecordId?: string;
  kind: "mark" | "reinstate";
  label: string;
  errorLabels: { error: string; notAllowed: string; notSameWork: string };
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [failed, setFailed] = useState<string | null>(null);
  const message = (r: DuplicateDecisionResult): string | null => {
    if (r.ok || r.code === "already") return null;
    if (r.code === "not_allowed") return errorLabels.notAllowed;
    if (r.code === "not_same_work") return errorLabels.notSameWork;
    return errorLabels.error;
  };
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setFailed(null);
            const r =
              kind === "mark" && keptRecordId
                ? await markRecordDuplicateAction({ recordId, keptRecordId })
                : await reinstateRecordAction({ recordId });
            const m = message(r);
            if (m) setFailed(m);
            else router.refresh();
          })
        }
        className="rounded-md border border-ink-500 px-3 py-1.5 text-xs font-semibold text-text-secondary hover:border-brand-orange disabled:opacity-50"
        data-testid={kind === "mark" ? `duplicate-mark-${recordId}` : `duplicate-reinstate-${recordId}`}
      >
        {label}
      </button>
      {failed ? (
        <span role="alert" className="text-meta text-state-warning">
          {failed}
        </span>
      ) : null}
    </span>
  );
}
