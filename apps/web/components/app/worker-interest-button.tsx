"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Link } from "@/lib/i18n/navigation";
import {
  expressInterestAction,
  withdrawInterestAction,
} from "@/lib/opportunities/interest-actions";
import { contactEmployerAction } from "@/lib/opportunities/contact-employer";
import type { InterestStatus } from "@/lib/opportunities/interest-snapshot";

/**
 * Worker express-interest control (Worker Express Interest slice).
 *
 * HONEST BY DESIGN: the action only creates an INTERNAL signal row — the
 * label says so explicitly. There is no message, no application status, no
 * contact reveal. Withdraw is always available on an active interest.
 * Rendered ONLY when the interest table exists (interestAvailable) — never a
 * dead button.
 *
 * Canonical-journey P1: an ACTIVE interest no longer dead-ends. The worker
 * can open the real in-app thread with the demand owner ("Parašyti
 * darbdaviui") — the server action re-verifies every fact (own signal, open
 * demand, verified company) and opens the canonical 0021 conversation. No
 * contact data is ever shown; the worker writes their own first message in
 * the thread.
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
    /** "contacted" is real (audit PR5): the company opened an in-app thread —
     *  this label links the worker to their messages, never a dead status. */
    contactedLink: string;
    /** Canonical-journey P1 — the worker-initiated thread open. */
    contactEmployer: string;
    contactError: string;
  };
}) {
  const router = useRouter();
  const [status, setStatus] = useState<InterestStatus | null>(initialStatus);
  const [failed, setFailed] = useState(false);
  const [contactFailed, setContactFailed] = useState(false);
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

  // Canonical-journey P1: open (or reopen) the real in-app thread with the
  // demand owner. All facts re-verified server-side; on success the worker
  // lands in the thread and writes their own words — nothing is auto-sent.
  const onContactEmployer = () =>
    startTransition(async () => {
      setContactFailed(false);
      const r = await contactEmployerAction({ locale, requestId });
      if (r.ok) {
        router.push(`/${locale}/dashboard/communication/${r.conversationId}`);
      } else {
        setContactFailed(true);
      }
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
              onClick={onContactEmployer}
              disabled={pending}
              className="rounded-md bg-brand-blue px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-blue/80 disabled:opacity-50"
              data-testid="interest-contact-employer"
            >
              {labels.contactEmployer}
            </button>
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
        {failed ? (
          <span role="alert" className="text-meta text-state-warning">
            {labels.error}
          </span>
        ) : null}
        {contactFailed ? (
          <span role="alert" className="text-meta text-state-warning">
            {labels.contactError}
          </span>
        ) : null}
      </div>
      {/* "Contacted" means a REAL in-app thread exists (opened by the gated
          contact action) — link the worker straight to it (audit PR5: status
          changes must be meaningful, never silent flags). */}
      {status === "contacted" ? (
        <Link
          href={"/dashboard/communication" as "/dashboard"}
          className="w-fit text-xs font-medium text-brand-blue hover:underline"
          data-testid="interest-contacted-link"
        >
          {labels.contactedLink} →
        </Link>
      ) : null}
      {/* Honest scope line — REQUIRED copy: internal signal only. */}
      <p className="text-meta leading-relaxed text-text-muted">{labels.internalNote}</p>
    </div>
  );
}
