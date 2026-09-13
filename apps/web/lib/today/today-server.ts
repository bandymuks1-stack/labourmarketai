import "server-only";

import { cache } from "react";

import { getSessionProfile } from "@/lib/auth/session-profile";
import { getPrimaryProfessionSlug, getWorkerCoreRow } from "@/lib/data/worker-core";
import { deriveGrowthReading, type GrowthReading } from "@/lib/journal/growth-reading";
import type { WorkIntelligence } from "@/lib/journal/work-intelligence";
import { loadOwnWorkIntelligence } from "@/lib/journal/work-intelligence-read";
import { loadOpportunitiesResultAction } from "@/lib/marketplace/worker-opportunities-actions";
import type { OpportunitiesResultView } from "@/lib/marketplace/worker-opportunities-contract";
import { getWorkerPlayerCard } from "@/lib/player-card/player-card";
import { getWorkerCard } from "@/lib/worker/work-card";
import { deriveWorkCardState, type WorkCardDerived } from "@/lib/worker/work-card-state";

/**
 * ŠIANDIEN — the server reads behind the worker's home, in THREE independent
 * pieces so the page can stream (the #1011 lesson: the slowest worker read
 * must never hold the whole surface behind the route's loading skeleton):
 *
 *   head          who · profession · the one next action
 *                 ← session profile + the ONE canonical player card +
 *                   the work-card read model (`getWorkerCard`) through the
 *                   ONE work-card engine (`deriveWorkCardState`)
 *   work          today · this week · open items · one growth line
 *                 ← `loadOwnWorkIntelligence` (the journal's ONE reader) +
 *                   `deriveGrowthReading` over the same model
 *   opportunities one opportunity line
 *                 ← `loadOpportunitiesResultAction` — the SAME projection
 *                   the conversation's result renders, no second query
 *
 * Every read degrades to `null` (UNKNOWN). Nothing here derives a figure of
 * its own; the pure model (`today-model.ts`) decides what the screen says.
 *
 * This is a plain `server-only` module, NOT a `"use server"` action file —
 * it exports readers for server components, never an endpoint.
 */

export type TodayHead = {
  readonly displayName: string | null;
  readonly professionSlug: string | null;
  readonly workCard: WorkCardDerived | null;
};

export const loadTodayHead = cache(async (): Promise<TodayHead> => {
  const session = await getSessionProfile();
  const displayName = session.profile?.full_name?.trim() || null;
  try {
    const [card, worker] = await Promise.all([getWorkerPlayerCard(), getWorkerCoreRow()]);
    if (!card) return { displayName, professionSlug: null, workCard: null };
    const data = await getWorkerCard({
      workerId: worker?.id ?? null,
      name: displayName ?? "",
      // `getWorkerCard` reads this for PRESENCE only (`hasProfession`); the
      // human label is resolved by the screen from the professions catalogue.
      professionName: card.professionSlug,
      skillsCount: card.skillsDeclared,
      evidenceCount: card.evidenceEntries,
    });
    return {
      displayName: displayName ?? card.displayName,
      professionSlug: card.professionSlug,
      workCard: deriveWorkCardState(data.signals, Date.now()),
    };
  } catch {
    // The person is still greeted; the next action is honestly unknown.
    return { displayName, professionSlug: null, workCard: null };
  }
});

/** ONE journal read per request, shared by the header's state line and the
 *  work section (both stream separately but never read twice). */
export const loadTodayWorkIntelligence = cache(async (): Promise<WorkIntelligence | null> => {
  try {
    return await loadOwnWorkIntelligence({ focus: "today" });
  } catch {
    return null;
  }
});

export const loadTodayGrowth = cache(async (): Promise<GrowthReading | null> => {
  const wi = await loadTodayWorkIntelligence();
  if (!wi) return null;
  try {
    const primaryProfessionSlug = await getPrimaryProfessionSlug().catch(() => null);
    return deriveGrowthReading(wi, { primaryProfessionSlug });
  } catch {
    return null;
  }
});

export const loadTodayOpportunities = cache(async (): Promise<OpportunitiesResultView | null> => {
  try {
    return await loadOpportunitiesResultAction();
  } catch {
    return null;
  }
});
