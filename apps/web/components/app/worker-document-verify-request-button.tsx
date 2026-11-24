"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { requestWorkerDocumentVerificationAction } from "@/lib/documents/document-actions";

/**
 * Worker-side "send for verification" — the first link of the document
 * approval chain. Renders only for rows `canRequestVerification` admits
 * (stored `ready` + verification `unverified`/`rejected`); the RPC
 * re-checks ownership and the ready gate server-side. On success the row
 * moves to `pending` and appears in the admin review queue.
 */
export function WorkerDocumentVerifyRequestButton({
  locale,
  documentId,
  labels,
}: {
  locale: string;
  documentId: string;
  labels: { submit: string; sent: string; notReady: string; unavailable: string; error: string };
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [state, setState] = useState<
    "idle" | "sent" | "not_ready" | "unavailable" | "error"
  >("idle");

  function submit() {
    startTransition(async () => {
      const res = await requestWorkerDocumentVerificationAction({
        locale,
        documentId,
      });
      if (res.ok) {
        setState("sent");
        router.refresh();
      } else if (res.code === "needs_migration") setState("unavailable");
      else if (res.code === "not_ready") setState("not_ready");
      else setState("error");
    });
  }

  if (state === "sent") {
    return (
      <span
        className="text-meta text-text-muted"
        data-testid="doc-verify-request-sent"
      >
        {labels.sent}
      </span>
    );
  }

  return (
    <span className="flex items-center gap-1.5">
      <button
        type="button"
        disabled={pending}
        onClick={submit}
        className="rounded-md border border-brand-blue/50 px-2 py-0.5 text-meta text-brand-blue hover:bg-brand-blue/10 disabled:opacity-50"
        data-testid="doc-verify-request-button"
      >
        {labels.submit}
      </button>
      {state === "not_ready" ? (
        <span className="text-meta text-text-muted">{labels.notReady}</span>
      ) : state === "unavailable" ? (
        <span className="text-meta text-text-muted">{labels.unavailable}</span>
      ) : state === "error" ? (
        <span className="text-meta text-state-danger">{labels.error}</span>
      ) : null}
    </span>
  );
}
