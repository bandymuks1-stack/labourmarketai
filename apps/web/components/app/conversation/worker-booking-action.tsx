"use client";

import { useState, useTransition } from "react";
import { useRouter } from "@/lib/i18n/navigation";
import { prepareConfirmationAction, dispatchWorkerAction } from "@/lib/conversation/dispatch";
import { trackFunnel } from "@/lib/telemetry/task";
import { FUNNEL_EVENTS } from "@/lib/telemetry/funnel-events";

export type BookingActionLabels = {
  offerFrom: string; // "Offer from {name}"
  period: string; // "{start} — {end}"
  accept: string;
  decline: string;
  confirmAcceptTitle: string;
  confirmAcceptBody: string;
  confirmDeclineTitle: string;
  confirmCta: string;
  cancelCta: string;
  working: string;
  acceptedResult: string;
  declinedResult: string;
  errorGeneric: string;
  errorStale: string;
  errorConflict: string;
};

type Phase =
  | { kind: "idle" }
  | { kind: "confirm"; decision: "accepted" | "declined"; token: string }
  | { kind: "done"; status: "accepted" | "declined" }
  | { kind: "error"; message: string };

/**
 * Conversation-first booking accept/decline (Phase B). A STRONG-tier action:
 * the worker sees an offer summary, then a strong confirmation card, then the
 * action runs ONLY through the server dispatcher with a fresh one-time
 * confirmation token. The result card shows the REAL server outcome — never a
 * fabricated success (§7). Accept creates the engagement/assignment (#857).
 */
export function WorkerBookingAction({
  bookingId,
  locale,
  title,
  subtitle,
  labels,
}: {
  bookingId: string;
  locale: string;
  title: string; // offer heading (company/role)
  subtitle: string | null; // period line
  labels: BookingActionLabels;
}) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [pending, start] = useTransition();

  function beginConfirm(decision: "accepted" | "declined") {
    setPhase({ kind: "idle" });
    start(async () => {
      const prep = await prepareConfirmationAction("worker.respond-booking", {
        bookingId,
        decision,
      });
      if (!prep.ok) {
        setPhase({ kind: "error", message: labels.errorGeneric });
        return;
      }
      setPhase({ kind: "confirm", decision, token: prep.token });
    });
  }

  function confirm() {
    if (phase.kind !== "confirm") return;
    const { decision, token } = phase;
    start(async () => {
      const res = await dispatchWorkerAction(
        "worker.respond-booking",
        { bookingId, decision },
        { locale, confirmationToken: token },
      );
      if (res.ok) {
        trackFunnel(
          decision === "accepted" ? FUNNEL_EVENTS.bookingAccepted : FUNNEL_EVENTS.bookingDeclined,
          { surface: "conversation", role_context: "worker", success: true },
        );
        setPhase({ kind: "done", status: decision });
        router.refresh();
      } else {
        const message =
          res.code === "stale_confirmation"
            ? labels.errorStale
            : res.code === "conflict"
              ? labels.errorConflict
              : labels.errorGeneric;
        setPhase({ kind: "error", message });
      }
    });
  }

  if (phase.kind === "done") {
    return (
      <div
        className="rounded-lg border border-state-success/40 bg-state-success/5 px-4 py-3 text-sm font-semibold text-state-success"
        data-testid="conversation-booking-done"
      >
        {phase.status === "accepted" ? labels.acceptedResult : labels.declinedResult}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-ink-600 bg-surface-1/40 px-4 py-3">
      <div className="flex flex-col gap-0.5">
        <span className="text-sm font-semibold text-text-primary">{title}</span>
        {subtitle && (
          <span className="font-mono text-[11px] uppercase tracking-label text-text-muted">
            {subtitle}
          </span>
        )}
      </div>

      {phase.kind === "confirm" ? (
        <div
          className="flex flex-col gap-3 rounded-md border border-state-warning/40 bg-state-warning/5 p-3"
          data-testid="conversation-booking-confirm"
        >
          <p className="text-sm font-semibold text-text-primary">
            {phase.decision === "accepted"
              ? labels.confirmAcceptTitle
              : labels.confirmDeclineTitle}
          </p>
          {phase.decision === "accepted" && (
            <p className="text-xs leading-relaxed text-text-secondary">
              {labels.confirmAcceptBody}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={pending}
              onClick={confirm}
              data-testid="conversation-booking-confirm-cta"
              className="inline-flex min-h-11 items-center justify-center rounded-md border border-brand-blue/50 bg-brand-blue/10 px-4 text-xs font-semibold text-brand-blue hover:bg-brand-blue/20 disabled:opacity-50"
            >
              {pending ? labels.working : labels.confirmCta}
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => setPhase({ kind: "idle" })}
              className="inline-flex min-h-11 items-center justify-center rounded-md border border-ink-500 px-4 text-xs font-medium text-text-secondary hover:bg-ink-700 disabled:opacity-50"
            >
              {labels.cancelCta}
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={pending}
            onClick={() => beginConfirm("accepted")}
            data-testid="conversation-booking-accept"
            className="inline-flex min-h-11 flex-1 items-center justify-center rounded-md border border-state-success/50 bg-state-success/10 px-3 text-xs font-semibold text-state-success hover:bg-state-success/20 disabled:opacity-50 sm:flex-none"
          >
            {labels.accept}
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => beginConfirm("declined")}
            data-testid="conversation-booking-decline"
            className="inline-flex min-h-11 flex-1 items-center justify-center rounded-md border border-ink-500 px-3 text-xs font-medium text-text-secondary hover:bg-ink-700 disabled:opacity-50 sm:flex-none"
          >
            {labels.decline}
          </button>
        </div>
      )}

      {phase.kind === "error" && (
        <p role="alert" className="text-xs text-state-danger" data-testid="conversation-booking-error">
          {phase.message}
        </p>
      )}
    </div>
  );
}
