"use client";

import { useState, useTransition } from "react";
import {
  confirmAccountDeletion,
  startDeletionReauth,
} from "@/lib/privacy/deletion-confirm-actions";

/**
 * Step two of account deletion: the holder confirms the open request. The
 * database accepts it only after a sign-in in the last 15 minutes; otherwise
 * the person signs in again and lands back here. After the confirmation the
 * system erases the account by itself and e-mails the result — no one has to
 * act by hand. Honest states only: nothing claims "deleted" here.
 */
export function PrivacyDeletionConfirm({
  locale,
  labels,
}: {
  locale: string;
  labels: {
    body: string;
    confirm: string;
    reauthBody: string;
    reauth: string;
    confirmed: string;
    confirmedBody: string;
    error: string;
  };
}) {
  const [pending, startTransition] = useTransition();
  const [state, setState] = useState<"idle" | "reauth" | "confirmed" | "error">("idle");

  if (state === "confirmed") {
    return (
      <div
        role="status"
        data-testid="privacy-deletion-confirmed"
        className="rounded-md border border-state-success/40 bg-state-success/5 p-3 text-sm text-text-primary"
      >
        <p className="font-medium">{labels.confirmed}</p>
        <p className="mt-1 text-xs text-text-secondary">{labels.confirmedBody}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3" data-testid="privacy-deletion-confirm-step">
      <p className="text-sm leading-relaxed text-text-primary">
        {state === "reauth" ? labels.reauthBody : labels.body}
      </p>
      {state === "reauth" ? (
        <button
          type="button"
          disabled={pending}
          data-testid="privacy-deletion-reauth"
          onClick={() =>
            startTransition(async () => {
              const { href } = await startDeletionReauth(locale);
              window.location.assign(href);
            })
          }
          className="inline-flex min-h-11 w-fit items-center rounded-md border border-brand-blue/50 px-4 text-sm font-medium text-brand-blue hover:bg-brand-blue/10 disabled:opacity-50"
        >
          {labels.reauth}
        </button>
      ) : (
        <button
          type="button"
          disabled={pending}
          data-testid="privacy-deletion-confirm-final"
          onClick={() =>
            startTransition(async () => {
              const res = await confirmAccountDeletion();
              if (res.kind === "confirmed") setState("confirmed");
              else if (res.kind === "reauth-required") setState("reauth");
              else setState("error");
            })
          }
          className="inline-flex min-h-11 w-fit items-center rounded-md border border-state-warning/50 px-4 text-sm font-medium text-state-warning hover:bg-state-warning/10 disabled:opacity-50"
        >
          {labels.confirm}
        </button>
      )}
      {state === "error" && (
        <p role="alert" className="text-xs text-state-warning">
          {labels.error}
        </p>
      )}
    </div>
  );
}
