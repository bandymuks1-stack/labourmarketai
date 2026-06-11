/**
 * Sector registry — the explicit, sector-AGNOSTIC backbone of skill
 * recognition.
 *
 * History: the recognition lexicon and seed taxonomy were construction-only,
 * which made construction the de-facto system default. This module makes the
 * multi-sector model explicit so construction is ONE sector among many, never
 * the default. Recognition, profile evidence, and journal suggestions reason
 * over `SectorKey`, not over a hardcoded "is this construction?" assumption.
 *
 * Honesty: listing a sector here does NOT claim the catalogue has verified
 * skills for it. Sectors without a seeded skill taxonomy still produce honest
 * label-only suggestions (no fake taxonomy, no auto-verified skill — §7).
 *
 * Adding a sector is a one-row change here + (optionally) tagging lexicon rows
 * with the new key. No component edits, no construction special-case.
 */

export type SectorKey =
  | "construction"
  | "transport_logistics"
  | "retail_sales"
  | "hospitality_food"
  | "care_health"
  | "office_admin"
  | "it_software"
  | "education"
  | "cleaning_facility"
  | "agriculture"
  | "other";

export interface SectorDef {
  readonly key: SectorKey;
  readonly nameLt: string;
  readonly nameEn: string;
}

/** Every sector the platform recognises today. Order is display order; it
 *  carries NO precedence meaning for recognition. Construction is a normal
 *  row — deliberately not first-and-special. */
export const SECTORS: readonly SectorDef[] = [
  { key: "construction", nameLt: "Statyba", nameEn: "Construction" },
  {
    key: "transport_logistics",
    nameLt: "Transportas ir logistika",
    nameEn: "Transport & logistics",
  },
  { key: "retail_sales", nameLt: "Prekyba", nameEn: "Retail & sales" },
  {
    key: "hospitality_food",
    nameLt: "Apgyvendinimas ir maitinimas",
    nameEn: "Hospitality & food",
  },
  { key: "care_health", nameLt: "Priežiūra ir sveikata", nameEn: "Care & health" },
  { key: "office_admin", nameLt: "Biuras ir administravimas", nameEn: "Office & admin" },
  { key: "it_software", nameLt: "IT ir programinė įranga", nameEn: "IT & software" },
  { key: "education", nameLt: "Švietimas ir mokymai", nameEn: "Education & training" },
  {
    key: "cleaning_facility",
    nameLt: "Valymas ir patalpų priežiūra",
    nameEn: "Cleaning & facilities",
  },
  { key: "agriculture", nameLt: "Žemės ūkis", nameEn: "Agriculture" },
  { key: "other", nameLt: "Kita", nameEn: "Other" },
];

/** The fallback sector for honest day-work the lexicon recognises but the
 *  taxonomy does not model. It is NOT "construction" — there is no
 *  construction default anywhere in the system. */
export const DEFAULT_SECTOR: SectorKey = "other";

const SECTOR_KEY_SET = new Set<string>(SECTORS.map((s) => s.key));

export function sectorKeys(): SectorKey[] {
  return SECTORS.map((s) => s.key);
}

export function isKnownSector(key: string): key is SectorKey {
  return SECTOR_KEY_SET.has(key);
}

export function sectorDef(key: SectorKey): SectorDef | undefined {
  return SECTORS.find((s) => s.key === key);
}
