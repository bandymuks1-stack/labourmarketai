"use client";

import { useState, useTransition } from "react";
import { useRouter } from "@/lib/i18n/navigation";
import { prepareConfirmationAction, dispatchWorkerAction } from "@/lib/conversation/dispatch";
import type { InvitationRef } from "@/lib/invitations/model";
import { ChatAction, ChatActionRow } from "@/components/app/conversation/chat/chat-action";

/**
 * ACCEPT AN INVITATION FROM THE CHAT — the same shape as the booking decision
 * (owner contract §4D: the person acts directly from the attention item).
 * Accepting creates a REAL relationship (an engagement: student / employee /
 * …, or the company / agency roster link), so it is the strong tier:
 * prepare → the exact consequence shown → explicit confirm → the ONE
 * dispatcher → `worker.respond-invitation` → the SAME accept the visual page
 * calls (`acceptInvitationByIdAction` → `accept_invitation_by_id_v1`, or the
 * dashboard card's accept → `accept_{company,agency}_worker_invitation`;
 * authority in SQL: the caller's verified e-mail must be the invited one).
 * There is no in-app decline in the canonical layer (decline exists by
 * mailed token only), so none is invented here: "later" simply leaves the
 * invitation where it is (the network page / dashboard card show it too).
 */
export interface InvitationActionLabels {
  readonly accept: string;
  readonly later: string;
  readonly confirmTitle: string;
  readonly confirmNote: string;
  readonly confirm: string;
  readonly cancel: string;
  readonly working: string;
  readonly done: string;
  readonly alreadyAnswered: string;
  readonly errorStale: string;
  readonly errorGeneric: string;
}

type Phase =
  | { kind: "idle" }
  | { kind: "confirm"; token: string }
  | { kind: "done"; outcome: string }
  | { kind: "later" }
  | { kind: "error"; message: string };

/** Outcomes that mean "this invitation is no longer open" rather than a failure. */
const ANSWERED_CODES = new Set([
  "already_accepted",
  "already_linked",
  "declined",
  "revoked",
  "expired",
  "not_found",
  "no_invitation",
]);

export function WorkerInvitationAction({
  invitationRef,
  locale,
  title,
  subtitle,
  labels,
}: {
  invitationRef: InvitationRef;
  locale: string;
  /** Who invites and as what — e.g. "E2E Walker UAB · mokinys". */
  title: string;
  /** The inviter's own words, when any. */
  subtitle: string | null;
  labels: InvitationActionLabels;
}) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [pending, start] = useTransition();
  // The structured action + context the backbone receives (§1a): the shared
  // ref plus the one decision the canonical layer offers.
  const input = { ...invitationRef, decision: "accepted" as const };

  function beginConfirm() {
    start(async () => {
      const prep = await prepareConfirmationAction("worker.respond-invitation", input);
      if (!prep.ok) {
        setPhase({ kind: "error", message: labels.errorGeneric });
        return;
      }
      setPhase({ kind: "confirm", token: prep.token });
    });
  }

  function confirm() {
    if (phase.kind !== "confirm") return;
    const { token } = phase;
    start(async () => {
      const res = await dispatchWorkerAction("worker.respond-invitation", input, { locale, confirmationToken: token });
      if (res.ok) {
        setPhase({ kind: "done", outcome: "accepted" });
        router.refresh();
      } else if (res.code === "stale_confirmation") {
        setPhase({ kind: "error", message: labels.errorStale });
      } else if (ANSWERED_CODES.has(res.code)) {
        // A real, final state of the row — not a failure of ours.
        setPhase({ kind: "done", outcome: res.code });
        router.refresh();
      } else {
        setPhase({ kind: "error", message: labels.errorGeneric });
      }
    });
  }

  if (phase.kind === "done") {
    const ok = phase.outcome === "accepted";
    return (
      <div
        className={`rounded-card border px-4 py-3 text-support font-semibold ${ok ? "border-state-success/40 bg-state-success/5 text-state-success" : "border-state-warning/40 bg-state-warning/5 text-state-warning"}`}
        data-testid="conversation-invitation-done"
        data-outcome={phase.outcome}
      >
        {ok ? labels.done : labels.alreadyAnswered}
      </div>
    );
  }

  if (phase.kind === "later") return null;

  return (
    <div className="flex max-w-xl flex-col gap-2 rounded-card border border-ink-500 bg-ink-800/40 p-3" data-testid="conversation-invitation-action">
      <p className="text-basis font-semibold text-text-primary">{title}</p>
      {subtitle ? <p className="text-support text-text-secondary">{subtitle}</p> : null}
      {phase.kind === "confirm" ? (
        <div className="flex flex-col gap-2 rounded-md border border-state-amber/40 bg-state-amber/5 p-2.5">
          <p className="font-mono text-meta uppercase tracking-label text-text-muted">{labels.confirmTitle}</p>
          <p className="text-support text-text-primary">{labels.confirmNote}</p>
          <ChatActionRow>
            <ChatAction tone="primary" onClick={confirm} disabled={pending} testId="conversation-invitation-confirm">
              {pending ? labels.working : labels.confirm}
            </ChatAction>
            <ChatAction onClick={() => setPhase({ kind: "idle" })} disabled={pending} testId="conversation-invitation-cancel">
              {labels.cancel}
            </ChatAction>
          </ChatActionRow>
        </div>
      ) : (
        <ChatActionRow>
          <ChatAction tone="primary" onClick={beginConfirm} disabled={pending} testId="conversation-invitation-accept">
            {pending ? labels.working : labels.accept}
          </ChatAction>
          <ChatAction onClick={() => setPhase({ kind: "later" })} disabled={pending} testId="conversation-invitation-later">
            {labels.later}
          </ChatAction>
        </ChatActionRow>
      )}
      {phase.kind === "error" ? (
        <p className="text-support text-state-danger" data-testid="conversation-invitation-error">
          {phase.message}
        </p>
      ) : null}
    </div>
  );
}
