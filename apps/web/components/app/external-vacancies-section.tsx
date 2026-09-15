import type { ReactNode } from "react";
import Link from "next/link";

/**
 * EXTERNAL VACANCIES — public-source job ads on the ONE worker destination.
 *
 * Two exports, one vocabulary:
 *
 *   `ExternalVacanciesSection` — the SUPPLY line: how many public ads were
 *   retrieved and how many the first view shows, where they come from, how
 *   old that supply is (freshness notice for every non-current state), and
 *   the one real door to the rest (`?view=all`). It renders no rows.
 *
 *   `ExternalOpportunityRow` — ONE public ad as a row inside a fit band of
 *   the destination (#1689, defect H). The rows used to live in this
 *   section under their own three headings ("best / possible / explore"),
 *   which folded MISSING REQUIREMENT, CONFLICT and NOT ASSESSED into one
 *   "explore" pile beside a second, platform-only list. Now the engine's
 *   verdict decides the band, the destination composes ONE band order over
 *   platform and public rows alike, and this file only knows how a public
 *   ad honestly looks inside it.
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
 *   - pay renders exactly as published (currency preserved, never
 *     converted; the unit is named as "not stated" when the source did not
 *     state one);
 *   - matching gaps render as UNKNOWNS. An ad that does not state a language
 *     requirement is not "no language required".
 */
import { ExternalApplyConfirm } from "@/components/app/external-vacancy-confirm";
import { MatchTierExplanation } from "@/components/app/match-tier-explanation";
import { OpportunityDetailsDisclosure } from "@/components/app/opportunity-details-disclosure";
import { FitBandChip } from "@/components/app/opportunities/fit-band-chip";
import { Card } from "@/components/ui/Card";
import type { ExternalOpportunityCardV1 } from "@/lib/opportunities/external-vacancies";
import type { FitBand } from "@/lib/opportunities/fit-band";
import {
  freshnessNeedsNotice,
  type SourceFreshnessV1,
} from "@/lib/vacancy-sources/source-freshness";

export interface ExternalVacanciesLabels {
  readonly sectionTitle: string;
  readonly sectionNote: string;
  /** Worker-facing sentence for a non-current supply state. */
  readonly freshnessNotice: (freshness: SourceFreshnessV1) => string;
  /** Compressed-view header count, e.g. "top 2 of 20" (used only when the
   *  first view is capped; the full-count header renders otherwise). */
  readonly shownOfTotal?: (shown: number, total: number) => string;
}

/**
 * The compressed first view over the ALREADY-ranked ads (owner rule
 * 2026-08-29): the top N of the list, or every loaded ad when `initialCount`
 * is null (any refined / expanded view). Presentation only — retrieval,
 * ranking and the loaded set are untouched. ONE rule, shared by the supply
 * line (which states the count) and the destination (which renders exactly
 * these rows inside the bands), so the two can never disagree.
 */
export function selectExternalFirstView(
  cards: readonly ExternalOpportunityCardV1[],
  initialCount: number | null,
): { readonly shown: readonly ExternalOpportunityCardV1[]; readonly capped: boolean } {
  const capped = initialCount != null && cards.length > initialCount;
  const shown = capped ? cards.slice(0, initialCount) : cards;
  return { shown, capped };
}

export function ExternalVacanciesSection({
  cards,
  labels,
  freshness,
  initialCount = null,
  expansion = null,
}: {
  readonly cards: readonly ExternalOpportunityCardV1[];
  readonly labels: ExternalVacanciesLabels;
  readonly freshness: SourceFreshnessV1;
  /** See `selectExternalFirstView`. */
  readonly initialCount?: number | null;
  /** The show-all link the compressed view renders (href + label). */
  readonly expansion?: { readonly href: string; readonly label: string } | null;
}): ReactNode {
  if (cards.length === 0) return null;

  const { shown, capped } = selectExternalFirstView(cards, initialCount);

  // Every state except `current` is stated plainly. The platform does not
  // control these vacancies and cannot promise one is still open, so supply
  // that has not been re-confirmed is never presented as though it had been.
  const notice = freshnessNeedsNotice(freshness.state)
    ? labels.freshnessNotice(freshness)
    : null;

  return (
    <section
      className="flex flex-col gap-2 rounded-lg border border-ink-600 bg-ink-800/30 px-4 py-3"
      data-testid="opportunities-external"
      aria-label={labels.sectionTitle}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span className="font-mono text-meta uppercase tracking-label text-text-muted">
          {labels.sectionTitle} ·{" "}
          {capped && labels.shownOfTotal
            ? labels.shownOfTotal(shown.length, cards.length)
            : cards.length}
        </span>
        {/* Compressed-view door: the withheld ads are one real link away —
            same page, ?view=all. Never a dead control, never a hidden list. */}
        {capped && expansion ? (
          <Link
            href={expansion.href}
            data-testid="opportunities-external-show-all"
            className="inline-flex min-h-11 items-center text-support font-medium text-brand-blue hover:text-brand-champagne"
          >
            {expansion.label} →
          </Link>
        ) : null}
      </div>
      <p className="text-meta leading-relaxed text-text-muted">{labels.sectionNote}</p>
      {notice ? (
        <p
          className="rounded-md border border-ink-500 bg-ink-900/40 p-3 text-basis leading-relaxed text-text-secondary"
          data-testid="external-freshness-notice"
          data-freshness-state={freshness.state}
          role="status"
        >
          {notice}
        </p>
      ) : null}
    </section>
  );
}

