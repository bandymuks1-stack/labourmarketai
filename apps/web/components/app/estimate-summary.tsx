"use client";

import { useLocale, useTranslations } from "next-intl";
import type { EstimateResult } from "@/lib/estimate/estimate";
import { EstimateSummaryView } from "@/components/app/estimate-summary-view";

/**
 * Presentational estimate summary — the calculated result + assumptions +
 * missing-info + the preliminary-estimate disclaimer. Pure display (no inputs,
 * no mutation), reused on the builder (live), the review step, the post-submit
 * confirmation, and the persistent read-back. Client component so it can read
 * translations from any of those contexts.
 *
 * Since European Work & Project Calculator v1 this is a thin i18n wrapper over
 * EstimateSummaryView (estimate-summary-view.tsx): the wrapper resolves the
 * `auth.dashboard.wow.demand.estimate` keys exactly as before, the view holds
 * the markup, and the public marketing calculator reuses the same view with
 * server-resolved labels. Behaviour and rendered output are unchanged —
 * sectionResult, the total, the range and the disclaimer render identically.
 *
 * Honesty: shows a deterministic preliminary estimate only — every line is the
 * user's own numbers run through transparent arithmetic, never a final offer.
 */
export function EstimateSummary({
  result,
  assumptions,
  missingInfo,
  compact = false,
}: {
  result: EstimateResult;
  assumptions: readonly string[];
  missingInfo: readonly string[];
  /** Compact = read-back / review variant (smaller, no big total card). */
  compact?: boolean;
}) {
  const t = useTranslations("auth.dashboard.wow.demand.estimate");
  const locale = useLocale();

  return (
    <EstimateSummaryView
      result={result}
      assumptionItems={assumptions.map((k) => t(`assumptions.${k}`))}
      missingItems={missingInfo.map((k) => t(`missing.${k}`))}
      labels={{
        sectionResult: t("sectionResult"),
        labourSubtotal: t("r.labourSubtotal"),
        materials: t("r.materials"),
        equipment: t("r.equipment"),
        transport: t("r.transport"),
        overhead: t("r.overhead"),
        margin: t("r.margin"),
        contingency: t("r.contingency"),
        estimatedTotal: t("r.estimatedTotal"),
        range: t("r.range"),
        assumptionsTitle: t("assumptionsTitle"),
        missingTitle: t("missingTitle"),
        disclaimer: t("disclaimer"),
      }}
      locale={locale}
      compact={compact}
    />
  );
}
