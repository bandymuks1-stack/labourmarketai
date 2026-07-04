"use client";

import { useState, useTransition } from "react";
import {
  expressInterestAction,
  withdrawInterestAction,
} from "@/lib/opportunities/interest-actions";
import type { InterestStatus } from "@/lib/opportunities/interest-snapshot";

/**
 * Worker express-interest control (Worker Express Interest slice).
 *
 * HONEST BY DESIGN: the action only creates an INTERNAL signal row — the
 * label says so explicitly. There is no message, no application status, no
 * contact reveal. Withdraw is always available on an active interest.
 * Rendered ONLY when the interest table exists (interestAvailable) — never a
 * dead button.
 */
export function WorkerInterestButton({
  locale,
  requestId,
  initialStatus,
  labels,
}: {
  locale: string;
  requestId: string;
  initialStatus: InterestStatus | null;
  labels: {
    express: string;
    sent: string;
    /** Honest company-side acknowledgement labels (PR7) — shown only when
     *  the company ACTUALLY set the status on the real row. */
    reviewed: string;
    contacted: string;
    withdraw: string;
    internalNote: string;
    error: string;
  };
}) {
  const [status, setStatus] = useState<InterestStatus | null>(initialStatus);
  const [failed, setFailed] = useState(false);
  const [pending, startTransition] = useTransition();

  const active = status === "interested" || status === "reviewed" || status === "contacted";
  const activeLabel =
    status === "reviewed"
      ? labels.reviewed
      : status === "contacted"
        ? labels.contacted
        : labels.sent;

  const onExpress = () =>
    startTransition(async () => {
      setFailed(false);
      const r = await expressInterestAction(locale, requestId);
      if (r.kind === "ok") setStatus(r.status);
      else setFailed(true);
    });

  const onWithdraw = () =>
    startTransition(async () => {
      setFailed(false);
      const r = await withdrawInterestAction(locale, requestId);
      if (r.kind === "ok") setStatus(r.status);
      else setFailed(true);
    });

  return (
    <div className="flex flex-col gap-1.5" data-testid={`interest-${requestId}`}>
      <div className="flex flex-wrap items-center gap-2">
        {active ? (
          <>
            <span
              className="rounded-md border border-state-success/40 bg-state-success/10 px-3 py-1.5 text-xs font-semibold text-state-success"
              data-testid="interest-sent"
              data-interest-status={status}
            >
              ✓ {activeLabel}
            </span>
            <button
              type="button"
              onClick={onWithdraw}
              disabled={pending}
              className="rounded-md border border-ink-500 px-3 py-1.5 text-xs text-text-secondary hover:border-state-warning hover:text-text-primary disabled:opacity-50"
              data-testid="interest-withdraw"
            >
              {labels.withdraw}
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={onExpress}
            disabled={pending}
            className="rounded-md bg-brand-blue px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-blue/80 disabled:opacity-50"
            data-testid="interest-express"
          >
            {labels.express}
          </button>
        )}
        {failed ? <span className="text-[11px] text-state-warning">{labels.error}</span> : null}
      </div>
      {/* Honest scope line — REQUIRED copy: internal signal only. */}
      <p className="text-[10px] leading-relaxed text-text-muted">{labels.internalNote}</p>
    </div>
  );
}
