"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { respondBookingAction } from "@/lib/booking/booking-actions";
import { DECLINE_REASON_KINDS, REASON_NOTE_MAX } from "@/lib/booking/booking-state";
import { trackFunnel } from "@/lib/telemetry/task";
import { FUNNEL_EVENTS } from "@/lib/telemetry/funnel-events";

/**
 * Worker accept/decline for a proposed booking (Stage 6). The worker is the
 * ONLY actor who can accept — the company can never self-accept. An overlapping
 * accepted booking is blocked server-side and surfaced here honestly.
 *
 * Reason capture (P2-PR6): declining opens an OPTIONAL reason step — a closed
 * select (lifecycle-v2 vocabulary) plus a bounded note. Choosing nothing keeps
 * today's one-tap decline (v1 path, zero regression). When a reason IS chosen
 * but the v2 function is not installed yet, the decline still lands via v1 and
 * the UI says honestly that the reason was not saved (`reasonStored: false`).
 */
export function BookingRespondButtons({
  locale,
  bookingId,
  labels,
}: {
  locale: string;
  bookingId: string;
  labels: {
    accept: string;
    decline: string;
    accepted: string;
    declined: string;
    conflict: string;
    error: string;
    unavailable: string;
  };
}) {
  const t = useTranslations("bookings");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [declineOpen, setDeclineOpen] = useState(false);
  const [reasonKind, setReasonKind] = useState("");
  const [reasonNote, setReasonNote] = useState("");
  const [state, setState] = useState<
    | { kind: "idle" }
    | { kind: "done"; status: "accepted" | "declined"; reasonStored?: boolean }
    | { kind: "conflict" }
    | { kind: "unavailable" }
    | { kind: "error" }
  >({ kind: "idle" });

  function respond(decision: "accepted" | "declined") {
    startTransition(async () => {
      const res = await respondBookingAction({
        locale,
        bookingId,
        decision,
        reasonKind: decision === "declined" ? reasonKind : null,
        reasonNote: decision === "declined" ? reasonNote : null,
      });
      if (res.kind === "ok") {
        // Funnel: the worker acted on an offer. Fire-and-forget, bounded
        // scalars only (no booking id, no counterparty) — Worker Launch
        // Readiness v1. Does not alter the accept/decline flow (#857).
        trackFunnel(
          decision === "accepted"
            ? FUNNEL_EVENTS.bookingAccepted
            : FUNNEL_EVENTS.bookingDeclined,
          { surface: "booking", success: true },
        );
        setState({ kind: "done", status: decision, reasonStored: res.reasonStored });
        router.refresh();
      } else if (res.kind === "conflict") {
        setState({ kind: "conflict" });
      } else if (res.kind === "needs-migration") {
        setState({ kind: "unavailable" });
      } else {
        setState({ kind: "error" });
      }
    });
  }

  if (state.kind === "done") {
    return (
      <div className="flex flex-col gap-1">
        <span
          className={`text-meta font-medium ${state.status === "accepted" ? "text-state-success" : "text-text-muted"}`}
          data-testid="booking-responded"
        >
          {state.status === "accepted" ? labels.accepted : labels.declined}
        </span>
        {state.reasonStored === false ? (
          // Honest partial: the ANSWER landed, the reason could not be
          // stored yet (v2 not installed) — one calm sentence, no jargon.
          <span className="text-meta text-text-muted" data-testid="booking-reason-not-stored">
            {t("reason.notStored")}
          </span>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex w-full flex-col gap-1.5 sm:w-auto">
      <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center">
        {/* min-h-11 = 44px touch targets (audit PR8); w-full on phones so the
            decision buttons are unmissable one-thumb targets (P2-PR6). Accept
            is the visually PRIMARY action of an incoming proposed row. */}
        <button
          type="button"
          disabled={pending}
          onClick={() => respond("accepted")}
          className="inline-flex min-h-11 w-full items-center justify-center rounded-md border border-state-success/50 bg-state-success/10 px-3 text-xs font-semibold text-state-success hover:bg-state-success/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue disabled:opacity-50 sm:w-auto"
        >
          {labels.accept}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => setDeclineOpen((v) => !v)}
          data-testid="booking-decline-open"
          className="inline-flex min-h-11 w-full items-center justify-center rounded-md border border-ink-500 px-3 text-xs font-medium text-text-secondary hover:bg-ink-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue disabled:opacity-50 sm:w-auto"
        >
          {labels.decline}
        </button>
      </div>
      {declineOpen ? (
        <div
          className="flex w-full flex-col gap-2 rounded-md border border-ink-500 bg-ink-800/60 p-2.5"
          data-testid="booking-decline-form"
        >
          <label className="flex flex-col gap-1 text-meta text-text-muted">
            {t("reason.optionalTitle")}
            <select
              value={reasonKind}
              onChange={(e) => setReasonKind(e.target.value)}
              data-testid="booking-decline-reason"
              className="min-h-11 rounded-md border border-ink-500 bg-ink-900 px-2 py-1 text-xs text-text-primary"
            >
              <option value="">{t("reason.none")}</option>
              {DECLINE_REASON_KINDS.map((kind) => (
                <option key={kind} value={kind}>
                  {t(`reason.decline.${kind}`)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-meta text-text-muted">
            {t("reason.noteLabel")}
            <input
              type="text"
              maxLength={REASON_NOTE_MAX}
              value={reasonNote}
              onChange={(e) => setReasonNote(e.target.value)}
              className="min-h-11 rounded-md border border-ink-500 bg-ink-900 px-2 py-1 text-xs text-text-primary"
            />
          </label>
          <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center">
            <button
              type="button"
              disabled={pending}
              onClick={() => respond("declined")}
              data-testid="booking-decline-confirm"
              className="inline-flex min-h-11 w-full items-center justify-center rounded-md border border-ink-500 px-3 text-xs font-medium text-text-secondary hover:bg-ink-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue disabled:opacity-50 sm:w-auto"
            >
              {t("reason.confirmDecline")}
            </button>
            <button
              type="button"
              onClick={() => setDeclineOpen(false)}
              className="min-h-11 text-meta text-text-muted hover:text-text-secondary sm:min-h-0"
            >
              {t("reason.cancel")}
            </button>
          </div>
        </div>
      ) : null}
      {state.kind === "conflict" ? (
        <span className="text-meta text-state-warning">{labels.conflict}</span>
      ) : state.kind === "unavailable" ? (
        <span className="text-meta text-text-muted">{labels.unavailable}</span>
      ) : state.kind === "error" ? (
        <span className="text-meta text-state-danger">{labels.error}</span>
      ) : null}
    </div>
  );
}
