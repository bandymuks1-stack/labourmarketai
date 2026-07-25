"use server";

import "server-only";

import { getLocale, getTranslations } from "next-intl/server";

import { loadWorkerOpportunityMatches } from "@/lib/marketplace/worker-opportunities";
import type { JobRecommendation } from "@/lib/opportunities/recommendations-model";
import { buildWorkTypeLabelMap } from "@/lib/taxonomy/work-categories";
import {
  CONVERSATION_FIND_WORK_LIMIT,
  type ChatEmployerMatch,
  type FindWorkResult,
} from "./find-work-contract";

/**
 * Conversation "find work" — a THIN presentation adapter over the canonical
 * marketplace use case.
 *
 * Owner decision: docs/owner-decisions/work-journal-conversation-architecture-v1.md
 * (`CONVERSATION_AND_UI_SHARE_DOMAIN_USE_CASES`); integration record:
 * docs/handoffs/2026-07-25_864_conversation_marketplace_integration.md.
 *
 * This module does NOT load, filter, rank, score or explain anything of its
 * own. `loadWorkerOpportunityMatches` already returned rows that are:
 *   - authorized (own-data, RLS-scoped, gated board RPC),
 *   - ranked by the ONE shared §19 comparator,
 *   - limited to the display slice, and
 *   - explained by their own §19 basis (matched / total / confirmed counts).
 *
 * All this adapter does is localize those facts into chat-card strings and
 * carry the REAL demand id forward, so the chat can open the opportunity and
 * report exactly what it showed. There is no percentage computed here, no
 * aggregate score anywhere, and no invented company, need or salary: an empty
 * board yields an honest empty message and an unapplied board RPC yields an
 * honest blocked message.
 */

/** Canonical match status → the conversation's localized fit label. A label
 *  lookup, not a recomputation: `status` comes straight from the use case. */
function fitKey(status: JobRecommendation["status"]): string {
  switch (status) {
    case "strong":
      return "fitStrong";
    case "possible":
      return "fitPossible";
    case "weak":
      return "fitWeak";
    default:
      return "fitInsufficient";
  }
}

export type { ChatEmployerMatch, FindWorkResult } from "./find-work-contract";

export async function findWorkForChat(): Promise<FindWorkResult> {
  const t = await getTranslations("conversation.findWork");
  const view = await loadWorkerOpportunityMatches({
    surface: "conversation",
    limit: CONVERSATION_FIND_WORK_LIMIT,
  });

  if (view.kind !== "ready") {
    return { kind: "blocked", message: t("blockedNoWorker") };
  }
  // Honest blocked state: without the gated worker-visibility RPC there is no
  // demand data at all, so "no matches" would be a false claim.
  if (!view.capabilities.boardAvailable) {
    return { kind: "blocked", message: t("blockedNoAccess") };
  }
  if (view.matches.length === 0) {
    return { kind: "empty", message: t("emptyState") };
  }

  // The canonical §19 basis line — the SAME localized form the dashboard card
  // and the journal block render, so one demand reads identically everywhere.
  const tRec = await getTranslations("opportunities.recommendations");
  const tOpp = await getTranslations("opportunities");
  const tlm = await getTranslations("labourMarket");
  const workLabels = buildWorkTypeLabelMap(await getLocale());

  const roleLabel = (slug: string | null): string =>
    (slug && workLabels[slug]) || tOpp("fieldRoleUnknown");

  // Order is the use case's order — no sort, no slice.
  const matches: ChatEmployerMatch[] = view.matches.map((m) => {
    const reasons: string[] = [
      tRec("basisCompact", {
        matched: m.basis.matchedTotal,
        total: m.basis.needTotal,
        confirmed: m.basis.matchedConfirmed,
      }),
    ];
    const country =
      m.country && tlm.has(`countryNames.${m.country}`)
        ? (tlm(`countryNames.${m.country}`) as string)
        : m.country;
    const location = m.locationLabel ?? country ?? null;
    if (location) reasons.push(t("locationReason", { location }));
    if (m.roleSlug) reasons.push(t("roleReason", { role: roleLabel(m.roleSlug) }));

    return {
      id: m.requestId,
      name: m.companyName ?? roleLabel(m.roleSlug),
      fitLabel: t(fitKey(m.status)),
      reasons: reasons.slice(0, 3),
    };
  });

  return {
    kind: "matches",
    intro:
      matches.length === 1
        ? t("introOne")
        : t("intro", { count: matches.length }),
    matches,
  };
}
