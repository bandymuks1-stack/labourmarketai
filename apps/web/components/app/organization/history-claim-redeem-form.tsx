"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";
import {
  redeemHistoryClaimAction,
  type HistoryClaimRedeemResult,
} from "@/lib/organization-evidence/history-claim-actions";

/**
 * "This is me." The person who was given a history link says so, once.
 *
 * It shows them nothing and links nothing: the organization is then asked to
 * confirm that the person who came is the person the record is about, and
 * only after that does the offer reach the person's own profile, where they
 * accept or refuse. Three acts, two parties, nothing automatic.
 */
export function HistoryClaimRedeemForm({
  token,
  labels,
}: {
  token: string;
  labels: {
    readonly submit: string;
    readonly submitting: string;
    readonly done: string;
    readonly doneHint: string;
    readonly errors: Readonly<Record<string, string>>;
  };
}) {
  const [state, submit, pending] = useActionState<HistoryClaimRedeemResult | null, FormData>(
    redeemHistoryClaimAction,
    null,
  );

  if (state?.ok) {
    return (
      <Notice tone="success" title={labels.done} testId="history-claim-redeemed">
        {labels.doneHint}
      </Notice>
    );
  }

  return (
    <form action={submit} className="flex flex-col gap-2">
      <input type="hidden" name="token" value={token} />
      <Button
        type="submit"
        loading={pending}
        disabled={pending}
        aria-busy={pending}
        className="self-start"
        data-testid="history-claim-redeem"
      >
        {pending ? labels.submitting : labels.submit}
      </Button>
      <div role="status" aria-live="polite">
      {state && !state.ok ? (
        <Notice tone="warning" testId="history-claim-redeem-error">
          {labels.errors[state.code] ?? labels.errors.error}
        </Notice>
      ) : null}
      </div>
    </form>
  );
}
