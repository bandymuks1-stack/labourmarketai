/**
 * Keyword dictionaries for the rule-based structuring parser. This is NOT AI
 * extraction — it is honest pattern matching. Every suggestion produced by the
 * parsers in this folder must be confirmed by the user before it becomes a
 * persisted fact (PLATFORM_DOCTRINE §7 — no fake AI claim).
 *
 * Slugs match the taxonomy in `messages/{locale}/skill-names.json` and
 * `messages/{locale}/professions.json` so the UI can render localized names
 * without duplicating copy.
 *
 * Sector awareness: activity rows carry a `sector` (see ./sectors). Construction
 * is one sector among many — NOT the default. The lexicon recognises non-
 * construction day-work (transport, retail, hospitality, care, office, IT,
 * education, cleaning, agriculture) and surfaces those as honest label-only
 * suggestions when the catalogue has no verified skill for them.
 */

import type { SectorKey } from "./sectors";

/** Lowercase substrings that map a free-text mention to a canonical skill slug.
 *
 *  RU (2026-06-12): Russian needles live in the SAME rows — the matcher
 *  lowercases the haystack and does substring containment, so Cyrillic
 *  needles ride the existing mechanism (one detection path, same canonical
 *  slugs — no parallel RU table, mirroring how EN needles were added). RU
 *  needles use stems of the inflected forms a worker actually writes
 *  («укладывал плитку», «штукатурил») and avoid stems that collide with
 *  unrelated common words (e.g. «кран» also means a water tap — the crane
 *  needle is «крановщик»). */
export const SKILL_HINTS_LT: { slug: string; needles: string[] }[] = [
  { slug: "tiling", needles: ["plytel", "klijav", "плитк", "плиточ"] },
  { slug: "drywall", needles: ["gipso", "gipskart", "гипсокартон", "гкл"] },
  { slug: "ceiling-systems", needles: ["lub", "потолок", "потолк"] },
  { slug: "partition-walls", needles: ["pertvar", "перегородк"] },
  { slug: "plastering", needles: ["tinkav", "tinkov", "штукатур"] },
  { slug: "skim-coating", needles: ["glaist", "шпаклев", "шпаклёв", "шпатлев"] },
  { slug: "painting", needles: ["daž", "dazym", "красил", "покраск", "маляр", "окраш"] },
  { slug: "flooring", needles: ["grind", "ламинат", "паркет", "напольн"] },
  { slug: "floor-screeding", needles: ["išlygin", "isl ygin", "стяжк"] },
  { slug: "plumbing", needles: ["santechn", "сантехник"] },
  { slug: "electrical-install", needles: ["elektr", "электр"] },
  { slug: "carpentry", needles: ["stali", "medien", "столярн", "плотник", "плотниц"] },
  { slug: "insulation", needles: ["šiltin", "siltin", "утепл", "теплоизоляц"] },
  { slug: "waterproofing", needles: ["hidroizoli", "гидроизоляц"] },
  { slug: "bricklaying", needles: ["mūr", "mur ", "кладк", "кирпич"] },
  { slug: "concrete-pouring", needles: ["bet liej", "betonav", "бетонир", "заливал бетон", "заливка бетон"] },
  { slug: "rebar-cutting", needles: ["armatūr", "armatur", "арматур"] },
  { slug: "welding-blueprint", needles: ["suvirin", "сварк", "сварщик", "сваривал"] },
  { slug: "scaffolding", needles: ["pastol", "подмост", "строительные леса", "строительных лесов"] },
  { slug: "demolition", needles: ["griovi", "ardym", "демонтаж", "снос "] },
  { slug: "site-cleaning", needles: ["valym", "уборк"] },
  { slug: "team-coordination", needles: ["komand", "brigad", "vadovav", "бригад"] },
  { slug: "site-management", needles: ["statyb vadov", "objekt vadov", "прораб"] },
  { slug: "quality-control", needles: ["kokyb", "качеств"] },
  // v1 construction work recognition — additional real-journal phrases,
  // mapped to existing skill-names.json slugs (no new taxonomy).
  { slug: "earthworks", needles: ["kasiau", "kasim", "iškas", "kasė", "smėl", "smel", "копал", "котлован", "транше", "землян"] },
  { slug: "wallpapering", needles: ["tapet", "обои", "обоев", "поклейк"] },
  { slug: "timber-framing", needles: ["karkas", "sij", "gegn", "apkal", "каркас", "стропил"] },
  { slug: "formwork", needles: ["klojin", "опалубк"] },
  { slug: "concrete-pouring", needles: ["sąram", "saram"] },
  { slug: "blueprint-reading", needles: ["brėžin", "brezin", "pagal projekt", "projekto skaitym", "чертеж", "чертёж", "по проекту"] },
  { slug: "general-labour", needles: ["darbo paruoš", "darbo pasiruoš", "подсобн", "разнорабоч"] },
];

/** Lowercase substrings that map a free-text mention to a profession slug.
 *  RU needles ride the same rows (see SKILL_HINTS_LT note). */
