import type { ReactNode } from "react";

/**
 * EXTERNAL VACANCIES SECTION — public-source job ads on the ONE worker board.
 *
 * Renders ONLY when at least one external ad exists. While supply is zero
 * (source not yet activated) or the store is unapplied, the board shows
 * nothing here — an empty "external ads" shell would be dead UI promising a
 * feature that is not on.
 *
 * Honesty rules carried from the presentation contract:
 *   - attribution is ALWAYS rendered (the publisher asked, our policy
 *     requires it, the boundary guard pins it);
 *   - the provenance note says this is someone's public ad, not a
 *     labourmarket.ai posting;
 *   - the ONLY action on an unclaimed ad is the publisher's original
 *     advertisement. No platform apply, no interest signal, no booking —
 *     the employer never agreed to receive any of that, and a control that
 *     delivers nowhere is a fake control;
 *   - pay renders exactly as published (currency preserved, never converted);
 *   - matching gaps render as UNKNOWNS. An ad that does not state a language
 *     requirement is not "no language required".
 */
import { ExternalApplyConfirm } from "@/components/app/external-apply-confirm";
import { MatchTierExplanation } from "@/components/app/match-tier-explanation";
import type { ExternalOpportunityCardV1 } from "@/lib/opportunities/external-vacancies";
import {
  freshnessNeedsNotice,
  type SourceFreshnessV1,
} from "@/lib/vacancy-sources/source-freshness";

export interface ExternalVacanciesLabels {
  readonly sectionTitle: string;
  readonly sectionNote: string;
  /** Worker-facing sentence for a non-current supply state. */
  readonly freshnessNotice: (freshness: SourceFreshnessV1) => string;
  readonly openOriginal: string;
  /** V8 addendum §4 — the confirm step before leaving for the publisher. */
  readonly confirmNotice: string;
  readonly confirmContinue: string;
  readonly confirmDismiss: string;
  readonly noApplicationRoute: string;
  readonly publishedOn: (iso: string) => string;
  readonly positionsLabel: (n: number) => string;
  readonly payAsPublished: string;
  readonly gapLabel: (gap: string) => string;
  readonly gapsTitle: string;
  /** Same labels object the platform cards pass to MatchTierExplanation. */
  readonly tierLabels: Parameters<typeof MatchTierExplanation>[0]["labels"];
  readonly attributionText: (code: string) => string;
  readonly originNoteText: (code: string) => string;
  readonly managementNoteText: (code: string) => string;
  readonly skillLabel: (slug: string) => string;
}

export function ExternalVacanciesSection({
  cards,
  labels,
  freshness,
}: {
  readonly cards: readonly ExternalOpportunityCardV1[];
  readonly labels: ExternalVacanciesLabels;
  readonly freshness: SourceFreshnessV1;
}): ReactNode {
  if (cards.length === 0) return null;

  // Every state except `current` is stated plainly. The platform does not
  // control these vacancies and cannot promise one is still open, so supply
  // that has not been re-confirmed is never presented as though it had been.
  const notice = freshnessNeedsNotice(freshness.state)
    ? labels.freshnessNotice(freshness)
    : null;

  return (
    <section
      className="flex flex-col gap-3 rounded-lg border border-ink-600 bg-ink-800/30 p-4"
      data-testid="opportunities-external"
      aria-label={labels.sectionTitle}
    >
      <div className="flex flex-col gap-1">
        <span className="font-mono text-meta uppercase tracking-label text-text-muted">
          {labels.sectionTitle} · {cards.length}
        </span>
        <p className="text-meta leading-relaxed text-text-muted">
          {labels.sectionNote}
        </p>
      </div>

      {notice ? (
        <p
          className="rounded-md border border-ink-500 bg-ink-900/40 p-3 text-meta leading-relaxed text-text-secondary"
          data-testid="external-freshness-notice"
          data-freshness-state={freshness.state}
          role="status"
        >
          {notice}
        </p>
      ) : null}

      <ul className="flex flex-col gap-4">
        {cards.map(({ key, view, capabilities, match, matchingGaps }) => (
          <li
            key={key}
            className="flex flex-col gap-2 rounded-md border border-ink-500 p-3"
            data-testid="external-vacancy-card"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="text-sm font-semibold text-text-primary">
                {view.title}
              </span>
              <span className="text-meta text-text-muted">
                {labels.publishedOn(view.publishedAt.slice(0, 10))}
              </span>
            </div>

            <p className="text-xs text-text-secondary">
              {[view.employerName, view.city, view.country]
                .filter(Boolean)
                .join(" · ")}
              {view.positions !== null
                ? ` · ${labels.positionsLabel(view.positions)}`
                : ""}
            </p>

            {/* Pay EXACTLY as published — currency preserved. Absent = absent. */}
            {view.payCurrency && (view.payMin !== null || view.payMax !== null) ? (
              <p className="text-xs text-text-secondary">
                {labels.payAsPublished}:{" "}
                <span className="tabular-nums">
                  {[view.payMin, view.payMax]
                    .filter((v): v is number => v !== null)
                    .join("–")}{" "}
                  {view.payCurrency}
                </span>
              </p>
            ) : null}

            {view.skillSlugs.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {view.skillSlugs.map((slug) => (
                  <span
                    key={slug}
                    className="rounded-md border border-ink-500 px-2 py-0.5 text-meta text-text-secondary"
                  >
                    {labels.skillLabel(slug)}
                  </span>
                ))}
              </div>
            ) : null}

            <MatchTierExplanation
              blocking={match.blocking}
              strengths={match.strengths}
              negotiables={match.negotiables}
              missingFacts={match.missingFacts}
              labels={labels.tierLabels}
              testId={`external-match-${key}`}
            />

            {/* What this ad simply does not state — unknowns, not failures. */}
            {matchingGaps.length > 0 ? (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-meta text-text-muted">
                  {labels.gapsTitle}:
                </span>
                {matchingGaps.map((gap) => (
                  <span
                    key={gap}
                    className="rounded-md border border-ink-500/60 px-2 py-0.5 text-meta text-text-muted"
                  >
                    {labels.gapLabel(gap)}
                  </span>
                ))}
              </div>
            ) : null}

            {/* Provenance — always rendered, attribution first. */}
            <div className="flex flex-col gap-0.5 border-t border-ink-600/60 pt-2">
              <p className="text-meta text-text-muted">
                {labels.attributionText(view.provenance.attributionCode)}
              </p>
              <p className="text-meta text-text-muted">
                {labels.originNoteText(view.provenance.originNoteCode)}{" "}
                {labels.managementNoteText(view.provenance.managementNoteCode)}
              </p>
            </div>

            {capabilities.canApplyInternally ? null : view.provenance
                .applicationRoute === "source_original" &&
              view.provenance.applicationUrl ? (
              /* Owner decision (V8 addendum §4): inform → confirm → open.
                 The real anchor (same href/target/rel) renders only after
                 the person confirms leaving for the publisher's portal. */
              <ExternalApplyConfirm
                url={view.provenance.applicationUrl}
                openLabel={labels.openOriginal}
                noticeText={labels.confirmNotice}
                continueLabel={labels.confirmContinue}
                dismissLabel={labels.confirmDismiss}
                anchorTestId="external-vacancy-original-link"
                variant="card"
              />
            ) : (
              <p className="text-meta text-text-muted">
                {labels.noApplicationRoute}
              </p>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
