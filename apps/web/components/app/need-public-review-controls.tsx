"use client";

import { useActionState, useRef } from "react";

import {
  decideNeedPublicReviewAction,
  type NeedPublicReviewActionState,
} from "@/lib/admin/need-public-review-actions";

/**
 * Operator approve / reject for one held need (owner decision V-1). Same
 * two-channel submit as CompanyVerificationReview: a hidden `decision` input
 * set on click, plus each button's own name/value for a pre-hydration submit.
 * Approving shows the need marked "Company not confirmed" — it never verifies
 * the company.
 */
export interface NeedPublicReviewLabels {
  readonly approve: string;
  readonly reject: string;
  readonly noteLabel: string;
  readonly saved: string;
  readonly failed: string;
  readonly saving: string;
}

export function NeedPublicReviewControls({
  requestId,
  labels,
}: {
  readonly requestId: string;
  readonly labels: NeedPublicReviewLabels;
}) {
  const [state, formAction, isPending] = useActionState<NeedPublicReviewActionState | null, FormData>(
    decideNeedPublicReviewAction,
    null,
  );
  const decisionRef = useRef<HTMLInputElement>(null);
  const setDecision = (v: "approved" | "rejected") => {
    if (decisionRef.current) decisionRef.current.value = v;
  };

  return (
    <form action={formAction} className="flex flex-col gap-2" data-testid={`need-public-review-${requestId}`}>
      <input type="hidden" name="request_id" value={requestId} />
      <input type="hidden" name="decision" ref={decisionRef} defaultValue="" />
      <label className="flex flex-col gap-1 text-meta">
        <span className="text-text-muted">{labels.noteLabel}</span>
        <textarea
          name="reason"
          rows={2}
          maxLength={500}
          className="rounded-md border border-border-default bg-surface-1 px-2 py-1 text-xs text-text-primary outline-none focus:border-brand-blue"
        />
      </label>
      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          name="decision"
          value="approved"
          onClick={() => setDecision("approved")}
          disabled={isPending}
          className="rounded-md border border-state-warning/50 px-3 py-1.5 text-xs font-semibold text-state-warning hover:border-state-warning disabled:opacity-50"
          data-testid={`need-public-review-approve-${requestId}`}
        >
          {labels.approve}
        </button>
        <button
          type="submit"
          name="decision"
          value="rejected"
          onClick={() => setDecision("rejected")}
          disabled={isPending}
          className="rounded-md border border-border-default px-3 py-1.5 text-xs font-medium text-text-secondary hover:border-brand-blue disabled:opacity-50"
          data-testid={`need-public-review-reject-${requestId}`}
        >
          {labels.reject}
        </button>
      </div>
      {isPending ? (
        <p role="status" className="text-meta text-text-muted">
          {labels.saving}
        </p>
      ) : state ? (
        <p
          role="status"
          className={`text-meta ${state.ok ? "text-state-success" : "text-state-warning"}`}
          data-testid={`need-public-review-result-${requestId}`}
        >
          {state.ok ? labels.saved : labels.failed}
        </p>
      ) : null}
    </form>
  );
}
