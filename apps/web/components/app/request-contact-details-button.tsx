"use client";

import { useState, useTransition } from "react";

import { requestContactDisclosureAction } from "@/lib/privacy/contact-disclosure-actions";
import type { ContactDisclosureStatus } from "@/lib/privacy/contact-disclosure-shared";

/**
 * Company "request contact details" on a scouting candidate (Wagon 1, shared
 * contact/consent contract).
 *
 * Sends only the safe requestId + workerId; the worker's identity/contact
 * never reaches this component. The ask covers ONLY the data-minimised
 * default field set (name, phone, email) and the WORKER alone answers on
 * their privacy screen — in TWO separate decisions: accepting the ask, and
 * separately granting the disclosure. Honest states only:
 *   - a live/answered ask renders as a plain status line (no dead button);
 *   - `accepted` without the separate grant says so explicitly — acceptance
 *     alone never means contact data;
 *   - the draft-gated data model being unapplied renders the "prepared, not
 *     enabled" note;
 *   - a granted disclosure shows the granted state — never contact data
 *     (disclosure execution stays server-enforced elsewhere).
 */
export function RequestContactDetailsButton({
  locale,
  requestId,
  workerId,
  currentStatus,
  disclosureGranted,
  modelApplied,
  labels,
}: {
  locale: string;
  requestId: string;
  workerId: string;
  /** The newest ask status for this (demand, worker), if any. */
  currentStatus: ContactDisclosureStatus | null;
  /** The SEPARATE consent-ledger grant state (live-verified server-side). */
  disclosureGranted: boolean;
  /** False while the draft migration is not applied — show the honest note. */
  modelApplied: boolean;
  labels: {
    button: string;
    sending: string;
    pending: string;
    accepted: string;
    granted: string;
    declined: string;
    expired: string;
    unavailable: string;
    rateLimited: string;
    noOrganization: string;
    fieldsNote: string;
    error: string;
  };
}) {
  const [pending, startTransition] = useTransition();
  const [state, setState] = useState<
    "idle" | "sent" | "rate_limited" | "no_organization" | "unavailable" | "error"
  >("idle");

  if (!modelApplied) {
    return (
      <p
        className="text-[11px] text-text-muted"
        data-testid={`contact-request-unavailable-${workerId}`}
      >
        {labels.unavailable}
      </p>
    );
  }

  const effectiveStatus: ContactDisclosureStatus | null =
    state === "sent" ? "created" : currentStatus;

  // A live or positively-answered ask → status line, never a second button
  // for the same ask (declined / withdrawn / expired may be re-asked below).
  if (effectiveStatus === "created") {
    return (
      <p
        className="text-[11px] text-text-secondary"
        data-testid={`contact-request-status-${workerId}`}
        data-status="created"
      >
        {labels.pending}
      </p>
    );
  }
  if (effectiveStatus === "accepted") {
    return (
      <p
        className={`text-[11px] font-medium ${
          disclosureGranted ? "text-state-success" : "text-text-secondary"
        }`}
        data-testid={`contact-request-status-${workerId}`}
        data-status="accepted"
        data-disclosure-granted={disclosureGranted ? "true" : "false"}
      >
        {disclosureGranted ? labels.granted : labels.accepted}
      </p>
    );
  }

  function send() {
    startTransition(async () => {
      const res = await requestContactDisclosureAction({
        locale,
        requestId,
        workerId,
      });
      if (res.kind === "ok" || res.kind === "already-accepted") setState("sent");
      else if (res.kind === "rate-limited") setState("rate_limited");
      else if (res.kind === "no-organization") setState("no_organization");
      else if (res.kind === "needs-migration") setState("unavailable");
      else setState("error");
    });
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={send}
          disabled={pending}
          data-testid={`contact-request-open-${workerId}`}
          className="w-fit rounded-md border border-brand-blue/40 px-2.5 py-1 text-[11px] font-medium text-brand-blue transition-colors hover:bg-brand-blue/10 disabled:opacity-60"
        >
          {pending ? labels.sending : labels.button}
        </button>
        {effectiveStatus === "declined" ? (
          <span className="text-[11px] text-text-muted" data-status="declined">
            {labels.declined}
          </span>
        ) : null}
        {effectiveStatus === "expired" ? (
          <span className="text-[11px] text-text-muted" data-status="expired">
            {labels.expired}
          </span>
        ) : null}
      </div>
      {/* What the ask covers — stated before sending, no hidden scope. */}
      <p className="text-[10px] leading-relaxed text-text-muted">
        {labels.fieldsNote}
      </p>
      {state === "rate_limited" ? (
        <p className="text-[11px] text-state-warning" data-testid={`contact-request-limit-${workerId}`}>
          {labels.rateLimited}
        </p>
      ) : null}
      {state === "no_organization" ? (
        <p className="text-[11px] text-state-warning">{labels.noOrganization}</p>
      ) : null}
      {state === "unavailable" ? (
        <p className="text-[11px] text-text-muted">{labels.unavailable}</p>
      ) : null}
      {state === "error" ? (
        <p className="text-[11px] text-state-danger">{labels.error}</p>
      ) : null}
    </div>
  );
}
