"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

import {
  inviteRosterPersonToClaimAction,
  type RosterClaimInviteResult,
} from "@/lib/organization-evidence/roster-link-actions";

/**
 * "Invite this person to claim their history" — the first step for a roster
 * name that has no account. It sends the ordinary organisation invitation; it
 * links nothing. Once the person has joined, the manager OFFERS the link (the
 * control beside it) and the person decides on their own profile.
 */
export function RosterClaimInviteForm({
  personId,
  locale,
  labels,
}: {
  personId: string;
  locale: string;
  labels: {
    readonly label: string;
    readonly placeholder: string;
    readonly invite: string;
    readonly sent: string;
    readonly created: string;
    readonly deliveryFailed: string;
    readonly hint: string;
    readonly errors: Readonly<Record<string, string>>;
  };
}) {
  const [state, submit, pending] = useActionState<RosterClaimInviteResult | null, FormData>(
    inviteRosterPersonToClaimAction,
    null,
  );
  if (state?.ok) {
    return (
      <div
        role="status"
        className="flex flex-col gap-1 text-xs text-state-success"
        data-testid={`roster-claim-invited-${personId}`}
        data-outcome={state.outcome}
      >
        <span>
          {state.outcome === "sent"
            ? labels.sent
            : state.outcome === "created"
              ? labels.created
              : labels.deliveryFailed}
        </span>
        {state.inviteLink ? (
          <Input
            readOnly
            value={state.inviteLink}
            aria-label={labels.created}
            onFocus={(e) => e.currentTarget.select()}
            className="w-full max-w-md font-mono max-sm:min-h-11"
            data-testid={`roster-claim-link-${personId}`}
          />
        ) : null}
      </div>
    );
  }
  return (
    <form
      action={submit}
      className="flex flex-col gap-1"
      data-testid={`roster-claim-invite-${personId}`}
    >
      <input type="hidden" name="person_id" value={personId} />
      <input type="hidden" name="locale" value={locale} />
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 text-xs text-text-secondary">
          <span className="sr-only">{labels.label}</span>
          <Input
            type="email"
            name="email"
            required
            autoComplete="off"
            placeholder={labels.placeholder}
            className="w-56 max-sm:min-h-11 max-sm:text-base"
            data-testid={`roster-claim-email-${personId}`}
          />
        </label>
        <Button
          type="submit"
          variant="secondary"
          size="sm"
          disabled={pending}
          aria-busy={pending}
          className="min-h-11"
        >
          {pending ? "…" : labels.invite}
        </Button>
      </div>
      <span className="text-meta text-text-muted">{labels.hint}</span>
      {state && !state.ok ? (
        <span
          role="alert"
          className="font-mono text-meta text-state-danger"
          data-testid={`roster-claim-error-${personId}`}
          data-code={state.code}
        >
          {labels.errors[state.code] ?? labels.errors.generic}
        </span>
      ) : null}
    </form>
  );
}
