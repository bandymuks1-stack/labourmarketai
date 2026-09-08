"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";

import { revokeConnectedApp } from "@/lib/auth/connected-apps-actions";

/**
 * Two-step disconnect for one connected app (Train A slice 2). The first
 * press only opens an inline confirmation naming the client; the second
 * submits the server action. No `window.confirm` (unstyled, not localisable,
 * blocked by some in-app browsers) and no destructive one-click.
 *
 * While the server action runs the confirm button is disabled and a
 * role="status" line says so (form-submit-feedback contract) — the person
 * never presses twice or wonders whether anything happened.
 */
function ConfirmSubmit({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <>
      <button
        type="submit"
        disabled={pending}
        aria-busy={pending}
        className="rounded-md bg-state-danger px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
        data-testid="connected-app-confirm-yes"
      >
        {pending ? pendingLabel : label}
      </button>
      {pending && (
        <span role="status" className="sr-only">
          {pendingLabel}
        </span>
      )}
    </>
  );
}

export function ConnectedAppRevokeButton({
  clientId,
  name,
  locale,
  labels,
}: {
  clientId: string;
  name: string;
  locale: string;
  labels: {
    disconnect: string;
    confirmTitle: string;
    confirmBody: string;
    confirmYes: string;
    pending: string;
    cancel: string;
  };
}) {
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="rounded-md border border-ink-500 px-3 py-1.5 text-xs font-medium text-text-primary hover:border-state-danger/60 hover:text-state-danger"
        data-testid="connected-app-disconnect"
        aria-label={`${labels.disconnect}: ${name}`}
      >
        {labels.disconnect}
      </button>
    );
  }

  return (
    <form
      action={revokeConnectedApp}
      className="flex flex-col gap-2 rounded-md border border-state-danger/40 bg-state-danger/5 p-3"
      role="group"
      aria-label={labels.confirmTitle}
      data-testid="connected-app-confirm"
    >
      <input type="hidden" name="client_id" value={clientId} />
      <input type="hidden" name="locale" value={locale} />
      <p className="text-sm font-medium text-text-primary">{labels.confirmTitle}</p>
      <p className="text-xs leading-relaxed text-text-secondary">{labels.confirmBody}</p>
      <div className="flex gap-2">
        <ConfirmSubmit label={labels.confirmYes} pendingLabel={labels.pending} />
        <button
          type="button"
          onClick={() => setConfirming(false)}
          className="rounded-md border border-ink-500 px-3 py-1.5 text-xs font-medium text-text-primary hover:bg-ink-500/10"
        >
          {labels.cancel}
        </button>
      </div>
    </form>
  );
}
