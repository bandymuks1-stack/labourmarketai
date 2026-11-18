"use client";

import { useActionState, useState } from "react";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Notice } from "@/components/ui/Notice";
import {
  unlinkRosterPersonAction,
  type RosterUnlinkResult,
} from "@/lib/organization-evidence/history-claim-actions";

/**
 * REVERSAL BY THE ORGANIZATION. A link made to the wrong person is taken
 * back, with a reason, which goes on the audit trail.
 *
 * Nothing is deleted: the roster row, every record the organization supplied
 * and every earlier audit row stay exactly as they are. What ends is one
 * person's access to them. Two steps: the first press asks for the reason.
 */
export function RosterUnlinkForm({
  personId,
  labels,
}: {
  personId: string;
  labels: {
    readonly open: string;
    readonly reasonLabel: string;
    readonly reasonPlaceholder: string;
    readonly confirm: string;
    readonly cancel: string;
    readonly done: string;
    readonly note: string;
    readonly errors: Readonly<Record<string, string>>;
  };
}) {
  const [state, submit, pending] = useActionState<RosterUnlinkResult | null, FormData>(
    unlinkRosterPersonAction,
    null,
  );
  const [asking, setAsking] = useState(false);

  if (state?.ok) {
    return (
      <p role="status" className="text-xs text-state-success" data-testid={`roster-unlink-done-${personId}`}>
        {labels.done}
      </p>
    );
  }

  if (!asking) {
    return (
      <div className="flex flex-col gap-1">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="self-start"
          onClick={() => setAsking(true)}
          data-testid={`roster-unlink-open-${personId}`}
        >
          {labels.open}
        </Button>
        {state && !state.ok ? (
          <Notice tone="warning" testId={`roster-unlink-error-${personId}`}>
            {labels.errors[state.code] ?? labels.errors.error}
          </Notice>
        ) : null}
      </div>
    );
  }

  return (
    <form action={submit} className="flex flex-col gap-1.5">
      <input type="hidden" name="person_id" value={personId} />
      <label className="flex min-w-0 flex-col gap-1">
        <span className="font-mono text-xs uppercase tracking-label text-text-muted">{labels.reasonLabel}</span>
        <Input
          name="reason"
          required
          maxLength={500}
          placeholder={labels.reasonPlaceholder}
          className="min-w-0 sm:w-auto sm:min-w-80"
          data-testid={`roster-unlink-reason-${personId}`}
        />
      </label>
      <p className="text-meta leading-relaxed text-text-muted">{labels.note}</p>
      <div className="flex flex-wrap gap-2">
        <Button
          type="submit"
          variant="secondary"
          size="sm"
          loading={pending}
          disabled={pending}
          aria-busy={pending}
          data-testid={`roster-unlink-confirm-${personId}`}
        >
          {labels.confirm}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setAsking(false)}>
          {labels.cancel}
        </Button>
      </div>
      <div role="status" aria-live="polite">
        {state && !state.ok ? (
          <Notice tone="warning" testId={`roster-unlink-error-${personId}`}>
            {labels.errors[state.code] ?? labels.errors.error}
          </Notice>
        ) : null}
      </div>
    </form>
  );
}
