"use client";

import { useActionState } from "react";
import { Check, X } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Choice";
import { Link } from "@/lib/i18n/navigation";
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
  /** Accepting stopped at the booking-proposal caps (10 waiting, 30 per
   *  24 h): which one, and the way to the bookings where proposals that
   *  are no longer needed can be withdrawn. */
  readonly limitOpen: string;
  readonly limitDaily: string;
  readonly limitUnknown: string;
  readonly openBookings: string;
};

/** The offering agency's placement term, as the employer must see it before
 *  accepting (migration 20261114235900). Absent when the agency states none. */
export type OfferPlacementTerm = {
  readonly id: string;
  /** "Placement fee – 300 € per successfully placed worker", already worded. */
  readonly feeLine: string;
  /** The agency's own condition, in its own words and language. */
  readonly conditionText: string;
  readonly conditionLanguage: string;
  readonly termsUrl: string | null;
};

export type OfferPlacementTermLabels = {
  readonly title: string;
  readonly conditionLabel: string;
  readonly termsLink: string;
  readonly termsPending: string;
  readonly onlyOnPlacement: string;
  readonly accept: string;
  readonly mustAccept: string;
  readonly changed: string;
};

const IDLE: BridgeActionState = { status: "idle" };

export function OfferDecisionButtons({
  offerId,
  labels,
  placementTerm,
  termLabels,
}: {
  readonly offerId: string;
  readonly labels: OfferDecisionLabels;
  readonly placementTerm?: OfferPlacementTerm | null;
  readonly termLabels?: OfferPlacementTermLabels;
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
        <form action={acceptAction} className="flex flex-col gap-2">
          <input type="hidden" name="offerId" value={offerId} readOnly />
          <input type="hidden" name="decision" value="accepted" readOnly />
          {placementTerm && termLabels ? (
            <div
              className="flex max-w-prose flex-col gap-1.5 rounded-md border border-ink-500 bg-ink-800/40 p-3"
              data-testid={`offer-placement-term-${offerId}`}
            >
              <p className="font-mono text-meta uppercase tracking-label text-text-muted">{termLabels.title}</p>
              <p className="text-sm font-semibold text-text-primary" data-testid={`offer-placement-fee-${offerId}`}>
                {placementTerm.feeLine}
              </p>
              <p className="text-xs text-text-secondary">
                <span className="text-text-muted">{termLabels.conditionLabel} </span>
                <span lang={placementTerm.conditionLanguage} data-testid={`offer-placement-condition-${offerId}`}>
                  {placementTerm.conditionText}
                </span>
              </p>
              <p className="text-xs text-text-muted">{termLabels.onlyOnPlacement}</p>
              {placementTerm.termsUrl ? (
                <a
                  href={placementTerm.termsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-fit text-xs text-brand-blue underline-offset-2 hover:underline"
                  data-testid={`offer-placement-terms-link-${offerId}`}
                >
                  {termLabels.termsLink}
                </a>
              ) : (
                <p className="text-xs text-text-muted" data-testid={`offer-placement-terms-pending-${offerId}`}>
                  {termLabels.termsPending}
                </p>
              )}
              <input type="hidden" name="acceptedTermId" value={placementTerm.id} readOnly />
              <Checkbox
                name="termsAccepted"
                value="yes"
                required
                label={termLabels.accept}
                className="text-xs"
                data-testid={`offer-placement-accept-${offerId}`}
              />
            </div>
          ) : null}
          <Button
            type="submit"
            variant="primary"
            size="sm"
            disabled={pending}
            className="min-h-11"
            data-testid={`offer-accept-${offerId}`}
          >
            <Check className="h-3.5 w-3.5" aria-hidden /> {labels.accept}
          </Button>
        </form>
        <form action={declineAction}>
          <input type="hidden" name="offerId" value={offerId} readOnly />
          <input type="hidden" name="decision" value="declined" readOnly />
          <Button
            type="submit"
            variant="secondary"
            size="sm"
            disabled={pending}
            className="min-h-11"
            data-testid={`offer-decline-${offerId}`}
          >
            <X className="h-3.5 w-3.5" aria-hidden /> {labels.decline}
          </Button>
        </form>
      </div>
      {state.status === "needs-migration" ? (
        <p className="text-xs text-text-muted" data-testid="offer-decision-not-ready">{labels.notReady}</p>
      ) : state.status === "forbidden" ? (
        <p className="text-xs text-state-danger" role="alert">{labels.forbidden}</p>
      ) : state.status === "not-found" ? (
        <p className="text-xs text-text-muted">{labels.closed}</p>
      ) : state.status === "error" && state.reason === "placement_term_not_accepted" && termLabels ? (
        <p className="text-xs text-state-danger" role="alert" data-testid={`offer-placement-refused-${offerId}`}>
          {placementTerm ? termLabels.mustAccept : termLabels.changed}
        </p>
      ) : state.status === "proposal-limit" ? (
        <div className="flex flex-col gap-1" role="alert" data-testid="offer-decision-limit" data-limit={state.limit}>
          <p className="text-xs text-state-warning">
            {state.limit === "open" ? labels.limitOpen : state.limit === "daily" ? labels.limitDaily : labels.limitUnknown}
          </p>
          <Link
            href="/dashboard/bookings"
            className="inline-flex min-h-11 w-fit items-center text-xs font-semibold text-brand-blue hover:underline"
            data-testid="offer-decision-limit-bookings"
          >
            {labels.openBookings} →
          </Link>
        </div>
      ) : state.status === "error" || state.status === "invalid" ? (
        <p className="text-xs text-state-danger" role="alert">{labels.error}</p>
      ) : null}
    </div>
  );
}
