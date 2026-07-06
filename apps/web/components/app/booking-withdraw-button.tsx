"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { withdrawBookingAction } from "@/lib/booking/booking-actions";

/**
 * Company-side withdraw for an OUTGOING proposed booking (booking lifecycle
 * v1). The withdraw RPC existed since Stage 6 but had no UI — a company that
 * proposed to the wrong worker or dates had no way out except waiting. Only
 * the proposer can withdraw and only from `proposed` (RPC-enforced); the
 * button renders only on those rows.
 */
export function BookingWithdrawButton({
  locale,
  bookingId,
  labels,
}: {
  locale: string;
  bookingId: string;
  labels: {
    withdraw: string;
    withdrawn: string;
    error: string;
    unavailable: string;
  };
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [state, setState] = useState<
    "idle" | "done" | "unavailable" | "error"
  >("idle");

  if (state === "done") {
    return (
      <span
        className="text-[11px] font-medium text-text-muted"
        data-testid="booking-withdrawn"
      >
        {labels.withdrawn}
      </span>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const res = await withdrawBookingAction({ locale, bookingId });
            if (res.kind === "ok") {
              setState("done");
              router.refresh();
            } else if (res.kind === "needs-migration") {
              setState("unavailable");
            } else {
              setState("error");
            }
          })
        }
        data-testid="booking-withdraw"
        className="inline-flex min-h-11 items-center rounded-md border border-ink-500 px-3 text-xs font-medium text-text-secondary hover:bg-ink-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue disabled:opacity-50"
      >
        {labels.withdraw}
      </button>
      {state === "unavailable" ? (
        <span className="text-[11px] text-text-muted">{labels.unavailable}</span>
      ) : state === "error" ? (
        <span className="text-[11px] text-state-danger">{labels.error}</span>
      ) : null}
    </div>
  );
}
