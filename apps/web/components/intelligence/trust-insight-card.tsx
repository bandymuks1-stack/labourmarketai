import Link from "next/link";
import { getTranslations } from "next-intl/server";

import type { TrustCardV1 } from "@/lib/intelligence/trust-card-model";
import { deriveSourceLifecycleState } from "@/lib/intelligence/source-lifecycle";
import { getSourceProfile } from "@/lib/intelligence/source-governance";
import { INTEL_CHIP_CLASS, INTEL_TRUST_STATUS_TONE } from "./badge-styles";
import { ExplainabilityDrawer } from "./explainability-drawer";
import { SourceStatusBadge } from "./source-status-badge";
import { ConfidenceBadge, ConflictBadge, FreshnessNote, OriginBadge } from "./trust-badges";

/**
 * TRUST INSIGHT CARD (Contextual Intelligence UI v1) — the ONE card engine
 * every contextual intelligence surface renders (worker hub, company hub,
 * workforce planning, opportunities). Rendering is driven entirely by a
 * TrustCardV1 built by lib/intelligence/trust-card-model.ts — the component
 * computes nothing and invents nothing (§18).
 *
 * Honesty contract:
 *  - ready    → headline + derived confidence + freshness + origin/source
 *               badges + the full explainability drawer;
 *  - conflict → everything above PLUS the loud conflict block showing BOTH
 *               values side by side — never an average;
 *  - unavailable → the four honest answers (why / what is required / which
 *               sources are off, with their real lifecycle badges / what
 *               happens after activation). Never "coming soon", never a
 *               placeholder number.
 */

export async function TrustInsightCard({
  card,
  locale,
  linkToWorkspace = false,
}: {
  card: TrustCardV1;
  locale: string;
  /** Render the "open intelligence workspace" link (hub surfaces). */
  linkToWorkspace?: boolean;
}) {
  const t = await getTranslations("intelligence");
  const tc = (code: string, params?: Record<string, string | number>) =>
    t(code.replace(/^intelligence\./, "") as never, params as never) as string;

  const report = card.report;
  const conflict =
    report?.conflict?.kind === "conflict" ? report.conflict : null;

  return (
    <section
      className="flex flex-col gap-3 rounded-md border border-ink-600 bg-ink-800/30 p-4"
      data-testid={`trust-card-${card.id}`}
      data-status={card.status}
      data-kind={card.kind}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-mono text-meta uppercase tracking-label text-text-muted">
          {tc(card.titleCode)}
        </span>
        {card.status === "conflict" ? (
          <ConflictBadge />
        ) : (
          <span
            className={`${INTEL_CHIP_CLASS} ${INTEL_TRUST_STATUS_TONE[card.status]}`}
          >
            {t(`trustCard.status.${card.status}`)}
          </span>
        )}
      </div>

      {report && card.headlineCode ? (
        <>
          <p className="text-sm font-semibold text-text-primary">
            {tc(card.headlineCode, { ...card.headlineParams })}
          </p>

          <div className="flex flex-wrap items-center gap-2">
            <ConfidenceBadge level={report.confidence} />
            <OriginBadge originKind={report.explanation.originKind} />
            <FreshnessNote label={report.freshnessLabel} />
          </div>

          {/* Conflict block (§7): BOTH values visible, never averaged. */}
          {conflict ? (
            <div
              className="flex flex-col gap-1 rounded-md border border-state-danger/40 bg-state-danger/5 px-3 py-2 text-xs text-text-secondary"
              data-testid="trust-card-conflict"
            >
              <p className="font-medium text-state-danger">
                {t("trustCard.conflict.title")} ·{" "}
                {t("trustCard.conflict.divergence", {
                  pct: conflict.divergencePct,
                })}
              </p>
              <p className="font-mono text-meta">
                {tc(`intelligence.sources.key.${conflict.a.sourceKey}`)}:{" "}
                {conflict.a.valueNumeric} {conflict.a.unit}
              </p>
              <p className="font-mono text-meta">
                {tc(`intelligence.sources.key.${conflict.b.sourceKey}`)}:{" "}
                {conflict.b.valueNumeric} {conflict.b.unit}
              </p>
              <p className="text-meta text-text-muted">
                {t("conflict.note")}
              </p>
            </div>
          ) : null}

          <ExplainabilityDrawer
            locale={locale}
            explanation={report.explanation}
            report={report}
            timeline={card.timeline}
            originKind={report.explanation.originKind}
          />
        </>
      ) : null}

      {card.unavailable ? (
        <div
          className="flex flex-col gap-2 text-xs leading-relaxed text-text-secondary"
          data-testid="trust-card-unavailable"
        >
          {/* WHY there is no figure here (§5 — never "coming soon"). */}
          <p>{tc(card.unavailable.reasonCode)}</p>
          <p>
            <span className="font-mono text-meta uppercase tracking-label text-text-muted">
              {t("trustCard.unavailable.requirementTitle")}:
            </span>{" "}
            {tc(card.unavailable.requirementCode)}
          </p>
          {card.unavailable.disabledSourceKeys.length > 0 ? (
            <div className="flex flex-col gap-1">
              <span className="font-mono text-meta uppercase tracking-label text-text-muted">
                {t("trustCard.unavailable.sourcesTitle")}:
              </span>
              <ul className="flex flex-col gap-1">
                {card.unavailable.disabledSourceKeys.map((key) => {
                  const profile = getSourceProfile(key);
                  return profile ? (
                    <li
                      key={key}
                      className="flex flex-wrap items-center gap-2"
                      data-source-key={key}
                    >
                      <SourceStatusBadge
                        state={deriveSourceLifecycleState(profile)}
                      />
                      <span className="text-meta text-text-muted">
                        {tc(profile.displayNameCode)}
                      </span>
                    </li>
                  ) : null;
                })}
              </ul>
            </div>
          ) : null}
          <p className="text-meta text-text-muted">
            {tc(card.unavailable.afterActivationCode)}
          </p>
        </div>
      ) : null}

      {linkToWorkspace ? (
        <Link
          href={`/${locale}/dashboard/intelligence`}
          className="inline-flex w-fit items-center text-xs font-medium text-brand-blue hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue"
          data-testid={`trust-card-${card.id}-link`}
        >
          {t("contextual.link")} →
        </Link>
      ) : null}
    </section>
  );
}
