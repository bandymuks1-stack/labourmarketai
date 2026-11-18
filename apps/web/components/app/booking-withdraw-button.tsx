"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { withdrawBookingAction } from "@/lib/booking/booking-actions";
import { WITHDRAW_REASON_KINDS, REASON_NOTE_MAX } from "@/lib/booking/booking-state";

/**
 * Company-side withdraw for an OUTGOING proposed booking (booking lifecycle
 * v1). The withdraw RPC existed since Stage 6 but had no UI — a company that
 * proposed to the wrong worker or dates had no way out except waiting. Only
 * the proposer can withdraw and only from `proposed` (RPC-enforced); the
 * button renders only on those rows.
 *
 * Reason capture (P2-PR6): withdrawing opens an OPTIONAL reason step — a
 * closed select (lifecycle-v2 vocabulary) plus a bounded note. Choosing
 * nothing keeps the plain v1 withdraw. When a reason IS chosen but the v2
 * function is not installed yet, the withdraw still lands via v1 and the UI
 * says honestly that the reason was not saved.
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
  const t = useTranslations("bookings");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [formOpen, setFormOpen] = useState(false);
  const [reasonKind, setReasonKind] = useState("");
  const [reasonNote, setReasonNote] = useState("");
  const [state, setState] = useState<
    | { kind: "idle" }
    | { kind: "done"; reasonStored?: boolean }
    | { kind: "unavailable" }
    | { kind: "error" }
  >({ kind: "idle" });

  function withdraw() {
    startTransition(async () => {
      const res = await withdrawBookingAction({ locale, bookingId, reasonKind, reasonNote });
      if (res.kind === "ok") {
        setState({ kind: "done", reasonStored: res.reasonStored });
        router.refresh();
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
          className="text-meta font-medium text-text-muted"
          data-testid="booking-withdrawn"
        >
          {labels.withdrawn}
        </span>
        {state.reasonStored === false ? (
          // Honest partial: the withdrawal landed, the reason could not be
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
      <Button
        type="button"
        disabled={pending}
        onClick={() => setFormOpen((v) => !v)}
        data-testid="booking-withdraw"
        variant="secondary"
        size="sm"
        className="min-h-11 w-full sm:w-auto"
      >
        {labels.withdraw}
      </Button>
      {formOpen ? (
        <div
          className="flex w-full flex-col gap-2 rounded-md border border-ink-500 bg-ink-800/60 p-2.5"
          data-testid="booking-withdraw-form"
        >
          <label className="flex flex-col gap-1 text-meta text-text-muted">
            {t("reason.optionalTitle")}
            <Select
              value={reasonKind}
              onChange={(e) => setReasonKind(e.target.value)}
              data-testid="booking-withdraw-reason"
              className="max-sm:text-base"
            >
              <option value="">{t("reason.none")}</option>
              {WITHDRAW_REASON_KINDS.map((kind) => (
                <option key={kind} value={kind}>
                  {t(`reason.withdraw.${kind}`)}
                </option>
              ))}
            </Select>
          </label>
          <label className="flex flex-col gap-1 text-meta text-text-muted">
            {t("reason.noteLabel")}
            <Input
              type="text"
              maxLength={REASON_NOTE_MAX}
              value={reasonNote}
              onChange={(e) => setReasonNote(e.target.value)}
              className="max-sm:text-base"
            />
          </label>
          <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center">
            <Button
              type="button"
              disabled={pending}
              onClick={withdraw}
              data-testid="booking-withdraw-confirm"
              variant="secondary"
              size="sm"
              className="min-h-11 w-full sm:w-auto"
            >
              {t("reason.confirmWithdraw")}
            </Button>
            <Button
              type="button"
              onClick={() => setFormOpen(false)}
              variant="ghost"
              size="sm"
              className="min-h-11"
            >
              {t("reason.cancel")}
            </Button>
          </div>
        </div>
      ) : null}
      {state.kind === "unavailable" ? (
        <span className="text-meta text-text-muted">{labels.unavailable}</span>
      ) : state.kind === "error" ? (
        <span className="text-meta text-state-danger">{labels.error}</span>
      ) : null}
    </div>
  );
}
