"use client";

import { useActionState } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  startModerationAction,
  decideModerationAction,
  type ExperienceFormState,
} from "@/lib/trust/experience-actions";

/**
 * W6 slice 3B — one moderation item.
 *
 * The UI offers ONLY the canonical transition available from the item's
 * CURRENT state: `submitted` → take into moderation; `in_moderation` →
 * publish or reject, each with a MANDATORY reason. There is no skip, no
 * delete, no sentiment edit, and no silent re-decision — a decided record
 * simply exposes no further control here.
 */
export function ExperienceModerationItem({
  id,
  sentiment,
  body,
  moderationStatus,
  disputeStatus,
  interactionKind,
}: {
  id: string;
  sentiment: "positive" | "negative";
  body: string;
  moderationStatus: string;
  disputeStatus: string;
  interactionKind: string;
}) {
  const locale = useLocale();
  const t = useTranslations("experience");
  const [startState, startAction, startPending] = useActionState<ExperienceFormState, FormData>(
    startModerationAction,
    null,
  );
  const [decideState, decideAction, decidePending] = useActionState<ExperienceFormState, FormData>(
    decideModerationAction,
    null,
  );

  const status = startState?.ok ? "in_moderation" : moderationStatus;
  const decided = decideState?.ok;

  return (
    <article
      className="flex flex-col gap-2 rounded-md border border-border-subtle bg-surface-1/40 p-3"
      data-testid="experience-moderation-item"
      data-experience-id={id}
      data-moderation={status}
      data-dispute={disputeStatus}
    >
      <div className="flex flex-wrap items-baseline gap-x-2">
        <span className="text-basis font-medium text-text-primary">
          {t(`sentiment.${sentiment}`)}
        </span>
        <span className="text-meta text-text-muted">· {t(`moderation.${status}`)}</span>
        {/* Interaction TYPE only — never the private transaction content. */}
        <span className="text-meta text-text-muted">· {t(`interaction.${interactionKind}`)}</span>
        {disputeStatus !== "none" ? (
          <span className="text-meta text-state-warning">· {t(`dispute.${disputeStatus}`)}</span>
        ) : null}
      </div>
      <p className="text-sm leading-relaxed text-text-secondary break-words">{body}</p>

      {decided ? (
        <p
          className="text-meta text-state-success"
          role="status"
          data-testid="experience-moderation-decided"
        >
          {t("moderation.decidedWithAudit")}
        </p>
      ) : status === "submitted" ? (
        <form action={startAction}>
          <input type="hidden" name="locale" value={locale} />
          <input type="hidden" name="experience_id" value={id} />
          <button
            type="submit"
            disabled={startPending}
            data-testid="experience-moderation-start"
            className="inline-flex min-h-[2.75rem] items-center rounded-md border border-border px-4 text-sm font-medium text-text-primary transition-colors hover:bg-surface-1 disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue"
          >
            {t("moderation.take")}
          </button>
        </form>
      ) : status === "in_moderation" ? (
        <form action={decideAction} className="flex flex-col gap-2">
          <input type="hidden" name="locale" value={locale} />
          <input type="hidden" name="experience_id" value={id} />
          <label className="flex flex-col gap-1">
            <span className="font-mono text-meta uppercase tracking-label text-text-muted">
              {t("moderation.reasonLabel")}
            </span>
            <textarea
              name="reason"
              required
              maxLength={2000}
              rows={2}
              data-testid="experience-moderation-reason"
              className="rounded-md border border-border bg-surface-1 p-2 text-sm text-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue"
            />
          </label>
          <p className="text-meta leading-relaxed text-text-muted">
            {t("moderation.reasonNotPublic")}
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              name="decision"
              value="published"
              disabled={decidePending}
              data-testid="experience-moderation-publish"
              className="inline-flex min-h-[2.75rem] items-center rounded-md bg-gradient-to-r from-brand-blue to-brand-cyan px-4 text-sm font-semibold text-ink-900 transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              {t("moderation.publish")}
            </button>
            <button
              type="submit"
              name="decision"
              value="rejected"
              disabled={decidePending}
              data-testid="experience-moderation-reject"
              className="inline-flex min-h-[2.75rem] items-center rounded-md border border-state-danger/40 px-4 text-sm font-medium text-text-primary transition-colors hover:bg-surface-1 disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue"
            >
              {t("moderation.reject")}
            </button>
          </div>
        </form>
      ) : null}

      {decideState && !decideState.ok ? (
        <p
          role="alert"
          className="text-meta text-state-danger"
          data-testid={`experience-moderation-error-${decideState.code}`}
        >
          {t(`moderation.errors.${decideState.code}`)}
        </p>
      ) : null}
    </article>
  );
}
