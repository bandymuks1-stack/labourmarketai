"use server";

import "server-only";

import { getTranslations } from "next-intl/server";

import { loadWorkerOpportunityMatches } from "@/lib/marketplace/worker-opportunities";
import type { DiscoveryFilterState } from "@/lib/opportunities/discovery-filters";
import { deriveFitBand, isAssessedFit } from "@/lib/opportunities/fit-band";
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
 * WHAT IT USED TO DO, AND WHY IT STOPPED. This module used to localize every
 * matched row into chat-card strings and carry a label bag for the interest
 * control, because the chat THREAD rendered its own job cards. That made two
 * renderers and two action surfaces for one answer — the duplication the
 * owner's net-complexity rule forbids. The Context Panel's `opportunities`
 * result is now the single renderer and the single place a person acts, so
 * this adapter no longer produces rows at all.
 *
 * It now answers exactly one question: **is there an answer worth opening the
 * panel for, and how do I say so in one sentence?** The rows themselves travel
 * through `loadOpportunitiesResultAction` to the panel, from the SAME use case
 * this function calls — one data flow, read once by the surface that renders.
 *
 * It still decides nothing: no loading, filtering, ranking, scoring or
 * explaining of its own — it COUNTS the panel's external rows by the fit band
 * the ONE engine's verdict already implies (`deriveFitBand`, #1689 defect H),
 * so a found posting is never announced as a suitable one. An empty board
 * yields an honest empty message and an
 * unapplied board RPC yields an honest blocked message — those two remain
 * DISTINCT, because "nothing matched" and "there is no demand data at all" are
 * different answers to a person.
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
  // SAME cards, and each is counted BY BAND (#1689, defect H): a posting the
  // engine assessed as strong/possible is a fit; one it could not assess, or
  // assessed as missing a requirement / in conflict, is a FOUND posting —
  // said so, never called suitable. The production sentence "Radau 2
  // tinkamų variantų" over an `insufficient_data` "Senior AI Engineer" was
  // exactly that collapse.
  const externalRows = view.externalCards.slice(
    0,
    CONVERSATION_FIND_WORK_EXTERNAL_LIMIT,
  );
  // A COUNT by band — not a filter: nothing is dropped or re-selected here,
  // the rows the panel renders are exactly the slice above.
  let externalAssessed = 0;
  for (const c of externalRows) {
    if (isAssessedFit(deriveFitBand(c.match).band)) externalAssessed += 1;
  }
  const externalDiscovered = externalRows.length - externalAssessed;
  const externalShown = externalRows.length;
  if (!view.capabilities.boardAvailable && externalShown === 0) {
    return { kind: "blocked", message: t("blockedNoAccess") };
  }
  const platformShown = view.capabilities.boardAvailable
    ? view.matches.length
    : 0;
  if (platformShown === 0 && externalShown === 0) {
    return { kind: "empty", message: t("emptyState") };
  }

  // The COUNT and one sentence — that is the whole of the chat's job now. The
  // panel renders the rows, so nothing here is localized per row and no id is
  // carried: the panel reads them from the same use case and reports what IT
  // actually rendered (rendering is the read event, canonical decision §10).
  // External ads get their own sentence: "public ads from official sources"
  // is a different claim than "matches on this platform", and folding the two
  // into one number would blur who is offering what.
  // The external sentence is TWO sentences, by band: assessed fits and found
  // postings are different claims, and a person hears the difference.
  const introParts: string[] = [];
  if (platformShown === 1) introParts.push(t("introOne"));
  else if (platformShown > 1) introParts.push(t("intro", { count: platformShown }));
  if (externalAssessed > 0) {
    introParts.push(t("introExternalAssessed", { count: externalAssessed }));
  }
  if (externalDiscovered > 0) {
    introParts.push(t("introExternalDiscovered", { count: externalDiscovered }));
  }
  return {
    kind: "matches",
    count: platformShown + externalShown,
    intro: introParts.join(" "),
  };
}
