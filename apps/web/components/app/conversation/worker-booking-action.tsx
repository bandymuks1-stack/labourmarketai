"use client";

import { useState, useTransition } from "react";
import { useRouter } from "@/lib/i18n/navigation";
import { prepareConfirmationAction, dispatchWorkerAction } from "@/lib/conversation/dispatch";
import { trackFunnel } from "@/lib/telemetry/task";
import { FUNNEL_EVENTS } from "@/lib/telemetry/funnel-events";
import { ChatAction, ChatActionRow } from "@/components/app/conversation/chat/chat-action";

/** A worker's incoming booking offer, executed inline in the conversation.
 *  Declared beside the component that consumes it (it previously lived in the
 *  now-deleted `conversation-shell`, an orphaned second conversation surface). */
export type BookingOffer = {
  bookingId: string;
  title: string; // roleText (may be empty → generic offer label used)
  subtitle: string | null; // period line
};

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
        className="rounded-card border border-state-success/40 bg-state-success/5 px-4 py-3 text-sm font-semibold text-state-success"
        data-testid="conversation-booking-done"
      >
        {phase.status === "accepted" ? labels.acceptedResult : labels.declinedResult}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-card border border-ink-600 bg-surface-1/40 px-4 py-3">
      <div className="flex flex-col gap-0.5">
        <span className="font-display text-card-title font-semibold text-text-primary">{title}</span>
        {subtitle && (
          <span className="font-mono text-meta uppercase tracking-label text-text-muted">
            {subtitle}
          </span>
        )}
      </div>

      {phase.kind === "confirm" ? (
        <div
          className="flex flex-col gap-3 rounded-control border border-state-warning/40 bg-state-warning/5 p-3"
          data-testid="conversation-booking-confirm"
        >
          <p className="font-display text-card-title font-semibold text-text-primary">
            {phase.decision === "accepted"
              ? labels.confirmAcceptTitle
              : labels.confirmDeclineTitle}
          </p>
          {phase.decision === "accepted" && (
            <p className="text-support leading-relaxed text-text-secondary">
              {labels.confirmAcceptBody}
            </p>
          )}
          <ChatActionRow>
            <ChatAction
              tone="primary"
              loading={pending}
              testId="conversation-booking-confirm-cta"
              onClick={confirm}
            >
              {pending ? labels.working : labels.confirmCta}
            </ChatAction>
            <ChatAction tone="secondary" disabled={pending} onClick={() => setPhase({ kind: "idle" })}>
              {labels.cancelCta}
            </ChatAction>
          </ChatActionRow>
        </div>
      ) : (
        <ChatActionRow>
          {/* Accepting is the recommended path; declining is the destructive
              branch and carries the semantic danger tone — visible, but never
              dressed up as the recommendation. */}
          <ChatAction
            tone="primary"
            disabled={pending}
            testId="conversation-booking-accept"
            onClick={() => beginConfirm("accepted")}
          >
            {labels.accept}
          </ChatAction>
          <ChatAction
            tone="danger"
            disabled={pending}
            testId="conversation-booking-decline"
            onClick={() => beginConfirm("declined")}
          >
            {labels.decline}
          </ChatAction>
        </ChatActionRow>
      )}

      {phase.kind === "error" && (
        <p role="alert" className="text-support text-state-danger" data-testid="conversation-booking-error">
          {phase.message}
        </p>
      )}
    </div>
  );
}
