"use server";

import "server-only";

import { getTranslations } from "next-intl/server";

import { loadWorkerOpportunityMatches } from "@/lib/marketplace/worker-opportunities";
import type { DiscoveryFilterState } from "@/lib/opportunities/discovery-filters";
import { deriveFitBand } from "@/lib/opportunities/fit-band";
import {
  bandOfStatus,
  countByBand,
  isDiscoveryOnly,
  nonEmptyBands,
} from "@/lib/opportunities/opportunities-view";
import {
  CONVERSATION_FIND_WORK_LIMIT,
  CONVERSATION_FIND_WORK_EXTERNAL_LIMIT,
  type FindWorkResult,
} from "./find-work-contract";

/**
 * Conversation "find work" — a THIN INTENT ADAPTER over the canonical
 * marketplace use case.
 *
 * Owner decision: docs/owner-decisions/work-journal-conversation-architecture-v1.md
 * (`CONVERSATION_AND_UI_SHARE_DOMAIN_USE_CASES`); integration record:
 * docs/handoffs/2026-07-25_864_conversation_marketplace_integration.md.
 *
 * It answers exactly one question: **is there an answer worth opening the
 * panel for, and how do I say so in ONE sentence?** The rows themselves
 * travel through `loadOpportunitiesResultAction` to the panel, from the SAME
 * use case this function calls — one data flow, read once by the surface
 * that renders; the destination (`/dashboard/opportunities`) holds every row
 * with its WHY.
 *
 * It still decides nothing: no loading, filtering, ranking, scoring or
 * explaining of its own — it COUNTS the panel's rows BY FIT BAND, the band
 * the ONE engine's verdict already implies (`deriveFitBand`, #1689 defect
 * H), so a found posting is never announced as a suitable one. The sentence
 * is one readback: the total, the non-empty bands with their counts, and
 * where the best and the rest are. An empty board yields an honest empty
 * message and an unapplied board RPC yields an honest blocked message —
 * those two remain DISTINCT, because "nothing matched" and "there is no
 * demand data at all" are different answers to a person.
 */
export type { FindWorkResult } from "./find-work-contract";

export async function findWorkForChat(
  /**
   * Canonical discovery filters (W4). The AI reads them out of the person's own
   * sentence and passes them straight through; this adapter still decides
   * nothing — the use case applies them inside the ONE ranking path.
   */
  filters?: DiscoveryFilterState,
): Promise<FindWorkResult> {
  const t = await getTranslations("conversation.findWork");
  const view = await loadWorkerOpportunityMatches({
    surface: "conversation",
    limit: CONVERSATION_FIND_WORK_LIMIT,
    filters,
  });

  if (view.kind !== "ready") {
    return { kind: "blocked", message: t("blockedNoWorker") };
  }
  // Honest blocked state: without the gated worker-visibility RPC there is no
  // PLATFORM demand data. External public-source ads read from their own
  // store, so they still count — "blocked" is only the answer when NOTHING
  // can be shown.
  //
  // The external rows the panel will render are its own display slice of the
  // SAME cards — a slice, never a filter: nothing is dropped or re-selected
  // here, the rows the panel renders are exactly this slice.
  const externalRows = view.externalCards.slice(
    0,
    CONVERSATION_FIND_WORK_EXTERNAL_LIMIT,
  );
  const platformRows = view.capabilities.boardAvailable ? view.matches : [];
  if (!view.capabilities.boardAvailable && externalRows.length === 0) {
    return { kind: "blocked", message: t("blockedNoAccess") };
  }
  if (platformRows.length === 0 && externalRows.length === 0) {
    return { kind: "empty", message: t("emptyState") };
  }

  // Every row banded by the ONE engine's verdict: an external card through
  // its full match (a conflict only on the engine's own word), a platform
  // recommendation through its status — the same derivation the panel and
  // the destination apply, so the three surfaces can never disagree about
  // which band a row is in.
  const banded = [
    ...platformRows.map((m) => ({ band: bandOfStatus(m.status) })),
    ...externalRows.map((c) => ({ band: deriveFitBand(c.match).band })),
  ];
  const counts = countByBand(banded);
  const bands = nonEmptyBands(counts)
    .map((b) => t(`band.${b}` as never, { count: counts[b] } as never))
    .join(", ");
  const total = banded.length;

  // ONE sentence — the count and where the answer lives. Discovery-only
  // (nothing the engine assessed as a fit) is said as such; the production
  // sentence "Radau 2 tinkamų variantų" over an `insufficient_data` "Senior
  // AI Engineer" was exactly the collapse this keeps apart.
  return {
    kind: "matches",
    count: total,
    intro: isDiscoveryOnly(banded)
      ? t("readbackDiscoveryOnly", { total, bands })
      : t("readback", { total, bands }),
  };
}
