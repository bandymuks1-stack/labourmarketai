/**
 * Work Market Atlas — visual concept system (design brief, not assets).
 *
 * One unified visual language across every block so the map, cards, badges and
 * marketplace feel like a premium scouting / manager board — understood in one
 * second, legible on mobile cards and map clusters, working on dark and light.
 * This file is the SPEC that an icon/illustration set is built against; it
 * carries no binary assets and no external references.
 *
 * Pure data, no DB.
 */

import { WORK_MARKET_CATEGORIES } from "./categories";

/** The shared style contract every block visual must obey. */
export const ATLAS_VISUAL_STYLE = {
  feel: "premium marketplace / sports-scouting / manager-game",
  geometry: "single-weight line + one solid accent, 2px grid, rounded joints",
  legibility: "readable at 20px (map cluster) and 320px-wide mobile card",
  surfaces: "must hold on both dark and light backgrounds",
  motion: "calm; no spin/bounce; subtle enter only",
  unified: "one silhouette family across all 28 blocks",
} as const;

/** Clichés that are banned everywhere (childish / generic / off-brand). */
export const FORBIDDEN_VISUAL_CLICHES: readonly string[] = [
  "emoji",
  "clipart",
  "cartoon mascots",
  "childish rounded blobs",
  "hard-hat-only construction stereotype",
  "national flags as category icons",
  "literal money raining",
  "stock-photo people",
  "drop-shadow skeuomorphism",
  "gradient-heavy 3D render",
];

export type BlockVisualConcept = {
  /** Category slug (must match a WORK_MARKET_CATEGORIES slug). */
  slug: string;
  /** Compact glyph for nav / chips / map cluster. */
  icon: string;
  /** Richer scene for headers / empty states. */
  illustration: string;
  /** How the block reads as a marketplace mini-card. */
  miniCard: string;
  /** Map marker + cluster treatment (signal vs verified point). */
  mapMarker: string;
  /** Trust / status badge treatment. */
  badge: string;
};

/** Per-block concepts. Each reuses the category's `iconConcept` as the glyph
 *  seed and extends it into the full set. Authored for all 28 blocks. */
export const BLOCK_VISUAL_CONCEPTS: readonly BlockVisualConcept[] = WORK_MARKET_CATEGORIES.map(
  (c): BlockVisualConcept => ({
    slug: c.slug,
    icon: c.iconConcept,
    illustration: `${c.labelEn}: a calm wide scene built from the ${c.iconConcept}, one accent colour, no people stereotypes`,
    miniCard: `compact card — glyph top-left, ${c.labelEn} title, 1-line signal count, accent left-border by layer`,
    mapMarker: `signal pill (count) when unverified; only a solid pin once coordinates are verified — never a guessed marker`,
    badge: `pill badge using the glyph at 14px + status colour (ready / needs-docs / verified / review)`,
  }),
);

const CONCEPT_BY_SLUG = new Map(BLOCK_VISUAL_CONCEPTS.map((v) => [v.slug, v]));

export function visualConceptFor(slug: string): BlockVisualConcept | undefined {
  return CONCEPT_BY_SLUG.get(slug);
}

/** Layer-level marker/cluster treatments shared across blocks. */
export const LAYER_VISUALS: Record<string, string> = {
  demand: "warm accent ring; count cluster; never an exact point unless verified",
  worker_signal: "cool accent ring; grouped by city; aggregated, no personal address",
  offer: "neutral accent square; category glyph; moderation state changes opacity",
  accommodation: "roof glyph cluster; count only until verified",
  brigade: "three-figure glyph; capacity badge",
  readiness_warning: "dashed amber ring; document glyph",
  rate: "coin-over-pin glyph; shown only with real data, else 'not enough data yet'",
};
