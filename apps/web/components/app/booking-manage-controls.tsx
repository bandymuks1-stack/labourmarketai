"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  rescheduleBookingAction,
  setBookingDeadlineAction,
} from "@/lib/booking/booking-actions";

/**
 * Owner-side lifecycle controls for an OPEN outgoing proposal (P2-PR6):
 * "Change dates" (reschedule_booking_proposal_v1) and "Respond-by date"
 * (set_booking_response_deadline_v1). Mounted ONLY under
 * canRescheduleProposal(row.status) — i.e. `proposed` rows — an ACCEPTED
 * booking is never mutated in place, so accepted rows never see these
 * controls. Both RPCs are owner-gated (lifecycle v2, not applied yet):
 * until then each action degrades honestly — the row is untouched and one
 * calm sentence says the dates / deadline were not changed. Never a fake
 * success, never an error wall.
 */
export function BookingManageControls({
  locale,
  bookingId,
  startDate,
  expectedEndDate,
  responseDeadlineDate,
}: {
  locale: string;
  bookingId: string;
  startDate: string | null;
  expectedEndDate: string | null;
  responseDeadlineDate: string | null;
}) {
  const t = useTranslations("bookings");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [panel, setPanel] = useState<"none" | "dates" | "deadline">("none");
  const [start, setStart] = useState(startDate ?? "");
  const [end, setEnd] = useState(expectedEndDate ?? "");
  const [note, setNote] = useState("");
  const [deadline, setDeadline] = useState(responseDeadlineDate ?? "");
  const [notice, setNotice] = useState<
    | "idle"
    | "dates-saved"
    | "dates-unchanged"
    | "deadline-saved"
    | "deadline-unsaved"
    | "error"
  >("idle");

  function saveDates() {
    startTransition(async () => {
      const res = await rescheduleBookingAction({
        locale,
        bookingId,
        startDate: start,
        endDate: end || null,
        note: note || null,
      });
      if (res.kind === "ok") {
        setNotice("dates-saved");
        setPanel("none");
        router.refresh();
      } else if (res.kind === "needs-migration") {
        // Honest degradation: nothing changed on the row.
        setNotice("dates-unchanged");
        setPanel("none");
      } else {
        setNotice("error");
      }
    });
  }

  function saveDeadline() {
    startTransition(async () => {
      const res = await setBookingDeadlineAction({ locale, bookingId, deadline });
      if (res.kind === "ok") {
        setNotice("deadline-saved");
        setPanel("none");
        router.refresh();
      } else if (res.kind === "needs-migration") {
        setNotice("deadline-unsaved");
        setPanel("none");
      } else {
        setNotice("error");
      }
    });
  }

  const inputCls =
    "min-h-11 rounded-md border border-ink-500 bg-ink-900 px-2 py-1 text-xs text-text-primary";
  const buttonCls =
    "inline-flex min-h-11 w-full items-center justify-center rounded-md border border-ink-500 px-3 text-xs font-medium text-text-secondary hover:bg-ink-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue disabled:opacity-50 sm:w-auto";

  return (
    <div className="flex w-full flex-col gap-1.5" data-testid="booking-manage-controls">
      <div className="flex w-full flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <button
          type="button"
          disabled={pending}
          onClick={() => setPanel(panel === "dates" ? "none" : "dates")}
          data-testid="booking-reschedule-open"
          className={buttonCls}
        >
          {t("reschedule.open")}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => setPanel(panel === "deadline" ? "none" : "deadline")}
          data-testid="booking-deadline-open"
          className={buttonCls}
        >
          {t("deadline.open")}
        </button>
      </div>

      {panel === "dates" ? (
        <div
          className="flex w-full flex-col gap-2 rounded-md border border-ink-500 bg-ink-800/60 p-2.5"
          data-testid="booking-reschedule-form"
        >
          <label className="flex flex-col gap-1 text-[11px] text-text-muted">
            {t("reschedule.startDate")}
            <input
              type="date"
              value={start}
              onChange={(e) => setStart(e.target.value)}
              className={inputCls}
            />
          </label>
          <label className="flex flex-col gap-1 text-[11px] text-text-muted">
            {t("reschedule.endDate")}
            <input
              type="date"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
              className={inputCls}
            />
          </label>
          <label className="flex flex-col gap-1 text-[11px] text-text-muted">
            {t("reschedule.note")}
            <input
              type="text"
              maxLength={500}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className={inputCls}
            />
          </label>
          <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center">
            <button
              type="button"
              disabled={pending || !start}
              onClick={saveDates}
              data-testid="booking-reschedule-save"
              className={buttonCls}
            >
              {t("reschedule.save")}
            </button>
            <button
              type="button"
              onClick={() => setPanel("none")}
              className="min-h-11 text-[11px] text-text-muted hover:text-text-secondary sm:min-h-0"
            >
              {t("reschedule.cancel")}
            </button>
          </div>
        </div>
      ) : null}

      {panel === "deadline" ? (
        <div
          className="flex w-full flex-col gap-2 rounded-md border border-ink-500 bg-ink-800/60 p-2.5"
          data-testid="booking-deadline-form"
        >
          <label className="flex flex-col gap-1 text-[11px] text-text-muted">
            {t("deadline.label")}
            <input
              type="date"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
              className={inputCls}
            />
          </label>
          <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center">
            <button
              type="button"
              disabled={pending || !deadline}
              onClick={saveDeadline}
              data-testid="booking-deadline-save"
              className={buttonCls}
            >
              {t("deadline.save")}
            </button>
            <button
              type="button"
              onClick={() => setPanel("none")}
              className="min-h-11 text-[11px] text-text-muted hover:text-text-secondary sm:min-h-0"
            >
              {t("deadline.cancel")}
            </button>
          </div>
        </div>
      ) : null}

      {notice === "dates-saved" ? (
        <span className="text-[11px] text-state-success">{t("reschedule.saved")}</span>
      ) : notice === "dates-unchanged" ? (
        <span className="text-[11px] text-text-muted" data-testid="booking-reschedule-unchanged">
          {t("reschedule.notChanged")}
        </span>
      ) : notice === "deadline-saved" ? (
        <span className="text-[11px] text-state-success">{t("deadline.saved")}</span>
      ) : notice === "deadline-unsaved" ? (
        <span className="text-[11px] text-text-muted" data-testid="booking-deadline-unsaved">
          {t("deadline.notSet")}
        </span>
      ) : notice === "error" ? (
        <span className="text-[11px] text-state-danger">{t("actions.error")}</span>
      ) : null}
    </div>
  );
}
