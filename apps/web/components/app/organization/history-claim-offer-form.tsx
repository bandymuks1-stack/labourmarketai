"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Notice } from "@/components/ui/Notice";
import {
  createHistoryClaimAction,
  type HistoryClaimCreateResult,
} from "@/lib/organization-evidence/history-claim-actions";

/**
 * "This person no longer works here — give them their history."
 *
 * One press makes a one-time link for THIS roster row. The link is shown
 * once, because the raw token is kept nowhere: the manager hands it to the
 * person. It links nothing by itself — the person opens it, the organization
 * confirms who came, and then the person accepts on their own profile.
 */
export function HistoryClaimOfferForm({
  personId,
  locale,
  labels,
}: {
  personId: string;
  locale: string;
  labels: {
    readonly offer: string;
    readonly offering: string;
    readonly hint: string;
    readonly created: string;
    readonly linkLabel: string;
    readonly onceOnly: string;
    readonly expires: string;
    readonly errors: Readonly<Record<string, string>>;
  };
}) {
  const [state, submit, pending] = useActionState<HistoryClaimCreateResult | null, FormData>(
    createHistoryClaimAction,
    null,
  );

  if (state?.ok) {
    return (
      <div
        role="status"
        className="flex flex-col gap-1.5"
        data-testid={`history-claim-created-${personId}`}
      >
        <p className="text-xs text-state-success">{labels.created}</p>
        <Input
          readOnly
          value={state.link}
          aria-label={labels.linkLabel}
          onFocus={(e) => e.currentTarget.select()}
          className="min-w-0 font-mono text-meta sm:w-auto sm:min-w-96"
          data-testid={`history-claim-link-${personId}`}
        />
        <p className="text-meta leading-relaxed text-text-muted">
          {labels.onceOnly}
          {state.expiresAt ? ` ${labels.expires.replace("{date}", state.expiresAt.slice(0, 10))}` : ""}
        </p>
      </div>
    );
  }

  return (
    <form action={submit} className="flex flex-col gap-1.5">
      <input type="hidden" name="person_id" value={personId} />
      <input type="hidden" name="locale" value={locale} />
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="submit"
          variant="secondary"
          size="sm"
          loading={pending}
          disabled={pending}
          aria-busy={pending}
          data-testid={`history-claim-offer-${personId}`}
        >
          {pending ? labels.offering : labels.offer}
        </Button>
        <span className="text-meta leading-relaxed text-text-muted">{labels.hint}</span>
      </div>
      <div role="status" aria-live="polite">
        {state && !state.ok ? (
          <Notice tone="warning" testId={`history-claim-error-${personId}`}>
            {labels.errors[state.code] ?? labels.errors.error}
          </Notice>
        ) : null}
      </div>
    </form>
  );
}
