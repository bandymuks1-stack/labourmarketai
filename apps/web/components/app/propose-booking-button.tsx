"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { proposeBookingAction } from "@/lib/booking/booking-actions";

/**
 * Company "propose booking" for a shortlisted, contactable candidate (Stage 6).
 * Sends only the safe requestId + workerId + a start date/note; the worker's
 * identity/contact never reaches the client. The worker alone accepts later.
 * Honest states only; degrades to "unavailable" until the migration is applied.
 *
 * Mode clarity (PR 5, contract §4): this surface is explicitly the
 * request_booking / propose_dates mode — a booking PROPOSAL with dates that
 * the worker confirms or declines. The dialog says so before submit, and
 * after submit it says what happens next (worker decides; answer lands in
 * Bookings; withdrawable until answered). Data contract unchanged — the new
 * copy comes from the shared `bookings.propose` namespace, not new props.
 *
 * Repeat actions (Capability G, PR 6b): `variant="rebook"` renders the SAME
 * flow pre-scoped to the same request + worker from a terminal
 * (declined/withdrawn) outgoing booking. The applied propose RPC upserts on
 * (owner_id, request_id, worker_id) and re-opens that row back to `proposed`
 * with the new dates — no new RPC, no new data path. The mode note states
 * clearly that it re-opens the same proposal and the worker decides again.
 */
export function ProposeBookingButton({
  locale,
  requestId,
  workerId,
  countryCode,
  labels,
  variant = "propose",
}: {
  locale: string;
  requestId: string;
  workerId: string;
  countryCode: string | null;
  variant?: "propose" | "rebook";
  labels: {
    open: string;
    startDate: string;
    note: string;
    send: string;
    sending: string;
    sent: string;
    unavailable: string;
    notEntitled: string;
    error: string;
    cancel: string;
  };
}) {
  const tPropose = useTranslations("bookings.propose");
  const [open, setOpen] = useState(false);
  const [startDate, setStartDate] = useState("");
  const [note, setNote] = useState("");
  const [pending, startTransition] = useTransition();
  const [state, setState] = useState<
    "idle" | "sent" | "unavailable" | "not_entitled" | "rate_limited" | "error"
  >("idle");

  function send() {
    startTransition(async () => {
      const res = await proposeBookingAction({
        locale,
        requestId,
        workerId,
        startDate,
        locationCountry: countryCode,
        note,
      });
      if (res.kind === "ok") setState("sent");
      else if (res.kind === "needs-migration") setState("unavailable");
      else if (res.kind === "not-entitled") setState("not_entitled");
      else if (res.kind === "rate-limited") setState("rate_limited");
      else setState("error");
    });
  }

  if (state === "sent") {
    return (
      <div className="flex flex-col gap-1" data-testid="propose-booking-sent">
        <span className="text-[11px] font-medium text-state-success">{labels.sent}</span>
        {/* What happens next: the worker decides; the answer lands under
            Bookings; the proposal stays withdrawable until answered. */}
        <span className="text-[11px] text-text-muted">{tPropose("afterSent")}</span>
      </div>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-md border border-brand-blue/40 px-2.5 py-1 text-[11px] font-medium text-brand-blue hover:bg-brand-blue/10"
        data-testid={variant === "rebook" ? "propose-again-open" : "propose-booking-open"}
      >
        {labels.open}
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-md border border-ink-500 bg-ink-800/60 p-2.5" data-testid="propose-booking-form">
      {/* Mode: request_booking / propose_dates — a proposal, never a booking
          until the WORKER accepts. Stated up front, honestly. The rebook
          variant says instead that this RE-OPENS the same proposal with new
          dates and the worker decides again. */}
      <p className="text-[11px] text-text-secondary" data-testid="propose-booking-mode-note">
        {variant === "rebook" ? tPropose("againModeNote") : tPropose("modeNote")}
      </p>
      <label className="flex flex-col gap-1 text-[11px] text-text-muted">
        {labels.startDate}
        <input
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          className="rounded-md border border-ink-500 bg-ink-900 px-2 py-1 text-xs text-text-primary"
        />
      </label>
      <label className="flex flex-col gap-1 text-[11px] text-text-muted">
        {labels.note}
        <input
          type="text"
          maxLength={2000}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className="rounded-md border border-ink-500 bg-ink-900 px-2 py-1 text-xs text-text-primary"
        />
      </label>
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={send}
          className="rounded-md border border-brand-blue/50 px-2.5 py-1 text-[11px] font-medium text-brand-blue hover:bg-brand-blue/10 disabled:opacity-50"
        >
          {pending ? labels.sending : labels.send}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-[11px] text-text-muted hover:text-text-secondary"
        >
          {labels.cancel}
        </button>
      </div>
      {state === "unavailable" ? (
        <span className="text-[11px] text-text-muted">{labels.unavailable}</span>
      ) : state === "not_entitled" ? (
        <span className="text-[11px] text-state-amber">{labels.notEntitled}</span>
      ) : state === "rate_limited" ? (
        // Bounded request budget reached (Wagon 1) — honest limit note.
        <span className="text-[11px] text-state-warning" data-testid="propose-booking-limit">
          {tPropose("rateLimited")}
        </span>
      ) : state === "error" ? (
        <span className="text-[11px] text-state-danger">{labels.error}</span>
      ) : null}
    </div>
  );
}
