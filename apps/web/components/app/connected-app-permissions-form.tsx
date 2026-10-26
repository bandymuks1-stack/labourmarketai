"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";

import { OauthScopeCheckboxes, type ScopeOption } from "@/components/app/oauth-scope-checkboxes";
import { changeConnectedAppPermissions } from "@/lib/auth/connected-apps-actions";
import type { ProductScope } from "@/lib/mcp/scopes";

/**
 * "Change permissions" for one connected app (B3). The first press opens the
 * same per-permission chooser as the consent screen, pre-ticked with the
 * person's CURRENT choice (nothing ticked for a connection from before B3);
 * Save submits the server action, which records the new choice. It applies to
 * the app's next call, with no reconnect.
 *
 * While the server action runs the Save button is disabled and a
 * role="status" line says so (form-submit-feedback contract).
 */
function SaveButton({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <>
      <button
        type="submit"
        disabled={pending}
        aria-busy={pending}
        className="rounded-md bg-brand-blue px-3 py-1.5 text-xs font-medium text-text-on-brand hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
        data-testid="connected-app-permissions-save"
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

export function ConnectedAppPermissionsForm({
  clientId,
  name,
  locale,
  options,
  current,
  labels,
}: {
  clientId: string;
  name: string;
  locale: string;
  options: readonly ScopeOption[];
  current: readonly ProductScope[];
  labels: {
    change: string;
    legend: string;
    hint: string;
    save: string;
    pending: string;
    cancel: string;
  };
}) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-md border border-ink-500 px-3 py-1.5 text-xs font-medium text-text-primary hover:border-brand-blue/60"
        data-testid="connected-app-change-permissions"
        aria-label={`${labels.change}: ${name}`}
      >
        {labels.change}
      </button>
    );
  }

  return (
    <form
      action={changeConnectedAppPermissions}
      className="flex flex-col gap-3 rounded-md border border-ink-500 p-3"
      aria-label={`${labels.change}: ${name}`}
      data-testid="connected-app-permissions-form"
    >
      <input type="hidden" name="client_id" value={clientId} />
      <input type="hidden" name="locale" value={locale} />
      <OauthScopeCheckboxes
        legend={labels.legend}
        hint={labels.hint}
        options={options}
        checked={current}
        idPrefix={`perm-${clientId.slice(0, 8)}`}
      />
      <div className="flex gap-2">
        <SaveButton label={labels.save} pendingLabel={labels.pending} />
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-md border border-ink-500 px-3 py-1.5 text-xs font-medium text-text-primary hover:bg-ink-500/10"
        >
          {labels.cancel}
        </button>
      </div>
    </form>
  );
}
