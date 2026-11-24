/**
 * Work Market Atlas — public assembly + lookup API.
 *
 * One import surface for the whole atlas: the 28 work/market blocks, the
 * action/identity model, the map layers, eligibility and visibility policies.
 * UI and data layers read from here instead of reaching into the parts.
 *
 * Pure, deterministic, no DB, no external references.
 */

import {
  WORK_MARKET_CATEGORIES,
  type WorkMarketCategory,
} from "./categories";
import {
  WORK_MARKET_ACTIONS,
  ACTION_META,
  resolveActionsForIdentity,
  type WorkMarketAction,
} from "./actions";
import { MAP_LAYER_KINDS, type MapLayerKind } from "./map-layers";

export * from "./categories";
export * from "./actions";
export * from "./map-layers";
export * from "./eligibility";
export * from "./visibility";

/** Expected count of high-level atlas blocks (guard-pinned). */
export const ATLAS_BLOCK_COUNT = 28;

/** All categories, ordered as authored. */
export function allCategories(): readonly WorkMarketCategory[] {
  return WORK_MARKET_CATEGORIES;
}

const BY_SLUG = new Map(WORK_MARKET_CATEGORIES.map((c) => [c.slug, c]));

export function categoryBySlug(slug: string): WorkMarketCategory | undefined {
  return BY_SLUG.get(slug);
}

/** Categories that can appear on the market map (as signals). */
export function mapEligibleCategories(): WorkMarketCategory[] {
  return WORK_MARKET_CATEGORIES.filter((c) => c.mapEligible);
}

/** Categories that support a given action. */
export function categoriesByAction(action: WorkMarketAction): WorkMarketCategory[] {
  return WORK_MARKET_CATEGORIES.filter((c) => c.actions.includes(action));
}

/** Categories a base identity can act in (person/company). */
export function categoriesForIdentity(
  identity: "person" | "company",
): WorkMarketCategory[] {
  return WORK_MARKET_CATEGORIES.filter(
    (c) =>
      c.identity === "both" ||
      c.identity === identity ||
      // a "company"-only or "person"-only block still appears for the matching
      // identity; "both" appears for everyone.
      false,
  );
}

/** Categories whose work may need a document / legal path for cross-border. */
export function categoriesNeedingDocuments(): WorkMarketCategory[] {
  return WORK_MARKET_CATEGORIES.filter((c) => c.needsDocuments);
}

/** Categories that can carry a real rate signal. */
export function rateSignalCategories(): WorkMarketCategory[] {
  return WORK_MARKET_CATEGORIES.filter((c) => c.rateSignalCapable);
}

/** Find categories related to a given skill slug (recognition → atlas bridge). */
export function categoriesForSkill(skillSlug: string): WorkMarketCategory[] {
  return WORK_MARKET_CATEGORIES.filter((c) => c.relatedSkills.includes(skillSlug));
}

/** The actions a concrete identity can take inside a category (honest CTAs). */
export function actionsFor(
  identity: "person" | "company",
  category: WorkMarketCategory,
): WorkMarketAction[] {
  return resolveActionsForIdentity(identity, category.actions);
}

/** Total subcategory count across the atlas — a quick breadth signal. */
export function totalSubcategoryCount(): number {
  return WORK_MARKET_CATEGORIES.reduce((n, c) => n + c.subcategories.length, 0);
}

export { WORK_MARKET_ACTIONS, ACTION_META, MAP_LAYER_KINDS };
export type { MapLayerKind };
