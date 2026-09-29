"use server";

import "server-only";

import { getLocale } from "next-intl/server";

import { loadWorkerOpportunityBoard } from "@/lib/marketplace/worker-opportunities";
import { buildWorkTypeLabelMap } from "@/lib/taxonomy/work-categories";

/**
 * "PARODYK IŠSAUGOTUS DARBUS" (Chat ↔ visual loop walk, production
 * 2026-09-29). The person saved a job on the opportunities page (the private
 * bookmark, "IŠSAUGOTOS GALIMYBĖS · 1") and the chat, asked for it, ran a new
 * search. The saved list the page renders comes from the ONE board read —
 * saved platform needs by id and saved public ads as live previews; this is
 * that read, handed to the chat. Nothing is written.
 */
export type SavedOpportunityItem = {
  readonly kind: "need" | "vacancy";
  readonly id: string;
  readonly label: string;
};

export type SavedOpportunitiesForChat =
  | { readonly kind: "ok"; readonly items: readonly SavedOpportunityItem[] }
  | { readonly kind: "unavailable" }
  | { readonly kind: "no-worker" };

export async function loadSavedOpportunitiesForChat(): Promise<SavedOpportunitiesForChat> {
  try {
    const board = await loadWorkerOpportunityBoard("conversation");
    if (board.kind !== "ready") return { kind: "no-worker" };
    if (!board.capabilities.savedAvailable) return { kind: "unavailable" };
    const saved = new Set(board.savedRequestIds);
    // The role is a work-type SLUG ("mason"); the page names it through the
    // work-type labels — the chat says the same word (walk 2026-09-29).
    const workLabels = buildWorkTypeLabelMap(await getLocale());
    const needs: SavedOpportunityItem[] = board.opportunities
      .filter((o) => saved.has(o.need.id))
      .map((o) => ({
        kind: "need",
        id: o.need.id,
        label: (o.need.roleText && workLabels[o.need.roleText]) || o.need.roleText || o.need.id,
      }));
    const vacancies: SavedOpportunityItem[] = board.savedVacancies.map((v) => ({
      kind: "vacancy",
      id: v.id,
      label: v.title || v.occupation || v.id,
    }));
    return { kind: "ok", items: [...needs, ...vacancies] };
  } catch {
    return { kind: "unavailable" };
  }
}
