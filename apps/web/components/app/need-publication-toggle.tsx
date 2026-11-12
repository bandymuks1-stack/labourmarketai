"use client";

import { useActionState, useRef } from "react";

import { Button } from "@/components/ui/Button";
import {
  setNeedPublicationAction,
  type NeedPublicationActionState,
} from "@/lib/opportunities/need-publication-actions";

/**
 * "Publish publicly" / "Stop publishing" for one need of a company that is not
 * verified (owner principle C). Default off. The explanation of exactly what a
 * signed-out visitor and a signed-in worker would see is shown BEFORE the
 * choice. Same two-channel submit as the other review forms: a hidden input
 * set on click plus each button's own name/value for a pre-hydration submit.
 */
export interface NeedPublicationLabels {
  readonly publish: string;
  readonly withdraw: string;
  readonly explain: string;
  readonly failed: string;
  readonly saving: string;
}

export function NeedPublicationToggle({
  requestId,
  published,
  labels,
}: {
  readonly requestId: string;
  readonly published: boolean;
  readonly labels: NeedPublicationLabels;
}) {
  const [state, formAction, isPending] = useActionState<NeedPublicationActionState | null, FormData>(
    setNeedPublicationAction,
    null,
  );
  const choiceRef = useRef<HTMLInputElement>(null);
  const next = published ? "false" : "true";
  return (
    <form action={formAction} className="flex flex-col gap-1" data-testid={`need-publication-${requestId}`}>
      <input type="hidden" name="request_id" value={requestId} />
      <input type="hidden" name="publish" ref={choiceRef} defaultValue="" />
      {!published ? <p className="text-meta leading-relaxed text-text-muted">{labels.explain}</p> : null}
      <div>
        <Button
          type="submit"
          name="publish"
          value={next}
          variant="secondary"
          size="sm"
          disabled={isPending}
          onClick={() => {
            if (choiceRef.current) choiceRef.current.value = next;
          }}
          data-testid={published ? `need-withdraw-${requestId}` : `need-publish-${requestId}`}
        >
          {published ? labels.withdraw : labels.publish}
        </Button>
      </div>
      {isPending ? (
        <p role="status" className="text-meta text-text-muted">
          {labels.saving}
        </p>
      ) : state && !state.ok ? (
        <p role="status" className="text-meta text-state-warning">
          {labels.failed}
        </p>
      ) : null}
    </form>
  );
}
