"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setDocumentVerificationAction } from "@/lib/admin/document-verification-actions";

/**
 * Admin verify / reject for a pending worker document (Stage 9). The only path
 * to a verified state — backed by the audited admin RPC. No fake verification.
 */
export function AdminDocVerifyButtons({
  locale,
  documentId,
  labels,
}: {
  locale: string;
  documentId: string;
  labels: { verify: string; reject: string; done: string; unavailable: string; error: string };
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [state, setState] = useState<"idle" | "done" | "unavailable" | "error">("idle");

  function act(decision: "verified" | "rejected") {
    startTransition(async () => {
      const res = await setDocumentVerificationAction({ locale, documentId, decision });
      if (res.kind === "ok") {
        setState("done");
        router.refresh();
      } else if (res.kind === "needs-migration") setState("unavailable");
      else setState("error");
    });
  }

  if (state === "done") {
    return <span className="text-meta text-text-muted">{labels.done}</span>;
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() => act("verified")}
          className="rounded-md border border-state-success/50 px-2 py-0.5 text-meta text-state-success hover:bg-state-success/10 disabled:opacity-50"
        >
          {labels.verify}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => act("rejected")}
          className="rounded-md border border-state-danger/50 px-2 py-0.5 text-meta text-state-danger hover:bg-state-danger/10 disabled:opacity-50"
        >
          {labels.reject}
        </button>
      </div>
      {state === "unavailable" ? (
        <span className="text-meta text-text-muted">{labels.unavailable}</span>
      ) : state === "error" ? (
        <span className="text-meta text-state-danger">{labels.error}</span>
      ) : null}
    </div>
  );
}
