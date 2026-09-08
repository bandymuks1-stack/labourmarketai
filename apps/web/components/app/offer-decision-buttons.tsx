"use client";

import { useActionState } from "react";
import { Check, X } from "lucide-react";

import {
  respondCandidateOfferAction,
  type BridgeActionState,
} from "@/lib/agency/bridge-actions";

/**
 * Client decision on an agency candidate offer (agency first value, 2026-09-03).
 * Two forms, one server action, every rule server-side (client owns the demand,
 * offer still open). `accepted` proposes the canonical booking to the worker —
 * the worker still decides; `declined` closes the offer. Honest states: until
 * migration 20260903101000 is applied the action answers `needs-migration` and
 * this renders the calm "not available yet" line instead of a broken button.
 */
export type OfferDecisionLabels = {
  readonly accept: string;
  readonly decline: string;
  readonly accepted: string;
  readonly declined: string;
  readonly notReady: string;
  readonly forbidden: string;
  readonly closed: string;
  readonly error: string;
};

const IDLE: BridgeActionState = { status: "idle" };

export function OfferDecisionButtons({
  offerId,
  labels,
}: {
  readonly offerId: string;
  readonly labels: OfferDecisionLabels;
}) {
  const [acceptState, acceptAction, acceptPending] = useActionState(respondCandidateOfferAction, IDLE);
  const [declineState, declineAction, declinePending] = useActionState(respondCandidateOfferAction, IDLE);
  const state = acceptState.status !== "idle" ? acceptState : declineState;
  const pending = acceptPending || declinePending;

  if (state.status === "ok") {
    return (
      <p className="text-xs text-text-secondary" data-testid="offer-decision-done">
        {acceptState.status === "ok" ? labels.accepted : labels.declined}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-1.5" data-testid={`offer-decision-${offerId}`}>
      <div className="flex flex-wrap gap-2">
        <form action={acceptAction}>
          <input type="hidden" name="offerId" value={offerId} readOnly />
          <input type="hidden" name="decision" value="accepted" readOnly />
          <button
            type="submit"
            disabled={pending}
            className="inline-flex items-center gap-1.5 rounded-md bg-gradient-to-r from-brand-blue to-brand-cyan px-3 py-1.5 text-xs font-semibold text-ink-900 transition-opacity hover:opacity-90 disabled:opacity-60"
            data-testid={`offer-accept-${offerId}`}
          >
            <Check className="h-3.5 w-3.5" aria-hidden /> {labels.accept}
          </button>
        </form>
        <form action={declineAction}>
          <input type="hidden" name="offerId" value={offerId} readOnly />
          <input type="hidden" name="decision" value="declined" readOnly />
          <button
            type="submit"
            disabled={pending}
            className="inline-flex items-center gap-1.5 rounded-md border border-ink-500 px-3 py-1.5 text-xs font-semibold text-text-secondary transition-colors hover:border-text-muted disabled:opacity-60"
            data-testid={`offer-decline-${offerId}`}
          >
            <X className="h-3.5 w-3.5" aria-hidden /> {labels.decline}
          </button>
        </form>
      </div>
      {state.status === "needs-migration" ? (
        <p className="text-xs text-text-muted" data-testid="offer-decision-not-ready">{labels.notReady}</p>
      ) : state.status === "forbidden" ? (
        <p className="text-xs text-state-danger" role="alert">{labels.forbidden}</p>
      ) : state.status === "not-found" ? (
        <p className="text-xs text-text-muted">{labels.closed}</p>
      ) : state.status === "error" || state.status === "invalid" ? (
        <p className="text-xs text-state-danger" role="alert">{labels.error}</p>
      ) : null}
    </div>
  );
}
