"use client";

import { useActionState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { resolveDisputeAction, type ExperienceFormState } from "@/lib/trust/experience-actions";

/**
 * W6 slice 3B — one dispute item in the moderator queue.
 *
 * The moderation status is displayed ALONGSIDE the dispute status, never
 * replaced by it: a disputed record is still `published` until a moderator
 * decides otherwise. Every resolution requires a reason and writes an audit
 * row; `removed` hides the record from public counts without deleting it.
 */
export function ExperienceDisputeItem({
  id,
  sentiment,
  body,
  moderationStatus,
  disputeStatus,
}: {
  id: string;
  sentiment: "positive" | "negative";
  body: string;
  moderationStatus: string;
  disputeStatus: string;
}) {
  const locale = useLocale();
  const t = useTranslations("experience");
  const [state, action, pending] = useActionState<ExperienceFormState, FormData>(
    resolveDisputeAction,
    null,
  );

  return (
    <article
      className="flex flex-col gap-2 rounded-md border border-state-warning/40 bg-surface-1/40 p-3"
      data-testid="experience-dispute-item"
      data-experience-id={id}
      data-moderation={moderationStatus}
      data-dispute={state?.ok ? "resolved" : disputeStatus}
    >
      <div className="flex flex-wrap items-baseline gap-x-2">
        <span className="text-basis font-medium text-text-primary">
          {t(`sentiment.${sentiment}`)}
        </span>
        {/* BOTH dimensions, always — the moderation state is never lost. */}
        <span className="text-meta text-text-muted" data-testid="dispute-item-moderation">
          · {t(`moderation.${moderationStatus}`)}
        </span>
        <span className="text-meta text-state-warning" data-testid="dispute-item-dispute">
          · {t(`dispute.${disputeStatus}`)}
        </span>
      </div>
      <p className="text-sm leading-relaxed text-text-secondary break-words">{body}</p>

      {state?.ok ? (
        <p
          className="text-meta text-state-success"
          role="status"
          data-testid="experience-dispute-resolved"
        >
          {t("moderation.decidedWithAudit")}
        </p>
      ) : (
        <form action={action} className="flex flex-col gap-2">
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
              data-testid="experience-dispute-resolve-reason"
              className="rounded-md border border-border bg-surface-1 p-2 text-sm text-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue"
            />
          </label>
          <div className="flex flex-wrap gap-2">
            {(["upheld", "changed", "removed"] as const).map((r) => (
              <button
                key={r}
                type="submit"
                name="resolution"
                value={r}
                disabled={pending}
                data-testid={`experience-dispute-resolve-${r}`}
                className="inline-flex min-h-[2.75rem] items-center rounded-md border border-border px-4 text-sm font-medium text-text-primary transition-colors hover:bg-surface-1 disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue"
              >
                {t(`moderation.resolve.${r}`)}
              </button>
            ))}
          </div>
          {state && !state.ok ? (
            <p
              role="alert"
              className="text-meta text-state-danger"
              data-testid={`experience-dispute-resolve-error-${state.code}`}
            >
              {t(`moderation.errors.${state.code}`)}
            </p>
          ) : null}
        </form>
      )}
    </article>
  );
}