export const PROFESSION_HINTS_LT: { slug: string; needles: string[] }[] = [
  { slug: "tiler", needles: ["plytel", "плитк", "плиточ"] },
  { slug: "drywaller", needles: ["gipso", "gipskart", "гипсокартон", "гкл"] },
  { slug: "painter", needles: ["daž", "dazym", "красил", "покраск", "маляр"] },
  { slug: "plumber", needles: ["santechn", "сантехник"] },
  { slug: "electrician", needles: ["elektr", "электр"] },
  { slug: "carpenter", needles: ["stali", "medien", "плотник", "столяр"] },
  { slug: "mason", needles: ["mūr", "mur ", "каменщик", "кладк", "кирпич"] },
  { slug: "concrete_worker", needles: ["beton", "бетон"] },
  { slug: "welder", needles: ["suvirin", "сварк", "сварщик", "сваривал"] },
  { slug: "rebar_worker", needles: ["armatūr", "armatur", "арматур"] },
  { slug: "roofer", needles: ["stog", "крыш", "кровл", "кровел"] },
  { slug: "foreman", needles: ["brigadin", "vadovav", "бригадир"] },
  { slug: "site_manager", needles: ["statyb vadov", "objekt vadov", "прораб"] },
  { slug: "general_laborer", needles: ["bendr darb", "pagalbin", "разнорабоч", "подсобн"] },
  // RU: «кран» alone also means a water tap (plumbing) — only the
  // unambiguous operator/profession forms are needles.
  { slug: "crane_operator", needles: ["kran", "крановщик", "башенный кран", "башенного крана"] },
  { slug: "heavy_equipment_operator", needles: ["ekskavator", "buldoz", "krautuv", "экскаватор", "бульдозер", "погрузчик"] },
];

