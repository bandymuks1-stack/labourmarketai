"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { isAiAssistEnabled } from "@/lib/ai/provider";
import { AI_ASSIST_FLAGS } from "@/lib/config/ai";
import { requestEstimateClarify } from "@/lib/ai/estimate-clarify-actions";
import { isAiDisabled, type AiLocale, type EstimateClarifyResult } from "@/lib/ai/types";

/**
 * Estimate-clarify assist surface (Step 1/6) — INERT by default.
 *
 * Hidden behind the AI flags: while `AI_ASSIST_ENABLED` and
 * `AI_ASSIST_FLAGS.estimate_clarify` are false (today), this renders NOTHING —
 * there is no visible AI surface and no claim that AI is working. The wiring
 * below is the future insertion point: when the owner activates the flags AND a
 * real provider is wired, it calls the boundary, validates the result, and shows
 * ONLY clarifying questions + assumption notes (never a number/price/total/
 * verification), with a human-confirm note. It can never save or change the
 * estimate. If the provider returns disabled, it shows a calm localized note —
 * it never looks broken.
 */
export function EstimateClarifyAssist({
  missingInfoKeys,
  workContext,
}: {
  missingInfoKeys: readonly string[];
  workContext?: string;
}) {
  const t = useTranslations("auth.dashboard.wow.demand.estimate.clarify");
  const rawLocale = useLocale();
  const locale: AiLocale =
    rawLocale === "lt" || rawLocale === "ru" ? rawLocale : "en";

  const [state, setState] = useState<"idle" | "loading" | "disabled" | "ok">("idle");
  const [result, setResult] = useState<EstimateClarifyResult | null>(null);

  // Flag gate — inert today. No AI surface renders while disabled.
  if (!isAiAssistEnabled() || !AI_ASSIST_FLAGS.estimate_clarify) return null;

  async function ask() {
    setState("loading");
    const res = await requestEstimateClarify({
      kind: "estimate_clarify",
      locale,
      missingInfoKeys,
      workContext,
    });
    if (isAiDisabled(res)) {
      setState("disabled");
      setResult(null);
      return;
    }
    setResult(res);
    setState("ok");
  }

  return (
    <div
      className="flex flex-col gap-2 rounded-md border border-brand-blue/30 bg-brand-blue/5 p-3"
      data-testid="estimate-clarify-assist"
    >
      <p className="text-xs leading-relaxed text-text-secondary">{t("intro")}</p>
      <button
        type="button"
        onClick={ask}
        disabled={state === "loading"}
        className="self-start rounded-md border border-brand-blue/50 px-3 py-1.5 text-xs font-semibold text-brand-blue transition-colors hover:bg-brand-blue/10 disabled:opacity-50"
        data-testid="estimate-clarify-ask"
      >
        {state === "loading" ? t("loading") : t("ask")}
      </button>

      {state === "disabled" && (
        <p className="text-meta text-text-muted" data-testid="estimate-clarify-disabled">
          {t("disabledNote")}
        </p>
      )}

      {state === "ok" && result && (
        <div className="flex flex-col gap-2" data-testid="estimate-clarify-result">
          {result.questions.length > 0 && (
            <div className="flex flex-col gap-1">
              <p className="font-mono text-meta uppercase tracking-label text-text-muted">
                {t("questionsTitle")}
              </p>
              <ul className="list-disc pl-4 text-xs leading-relaxed text-text-secondary">
                {result.questions.map((q) => (
                  <li key={q}>{q}</li>
                ))}
              </ul>
            </div>
          )}
          {result.assumptionNotes.length > 0 && (
            <div className="flex flex-col gap-1">
              <p className="font-mono text-meta uppercase tracking-label text-text-muted">
                {t("assumptionsTitle")}
              </p>
              <ul className="list-disc pl-4 text-xs leading-relaxed text-text-secondary">
                {result.assumptionNotes.map((a) => (
                  <li key={a}>{a}</li>
                ))}
              </ul>
            </div>
          )}
          <p className="text-meta leading-relaxed text-text-muted">
            {t("humanConfirmNote")}
          </p>
        </div>
      )}
    </div>
  );
}
