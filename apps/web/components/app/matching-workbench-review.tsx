"use client";

import { useActionState, useRef, useState } from "react";

import {
  recordHumanMatchAction,
  type MatchActionState,
} from "@/lib/admin/matching-workbench-actions";
import type { WorkbenchStatus } from "@/lib/admin/matching-workbench";
import { DarkListbox, type DarkListboxOption } from "@/components/ui/DarkListbox";

/**
 * Per-request human match controls (Phase 3.2 workbench).
 *
 * Low-fidelity preview, bus pakeistas TASK 07 (living-arena UI po owner
 * vizualinio užrakto). Funkcija > grožis: worker picker (canonical
 * DarkListbox), feedback note, three explicit human decisions. The match is a
 * HUMAN decision — the surrounding page says so in copy; nothing here ranks,
 * scores, or suggests.
 */
export interface MatchingReviewLabels {
  readonly workerLabel: string;
  readonly workerPlaceholder: string;
  readonly noteLabel: string;
  readonly notePlaceholder: string;
  readonly recordInReview: string;
  readonly recordFollowup: string;
  readonly recordApproved: string;
  readonly statusSaved: string;
  readonly statusNotAdmin: string;
  readonly statusInvalid: string;
  readonly statusNotFound: string;
  readonly statusNeedsMigration: string;
  readonly statusError: string;
}

export function MatchingWorkbenchReview({
  requestId,
  workers,
  labels,
}: {
  readonly requestId: string;
  readonly workers: readonly DarkListboxOption[];
  readonly labels: MatchingReviewLabels;
}) {
  const [state, formAction, isPending] = useActionState<
    MatchActionState | null,
    FormData
  >(recordHumanMatchAction, null);
  const [workerId, setWorkerId] = useState("");

  const statusRef = useRef<HTMLInputElement>(null);
  const setStatus = (v: WorkbenchStatus) => {
    if (statusRef.current) statusRef.current.value = v;
  };

  const banner: { tone: "success" | "warning"; text: string } | null = (() => {
    if (!state) return null;
    if (state.ok) return { tone: "success", text: labels.statusSaved };
    switch (state.code) {
      case "not_admin":
        return { tone: "warning", text: labels.statusNotAdmin };
      case "invalid":
        return { tone: "warning", text: labels.statusInvalid };
      case "not_found":
        return { tone: "warning", text: labels.statusNotFound };
      case "needs_migration":
        return { tone: "warning", text: labels.statusNeedsMigration };
      default:
        return { tone: "warning", text: state.message ?? labels.statusError };
    }
  })();

  return (
    <form
      action={formAction}
      className="flex flex-col gap-2"
      data-testid={`matching-review-${requestId}`}
    >
      <input type="hidden" name="request_id" value={requestId} />
      <input type="hidden" name="status" ref={statusRef} defaultValue="" />

      <label className="flex flex-col gap-1 text-meta">
        <span className="text-text-muted">{labels.workerLabel}</span>
        <DarkListbox
          value={workerId}
          onChange={setWorkerId}
          options={workers}
          name="worker_id"
          placeholder={labels.workerPlaceholder}
          ariaLabel={labels.workerLabel}
          testId={`matching-worker-pick-${requestId}`}
        />
      </label>

      <label className="flex flex-col gap-1 text-meta">
        <span className="text-text-muted">{labels.noteLabel}</span>
        <textarea
          name="note"
          rows={2}
          maxLength={2000}
          placeholder={labels.notePlaceholder}
          className="rounded-md border border-border-default bg-surface-1 px-2 py-1 text-xs text-text-primary outline-none focus:border-brand-blue"
          data-testid={`matching-note-${requestId}`}
        />
      </label>

      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          onClick={() => setStatus("in_review")}
          disabled={isPending || !workerId}
          className="rounded-md bg-brand-blue/90 px-3 py-1.5 text-xs font-semibold text-ink-900 hover:bg-brand-blue disabled:opacity-50"
          data-testid={`matching-record-in-review-${requestId}`}
        >
          {labels.recordInReview}
        </button>
        <button
          type="submit"
          onClick={() => setStatus("needs_followup")}
          disabled={isPending || !workerId}
          className="rounded-md border border-state-warning/50 px-3 py-1.5 text-xs font-semibold text-state-warning hover:border-state-warning disabled:opacity-50"
          data-testid={`matching-record-followup-${requestId}`}
        >
          {labels.recordFollowup}
        </button>
        <button
          type="submit"
          onClick={() => setStatus("approved")}
          disabled={isPending || !workerId}
          className="rounded-md bg-state-success/90 px-3 py-1.5 text-xs font-semibold text-ink-900 hover:bg-state-success disabled:opacity-50"
          data-testid={`matching-record-approved-${requestId}`}
        >
          {labels.recordApproved}
        </button>
      </div>

      {banner ? (
        <p
          className={
            banner.tone === "success"
              ? "rounded-md border border-state-success bg-state-success/10 px-2 py-1 text-meta text-state-success"
              : "rounded-md border border-state-warning bg-state-warning/10 px-2 py-1 text-meta text-state-warning"
          }
          role="status"
          data-testid={`matching-result-${requestId}`}
        >
          {banner.text}
        </p>
      ) : null}
    </form>
  );
}