export interface ExternalOpportunityRowLabels {
  /** The band word for the chip (STRONG · POSSIBLE · …). */
  readonly bandLabel: string;
  /** "Why: " prefix of the explanation line. */
  readonly whyLabel: string;
  /** Engine code → words, or null when no copy exists (the code is then
   *  dropped, never shown raw). */
  readonly whyText: (code: string) => string | null;
  /** The line for a row whose band has no code to explain it. */
  readonly whyFallback: string;
  readonly openOriginal: string;
  /** V8 addendum §4 — the confirm step before leaving for the publisher. */
  readonly confirmNotice: string;
  readonly confirmContinue: string;
  readonly confirmDismiss: string;
  readonly noApplicationRoute: string;
  readonly publishedOn: (iso: string) => string;
  readonly positionsLabel: (n: number) => string;
  readonly payAsPublished: string;
  /** The source stated an amount but no unit. */
  readonly payUnitNotStated: string;
  readonly payNotStated: string;
  readonly gapLabel: (gap: string) => string;
  readonly gapsTitle: string;
  /** Same labels object the platform rows pass to MatchTierExplanation. */
  readonly tierLabels: Parameters<typeof MatchTierExplanation>[0]["labels"];
  readonly attributionText: (code: string) => string;
  readonly originNoteText: (code: string) => string;
  readonly managementNoteText: (code: string) => string;
  readonly skillLabel: (slug: string) => string;
  readonly detailsShow: string;
  readonly detailsHide: string;
}

/**
 * One public ad inside a band: title · employer/source · place · pay as
 * published · band chip · WHY · the original advertisement behind one
 * confirm. Everything that is not needed to decide "is this worth opening"
 * (skills, the per-criterion tiers, what the ad left unstated, the two
 * provenance notes) sits behind the same details disclosure the platform
 * rows use.
 */
export function ExternalOpportunityRow({
  card,
  band,
  whyCodes,
  labels,
}: {
  readonly card: ExternalOpportunityCardV1;
  readonly band: FitBand;
  /** The engine's own codes for THIS worker against THIS ad, in the order
   *  the destination decided (gaps → unknowns). */
  readonly whyCodes: readonly string[];
  readonly labels: ExternalOpportunityRowLabels;
}): ReactNode {
  const { key, view, capabilities, match, matchingGaps } = card;
  const why = whyCodes
    .map(labels.whyText)
    .filter((s): s is string => s !== null);
  const payAmount =
    view.payCurrency && (view.payMin !== null || view.payMax !== null)
      ? `${[view.payMin, view.payMax]
          .filter((v): v is number => v !== null)
          .join("–")} ${view.payCurrency}`
      : null;

  return (
    <li data-testid="external-vacancy-card" data-band={band} className="min-w-0">
      <Card compact variant="interactive" className="flex flex-col gap-2">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <p className="min-w-0 font-display text-card-title font-bold text-text-primary">
            {view.title}
          </p>
          <FitBandChip band={band} label={labels.bandLabel} />
        </div>

        {/* Organization / source · place · published. */}
        <p className="text-basis text-text-secondary">
          {[view.employerName, view.city, view.country].filter(Boolean).join(" · ")}
          {view.positions !== null ? ` · ${labels.positionsLabel(view.positions)}` : ""}
          {" · "}
          {labels.publishedOn(view.publishedAt.slice(0, 10))}
        </p>

        {/* Pay EXACTLY as published — currency preserved, unit named or
            honestly "not stated". Absent = absent. */}
        <p className="text-basis text-text-secondary" data-testid="external-vacancy-pay">
          {payAmount ? (
            <>
              {labels.payAsPublished}: <span className="tabular-nums">{payAmount}</span>
              <span className="text-text-muted"> · {labels.payUnitNotStated}</span>
            </>
          ) : (
            <span className="text-text-muted">{labels.payNotStated}</span>
          )}
        </p>

        {/* WHY the row sits in its band — the engine's codes, in words. */}
        <p className="text-basis text-text-secondary" data-testid="external-vacancy-why">
          <span className="font-medium text-text-primary">{labels.whyLabel} </span>
          {why.length > 0 ? why.join(" · ") : labels.whyFallback}
        </p>

        {/* Provenance — always rendered, attribution first. */}
        <p className="text-meta text-text-muted" data-testid="external-vacancy-attribution">
          {labels.attributionText(view.provenance.attributionCode)}
        </p>

        <OpportunityDetailsDisclosure
          showLabel={labels.detailsShow}
          hideLabel={labels.detailsHide}
          testId={`external-vacancy-details-${key}`}
        >
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
              <span className="text-meta text-text-muted">{labels.gapsTitle}:</span>
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

          <p className="text-meta text-text-muted">
            {labels.originNoteText(view.provenance.originNoteCode)}{" "}
            {labels.managementNoteText(view.provenance.managementNoteCode)}
          </p>
        </OpportunityDetailsDisclosure>

        {capabilities.canApplyInternally ? null : view.provenance.applicationRoute ===
            "source_original" && view.provenance.applicationUrl ? (
          /* Owner decision (V8 addendum §4): inform → confirm → open. The real
             anchor (same href/target/rel) renders only after the person
             confirms leaving for the publisher's portal. */
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
          <p className="text-meta text-text-muted">{labels.noApplicationRoute}</p>
        )}
      </Card>
    </li>
  );
}
