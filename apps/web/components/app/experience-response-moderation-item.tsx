"use client";

import { useActionState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { moderateResponseAction, type ExperienceFormState } from "@/lib/trust/experience-actions";

/**
 * One REPLY waiting for a moderator (register 2.24, right of reply).
 *
 * A subject's reply is published or rejected here, each with a mandatory
 * reason that lands in the audit trail. Until this item existed nothing called
 * `moderate_experience_response`: a reply stayed `submitted` for good and the
 * experience's author could never read it.
 *
 * The reply cannot edit or remove the experience it answers and does not move
 * the counts — this item offers no control over the record itself.
 */
export function ExperienceResponseModerationItem({
  id,
  body,
  moderationStatus,
  recordBody,
  conflict,
}: {
  id: string;
  body: string;
  moderationStatus: string;
  /** The experience the reply answers. Null = that read failed; the item says
   *  nothing about it rather than showing an empty quote. */
  recordBody: string | null;
  /** Whether the signed-in moderator is a party to the reply or its experience. */
  conflict?: "clear" | "conflict" | "unknown";
}) {
  const locale = useLocale();
  const t = useTranslations("experience");
  const [state, action, pending] = useActionState<ExperienceFormState, FormData>(
    moderateResponseAction,
    null,
  );

  return (
    <article
      className="flex flex-col gap-2 rounded-md border border-border-subtle bg-surface-1/40 p-3"
      data-testid="experience-response-moderation-item"
      data-response-id={id}
      data-moderation={state?.ok ? "decided" : moderationStatus}
    >
      <span className="text-meta text-text-muted">{t(`moderation.${moderationStatus}`)}</span>
      {recordBody !== null ? (
        <div className="flex flex-col gap-1">
          <span className="font-mono text-meta uppercase tracking-label text-text-muted">
            {t("moderation.replyToLabel")}
          </span>
          <p className="text-sm leading-relaxed text-text-secondary break-words">{recordBody}</p>
        </div>
      ) : null}
      <p
        className="text-sm leading-relaxed text-text-primary break-words"
        data-testid="experience-response-moderation-body"
      >
        {body}
      </p>

      {conflict === "conflict" || conflict === "unknown" ? (
        // A party to the experience does not decide here, and neither does a
        // moderator whose tie could not be checked. The server refuses the
        // step as well; this is the explanation, not the control.
        <p
          className="text-meta leading-relaxed text-state-warning"
          role="status"
          data-testid="experience-response-moderation-conflict"
          data-conflict={conflict}
        >
          {t(conflict === "conflict" ? "moderation.conflictNotice" : "moderation.conflictUnknown")}
        </p>
      ) : state?.ok ? (
        <p
          className="text-meta text-state-success"
          role="status"
          data-testid="experience-response-moderation-decided"
        >
          {t("moderation.decidedWithAudit")}
        </p>
      ) : (
        <form action={action} className="flex flex-col gap-2">
          <input type="hidden" name="locale" value={locale} />
          <input type="hidden" name="response_id" value={id} />
          <label className="flex flex-col gap-1">
            <span className="font-mono text-meta uppercase tracking-label text-text-muted">
              {t("moderation.reasonLabel")}
            </span>
            <textarea
              name="reason"
              required
              maxLength={2000}
              rows={2}
              data-testid="experience-response-moderation-reason"
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
              disabled={pending}
              data-testid="experience-response-moderation-publish"
              className="inline-flex min-h-[2.75rem] items-center rounded-md bg-gradient-cta px-4 text-sm font-semibold text-text-on-brand transition-opacity hover:opacity-90 disabled:opacity-60 motion-reduce:transition-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue"
            >
              {t("moderation.publish")}
            </button>
            <button
              type="submit"
              name="decision"
              value="rejected"
              disabled={pending}
              data-testid="experience-response-moderation-reject"
              className="inline-flex min-h-[2.75rem] items-center rounded-md border border-state-danger/40 px-4 text-sm font-medium text-text-primary transition-colors hover:bg-surface-1 disabled:opacity-60 motion-reduce:transition-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue"
            >
              {t("moderation.reject")}
            </button>
          </div>
          {state && !state.ok ? (
            <p
              role="alert"
              className="text-meta text-state-danger"
              data-testid={`experience-response-moderation-error-${state.code}`}
            >
              {t(`moderation.errors.${state.code}`)}
            </p>
          ) : null}
        </form>
      )}
    </article>
  );
}
