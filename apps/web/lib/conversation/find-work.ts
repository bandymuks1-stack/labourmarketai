"use server";

import "server-only";

import { getTranslations } from "next-intl/server";

import { loadWorkerOpportunities } from "@/lib/opportunities/load-worker-opportunities";
import { compareMatches, type MatchStatus } from "@/lib/market/match-v1";

/**
 * Conversation "find work" — REAL employer/opportunity matches for the chat.
 *
 * Delegates to the canonical `loadWorkerOpportunities()` (own-data, RLS-scoped,
 * SECURITY DEFINER board RPC over verified companies' `customer_requests`) and
 * maps the top matches into chat cards. It NEVER fabricates a company or a need:
 * an empty board yields an honest empty message; an unapplied board RPC yields
 * an honest blocked message. All fit reasons carry their §19 basis (X of Y
 * skills, Z confirmed) — never a bare score, never a global person rating.
 */

export type ChatEmployerMatch = {
  id: string;
  name: string;
  fitLabel: string;
  reasons: string[];
};

export type FindWorkResult =
  | { kind: "matches"; intro: string; matches: ChatEmployerMatch[] }
  | { kind: "empty"; message: string }
  | { kind: "blocked"; message: string };

function fitKey(status: MatchStatus): string {
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

export async function findWorkForChat(): Promise<FindWorkResult> {
  const t = await getTranslations("conversation.findWork");
  const res = await loadWorkerOpportunities();

  if (res.kind === "no-worker") {
    return { kind: "blocked", message: t("blockedNoWorker") };
  }
  if (res.needsDataAccess) {
    return { kind: "blocked", message: t("blockedNoAccess") };
  }
  if (res.opportunities.length === 0) {
    return { kind: "empty", message: t("emptyState") };
  }

  const top = [...res.opportunities]
    .sort((a, b) => compareMatches(a.match, b.match))
    .slice(0, 3);

  const matches: ChatEmployerMatch[] = top.map((card, i) => {
    const need = card.need;
    const m = card.match;
    const reasons: string[] = [];
    if (m.skillFit) {
      reasons.push(
        t("skillBasis", {
          pct: m.skillFit.pct,
          matched: m.skillFit.matchedTotal,
          total: m.skillFit.needTotal,
          confirmed: m.skillFit.matchedConfirmed,
        }),
      );
    }
    const location = need.locationLabel ?? need.country ?? null;
    if (location) reasons.push(t("locationReason", { location }));
    if (need.roleText) reasons.push(t("roleReason", { role: need.roleText }));

    const name =
      need.companyName ??
      (need.roleText ? need.roleText.replace(/[_-]+/g, " ") : t("fitPossible"));

    return {
      id: `${i}`,
      name,
      fitLabel: t(fitKey(m.status)),
      reasons: reasons.slice(0, 3),
    };
  });

  return {
    kind: "matches",
    intro: matches.length === 1 ? t("introOne") : t("intro", { count: matches.length }),
    matches,
  };
}
