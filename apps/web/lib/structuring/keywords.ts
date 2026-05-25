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

/** Cross-domain per-fragment activity lexicon (not just construction).
 *
 *  Each row carries:
 *  - `slug`: maps to professions.json when the activity has a canonical entry
 *    (e.g. roofer). May be `null` when the activity is honest day-work that
 *    the taxonomy doesn't model yet (e.g. cashier, driver) — the UI shows the
 *    LT `label` directly as a review-only free-text suggestion (no fake
 *    taxonomy invention, no auto-verified skill — see §7 of the doctrine).
 *  - `label`: short LT human-readable name for the work direction.
 *  - `needles`: lowercase substrings that trigger the match per fragment.
 *
 *  Ordering matters — earlier entries win for ambiguous fragments. */
export const ACTIVITY_HINTS_LT: {
  slug: string | null;
  label: string;
  needles: string[];
}[] = [
  // ── Specific-before-generic ────────────────────────────────────────────
  // Order matters: the activity matcher picks the FIRST row whose needle
  // appears in the fragment, so narrower carpentry/structural variants of
  // a "stog…" / generic phrase must sit ABOVE the wider entries below.
  {
    // "Stogo karkasas" — roof framing (carpentry-side, not the membrane).
    // Kept distinct from generic "Stogo dengimas" because the worker is
    // building the timber structure, not laying the cover.
    slug: "carpenter",
    label: "Stogo karkaso darbai",
    needles: ["stogo karkas", "stog karkas", "karkas stog"],
  },
  {
    // Door + window installation. Each LT form is listed explicitly to keep
    // the needles long enough that they don't false-match unrelated words.
    slug: "carpenter",
    label: "Durų ir langų montavimas",
    needles: [
      "duris", "durų", "durims", "durimis", "duryse",
      "langus", "langų", "langams", "langais", "languose",
      "stačiau duris", "stačiau langus",
      "dėjau duris", "dėjau langus",
      "montav duris", "montav langus",
    ],
  },
  {
    // Project preparation / design — not a trade slug; surface as label-only
    // so the worker can confirm it without the platform pretending there's
    // a verified "project_manager" skill behind it.
    slug: null,
    label: "Projekto rengimas",
    needles: [
      "projekt reng",
      "rengiau projekt",
      "projekto rengim",
      "rengiu projekt",
      "projekt parengim",
    ],
  },
  // ── Construction trades ────────────────────────────────────────────────
  {
    slug: "roofer",
    label: "Stogo dengimas",
    needles: ["stog", "dengiau stog", "dengti stog"],
  },
  { slug: "tiler", label: "Plytelių klojimas", needles: ["plytel", "klijav"] },
  {
    slug: "drywaller",
    label: "Gipso kartono montavimas",
    needles: ["gipso", "gipskart"],
  },
  { slug: "painter", label: "Dažymas", needles: ["daž", "dazym"] },
  { slug: "plumber", label: "Santechnika", needles: ["santechn"] },
  { slug: "electrician", label: "Elektra", needles: ["elektr"] },
  {
    slug: "carpenter",
    label: "Staliaus darbai",
    needles: ["stali", "medien"],
  },
  { slug: "mason", label: "Mūrijimas", needles: ["mūr", "mur "] },
  {
    slug: "concrete_worker",
    label: "Betonavimas",
    needles: ["beton liej", "betonav"],
  },
  { slug: "welder", label: "Suvirinimas", needles: ["suvirin"] },
  {
    slug: "rebar_worker",
    label: "Armatūros darbai",
    needles: ["armatūr", "armatur"],
  },
  // Adjacent day-work that the construction taxonomy doesn't model — label
  // only, no fake slug so it stays a review-only suggestion.
  {
    slug: null,
    label: "Pavežėjimas / vairavimas",
    needles: [
      "pavežėj",
      "pavezej",
      "pavežti",
      "pavezti",
      "vežiau",
      "veziau",
      "vairav",
      "ride-hail",
      "driver",
      "driving",
    ],
  },
  {
    slug: null,
    label: "Kasininko / parduotuvės darbas",
    needles: [
      "kasinink",
      "kasoje",
      "kasa ",
      "parduotuv",
      "cashier",
      "retail",
      "store ",
    ],
  },
  {
    slug: null,
    label: "Klientų aptarnavimas",
    needles: ["klient aptarn", "aptarnav"],
  },
];

/** English aliases for the activity lexicon. The matcher in the extractor
 *  lowercases the haystack so adding EN substrings to `needles` is enough
 *  for bilingual entries — kept here for clarity. */
export const ACTIVITY_HINTS_EN: typeof ACTIVITY_HINTS_LT = [
  {
    slug: "roofer",
    label: "Roofing",
    needles: ["roof", "roofing", "covering roof"],
  },
  {
    slug: null,
    label: "Driver / ride-hailing",
    needles: ["driver", "driving", "ride-hail", "transport"],
  },
  {
    slug: null,
    label: "Cashier / retail",
    needles: ["cashier", "store", "retail", "shop"],
  },
];