/** Higher-level work directions surfaced as a separate suggestion bucket. */
export const WORK_DIRECTION_HINTS_LT: { slug: string; needles: string[] }[] = [
  { slug: "tiler", needles: ["vidaus apdail", "apdail", "отделочн", "отделк"] },
  { slug: "concrete_worker", needles: ["betonav", "konstruk", "бетонные работ", "монолитн"] },
  { slug: "electrician", needles: ["elektros darb", "instaliac", "электромонтаж"] },
  { slug: "plumber", needles: ["santechnik darb", "сантехнические работ"] },
  { slug: "carpenter", needles: ["medienos darb", "stalystės", "столярные работ"] },
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
  /** Sector this activity belongs to. Construction is one sector among many;
   *  there is no construction default. Defaults to "other" when omitted. */
  sector?: SectorKey;
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
    needles: ["stogo karkas", "stog karkas", "karkas stog", "каркас крыши", "стропильн"],
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
      "montav duris", "montav langus", "ставил двери", "ставил окна", "монтаж дверей", "монтаж окон", "двери", "дверей", "оконн",
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
      "projekt parengim", "готовил проект", "разрабатывал проект", "разработка проекта",
    ],
  },
  // ── Non-construction day-work (v3) ────────────────────────────────────
  // Each row uses explicit LT inflected forms — substring matches on short
  // roots like `tikr` / `darb` would false-match dozens of unrelated words.
  {
    // App / software testing.
    slug: null,
    sector: "it_software",
    label: "Programėlės / programinės įrangos testavimas",
    needles: [
      "programėlės patikrinim",
      "programėlės testav",
      "programos patikrinim",
      "programos testav",
      "programinės įrangos patikrinim",
      "programinės įrangos testav",
      "atlikau patikrinim",
      "qa testav",
      "app testing", "тестировал приложени", "тестировал программ",
      "software testing",
    ],
  },
  {
    // Programming / software fixes — distinct from testing.
    slug: null,
    sector: "it_software",
    label: "Programavimas / kodo pataisymai",
    needles: [
      "programavau",
      "programuoju",
      "kodav",
      "programavimo darb",
      "kodo pataisym",
      "pataisymus",
      "pataisymai",
      "bug fix",
      "coding",
      "programming", "программировал", "писал код", "исправлял баг", "правил код",
    ],
  },
  {
    // Wall plastering / smoothing — distinct from generic plastering because
    // the LT verb `glaistyti` (skim-coating) is the common worker form. We
    // also surface a profession slug (`plasterer` is absent, so `skim-coating`
    // skill or null) — null is the safe pick to avoid a fake profession.
    slug: null,
    label: "Sienų glaistymas / lyginimas",
    needles: [
      "glaiščiau sien",
      "glaisčiau sien",
      "glaistau sien",
      "glaistyti sien",
      "glaist sienas",
      "lygin sien",
      "wall plaster",
      "wall smoothing",
      "skim coat", "шпаклевал стен", "шпатлевал стен", "штукатурил стен", "выравнивал стен",
    ],
  },
  {
    // Horse / animal care.
    slug: null,
    sector: "agriculture",
    label: "Žirgų / gyvulių priežiūra",
    needles: [
      "prižiūrėjau žirg",
      "žirgų priežiūr",
      "žirg priežiūr",
      "šėriau žirg",
      "valiau arklid",
      "gyvulių priežiūr",
      "horse care", "ухаживал за лошад", "конюшн", "кормил лошад", "за животными",
      "stable",
    ],
  },
  {
    // Lecturing / teaching. Captures `dėsčiau paskaitą`, `vedžiau seminarą`.
    slug: null,
    sector: "education",
    label: "Paskaitos / mokymai",
    needles: [
      "dėsčiau paskait",
      "skaiciau paskait",
      "skaitė paskait",
      "vedžiau paskait",
      "vedžiau seminar",
      "vedžiau mokymus",
      "vedžiau mokymai",
      "paskaitos",
      "paskaitą",
      "lectured",
      "teaching session",
      "workshop facilitation", "читал лекци", "вел семинар", "вёл семинар", "проводил занятия", "лекци",
    ],
  },
  // ── Construction trades ────────────────────────────────────────────────
  {
    slug: "roofer",
    sector: "construction",
    label: "Stogo dengimas",
    needles: ["stog", "dengiau stog", "dengti stog", "крыш", "кровл", "кровел"],
  },
  { slug: "tiler", label: "Plytelių klojimas", needles: ["plytel", "klijav", "плитк", "плиточ"] },
  {
    slug: "drywaller",
    label: "Gipso kartono montavimas",
    needles: ["gipso", "gipskart", "гипсокартон", "гкл"],
  },
  { slug: "painter", label: "Dažymas", needles: ["daž", "dazym", "красил", "покраск", "маляр"] },
  { slug: "plumber", label: "Santechnika", needles: ["santechn", "сантехник"] },
  { slug: "electrician", label: "Elektra", needles: ["elektr", "электр"] },
  {
    slug: "carpenter",
    label: "Staliaus darbai",
    needles: ["stali", "medien", "столярн", "плотник", "плотниц"],
  },
  { slug: "mason", label: "Mūrijimas", needles: ["mūr", "mur ", "кладк", "кирпич", "каменщик"] },
  {
    slug: "concrete_worker",
    label: "Betonavimas",
    needles: ["beton liej", "betonav", "бетонир", "заливал бетон", "бетонщик"],
  },
  { slug: "welder", label: "Suvirinimas", needles: ["suvirin", "сварк", "сварщик", "сваривал"] },
  {
    slug: "rebar_worker",
    label: "Armatūros darbai",
    needles: ["armatūr", "armatur", "арматур"],
  },
  // Adjacent day-work that the construction taxonomy doesn't model — label
  // only, no fake slug so it stays a review-only suggestion.
  {
    slug: null,
    sector: "transport_logistics",
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
      "driving", "возил", "отвозил", "развозил", "перевозил", "водител", "таксовал",
    ],
  },
  {
    slug: null,
    sector: "retail_sales",
    label: "Kasininko / parduotuvės darbas",
    needles: [
      "kasinink",
      "kasoje",
      "kasa ",
      "parduotuv",
      "cashier",
      "retail",
      "store ", "кассир", "за кассой", "в кассе", "магазин",
    ],
  },
  {
    slug: null,
    sector: "retail_sales",
    label: "Klientų aptarnavimas",
    needles: ["klient aptarn", "aptarnav", "обслуживал клиент", "обслуживание клиент"],
  },
  // ── Further non-construction sectors (v4) — label-only, honest. ────────
  {
    slug: null,
    sector: "hospitality_food",
    label: "Maisto gaminimas / virtuvė",
    needles: [
      "gaminau maist",
      "maisto gamin",
      "virėj",
      "virtuvėj",
      "virtuvej",
      "cooking",
      "kitchen",
      "chef", "готовил еду", "готовил обед", "на кухне", "повар",
    ],
  },
  {
    slug: null,
    sector: "care_health",
    label: "Slauga / vaikų priežiūra",
    needles: [
      "slaug",
      "pacient",
      "prižiūrėjau vaik",
      "prizurejau vaik",
      "vaikų priežiūr",
      "vaiku prieziur",
      "childcare",
      "caregiv",
      "nursing", "ухаживал за", "сиделк", "медсестр", "присматривал за дет", "нянч", "за пациент",
    ],
  },
  {
    slug: null,
    sector: "office_admin",
    label: "Biuro / administracinis darbas",
    needles: [
      "dokument tvark",
      "administrac",
      "biuro darb",
      "sąskaitų",
      "saskaitu",
      "buhalter",
      "office admin",
      "paperwork", "оформлял документ", "бухгалтер", "офисн", "делопроизводств",
    ],
  },
  {
    slug: null,
    sector: "cleaning_facility",
    label: "Valymo darbai",
    needles: [
      "valymo darb",
      "valiau patalp",
      "valytoj",
      "cleaning",
      "cleaner", "убирал", "уборк", "уборщ", "мыл полы",
    ],
  },
  {
    slug: null,
    sector: "transport_logistics",
    label: "Sandėlio / logistikos darbai",
    needles: [
      "sandėl",
      "sandel",
      "krovini",
      "pakrov",
      "warehouse",
      "logistics", "склад", "грузил", "погрузк", "разгру", "логистик",
    ],
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
