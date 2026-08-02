"use client";

import { useActionState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { submitExperienceAction, type ExperienceFormState } from "@/lib/trust/experience-actions";

/**
 * W6 slice 3B — the experience submission form.
 *
 * ONLY positive|negative + bounded text. No stars, no numeric field, no
 * neutral option, no skill/evidence picker standing in for a judgement.
 * The eligible interaction is carried as a hidden reference ONLY so the
 * server can re-derive it — it is never treated as permission here.
 */
export function ExperienceSubmitForm({
  subjectType,
  subjectId,
  interactionKind,
  interactionId,
  subjectLabel,
}: {
  subjectType: "worker" | "organization";
  subjectId: string;
  interactionKind: string;
  interactionId: string;
  subjectLabel: string;
}) {
  const locale = useLocale();
  const t = useTranslations("experience");
  const [state, action, pending] = useActionState<ExperienceFormState, FormData>(
    submitExperienceAction,
    null,
  );

  if (state?.ok) {
    return (
      <div
        className="rounded-md border border-state-success/40 bg-state-success/5 p-3"
        data-testid="experience-submitted"
        role="status"
      >
        <p className="text-basis text-text-primary">{t("submit.submitted")}</p>
        <p className="text-meta leading-relaxed text-text-secondary">
          {t("submit.awaitingModeration")}
        </p>
      </div>
    );
  }

  const errorKey = state && !state.ok ? state.code : null;
  // A duplicate is NOT a failure to explain away: the experience already
  // exists, and the person is told exactly that.
  const isDuplicate = errorKey === "duplicate_for_interaction";

  return (
    <form action={action} className="flex flex-col gap-3" data-testid="experience-submit-form">
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="subject_type" value={subjectType} />
      <input type="hidden" name="subject_id" value={subjectId} />
      <input type="hidden" name="interaction_kind" value={interactionKind} />
      <input type="hidden" name="interaction_id" value={interactionId} />

      <p className="text-basis text-text-primary">
        {t("submit.about", { name: subjectLabel })}
      </p>

      <fieldset className="flex flex-col gap-2">
        <legend className="font-mono text-meta uppercase tracking-label text-text-muted">
          {t("submit.sentimentLegend")}
        </legend>
        <div className="flex flex-wrap gap-2">
          {(["positive", "negative"] as const).map((value) => (
            <label
              key={value}
              className="inline-flex min-h-[2.75rem] cursor-pointer items-center gap-2 rounded-md border border-border px-3 text-sm text-text-primary transition-colors hover:border-brand-blue focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-brand-blue"
            >
              <input
                type="radio"
                name="sentiment"
                value={value}
                required
                data-testid={`experience-sentiment-${value}`}
                className="size-4"
              />
              {t(`submit.sentiment.${value}`)}
            </label>
          ))}
        </div>
      </fieldset>

      <label className="flex flex-col gap-1">
        <span className="font-mono text-meta uppercase tracking-label text-text-muted">
          {t("submit.bodyLabel")}
        </span>
        <textarea
          name="body"
          required
          maxLength={2000}
          rows={4}
          data-testid="experience-body"
          className="rounded-md border border-border bg-surface-1 p-2 text-sm text-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue"
        />
      </label>

      <p className="text-meta leading-relaxed text-text-muted">{t("submit.moderationNote")}</p>

      {errorKey ? (
        <p
          role="alert"
          className={isDuplicate ? "text-meta text-text-secondary" : "text-meta text-state-danger"}
          data-testid={`experience-error-${errorKey}`}
        >
          {t(`submit.errors.${errorKey}`)}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        data-testid="experience-submit"
        className="inline-flex min-h-[2.75rem] w-fit items-center rounded-md bg-gradient-to-r from-brand-blue to-brand-cyan px-4 text-sm font-semibold text-ink-900 transition-opacity hover:opacity-90 disabled:opacity-60"
      >
        {pending ? t("submit.sending") : t("submit.cta")}
      </button>
    </form>
  );
}
