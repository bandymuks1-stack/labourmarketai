"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
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
  /**
   * GDPR Art. 5(1)(a) transparency — states the identity disclosure the accept
   * itself causes, BEFORE the worker accepts. Condition C1 of
   * docs/human-gates/can-view-worker-booking-engagement-gate.md; the
   * `can_view_worker` booking-engagement branch may not be applied without it.
   */
  confirmAcceptDisclosure: string;
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
  | {
      kind: "confirm";
      decision: "accepted" | "declined";
      token: string;
      /** RED #5 — this confirmation is for an ACKNOWLEDGED overlap. The token
       *  was minted for exactly this input, so it cannot be reused for the
       *  plain accept, nor the plain accept's token for this. */
      acknowledgeClash: boolean;
    }
  | {
      kind: "done";
      status: "accepted" | "declined";
      /** How many already-accepted bookings this knowingly overlapped. */
      acknowledgedClashes?: number | null;
    }
  /** A REAL date clash. Terminal for the PLAIN accept; the person may still
   *  take one separate, explicit decision below (RED #5). */
  | { kind: "conflict" }
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
  // RED #5 — the SAME `bookings.clash.*` catalogue the bookings list uses,
  // already shipped in all 11 locales: one wording, two surfaces, nothing to
  // drift. Resolved HERE rather than threaded through `labels` because the
  // acknowledged line interpolates a COUNT the server cannot know — a label
  // baked at render time would have had to guess it, and guessing "1" would
  // misreport a two-booking overlap.
  const tClash = useTranslations("bookings.clash");
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [pending, start] = useTransition();

  function beginConfirm(
    decision: "accepted" | "declined",
    /** RED #5 — set ONLY by the explicit control in the conflict branch. */
    acknowledgeClash = false,
  ) {
    setPhase({ kind: "idle" });
    start(async () => {
      const prep = await prepareConfirmationAction("worker.respond-booking", {
        bookingId,
        decision,
        ...(acknowledgeClash ? { acknowledgeClash: true } : {}),
      });
      if (!prep.ok) {
        setPhase({ kind: "error", message: labels.errorGeneric });
        return;
      }
      setPhase({ kind: "confirm", decision, token: prep.token, acknowledgeClash });
    });
  }

  function confirm() {
    if (phase.kind !== "confirm") return;
    const { decision, token, acknowledgeClash } = phase;
    start(async () => {
      const res = await dispatchWorkerAction(
        "worker.respond-booking",
        // EXACTLY the input the token was minted for — `canonicalInputHash`
        // binds them, so any drift here is a stale-confirmation refusal.
        { bookingId, decision, ...(acknowledgeClash ? { acknowledgeClash: true } : {}) },
        { locale, confirmationToken: token },
      );
      if (res.ok) {
        trackFunnel(
          decision === "accepted" ? FUNNEL_EVENTS.bookingAccepted : FUNNEL_EVENTS.bookingDeclined,
          { surface: "conversation", role_context: "worker", success: true },
        );
        const data = res.data as { acknowledgedClashes?: number | null } | undefined;
        setPhase({
          kind: "done",
          status: decision,
          acknowledgedClashes: data?.acknowledgedClashes ?? null,
        });
        router.refresh();
      } else if (res.code === "conflict") {
        // The dates really are taken by an already-accepted booking, so the
        // plain accept/decline CTAs stop being shown — retrying them can only
        // fail identically. RED #5 adds ONE separate, explicit decision below;
        // it is never taken automatically and needs its own confirmation.
        setPhase({ kind: "conflict" });
        router.refresh();
      } else {
        const message =
          res.code === "stale_confirmation"
            ? labels.errorStale
            : labels.errorGeneric;
        setPhase({ kind: "error", message });
      }
    });
  }

  if (phase.kind === "conflict") {
    return (
      <div
        className="flex flex-col gap-2 rounded-card border border-state-warning/40 bg-state-warning/5 px-4 py-3"
        data-testid="conversation-booking-conflict-decision"
      >
        <span
          className="text-support font-semibold text-state-warning"
          role="status"
          data-testid="conversation-booking-conflict"
        >
          {labels.errorConflict}
        </span>
        {/* The consequence is stated BEFORE the control that acts on it. */}
        <span className="text-meta text-text-muted">{tClash("stillStands")}</span>
        {/* The canonical conversation control, not a hand-rolled button: it
            carries the surface's type ladder, its 44px touch target and its
            tone set. `secondary` deliberately — overriding a clash is not the
            card's primary action, and a `ux-2-0-foundation` guard counts how
            many primaries a card renders. */}
        <ChatActionRow>
          <ChatAction
            tone="secondary"
            disabled={pending}
            testId="conversation-booking-accept-anyway"
            onClick={() => beginConfirm("accepted", true)}
          >
            {tClash("acceptAnyway")}
          </ChatAction>
        </ChatActionRow>
      </div>
    );
  }

  if (phase.kind === "done") {
    return (
      <div
        className="flex flex-col gap-1 rounded-card border border-state-success/40 bg-state-success/5 px-4 py-3"
        data-testid="conversation-booking-done"
      >
        <span className="text-support font-semibold text-state-success">
          {phase.status === "accepted" ? labels.acceptedResult : labels.declinedResult}
        </span>
        {phase.acknowledgedClashes ? (
          // Says what was overridden, and says plainly it was not fixed.
          <span
            className="text-meta text-state-amber"
            data-testid="conversation-booking-clash-acknowledged"
          >
            {tClash("acknowledged", { count: phase.acknowledgedClashes })}
          </span>
        ) : null}
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
            <>
              <p className="text-support leading-relaxed text-text-secondary">
                {labels.confirmAcceptBody}
              </p>
              <p
                className="text-support leading-relaxed text-text-secondary"
                data-testid="conversation-booking-accept-disclosure"
              >
                {labels.confirmAcceptDisclosure}
              </p>
            </>
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
