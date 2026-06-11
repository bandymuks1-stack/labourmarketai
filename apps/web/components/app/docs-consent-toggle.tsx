"use client";

import { useActionState } from "react";
import { useLocale, useTranslations } from "next-intl";

import {
  setDocsConsentAction,
  type DocsConsentState,
} from "@/lib/documents/consent-actions";

/**
 * S6 — the worker's documents-aggregate consent switch. Explains EXACTLY
 * what the agency will see (category-level counts: valid / expiring /
 * needs-attention — never document contents, files or notes). Default OFF;
 * each flip is the worker's own audited act. Honest needs-gate state until
 * the owner applies the S6 consent draft.
 */
export function DocsConsentToggle({
  current,
}: {
  /** Current saved value; null = the consent layer is not active yet. */
  current: boolean | null;
}) {
  const t = useTranslations("documents.consent");
  const locale = useLocale();
  const [state, action, pending] = useActionState<DocsConsentState, FormData>(
    setDocsConsentAction,
    null,
  );

  const effective =
    state?.outcome === "saved" ? state.enabled : current ?? false;
  const gateMissing =
    current === null && state?.outcome !== "saved"
      ? state?.outcome === "needs_gate" || state === null
      : state?.outcome === "needs_gate";

  return (
    <section
      className="card-border flex flex-col gap-2 p-4"
      data-testid="docs-consent"
    >
      <h2 className="font-mono text-[10px] uppercase tracking-label text-text-muted">
        {t("title")}
      </h2>
      <p className="max-w-prose text-xs leading-relaxed text-text-secondary">
        {t("explainer")}
      </p>
      {gateMissing ? (
        <p
          className="rounded-md border border-dashed border-ink-500 px-3 py-2 text-[11px] leading-relaxed text-text-muted"
          data-testid="docs-consent-needs-gate"
        >
          {t("needsGate")}
        </p>
      ) : (
        <form action={action} className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="locale" value={locale} />
          <input type="hidden" name="enabled" value={effective ? "0" : "1"} />
          <button
            type="submit"
            disabled={pending}
            aria-pressed={effective}
            className={`inline-flex min-h-10 items-center rounded-md border px-4 py-2 text-sm font-medium transition-colors duration-fast disabled:opacity-50 ${
              effective
                ? "border-state-success/40 bg-state-success/10 text-state-success"
                : "border-ink-500 text-text-secondary hover:border-brand-blue hover:text-brand-blue"
            }`}
            data-testid="docs-consent-toggle"
          >
            {pending
              ? t("saving")
              : effective
                ? t("onLabel")
                : t("offLabel")}
          </button>
          <span className="text-[11px] leading-relaxed text-text-muted">
            {effective ? t("onHint") : t("offHint")}
          </span>
          {state?.outcome === "error" || state?.outcome === "no_worker" ? (
            <span className="text-[11px] text-state-warning" role="status">
              {t(`error.${state.outcome}`)}
            </span>
          ) : null}
        </form>
      )}
    </section>
  );
}
