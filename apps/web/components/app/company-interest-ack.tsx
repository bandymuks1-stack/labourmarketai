"use client";

import { useState, useTransition } from "react";
import { acknowledgeInterestAction } from "@/lib/opportunities/interest-actions";
import type { InterestStatus } from "@/lib/opportunities/interest-snapshot";

/**
 * Company acknowledgement control for one worker interest signal (PR7).
 *
 * INTERNAL state only — marking "reviewed" / "contacted" records the
 * company's own decision on its own demand. Nothing is sent to the worker
 * or anywhere else; the worker sees the honest status through their own row
 * (RLS). Rendered only for candidates who ACTUALLY expressed interest.
 */
export function CompanyInterestAck({
  locale,
  requestId,
  workerId,
  initialStatus,
  labels,
}: {
  locale: string;
  requestId: string;
  workerId: string;
  initialStatus: string;
  labels: {
    statusLabel: (status: string) => string;
    markReviewed: string;
    markContacted: string;
    internalNote: string;
    error: string;
    notAvailable: string;
  };
}) {
  const [status, setStatus] = useState<string>(initialStatus);
  const [failure, setFailure] = useState<"none" | "error" | "not-available">("none");
  const [pending, startTransition] = useTransition();

  const ack = (next: "reviewed" | "contacted") =>
    startTransition(async () => {
      setFailure("none");
      const r = await acknowledgeInterestAction(locale, requestId, workerId, next);
      if (r.kind === "ok") setStatus(r.status as InterestStatus);
      else if (r.kind === "needs-migration") setFailure("not-available");
      else setFailure("error");
    });

  return (
    <div
      className="flex flex-col gap-1.5 rounded-md border border-state-success/25 bg-state-success/5 px-2.5 py-2"
      data-testid={`interest-ack-${workerId}`}
      data-interest-status={status}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-[10px] uppercase tracking-label text-state-success">
          {labels.statusLabel(status)}
        </span>
        {status !== "reviewed" ? (
          <button
            type="button"
            onClick={() => ack("reviewed")}
            disabled={pending}
            className="rounded-md border border-ink-500 px-2.5 py-1 text-[11px] text-text-primary hover:border-brand-blue disabled:opacity-50"
            data-testid="interest-ack-reviewed"
          >
            {labels.markReviewed}
          </button>
        ) : null}
        {status !== "contacted" ? (
          <button
            type="button"
            onClick={() => ack("contacted")}
            disabled={pending}
            className="rounded-md border border-ink-500 px-2.5 py-1 text-[11px] text-text-primary hover:border-brand-blue disabled:opacity-50"
            data-testid="interest-ack-contacted"
          >
            {labels.markContacted}
          </button>
        ) : null}
        {failure === "error" ? (
          <span className="text-[11px] text-state-warning">{labels.error}</span>
        ) : null}
        {failure === "not-available" ? (
          <span className="text-[11px] text-text-muted">{labels.notAvailable}</span>
        ) : null}
      </div>
      {/* Honest scope line — internal record only, nothing is sent. */}
      <p className="text-[10px] leading-relaxed text-text-muted">{labels.internalNote}</p>
    </div>
  );
}
