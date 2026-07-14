import { getTranslations } from "next-intl/server";

import type { InsightExplanationV1 } from "@/lib/intelligence/explainability";
import type { InsightTrustReportV1 } from "@/lib/intelligence/trust-explainability";
import { freshnessLabel } from "@/lib/intelligence/freshness";
import type { IntelligenceTimelineV1 } from "@/lib/intelligence/timeline";
import { IntelligenceTimeline } from "./intelligence-timeline";
import { ConfidenceBadge, FreshnessNote, OriginBadge } from "./trust-badges";

/**
 * EXPLAINABILITY drawer (Contextual Intelligence UI v1) — the ONE
 * disclosure every intelligence card opens. No hidden reasoning: behind a
 * single native `<details>` (server-renderable, keyboard-accessible) it
 * answers everything the card knows —
 *
 *   meaning · why visible · data basis · window/geo/sample · origin +
 *   sources · confidence · freshness · observation references ·
 *   limitations · next action · derivation timeline
 *
 * — and for everything it does NOT know it renders an explicit honest line
 * (confidence "unknown", "no observation references yet", "timeline joins
 * after activation") instead of omitting the row. When no trust report
 * exists (V1 workspace cards) the trust rows degrade to those honest
 * unknowns rather than disappearing.
 */

export async function ExplainabilityDrawer({
  locale,
  explanation,
  report = null,
  timeline = null,
  sourceKeys = null,
  originKind,
}: {
  locale: string;
  explanation: InsightExplanationV1;
  report?: InsightTrustReportV1 | null;
  timeline?: IntelligenceTimelineV1 | null;
  /** Source keys when no report carries them (V1 cards). */
  sourceKeys?: readonly string[] | null;
  originKind: "internal" | "external" | "blended";
}) {
  const t = await getTranslations("intelligence");
  const tc = (code: string, params?: Record<string, string | number>) =>
    t(code.replace(/^intelligence\./, "") as never, params as never) as string;

  const dateFmt = new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  const fmtIso = (iso: string | null): string | null => {
    if (!iso) return null;
    const ms = Date.parse(iso);
    return Number.isFinite(ms) ? dateFmt.format(new Date(ms)) : null;
  };

  const e = explanation;
  const windowStart = fmtIso(e.window.start);
  const windowEnd = fmtIso(e.window.end);
  const keys = report?.sourceKeys ?? sourceKeys ?? [];
  const limitationCodes = [
    ...e.uncertaintyCodes,
    ...(report?.notKnownCodes ?? []),
  ];

  const DT_CLASS =
    "font-mono text-[10px] uppercase tracking-label text-text-muted";

  return (
    <details
      className="group rounded-md border border-ink-600 bg-ink-800/40"
      data-testid="intelligence-explainability-drawer"
    >
      <summary className="cursor-pointer select-none px-3 py-2 text-xs font-medium text-text-primary marker:text-text-muted">
        {t("explain.toggle")}
      </summary>
      <dl className="flex flex-col gap-2 px-3 pb-3 text-xs leading-relaxed text-text-secondary">
        <div>
          <dt className={DT_CLASS}>{t("explain.meaning")}</dt>
          <dd>{tc(e.meaningCode)}</dd>
        </div>

        {report ? (
          <div>
            <dt className={DT_CLASS}>{t("explain.whyVisible")}</dt>
            <dd>{tc(report.whyVisibleCode)}</dd>
          </div>
        ) : null}

        <div>
          <dt className={DT_CLASS}>{t("explain.dataBasis")}</dt>
          <dd>
            <ul className="list-inside list-disc">
              {e.dataBasisCodes.map((code) => (
                <li key={code}>{tc(code)}</li>
              ))}
            </ul>
          </dd>
        </div>

        <div>
          <dt className={DT_CLASS}>
            {t("explain.window")} · {t("explain.geo")} · {t("explain.sample")}
          </dt>
          <dd>
            {windowStart && windowEnd
              ? `${windowStart} – ${windowEnd}`
              : t("explain.windowNone")}
            {" · "}
            {e.geoLabel ?? t("explain.geoNone")}
            {" · "}
            {e.sampleSize !== null ? e.sampleSize : t("explain.sampleNone")}
          </dd>
        </div>

        <div>
          <dt className={DT_CLASS}>{t("explain.origin")}</dt>
          <dd className="flex flex-wrap items-center gap-2 pt-1">
            <OriginBadge originKind={originKind} />
            {keys.length > 0 ? (
              <span className="text-[11px] text-text-muted">
                {keys.map((key) => tc(`intelligence.sources.key.${key}`)).join(" · ")}
              </span>
            ) : null}
          </dd>
        </div>

        {/* Confidence + freshness — honest "unknown" rows when no report. */}
        <div>
          <dt className={DT_CLASS}>{t("explain.confidence")}</dt>
          <dd className="pt-1">
            <ConfidenceBadge level={report?.confidence ?? "unknown"} />
          </dd>
        </div>
        <div>
          <dt className={DT_CLASS}>{t("explain.freshness")}</dt>
          <dd>
            <FreshnessNote
              label={report?.freshnessLabel ?? freshnessLabel(null)}
            />
          </dd>
        </div>

        <div>
          <dt className={DT_CLASS}>{t("explain.observations")}</dt>
          <dd data-testid="drawer-observation-refs">
            {report && report.observationRefs.length > 0 ? (
              <ul className="list-inside list-disc break-all font-mono text-[11px]">
                {report.observationRefs.map((ref) => (
                  <li key={ref}>{ref}</li>
                ))}
              </ul>
            ) : (
              tc("intelligence.trust.notKnown.noObservationStore")
            )}
          </dd>
        </div>

        <div>
          <dt className={DT_CLASS}>{t("drawer.limitations")}</dt>
          <dd data-testid="drawer-limitations">
            {limitationCodes.length > 0 ? (
              <ul className="list-inside list-disc">
                {limitationCodes.map((code) => (
                  <li key={code}>{tc(code)}</li>
                ))}
              </ul>
            ) : (
              t("explain.none")
            )}
          </dd>
        </div>

        <div>
          <dt className={DT_CLASS}>{t("explain.nextAction")}</dt>
          <dd>{e.nextActionCode ? tc(e.nextActionCode) : t("explain.none")}</dd>
        </div>

        <div>
          <dt className={DT_CLASS}>{t("timeline.title")}</dt>
          <dd className="pt-1" data-testid="drawer-timeline">
            {timeline ? (
              <IntelligenceTimeline timeline={timeline} locale={locale} />
            ) : (
              <span className="text-[11px] text-text-muted">
                {t("drawer.timelineUnavailable")}
              </span>
            )}
          </dd>
        </div>
      </dl>
    </details>
  );
}
