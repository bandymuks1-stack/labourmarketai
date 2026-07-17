"use client";

import type { EstimateResult } from "@/lib/estimate/estimate";

/**
 * Presentational estimate summary VIEW — the calculated result + assumptions
 * + missing-info + the preliminary-estimate disclaimer, with every label and
 * list item passed in as an already-localized string.
 *
 * Extracted from estimate-summary.tsx (European Work & Project Calculator v1)
 * so the PUBLIC marketing calculator can reuse the identical display without a
 * useTranslations call: the marketing route group ships a minimal message
 * pick and the client-messages allowlist guard forbids non-literal namespaces
 * there, so this file deliberately contains NO i18n hook. The authenticated
 * demand flow keeps its behaviour through the EstimateSummary wrapper.
 *
 * Honesty: shows a deterministic preliminary estimate only — every line is the
 * user's own numbers run through transparent arithmetic, never a final offer.
 */
export interface EstimateSummaryViewLabels {
  readonly sectionResult: string;
  readonly labourSubtotal: string;
  readonly materials: string;
  readonly equipment: string;
  readonly transport: string;
  readonly overhead: string;
  readonly margin: string;
  readonly contingency: string;
  readonly estimatedTotal: string;
  readonly range: string;
  readonly assumptionsTitle: string;
  readonly missingTitle: string;
  readonly disclaimer: string;
}

export function EstimateSummaryView({
  result,
  assumptionItems,
  missingItems,
  labels,
  locale,
  compact = false,
}: {
  result: EstimateResult;
  /** Already-localized assumption lines. */
  assumptionItems: readonly string[];
  /** Already-localized missing-info lines. */
  missingItems: readonly string[];
  labels: EstimateSummaryViewLabels;
  /** BCP 47 tag for number formatting (active locales all qualify). */
  locale: string;
  /** Compact = read-back / review variant (smaller, no missing block). */
  compact?: boolean;
}) {
  const nf = new Intl.NumberFormat(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const money = (n: number) => `${nf.format(n)} ${result.currency}`;

  const lines = (
    [
      [labels.labourSubtotal, result.labourSubtotal],
      [labels.materials, result.materials],
      [labels.equipment, result.equipment],
      [labels.transport, result.transportAccommodation],
      [labels.overhead, result.overhead],
      [labels.margin, result.margin],
      [labels.contingency, result.contingency],
    ] as Array<[string, number]>
  ).filter(([, v]) => v > 0);

  return (
    <div className="flex flex-col gap-3" data-testid="estimate-summary">
      <p className="font-mono text-[10px] uppercase tracking-label text-brand-cyan">
        {labels.sectionResult}
      </p>
      <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1.5 rounded-md border border-ink-600 bg-ink-800/40 p-4 text-sm">
        {lines.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-text-secondary">{label}</dt>
            <dd className="text-right font-mono text-text-primary">{money(value)}</dd>
          </div>
        ))}
        <dt className="mt-1 border-t border-ink-600 pt-2 font-semibold text-text-primary">
          {labels.estimatedTotal}
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
          {labels.range}: <span className="font-mono">{money(result.low)}</span> –{" "}
          <span className="font-mono">{money(result.high)}</span>
        </p>
      )}

      {assumptionItems.length > 0 && (
        <div className="flex flex-col gap-1">
          <p className="font-mono text-[10px] uppercase tracking-label text-text-muted">
            {labels.assumptionsTitle}
          </p>
          <ul className="list-disc pl-4 text-[11px] leading-relaxed text-text-muted">
            {assumptionItems.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      )}

      {!compact && missingItems.length > 0 && (
        <div className="flex flex-col gap-1">
          <p className="font-mono text-[10px] uppercase tracking-label text-text-muted">
            {labels.missingTitle}
          </p>
          <ul className="list-disc pl-4 text-[11px] leading-relaxed text-text-muted">
            {missingItems.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      )}

      <p
        className="rounded-md border border-state-warning/30 bg-state-warning/5 px-3 py-2 text-[11px] leading-relaxed text-state-warning"
        data-testid="estimate-disclaimer"
      >
        {labels.disclaimer}
      </p>
    </div>
  );
}
