"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { requestWorkerConversationAction } from "@/lib/communication/request-worker-conversation";

/**
 * Step 4A — "Request to communicate" on a scouting candidate. Sends only the
 * (safe) requestId + workerId; the worker's profile/identity is resolved
 * server-side and never reaches this component. Honest states only: opening,
 * opened (waiting for the worker's reply — NOT an acceptance), or an error
 * reason. No contact is ever shown. Renders nothing actionable unless the
 * worker is contactable (the parent passes canContact, the server re-checks).
 */
export function RequestCommunicationButton({
  locale,
  requestId,
  workerId,
  labels,
}: {
  locale: string;
  requestId: string;
  workerId: string;
  labels: {
    button: string;
    opening: string;
    opened: string;
    view: string;
    error: string;
    /** Honest bounded-budget note (Wagon 1) — shown when the daily
     *  conversation-request limit is reached, instead of a generic error. */
    limitReached: string;
  };
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [state, setState] = useState<
    | { kind: "idle" }
    | { kind: "opened"; conversationId: string }
    | { kind: "rate_limited" }
    | { kind: "error" }
  >({ kind: "idle" });

  function onRequest() {
    setState({ kind: "idle" });
    startTransition(async () => {
      const res = await requestWorkerConversationAction({ locale, requestId, workerId });
      if (res.ok) {
        setState({ kind: "opened", conversationId: res.conversationId });
      } else if (res.reason === "rate_limited") {
        setState({ kind: "rate_limited" });
      } else {
        setState({ kind: "error" });
      }
    });
  }

  if (state.kind === "opened") {
    return (
      <div className="flex flex-wrap items-center gap-2 text-[11px]">
        <span className="text-state-success">{labels.opened}</span>
        <button
          type="button"
          onClick={() => router.push(`/${locale}/dashboard/communication/${state.conversationId}`)}
          className="rounded-md border border-brand-blue/40 px-2.5 py-1 font-medium text-brand-blue hover:bg-brand-blue/10"
        >
          {labels.view}
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={onRequest}
        disabled={pending}
        data-testid={`request-communication-${workerId}`}
        className="w-fit rounded-md border border-brand-blue/40 px-2.5 py-1 text-xs font-medium text-brand-blue transition-colors hover:bg-brand-blue/10 disabled:opacity-60"
      >
        {pending ? labels.opening : labels.button}
      </button>
      {state.kind === "rate_limited" ? (
        <span className="text-[11px] text-state-warning" data-testid="request-communication-limit">
          {labels.limitReached}
        </span>
      ) : null}
      {state.kind === "error" ? (
        <span className="text-[11px] text-state-danger">{labels.error}</span>
      ) : null}
    </div>
  );
}
