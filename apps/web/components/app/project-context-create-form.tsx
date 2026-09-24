"use client";

import { useActionState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/lib/i18n/navigation";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import {
  createProjectContextAction,
  type CreateProjectContextState,
} from "@/lib/company/project-context-actions";
import { DisplayedWorkspaceField } from "@/components/app/workspace/displayed-workspace-field";

/**
 * Minimal company-side project/client context create form. Required: project
 * name. Optional: location + client name (both backed by real columns). No
 * journal linking, no worker assignment — and the form says so explicitly.
 */
export function ProjectContextCreateForm() {
  const t = useTranslations("companyOps.createProject");
  const locale = useLocale();
  const [state, action, pending] = useActionState<
    CreateProjectContextState | null,
    FormData
  >(createProjectContextAction, null);

  if (state?.ok) {
    return (
      <div
        className="card-border flex flex-col gap-2 p-4"
        data-testid="project-context-created"
        role="status"
      >
        <p className="text-sm font-medium text-state-success">{t("success")}</p>
        <p className="text-xs text-text-secondary">{t("journalLinkingDisabled")}</p>
        <Link
          href="/dashboard/company"
          className="w-fit text-xs font-medium text-brand-blue hover:underline"
        >
          {t("backToDashboard")}
        </Link>
      </div>
    );
  }

  // `not_authorized` names WHO can grant the right (owner / admin) — the
  // refused write of a manager or member is a fact about their role in a
  // real organization, never "could not create" (SEP-7).
  const errorText =
    state && !state.ok
      ? state.code === "invalid_name"
        ? t("errorName")
        : state.code === "no_company"
          ? t("errorNoCompany")
          : state.code === "not_authorized"
            ? t("errorNotAuthorized")
            : t("error")
      : null;

  return (
    <form action={action} className="card-border flex flex-col gap-3 p-4">
      <DisplayedWorkspaceField />
      <input type="hidden" name="locale" value={locale} />

      <label className="flex flex-col gap-1 text-xs text-text-secondary">
        {t("nameLabel")}
        <Input
          name="name"
          required
          minLength={2}
          maxLength={120}
          placeholder={t("namePlaceholder")}
          data-testid="project-name-input"
        />
      </label>

      <label className="flex flex-col gap-1 text-xs text-text-secondary">
        {t("locationLabel")}
        <Input name="location" maxLength={200} placeholder={t("locationPlaceholder")} />
      </label>

      <label className="flex flex-col gap-1 text-xs text-text-secondary">
        {t("clientLabel")}
        <Input name="client_name" maxLength={200} placeholder={t("clientPlaceholder")} />
      </label>

      <p className="text-meta leading-relaxed text-text-muted">
        {t("journalLinkingDisabled")}
      </p>

      {errorText && (
        <p
          className="text-xs text-state-warning"
          role="alert"
          data-testid="project-create-error"
          data-code={state && !state.ok ? state.code : undefined}
        >
          {errorText}
        </p>
      )}

      <Button type="submit" size="sm" variant="primary" disabled={pending} data-testid="project-create-submit">
        {t("submit")}
      </Button>
    </form>
  );
}
