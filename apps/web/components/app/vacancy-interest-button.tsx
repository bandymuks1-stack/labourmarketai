"use client";

import { useState, useTransition } from "react";
import {
  expressVacancyInterestAction,
  withdrawVacancyInterestAction,
} from "@/lib/opportunities/vacancy-interest-actions";
import type { InterestStatus } from "@/lib/opportunities/interest-snapshot";
import type { VacancyHandoffOutcome } from "@/lib/opportunities/vacancy-interest";

/**
 * "I want this job" on a PUBLIC VACANCY — the first control on an external
 * ad that reaches somebody (Nonstop's commercial workflow), so it is no
 * longer the fake control the presentation contract refused.
 *
 * HONEST BY DESIGN, in words the person reads:
 *   - the action stores the person's interest and tells Nonstop Group, a
 *     workforce company, that a worker on LabourMarket.ai wants this job;
 *   - it does NOT apply, does NOT message the employer, does NOT send a CV;
 *   - whether Nonstop may PRESENT the person to this employer is a separate,
 *     unchecked-by-default question (`employer-proposition-v1`). Without
 *     that tick Nonstop may pursue the vacancy but may not name the person;
 *   - the publisher's own ad stays one click away regardless.
 *
 * What the row says AFTER the click is the server's truth for THIS worker
 * and THIS ad — `created` / `exists` ("Nonstop was informed"), `ineligible`
 * with its reason (e.g. the person is not matchable yet, the employer is
 * not identifiable), or `needs-migration` (interest stored; the handoff
 * store is not applied yet). Never "application sent".
 */
export function VacancyInterestButton({
  locale,
  vacancyId,
  initialStatus,
  initialHandoff,
  labels,
}: {
  locale: string;
  vacancyId: string;
  initialStatus: InterestStatus | null;
  /** Whether a handoff row already exists for this worker+vacancy (own
   *  RLS read), so a reload shows the same truth the click showed. */
  initialHandoff: { status: string; outreachState: string } | null;
  labels: {
    express: string;
    sent: string;
    withdraw: string;
    /** The proposition-consent question, exactly as asked. */
    consentLabel: string;
    consentHint: string;
    /** After the click: the handoff truth. */
    handoffCreated: string;
    handoffTooNew: string;
    handoffIneligible: (reason: string) => string;
    handoffPending: string;
    scopeNote: string;
    error: string;
  };
}) {
  const [status, setStatus] = useState<InterestStatus | null>(initialStatus);
  const [consent, setConsent] = useState(false);
  const [handoff, setHandoff] = useState<VacancyHandoffOutcome | null>(
    initialHandoff
      ? initialHandoff.status === "closed"
        ? null
        : { kind: "exists", outreachState: initialHandoff.outreachState }
      : null,
  );
  const [failed, setFailed] = useState(false);
  const [pending, startTransition] = useTransition();

  const active = status === "interested" || status === "reviewed" || status === "contacted";

  const onExpress = () =>
    startTransition(async () => {
      setFailed(false);
      const r = await expressVacancyInterestAction(locale, vacancyId, consent);
      if (r.kind === "ok") {
        setStatus(r.status);
        setHandoff(r.handoff);
      } else {
        setFailed(true);
      }
    });

  const onWithdraw = () =>
    startTransition(async () => {
      setFailed(false);
      const r = await withdrawVacancyInterestAction(locale, vacancyId);
      if (r.kind === "ok") {
        setStatus(r.status);
        setHandoff(null);
      } else {
        setFailed(true);
      }
    });

  const handoffLine =
    !active || !handoff
      ? null
      : handoff.kind === "created" || handoff.kind === "exists"
        ? handoff.outreachState === "ineligible_too_new"
          ? labels.handoffTooNew
          : labels.handoffCreated
        : handoff.kind === "ineligible"
          ? labels.handoffIneligible(handoff.reason)
          : labels.handoffPending;

  return (
    <div
      className="flex flex-col gap-1.5"
      data-testid={`vacancy-interest-${vacancyId}`}
      data-interest-status={status ?? "none"}
    >
      <div className="flex flex-wrap items-center gap-2">
        {active ? (
          <>
            <span
              className="rounded-md border border-state-success/40 bg-state-success/10 px-3 py-1.5 text-xs font-semibold text-state-success"
              data-testid="vacancy-interest-sent"
            >
              ✓ {labels.sent}
            </span>
            <button
              type="button"
              onClick={onWithdraw}
              disabled={pending}
              className="rounded-md border border-ink-500 px-3 py-1.5 text-xs text-text-secondary hover:border-state-warning hover:text-text-primary disabled:opacity-50"
              data-testid="vacancy-interest-withdraw"
            >
              {labels.withdraw}
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={onExpress}
            disabled={pending}
            className="rounded-md bg-brand-blue px-3 py-1.5 text-xs font-semibold text-text-on-brand hover:bg-brand-blue/80 disabled:opacity-50"
            data-testid="vacancy-interest-express"
          >
            {labels.express}
          </button>
        )}
        {failed ? (
          <span role="alert" className="text-meta text-state-warning">
            {labels.error}
          </span>
        ) : null}
      </div>
      {/* The SEPARATE consent — asked before the click, unchecked by default,
          never inferred from interest, referral or registration. */}
      {!active ? (
        <label className="flex cursor-pointer items-start gap-2 text-meta leading-relaxed text-text-secondary">
          <input
            type="checkbox"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 accent-brand-blue"
            data-testid="vacancy-interest-consent"
          />
          <span>
            {labels.consentLabel}{" "}
            <span className="text-text-muted">{labels.consentHint}</span>
          </span>
        </label>
      ) : null}
      {handoffLine ? (
        <p
          className="text-meta leading-relaxed text-text-secondary"
          data-testid="vacancy-interest-handoff"
          data-handoff-kind={handoff?.kind ?? "none"}
        >
          {handoffLine}
        </p>
      ) : null}
      {/* Honest scope line — what this does and does not do. */}
      <p className="text-meta leading-relaxed text-text-muted">{labels.scopeNote}</p>
    </div>
  );
}
