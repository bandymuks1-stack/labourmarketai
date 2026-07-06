"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { respondBookingAction } from "@/lib/booking/booking-actions";

/**
 * Worker accept/decline for a proposed booking (Stage 6). The worker is the
 * ONLY actor who can accept — the company can never self-accept. An overlapping
 * accepted booking is blocked server-side and surfaced here honestly.
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
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [state, setState] = useState<
    | { kind: "idle" }
    | { kind: "done"; status: "accepted" | "declined" }
    | { kind: "conflict" }
    | { kind: "unavailable" }
    | { kind: "error" }
  >({ kind: "idle" });

  function respond(decision: "accepted" | "declined") {
    startTransition(async () => {
      const res = await respondBookingAction({ locale, bookingId, decision });
      if (res.kind === "ok") {
        setState({ kind: "done", status: decision });
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
      <span
        className={`text-[11px] font-medium ${state.status === "accepted" ? "text-state-success" : "text-text-muted"}`}
        data-testid="booking-responded"
      >
        {state.status === "accepted" ? labels.accepted : labels.declined}
      </span>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-2">
        {/* min-h-11 = 44px touch targets (audit PR8): accept/decline are
            decision-critical buttons and were ~24px tall on mobile. */}
        <button
          type="button"
          disabled={pending}
          onClick={() => respond("accepted")}
          className="inline-flex min-h-11 items-center rounded-md border border-state-success/50 px-3 text-xs font-medium text-state-success hover:bg-state-success/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue disabled:opacity-50"
        >
          {labels.accept}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => respond("declined")}
          className="inline-flex min-h-11 items-center rounded-md border border-ink-500 px-3 text-xs font-medium text-text-secondary hover:bg-ink-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue disabled:opacity-50"
        >
          {labels.decline}
        </button>
      </div>
      {state.kind === "conflict" ? (
        <span className="text-[11px] text-state-warning">{labels.conflict}</span>
      ) : state.kind === "unavailable" ? (
        <span className="text-[11px] text-text-muted">{labels.unavailable}</span>
      ) : state.kind === "error" ? (
        <span className="text-[11px] text-state-danger">{labels.error}</span>
      ) : null}
    </div>
  );
}
