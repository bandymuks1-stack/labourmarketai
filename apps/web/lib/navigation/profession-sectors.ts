/**
 * WHICH SECTOR A CATALOGUE PROFESSION BELONGS TO — for the public "browse by
 * profession" carousel (owner P0 2026-11-12). PURE.
 *
 * Nothing new is invented here. The professions are the catalogue's
 * (`messages/{locale}/professions.json`, doctrine §10); the sectors are the
 * ONE sector list (`lib/taxonomy/work-categories.ts`). A profession that is
 * also a work type takes that work type's sector; the catalogue professions
 * the work-type list does not name are placed by the small table below.
 *
 * `lib/guards/browse-carousels.test.ts` fails when a catalogue profession has
 * no sector, so a new profession is classified the day it is added — and no
 * single trade can ever be the whole row (no tiler hardcode).
 */

import professionCatalogue from "../../messages/en/professions.json";
import { WORK_CATEGORIES, type WorkCategoryKey } from "@/lib/taxonomy/work-categories";
import type { WorkAreaIconKey } from "@/lib/navigation/work-area-icon-key";

export const CATALOGUE_PROFESSION_SLUGS: readonly string[] = Object.keys(
  professionCatalogue as Record<string, string>,
).sort();

const FROM_WORK_TYPES = new Map<string, WorkCategoryKey>(
  WORK_CATEGORIES.flatMap((c) => c.types.map((t) => [t.slug, c.key] as const)),
);

/** Catalogue professions the work-type list does not name. */
const PLACED: Readonly<Record<string, WorkCategoryKey>> = {
  auto_mechanic: "transport",
  baker: "hospitality_food",
  barista: "hospitality_food",
  builder: "construction",
  caregiver: "care_support",
  driver: "transport",
  drywaller: "construction",
  event_organizer: "hospitality_food",
  foreman: "construction",
  furniture_assembler: "manufacturing",
  gardener: "agriculture",
  handyman: "construction",
  laundry_worker: "cleaning_facility",
  rebar_worker: "construction",
  safety_specialist: "construction",
  site_engineer: "construction",
  site_manager: "construction",
};

export function professionSector(slug: string): WorkCategoryKey | null {
  return FROM_WORK_TYPES.get(slug) ?? PLACED[slug] ?? null;
}

export const SECTOR_ICONS: Readonly<Record<WorkCategoryKey, WorkAreaIconKey>> = {
  construction: "hardHat",
  manufacturing: "factory",
  warehouse_logistics: "warehouse",
  transport: "truck",
  agriculture: "sprout",
  cleaning_facility: "sparkles",
  hospitality_food: "utensils",
  care_support: "heartHandshake",
  machinery_operators: "tractor",
  office_business: "building",
  retail_sales: "shoppingBag",
  it_digital: "code",
  education_training: "graduationCap",
  beauty_personal: "scissors",
  other: "layers",
};

export type ProfessionCard = {
  readonly slug: string;
  readonly sector: WorkCategoryKey;
  /** The public board filtered to this profession — a real, linkable URL. */
  readonly href: string;
};

/**
 * Every catalogue profession as a card, ROUND-ROBIN across sectors: the first
 * cards a visitor sees are one from each sector, not fifteen construction
 * trades in a row.
 */
export function professionCards(): readonly ProfessionCard[] {
  const bySector = new Map<WorkCategoryKey, string[]>();
  for (const slug of CATALOGUE_PROFESSION_SLUGS) {
    const sector = professionSector(slug);
    if (!sector) continue;
    bySector.set(sector, [...(bySector.get(sector) ?? []), slug]);
  }
  const order = WORK_CATEGORIES.map((c) => c.key).filter((k) => bySector.has(k));
  const out: ProfessionCard[] = [];
  for (let round = 0; out.length < CATALOGUE_PROFESSION_SLUGS.length; round++) {
    let added = false;
    for (const sector of order) {
      const slug = bySector.get(sector)?.[round];
      if (!slug) continue;
      out.push({ slug, sector, href: `/jobs?profession=${slug}` });
      added = true;
    }
    if (!added) break;
  }
  return out;
}
