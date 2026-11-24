"use client";

import { useActionState } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  openExperienceDisputeAction,
  type ExperienceFormState,
} from "@/lib/trust/experience-actions";

/**
 * W6 slice 3B — opening a dispute. A dispute is a SEPARATE dimension: the
 * record stays published while a moderator decides, and the UI says so.
 * A bounded reason is mandatory.
 */
export function ExperienceDisputeForm({ experienceId }: { experienceId: string }) {
  const locale = useLocale();
  const t = useTranslations("experience");
  const [state, action, pending] = useActionState<ExperienceFormState, FormData>(
    openExperienceDisputeAction,
    null,
  );

  if (state?.ok) {
    return (
      <p className="text-meta leading-relaxed text-state-warning" data-testid="experience-dispute-opened" role="status">
        {t("dispute.openedNote")}
      </p>
    );
  }

  return (
    <details className="rounded-md border border-border-subtle" data-testid="experience-dispute">
      <summary className="cursor-pointer select-none px-3 py-2 text-sm text-text-secondary hover:text-text-primary">
        {t("dispute.open")}
      </summary>
      <form action={action} className="flex flex-col gap-2 px-3 pb-3">
        <input type="hidden" name="locale" value={locale} />
        <input type="hidden" name="experience_id" value={experienceId} />
        <p className="text-meta leading-relaxed text-text-muted">{t("dispute.rules")}</p>
        <textarea
          name="reason"
          required
          maxLength={2000}
          rows={3}
          data-testid="experience-dispute-reason"
          className="rounded-md border border-border bg-surface-1 p-2 text-sm text-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue"
        />
        {state && !state.ok ? (
          <p role="alert" className="text-meta text-state-danger" data-testid={`experience-dispute-error-${state.code}`}>
            {t(`dispute.errors.${state.code}`)}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={pending}
          data-testid="experience-dispute-submit"
          className="inline-flex min-h-[2.75rem] w-fit items-center rounded-md border border-state-warning/40 px-4 text-sm font-medium text-text-primary transition-colors hover:bg-surface-1 disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue"
        >
          {pending ? t("dispute.sending") : t("dispute.cta")}
        </button>
      </form>
    </details>
  );
}
