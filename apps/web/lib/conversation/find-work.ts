"use server";

import "server-only";

import { loadWorkerOpportunityMatches } from "@/lib/marketplace/worker-opportunities";
import type { DiscoveryFilterState } from "@/lib/opportunities/discovery-filters";
import {
  CONVERSATION_FIND_WORK_LIMIT,
  type FindWorkResult,
} from "./find-work-contract";
import { findWorkReadback } from "./find-work-readback";

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
  const view = await loadWorkerOpportunityMatches({
    surface: "conversation",
    limit: CONVERSATION_FIND_WORK_LIMIT,
    filters,
  });
  return findWorkReadback(view);
}
