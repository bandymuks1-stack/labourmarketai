"use client";

import { useState, useTransition } from "react";
import { Check, Send } from "lucide-react";
import { requestServiceOffering } from "@/lib/marketplace/service-requests";
import { trackFunnel } from "@/lib/telemetry/task";
import { FUNNEL_EVENTS } from "@/lib/telemetry/funnel-events";

/**
 * REQUEST THIS SERVICE — from the page where the visitor is actually looking
 * at the person who offers it.
 *
 * Owner readiness window, 2026-09-09, Priority 4. The person page listed a
 * person's active service offerings as plain text with no way to act on any
 * of them: real data, no next action. §Priority 4's rule cuts both ways —
 * no dead buttons, and no decorative lists either.
 *
 * A SECOND ENTRY POINT, NOT A SECOND LOOP. This calls the SAME
 * `requestServiceOffering` server action the marketplace surface calls, which
 * goes through the SAME `request_service_offering` SECURITY DEFINER RPC
 * (verified live in production 2026-09-09: the function exists and
 * `authenticated` has execute). No new table, no new RPC, no second request
 * model, and no copy of its own — every label comes from the existing
 * `marketplace` namespace the service-requests page already uses.
 *
 * HONEST RESULTS ONLY, and each one says something DIFFERENT, because
 * "already open", "no longer active", "not enabled here yet" and "it broke"
 * need four different responses from the person reading them:
 *   ok              → the row is written; the button becomes a state, not a
 *                     button that could be pressed again
 *   duplicate       → an open request already exists (the one-open-request
 *                     partial unique index)
 *   inactive        → the provider deactivated the offering; a permanent no
 *   needs-migration → the loop is not enabled; a calm "not available yet"
 *   not-authed      → cannot happen on this page (it redirects to login), but
 *                     it is handled rather than swallowed
 *
 * NO SELF-REQUEST GUARD IS NEEDED HERE: the person page redirects a viewer
 * looking at their own row to `/dashboard/profile` before this renders.
 */

export type PersonServiceRequestLabels = {
  /** "Request" — the action. */
  readonly request: string;
  /** "Requested" — the terminal state after a successful write. */
  readonly requested: string;
  readonly duplicate: string;
  readonly offeringInactive: string;
  readonly notAvailable: string;
  readonly errorGeneric: string;
};

type State = "idle" | "sent" | "duplicate" | "inactive" | "unavailable" | "error";

export function PersonServiceRequestButton({
  offeringId,
  labels,
}: {
  offeringId: string;
  labels: PersonServiceRequestLabels;
}) {
  const [state, setState] = useState<State>("idle");
  const [pending, startTransition] = useTransition();

  function send() {
    trackFunnel(FUNNEL_EVENTS.serviceRequestStarted, { surface: "person_page" });
    startTransition(async () => {
      const res = await requestServiceOffering(offeringId);
      trackFunnel(FUNNEL_EVENTS.serviceRequestSent, {
        surface: "person_page",
        success: res.kind === "ok",
      });
      if (res.kind === "ok") setState("sent");
      else if (res.kind === "duplicate") setState("duplicate");
      else if (res.kind === "inactive") setState("inactive");
      else if (res.kind === "needs-migration") setState("unavailable");
      else setState("error");
    });
  }

  if (state === "sent") {
    return (
      <span
        data-testid="person-service-requested"
        className="inline-flex shrink-0 items-center gap-1 rounded-md border border-state-success/40 px-2 py-1 text-xs text-state-success"
      >
        <Check className="h-3 w-3" aria-hidden /> {labels.requested}
      </span>
    );
  }

  const message =
    state === "duplicate"
      ? labels.duplicate
      : state === "inactive"
        ? labels.offeringInactive
        : state === "unavailable"
          ? labels.notAvailable
          : state === "error"
            ? labels.errorGeneric
            : null;

  // A permanent no (the offering is gone, or the loop is not enabled) leaves
  // no button: offering the action again would be a dead button.
  const retryable = state === "idle" || state === "error";

  return (
    <div className="flex shrink-0 flex-col items-end gap-1">
      {retryable ? (
        <button
          type="button"
          disabled={pending}
          onClick={send}
          data-testid="person-service-request"
          className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border border-brand-cyan/40 bg-brand-cyan/10 px-3 py-1.5 text-xs font-semibold text-brand-cyan hover:opacity-90 disabled:opacity-50"
        >
          <Send className="h-3 w-3" aria-hidden /> {labels.request}
        </button>
      ) : null}
      {message ? (
        <p
          className="max-w-[16rem] text-right text-xs leading-relaxed text-text-muted"
          data-testid="person-service-request-msg"
          role="status"
        >
          {message}
        </p>
      ) : null}
    </div>
  );
}
