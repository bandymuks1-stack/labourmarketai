"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { submitPrivacyRequest } from "@/lib/privacy/actions";

/**
 * Account-deletion REQUEST form (privacy self-service v1). Two-step honest
 * friction: an explicit confirmation checkbox, then submit. Nothing is
 * deleted by this form — it files a request row a person reviews; the copy
 * says exactly that. Honest degradation: while the DRAFT intake migration
 * is not applied the action reports "not available yet" — no fake success.
 */
export function PrivacyDeletionRequest({
  labels,
}: {
  labels: {
    confirmLabel: string;
    noteLabel: string;
    submit: string;
    submitted: string;
    submittedBody: string;
    unavailable: string;
    tooManyOpen: string;
    error: string;
  };
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirmed, setConfirmed] = useState(false);
  const [note, setNote] = useState("");
  const [state, setState] = useState<
    "idle" | "done" | "unavailable" | "too-many" | "error"
  >("idle");

  if (state === "done") {
    return (
      <div
        role="status"
        data-testid="privacy-deletion-submitted"
        className="rounded-md border border-state-success/40 bg-state-success/5 p-3 text-sm text-text-primary"
      >
        <p className="font-medium">{labels.submitted}</p>
        <p className="mt-1 text-xs text-text-secondary">{labels.submittedBody}</p>
      </div>
    );
  }

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (!confirmed) return;
        startTransition(async () => {
          const res = await submitPrivacyRequest({
            type: "account_deletion",
            note,
          });
          if (res.kind === "ok") {
            setState("done");
            router.refresh();
          } else if (res.kind === "needs-migration") {
            setState("unavailable");
          } else if (res.kind === "too-many-open") {
            setState("too-many");
          } else {
            setState("error");
          }
        });
      }}
    >
      <label className="flex items-start gap-2 text-sm text-text-primary">
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(e) => setConfirmed(e.target.checked)}
          data-testid="privacy-deletion-confirm"
          className="mt-0.5 h-4 w-4 accent-brand-blue"
        />
        <span>{labels.confirmLabel}</span>
      </label>
      <label className="flex flex-col gap-1 text-xs text-text-muted">
        {labels.noteLabel}
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={500}
          rows={2}
          className="rounded-md border border-ink-500 bg-ink-800/40 p-2 text-sm text-text-primary"
        />
      </label>
      <button
        type="submit"
        disabled={pending || !confirmed}
        data-testid="privacy-deletion-submit"
        className="inline-flex min-h-11 w-fit items-center rounded-md border border-state-warning/50 px-4 text-sm font-medium text-state-warning hover:bg-state-warning/10 disabled:opacity-50"
      >
        {labels.submit}
      </button>
      {state !== "idle" && (
        <p role="alert" className="text-xs text-state-warning">
          {state === "unavailable"
            ? labels.unavailable
            : state === "too-many"
              ? labels.tooManyOpen
              : labels.error}
        </p>
      )}
    </form>
  );
}
