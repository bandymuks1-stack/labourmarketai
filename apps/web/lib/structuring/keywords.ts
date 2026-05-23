/**
 * Keyword dictionaries for the rule-based structuring parser. This is NOT AI
 * extraction — it is honest pattern matching. Every suggestion produced by the
 * parsers in this folder must be confirmed by the user before it becomes a
 * persisted fact (PLATFORM_DOCTRINE §7 — no fake AI claim).
 *
 * Slugs match the taxonomy in `messages/{locale}/skill-names.json` and
 * `messages/{locale}/professions.json` so the UI can render localized names
 * without duplicating copy.
 */

/** Lowercase substrings that map a free-text mention to a canonical skill slug. */
export const SKILL_HINTS_LT: { slug: string; needles: string[] }[] = [
  { slug: "tiling", needles: ["plytel", "klijav"] },
  { slug: "drywall", needles: ["gipso", "gipskart"] },
  { slug: "ceiling-systems", needles: ["lub"] },
  { slug: "partition-walls", needles: ["pertvar"] },
  { slug: "plastering", needles: ["tinkav", "tinkov"] },
  { slug: "skim-coating", needles: ["glaist"] },
  { slug: "painting", needles: ["daž", "dazym"] },
  { slug: "flooring", needles: ["grind"] },
  { slug: "floor-screeding", needles: ["išlygin", "isl ygin"] },
  { slug: "plumbing", needles: ["santechn"] },
  { slug: "electrical-install", needles: ["elektr"] },
  { slug: "carpentry", needles: ["stali", "medien"] },
  { slug: "insulation", needles: ["šiltin", "siltin"] },
  { slug: "waterproofing", needles: ["hidroizoli"] },
  { slug: "bricklaying", needles: ["mūr", "mur "] },
  { slug: "concrete-pouring", needles: ["bet liej", "betonav"] },
  { slug: "rebar-cutting", needles: ["armatūr", "armatur"] },
  { slug: "welding-blueprint", needles: ["suvirin"] },
  { slug: "scaffolding", needles: ["pastol"] },
  { slug: "demolition", needles: ["griovi", "ardym"] },
  { slug: "site-cleaning", needles: ["valym"] },
  { slug: "team-coordination", needles: ["komand", "brigad", "vadovav"] },
  { slug: "site-management", needles: ["statyb vadov", "objekt vadov"] },
  { slug: "quality-control", needles: ["kokyb"] },
];

/** Lowercase substrings that map a free-text mention to a profession slug. */
export const PROFESSION_HINTS_LT: { slug: string; needles: string[] }[] = [
  { slug: "tiler", needles: ["plytel"] },
  { slug: "drywaller", needles: ["gipso", "gipskart"] },
  { slug: "painter", needles: ["daž", "dazym"] },
  { slug: "plumber", needles: ["santechn"] },
  { slug: "electrician", needles: ["elektr"] },
  { slug: "carpenter", needles: ["stali", "medien"] },
  { slug: "mason", needles: ["mūr", "mur "] },
  { slug: "concrete_worker", needles: ["beton"] },
  { slug: "welder", needles: ["suvirin"] },
  { slug: "rebar_worker", needles: ["armatūr", "armatur"] },
  { slug: "roofer", needles: ["stog"] },
  { slug: "foreman", needles: ["brigadin", "vadovav"] },
  { slug: "site_manager", needles: ["statyb vadov", "objekt vadov"] },
  { slug: "general_laborer", needles: ["bendr darb", "pagalbin"] },
  { slug: "crane_operator", needles: ["kran"] },
  { slug: "heavy_equipment_operator", needles: ["ekskavator", "buldoz", "krautuv"] },
];

/** Higher-level work directions surfaced as a separate suggestion bucket. */
export const WORK_DIRECTION_HINTS_LT: { slug: string; needles: string[] }[] = [
  { slug: "tiler", needles: ["vidaus apdail", "apdail"] },
  { slug: "concrete_worker", needles: ["betonav", "konstruk"] },
  { slug: "electrician", needles: ["elektros darb", "instaliac"] },
  { slug: "plumber", needles: ["santechnik darb"] },
  { slug: "carpenter", needles: ["medienos darb", "stalystės"] },
];
