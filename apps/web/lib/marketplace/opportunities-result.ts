import "server-only";

import { getTranslations } from "next-intl/server";

import type { DiscoveryFilterState } from "@/lib/opportunities/discovery-filters";
import { deriveFitBand } from "@/lib/opportunities/fit-band";
import { resolveInterestLabels } from "@/lib/opportunities/interest-labels";
import {
  OPPORTUNITIES_RESULT_EXTERNAL_LIMIT,
  type OpportunitiesResultExternalRow,
  type OpportunitiesResultView,
} from "./worker-opportunities-contract";
import {
  loadWorkerOpportunityMatches,
  type MarketplaceMatchesView,
} from "./worker-opportunities";

/**
 * The opportunities RESULT projection — ONE place for both of its readers:
 *
 *   - `loadOpportunitiesResultAction` (the conversation's Context Panel), which
 *     stays argument-free so a browser client can never widen its own read;
 *   - the `work.find` capability (MCP / external assistants), which has no
 *     panel to open and therefore needs the rows themselves — the SAME rows,
 *     the SAME engine verdicts, never a second projection.
 *
 * Deliberately NOT a `"use server"` module: every async export of such a file
 * is a client-callable action, and this one takes a limit and filters.
 *
 * It enters the SAME canonical use case every other marketplace surface
 * enters. No second engine, no second ranking, no second notion of "new".
 * The three cases stay DISTINCT: `no-worker`, `unavailable` (the gated demand
 * source is not applied — no data at all) and `ready` (an empty `matches` is
 * an honest empty: the read worked and found nothing).
 */
export async function loadOpportunitiesResult(input: {
  readonly limit: number;
  readonly filters?: DiscoveryFilterState;
}): Promise<OpportunitiesResultView> {
  const view = await loadWorkerOpportunityMatches({
    // The conversation window — the surface tag this result actually is.
    surface: "conversation",
    limit: input.limit,
    filters: input.filters,
  });
  return projectOpportunitiesResult(view);
}

/** The projection itself, over an already-loaded view — so a caller that also
 *  needs the chat's sentence (`work.find`) reads the board ONCE. */
export async function projectOpportunitiesResult(
  view: MarketplaceMatchesView,
): Promise<OpportunitiesResultView> {
  if (view.kind !== "ready") return { kind: "no-worker" };
  if (!view.capabilities.boardAvailable) return { kind: "unavailable" };

  return {
    kind: "ready",
    // Projected field by field: the recommendation model may grow without
    // widening what crosses this boundary.
    matches: view.matches.map((m) => ({
      requestId: m.requestId,
      roleSlug: m.roleSlug,
      country: m.country,
      locationLabel: m.locationLabel,
      startPeriod: m.startPeriod,
      basis: {
        matchedTotal: m.basis.matchedTotal,
        needTotal: m.basis.needTotal,
        matchedConfirmed: m.basis.matchedConfirmed,
      },
      salary: m.salary,
      matchedSkillSlugs: m.matchedSkillSlugs,
      missingSkillSlugs: m.missingSkillSlugs,
      needSkillsUnconfirmed: m.needSkillsUnconfirmed,
      isNew: m.isNew,
      companyName: m.companyName,
      fitStatus: m.status,
      // The worker's own signal, from the same view — never guessed, and
      // absent-key means "no signal", not "not interested".
      interestStatus: view.interestStatusByRequestId[m.requestId] ?? null,
    })),
    totalRecommendable: view.totalRecommendable,
    newCount: view.newCount,
    seenDegraded: view.capabilities.seenReadDegraded,
    // ONE resolver for this copy, server-side, shared with the job context.
    // Absent table ⇒ null ⇒ the panel renders read-only rows instead of a
    // button that cannot write.
    interestLabels: view.capabilities.interestAvailable
      ? await resolveInterestLabels()
      : null,
    // External public-source ads — the SAME rows the board section renders,
    // projected to the compact row contract. Provenance travels with every
    // row; the original ad is the only action. Attribution is resolved HERE,
    // server-side: the client bundle has no `vacancySources` namespace, so a
    // code crossing this boundary renders raw (observed in production
    // 2026-08-10).
    external: await projectExternalVacancies(view),
    totalExternal: view.totalExternal,
  };
}

/**
 * The external public-source ads of a loaded view, projected to the compact
 * row contract. Exported on its own because the ads are read from their own
 * store: they stay real even when the gated platform-demand source is not
 * readable, and the capability door (`work.find`) must not drop them then.
 */
export async function projectExternalVacancies(
  view: Extract<MarketplaceMatchesView, { kind: "ready" }>,
): Promise<OpportunitiesResultExternalRow[]> {
  const cards = view.externalCards.slice(
    0,
    OPPORTUNITIES_RESULT_EXTERNAL_LIMIT,
  );
  if (cards.length === 0) return [];
  const tRoot = await getTranslations();
  return cards.map((c) => {
    // The engine's verdict travels WITH the row (#1689, defect H). It used
    // to be dropped here, so the panel could only render every external
    // ad as a plain row under a heading that called it suitable — an
    // `insufficient_data` "Senior AI Engineer" included. The band is a
    // pure derivation of that verdict, never a second judgement.
    const fit = deriveFitBand(c.match);
    return {
      key: c.key,
      title: c.view.title,
      employerName: c.view.employerName,
      city: c.view.city,
      country: c.view.country,
      publishedAt: c.view.publishedAt.slice(0, 10),
      originalUrl:
        c.view.provenance.applicationRoute === "source_original"
          ? c.view.provenance.applicationUrl
          : null,
      attributionText: tRoot(c.view.provenance.attributionCode as never),
      fitStatus: fit.status,
      band: fit.band,
      gapCodes: fit.why.gapCodes,
      missingDataCodes: fit.why.missingDataCodes,
    };
  });
}
