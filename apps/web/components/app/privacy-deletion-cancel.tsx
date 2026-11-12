"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { InlineConfirm } from "@/components/ui/InlineConfirm";
import { cancelMyAccountDeletion } from "@/lib/privacy/deletion-cancel-actions";
import {
  cancelOutcomeView,
  type CancelMessageKey,
  type CancelOutcomeView,
} from "@/lib/privacy/deletion-cancel-model";

/**
 * Self-service cancel of the person's own pending account-deletion request
 * (owner P0 2026-11-09). One explicit confirm (the ONE confirmation
 * mechanism, InlineConfirm), then the cancel RPC. The outcome is whatever the
 * database answered — mapped by `cancelOutcomeView`, never assumed. On
 * success the page refreshes so the section shows the withdrawn request.
 *
 * Rendered only while the status read says the request is `cancellable`, so
 * it never appears before the migration that backs it is applied.
 */
export function PrivacyDeletionCancel({
  locale,
  labels,
}: {
  locale: string;
  labels: {
    button: string;
    question: string;
    confirm: string;
    keep: string;
    working: string;
    messages: Record<CancelMessageKey, string>;
  };
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [outcome, setOutcome] = useState<CancelOutcomeView | null>(null);

  if (outcome?.withdrawn) {
    return (
      <p
        role="status"
        data-testid="privacy-deletion-cancelled"
        className="rounded-md border border-state-success/40 bg-state-success/5 p-3 text-sm font-medium text-text-primary"
      >
        {labels.messages[outcome.messageKey]}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2" data-testid="privacy-deletion-cancel">
      {pending ? (
        <p role="status" className="text-sm text-text-secondary">
          {labels.working}
        </p>
      ) : (
        <InlineConfirm
          label={labels.button}
          question={labels.question}
          confirmLabel={labels.confirm}
          cancelLabel={labels.keep}
          tier="important_write"
          touch
          testId="privacy-deletion-cancel-button"
          className="inline-flex min-h-11 w-fit max-w-full items-center rounded-md border border-brand-blue/50 px-4 text-left text-sm font-medium text-brand-blue hover:bg-brand-blue/10 disabled:opacity-50"
          onConfirm={() =>
            startTransition(async () => {
              const result = await cancelMyAccountDeletion({ locale });
              const view = cancelOutcomeView(result);
              setOutcome(view);
              if (view.withdrawn) router.refresh();
            })
          }
        />
      )}
      {outcome && !outcome.withdrawn ? (
        <p role="alert" data-testid="privacy-deletion-cancel-error" className="text-xs text-state-warning">
          {labels.messages[outcome.messageKey]}
        </p>
      ) : null}
    </div>
  );
}
