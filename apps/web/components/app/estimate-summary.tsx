"use client";

import { useLocale, useTranslations } from "next-intl";
import type { EstimateResult } from "@/lib/estimate/estimate";

/**
 * Presentational estimate summary — the calculated result + assumptions +
 * missing-info + the binding-quote disclaimer. Pure display (no inputs, no
 * mutation), reused on the builder (live), the review step, the post-submit
 * confirmation, and the persistent read-back. Client component so it can read
 * translations from any of those contexts.
 *
 * Honesty: shows a deterministic preliminary estimate only — every line is the
 * user's own numbers run through transparent arithmetic. Never a binding quote.
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
  // Use the active locale directly (lt/en/ru/nl/de are all valid BCP 47
  // tags) so nl/de get their own number formatting instead of the en style.
  const nf = new Intl.NumberFormat(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const money = (n: number) => `${nf.format(n)} ${result.currency}`;

  const lines = (
    [
      [t("r.labourSubtotal"), result.labourSubtotal],
      [t("r.materials"), result.materials],
      [t("r.equipment"), result.equipment],
      [t("r.transport"), result.transportAccommodation],
      [t("r.overhead"), result.overhead],
      [t("r.margin"), result.margin],
      [t("r.contingency"), result.contingency],
    ] as Array<[string, number]>
  ).filter(([, v]) => v > 0);

  return (
    <div className="flex flex-col gap-3" data-testid="estimate-summary">
      <p className="font-mono text-[10px] uppercase tracking-label text-brand-cyan">
        {t("sectionResult")}
      </p>
      <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1.5 rounded-md border border-ink-600 bg-ink-800/40 p-4 text-sm">
        {lines.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-text-secondary">{label}</dt>
            <dd className="text-right font-mono text-text-primary">{money(value)}</dd>
          </div>
        ))}
        <dt className="mt-1 border-t border-ink-600 pt-2 font-semibold text-text-primary">
          {t("r.estimatedTotal")}
        </dt>
        <dd
          className="mt-1 border-t border-ink-600 pt-2 text-right font-mono text-base font-bold text-text-primary"
          data-testid="estimate-total"
        >
          {money(result.estimatedTotal)}
        </dd>
      </dl>

      {result.hasRange && (
        <p className="text-xs text-text-secondary" data-testid="estimate-range">
          {t("r.range")}: <span className="font-mono">{money(result.low)}</span> –{" "}
          <span className="font-mono">{money(result.high)}</span>
        </p>
      )}

      {assumptions.length > 0 && (
        <div className="flex flex-col gap-1">
          <p className="font-mono text-[10px] uppercase tracking-label text-text-muted">
            {t("assumptionsTitle")}
          </p>
          <ul className="list-disc pl-4 text-[11px] leading-relaxed text-text-muted">
            {assumptions.map((k) => (
              <li key={k}>{t(`assumptions.${k}`)}</li>
            ))}
          </ul>
        </div>
      )}

      {!compact && missingInfo.length > 0 && (
        <div className="flex flex-col gap-1">
          <p className="font-mono text-[10px] uppercase tracking-label text-text-muted">
            {t("missingTitle")}
          </p>
          <ul className="list-disc pl-4 text-[11px] leading-relaxed text-text-muted">
            {missingInfo.map((k) => (
              <li key={k}>{t(`missing.${k}`)}</li>
            ))}
          </ul>
        </div>
      )}

      <p
        className="rounded-md border border-state-warning/30 bg-state-warning/5 px-3 py-2 text-[11px] leading-relaxed text-state-warning"
        data-testid="estimate-disclaimer"
      >
        {t("disclaimer")}
      </p>
    </div>
  );
}
