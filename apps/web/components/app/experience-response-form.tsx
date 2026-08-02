"use client";

import { useActionState } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  submitExperienceResponseAction,
  type ExperienceFormState,
} from "@/lib/trust/experience-actions";

/**
 * W6 slice 3B — right of reply. ONE response per experience, itself
 * moderated, and it NEVER changes the positive/negative counts (said in
 * words, not just enforced in SQL). It cannot edit or remove the original.
 */
export function ExperienceResponseForm({ experienceId }: { experienceId: string }) {
  const locale = useLocale();
  const t = useTranslations("experience");
  const [state, action, pending] = useActionState<ExperienceFormState, FormData>(
    submitExperienceResponseAction,
    null,
  );

  if (state?.ok) {
    return (
      <p className="text-meta leading-relaxed text-text-secondary" data-testid="experience-response-submitted" role="status">
        {t("response.submitted")}
      </p>
    );
  }

  return (
    <details className="rounded-md border border-border-subtle" data-testid="experience-response">
      <summary className="cursor-pointer select-none px-3 py-2 text-sm text-text-secondary hover:text-text-primary">
        {t("response.open")}
      </summary>
      <form action={action} className="flex flex-col gap-2 px-3 pb-3">
        <input type="hidden" name="locale" value={locale} />
        <input type="hidden" name="experience_id" value={experienceId} />
        <p className="text-meta leading-relaxed text-text-muted">{t("response.rules")}</p>
        <textarea
          name="body"
          required
          maxLength={2000}
          rows={3}
          data-testid="experience-response-body"
          className="rounded-md border border-border bg-surface-1 p-2 text-sm text-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue"
        />
        {state && !state.ok ? (
          <p role="alert" className="text-meta text-state-danger" data-testid={`experience-response-error-${state.code}`}>
            {t(`response.errors.${state.code}`)}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={pending}
          data-testid="experience-response-submit"
          className="inline-flex min-h-[2.75rem] w-fit items-center rounded-md border border-border px-4 text-sm font-medium text-text-primary transition-colors hover:bg-surface-1 disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue"
        >
          {pending ? t("response.sending") : t("response.cta")}
        </button>
      </form>
    </details>
  );
}
