"use client";

import { useActionState } from "react";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import {
  resolveDisputeAction,
  startDisputeReviewAction,
  type ExperienceFormState,
} from "@/lib/trust/experience-actions";

/**
 * W6 slice 3B — one dispute item in the moderator queue.
 *
 * The moderation status is displayed ALONGSIDE the dispute status, never
 * replaced by it: a disputed record is still `published` until a moderator
 * decides otherwise. Every resolution requires a reason and writes an audit
 * row; `removed` hides the record from public counts without deleting it.
 *
 * TWO STEPS, like the moderation item, because the database has two:
 * `opened` → take into review, `under_review` → decide. A decision sent while
 * the dispute is still `opened` is refused (`invalid_transition`); this item
 * used to offer only that, so no dispute could be decided.
 */
export function ExperienceDisputeItem({
  id,
  sentiment,
  body,
  moderationStatus,
  disputeStatus,
  disputeReason,
  stepAt,
  now,
  conflict,
}: {
  id: string;
  sentiment: "positive" | "negative";
  body: string;
  moderationStatus: string;
  disputeStatus: string;
  /** The subject's reason. Undefined/null = not read; the item then says
   *  nothing about it rather than implying there was none. */
  disputeReason?: string | null;
  /** When the dispute entered its current step; null = not known. */
  stepAt?: string | null;
  /** The server's clock at render, so the age is the same on both renders. */
  now: string;
  /** The signed-in administrator is a party to this record. */
  conflict?: boolean;
}) {
  const format = useFormatter();
  const locale = useLocale();
  const t = useTranslations("experience");
  const [state, action, pending] = useActionState<ExperienceFormState, FormData>(
    resolveDisputeAction,
    null,
  );
  const [startState, startAction, startPending] = useActionState<ExperienceFormState, FormData>(
    startDisputeReviewAction,
    null,
  );
  const status = startState?.ok ? "under_review" : disputeStatus;

  return (
    <article
      className="flex flex-col gap-2 rounded-md border border-state-warning/40 bg-surface-1/40 p-3"
      data-testid="experience-dispute-item"
      data-experience-id={id}
      data-moderation={moderationStatus}
      data-dispute={state?.ok ? "resolved" : status}
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
          · {t(`dispute.${status}`)}
        </span>
      </div>
      <p className="text-sm leading-relaxed text-text-secondary break-words">{body}</p>
      {stepAt ? (
        <p className="text-meta text-text-muted" data-testid="experience-dispute-age">
          {t(status === "opened" ? "moderation.disputeOpenedLabel" : "moderation.disputeReviewStartedLabel")}
          {": "}
          <time dateTime={stepAt}>
            {format.dateTime(new Date(stepAt), { dateStyle: "medium" })}
          </time>
          {" · "}
          {format.relativeTime(new Date(stepAt), new Date(now))}
        </p>
      ) : null}
      {disputeReason ? (
        <div className="flex flex-col gap-1" data-testid="experience-dispute-reason">
          <span className="font-mono text-meta uppercase tracking-label text-text-muted">
            {t("moderation.disputeReasonLabel")}
          </span>
          <p className="text-sm leading-relaxed text-text-primary break-words">{disputeReason}</p>
        </div>
      ) : null}

      {conflict ? (
        // A party to the record does not decide its dispute. The server
        // refuses the step as well; this is the explanation, not the control.
        <p
          className="text-meta leading-relaxed text-state-warning"
          role="status"
          data-testid="experience-dispute-conflict"
        >
          {t("moderation.conflictNotice")}
        </p>
      ) : state?.ok ? (
        <p
          className="text-meta text-state-success"
          role="status"
          data-testid="experience-dispute-resolved"
        >
          {t("moderation.decidedWithAudit")}
        </p>
      ) : status === "opened" ? (
        <form action={startAction} className="flex flex-col gap-2">
          <input type="hidden" name="locale" value={locale} />
          <input type="hidden" name="experience_id" value={id} />
          <div>
            <button
              type="submit"
              disabled={startPending}
              data-testid="experience-dispute-start-review"
              className="inline-flex min-h-[2.75rem] items-center rounded-md border border-border px-4 text-sm font-medium text-text-primary transition-colors hover:bg-surface-1 disabled:opacity-60 motion-reduce:transition-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue"
            >
              {t("moderation.takeDispute")}
            </button>
          </div>
          {startState && !startState.ok ? (
            <p
              role="alert"
              className="text-meta text-state-danger"
              data-testid={`experience-dispute-start-error-${startState.code}`}
            >
              {t(`moderation.errors.${startState.code}`)}
            </p>
          ) : null}
        </form>
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
            {/* "changed" is not offered: nothing changes the text, so it would
                record a correction that never happened. */}
            {(["upheld", "removed"] as const).map((r) => (
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
