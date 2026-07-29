"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MessageSquare } from "lucide-react";

import { acknowledgeInterestAction } from "@/lib/opportunities/interest-actions";
import { contactInterestedWorkerAction } from "@/lib/communication/contact-interested-worker";
import type { InterestStatus } from "@/lib/opportunities/interest-snapshot";

/**
 * Company acknowledgement control for one worker interest signal.
 *
 * "Reviewed" stays an INTERNAL record on the company's own demand. "Contact"
 * (audit PR5) is no longer a bare flag: it opens/reopens the REAL in-app
 * conversation with the interested worker first (server-verified: demand
 * ownership + the worker's own standing interest signal) and only then marks
 * the signal `contacted` — so the status never claims contact that no
 * surface mediated. Nothing external is ever sent; the worker notices the
 * thread through the real unread badge/bell. Rendered only for candidates
 * who ACTUALLY expressed interest.
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
    /** Plain status → label map. A function prop here is a server-render
     *  crash: this is a client component, and RSC cannot serialize functions
     *  passed from the server page — the whole scouting page dies the first
     *  time an interest signal renders. Unknown statuses fall back to the
     *  raw status string. */
    statusLabels: Record<string, string>;
    markReviewed: string;
    markContacted: string;
    internalNote: string;
    error: string;
    notAvailable: string;
  };
}) {
  const router = useRouter();
  const [status, setStatus] = useState<string>(initialStatus);
  const [failure, setFailure] = useState<"none" | "error" | "not-available">("none");
  const [pending, startTransition] = useTransition();

  const markReviewed = () =>
    startTransition(async () => {
      setFailure("none");
      const r = await acknowledgeInterestAction(locale, requestId, workerId, "reviewed");
      if (r.kind === "ok") setStatus(r.status as InterestStatus);
      else if (r.kind === "needs-migration") setFailure("not-available");
      else setFailure("error");
    });

  const contact = () =>
    startTransition(async () => {
      setFailure("none");
      const r = await contactInterestedWorkerAction({ locale, requestId, workerId });
      if (r.ok) {
        setStatus("contacted");
        router.push(`/${locale}/dashboard/communication/${r.conversationId}`);
        return;
      }
      if (r.reason === "needs_migration") setFailure("not-available");
      else setFailure("error");
    });

  return (
    <div
      className="flex flex-col gap-1.5 rounded-md border border-state-success/25 bg-state-success/5 px-2.5 py-2"
      data-testid={`interest-ack-${workerId}`}
      data-interest-status={status}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-meta uppercase tracking-label text-state-success">
          {labels.statusLabels[status] ?? status}
        </span>
        {status !== "reviewed" && status !== "contacted" ? (
          <button
            type="button"
            onClick={markReviewed}
            disabled={pending}
            className="min-h-11 rounded-md border border-ink-500 px-3 py-1.5 text-meta text-text-primary hover:border-brand-blue disabled:opacity-50"
            data-testid="interest-ack-reviewed"
          >
            {labels.markReviewed}
          </button>
        ) : null}
        {/* The contact affordance stays available even at status=contacted —
            it REOPENS the same deduped thread (never a duplicate). */}
        <button
          type="button"
          onClick={contact}
          disabled={pending}
          className="inline-flex min-h-11 items-center gap-1 rounded-md border border-brand-blue/40 px-3 py-1.5 text-meta text-brand-blue hover:border-brand-blue disabled:opacity-50"
          data-testid="interest-ack-contacted"
        >
          <MessageSquare className="h-3 w-3" /> {labels.markContacted}
        </button>
        {failure === "error" ? (
          <span role="alert" className="text-meta text-state-warning">
            {labels.error}
          </span>
        ) : null}
        {failure === "not-available" ? (
          <span className="text-meta text-text-muted">{labels.notAvailable}</span>
        ) : null}
      </div>
      {/* Honest scope line — in-app thread only, no external send. */}
      <p className="text-meta leading-relaxed text-text-muted">{labels.internalNote}</p>
    </div>
  );
}
