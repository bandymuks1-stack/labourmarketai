/**
 * P0 work-category taxonomy — the public, sector-grouped list of work types a
 * worker can pick on intake and an employer can request in a need.
 *
 * WHY: the intake/need selects were construction-only, which made the product
 * read as a construction platform even though it positions as the whole labour
 * market. This config makes the breadth explicit: ten plain-language sectors,
 * each with a few honest work types. Construction is ONE sector among many.
 *
 * SAFETY / DOCTRINE:
 *  - Config only. No fake ESCO import, no auto-verified skills (§7) — these are
 *    plain selection labels, not a claimed skill taxonomy.
 *  - The DB stores `profession` as a free string (companyNeed / workerIntake
 *    schemas use `z.string()`), so adding slugs needs NO migration and is fully
 *    backward-compatible: every slug that already existed in the construction
 *    list is kept verbatim here.
 *  - Labels are inline (lt/en/ru/pl) so the taxonomy stays in one place and does
 *    not fan out into 11 message catalogs.
 *
 * Adding a sector or work type is a one-row edit here — no component change.
 */

export type WorkCategoryKey =
  | "construction"
  | "manufacturing"
  | "warehouse_logistics"
  | "transport"
  | "agriculture"
  | "cleaning_facility"
  | "hospitality_food"
  | "care_support"
  | "machinery_operators"
  | "other";

export interface WorkLabel {
  readonly lt: string;
  readonly en: string;
  readonly ru: string;
  /** 2026-09-20: PL became an active UI locale; Polish visitors were served the
   *  Lithuanian fallback labels until this field existed. */
  readonly pl: string;
}

export interface WorkType extends WorkLabel {
  /** Stable slug persisted as `profession`. Backward-compatible: pre-existing
   *  construction slugs are unchanged. */
  readonly slug: string;
}

export interface WorkCategory extends WorkLabel {
  readonly key: WorkCategoryKey;
  readonly types: readonly WorkType[];
}

export const WORK_CATEGORIES: readonly WorkCategory[] = [
  {
    key: "construction",
    lt: "Statyba",
    en: "Construction",
    ru: "Строительство",
    pl: "Budownictwo",
    types: [
      { slug: "general_laborer", lt: "Statybos pagalbinis darbininkas", en: "General laborer", ru: "Разнорабочий", pl: "Pracownik ogólnobudowlany" },
      { slug: "carpenter", lt: "Stalius", en: "Carpenter", ru: "Плотник", pl: "Cieśla" },
      { slug: "mason", lt: "Mūrininkas", en: "Mason", ru: "Каменщик", pl: "Murarz" },
      { slug: "electrician", lt: "Elektrikas", en: "Electrician", ru: "Электрик", pl: "Elektryk" },
      { slug: "plumber", lt: "Santechnikas", en: "Plumber", ru: "Сантехник", pl: "Hydraulik" },
      { slug: "painter", lt: "Dažytojas", en: "Painter", ru: "Маляр", pl: "Malarz" },
      { slug: "tiler", lt: "Plytelių klojėjas", en: "Tiler", ru: "Плиточник", pl: "Glazurnik" },
      { slug: "welder", lt: "Suvirintojas", en: "Welder", ru: "Сварщик", pl: "Spawacz" },
      { slug: "roofer", lt: "Stogdengys", en: "Roofer", ru: "Кровельщик", pl: "Dekarz" },
      // Owner contract 2026-09-04 §9 — "I need 12 scaffolders in Rotterdam
      // from 5 October" classified as UNKNOWN because the intake could not
      // name the trade. Five construction trades employers actually ask for.
      { slug: "scaffolder", lt: "Pastolininkas", en: "Scaffolder", ru: "Монтажник строительных лесов", pl: "Monter rusztowań" },
      { slug: "concrete_worker", lt: "Betonuotojas", en: "Concrete worker", ru: "Бетонщик", pl: "Betoniarz" },
      { slug: "plasterer", lt: "Tinkuotojas", en: "Plasterer", ru: "Штукатур", pl: "Tynkarz" },
      { slug: "steel_fixer", lt: "Armatūrininkas", en: "Steel fixer", ru: "Арматурщик", pl: "Zbrojarz" },
      { slug: "insulation_worker", lt: "Izoliuotojas", en: "Insulation worker", ru: "Изолировщик", pl: "Monter izolacji" },
    ],
  },
  {
    key: "manufacturing",
    lt: "Gamyba",
    en: "Manufacturing",
    ru: "Производство",
    pl: "Produkcja",
    types: [
      { slug: "production_worker", lt: "Gamybos darbininkas", en: "Production worker", ru: "Производственный рабочий", pl: "Pracownik produkcji" },
      { slug: "assembler", lt: "Surinkėjas", en: "Assembler", ru: "Сборщик", pl: "Monter" },
      { slug: "machine_operator", lt: "Staklių operatorius", en: "Machine operator", ru: "Оператор станка", pl: "Operator maszyn" },
      { slug: "quality_control", lt: "Kokybės kontrolierius", en: "Quality control", ru: "Контролёр качества", pl: "Kontroler jakości" },
    ],
  },
  {
    key: "warehouse_logistics",
    lt: "Sandėliai ir logistika",
    en: "Warehouse & logistics",
    ru: "Склады и логистика",
    pl: "Magazyny i logistyka",
    types: [
      { slug: "warehouse_worker", lt: "Sandėlio darbininkas", en: "Warehouse worker", ru: "Складской работник", pl: "Pracownik magazynu" },
      { slug: "order_picker", lt: "Prekių rinkėjas", en: "Order picker", ru: "Комплектовщик", pl: "Kompletator" },
      { slug: "forklift_operator", lt: "Krautuvo vairuotojas", en: "Forklift operator", ru: "Водитель погрузчика", pl: "Operator wózka widłowego" },
      { slug: "packer", lt: "Pakuotojas", en: "Packer", ru: "Упаковщик", pl: "Pakowacz" },
    ],
  },
  {
    key: "transport",
    lt: "Transportas",
    en: "Transport",
    ru: "Транспорт",
    pl: "Transport",
    types: [
      { slug: "delivery_driver", lt: "Pristatymo vairuotojas", en: "Delivery driver", ru: "Водитель-курьер", pl: "Kierowca dostawczy" },
      { slug: "truck_driver_c", lt: "Sunkvežimio vairuotojas (C)", en: "Truck driver (C)", ru: "Водитель грузовика (C)", pl: "Kierowca ciężarówki (C)" },
      { slug: "truck_driver_ce", lt: "Vilkiko vairuotojas (CE)", en: "Truck driver (CE)", ru: "Водитель фуры (CE)", pl: "Kierowca ciągnika siodłowego (CE)" },
      { slug: "courier", lt: "Kurjeris", en: "Courier", ru: "Курьер", pl: "Kurier" },
    ],
  },
  {
    key: "agriculture",
    lt: "Žemės ūkis",
    en: "Agriculture",
    ru: "Сельское хозяйство",
    pl: "Rolnictwo",
    types: [
      { slug: "farm_worker", lt: "Žemės ūkio darbininkas", en: "Farm worker", ru: "Сельхозработник", pl: "Pracownik rolny" },
      { slug: "harvest_worker", lt: "Derliaus rinkėjas", en: "Harvest worker", ru: "Сборщик урожая", pl: "Zbieracz plonów" },
      { slug: "greenhouse_worker", lt: "Šiltnamio darbininkas", en: "Greenhouse worker", ru: "Тепличный работник", pl: "Pracownik szklarni" },
    ],
  },
  {
    key: "cleaning_facility",
    lt: "Valymas ir priežiūra",
    en: "Cleaning & facilities",
    ru: "Уборка и обслуживание",
    pl: "Sprzątanie i utrzymanie obiektów",
    types: [
      { slug: "cleaner", lt: "Valytojas", en: "Cleaner", ru: "Уборщик", pl: "Sprzątacz" },
      { slug: "industrial_cleaner", lt: "Pramoninis valytojas", en: "Industrial cleaner", ru: "Промышленный уборщик", pl: "Sprzątacz przemysłowy" },
      { slug: "facility_worker", lt: "Patalpų prižiūrėtojas", en: "Facility worker", ru: "Работник по обслуживанию", pl: "Konserwator obiektu" },
    ],
  },
  {
    key: "hospitality_food",
    lt: "Viešbučiai ir maitinimas",
    en: "Hospitality & food",
    ru: "Гостиницы и общепит",
    pl: "Hotelarstwo i gastronomia",
    types: [
      { slug: "kitchen_helper", lt: "Virtuvės pagalbininkas", en: "Kitchen helper", ru: "Помощник повара", pl: "Pomoc kuchenna" },
      { slug: "cook", lt: "Virėjas", en: "Cook", ru: "Повар", pl: "Kucharz" },
      { slug: "waiter", lt: "Padavėjas", en: "Waiter", ru: "Официант", pl: "Kelner" },
      { slug: "housekeeper", lt: "Kambarinė", en: "Housekeeper", ru: "Горничная", pl: "Pokojowa" },
      { slug: "dishwasher", lt: "Indų plovėjas", en: "Dishwasher", ru: "Посудомойщик", pl: "Zmywacz naczyń" },
    ],
  },
  {
    key: "care_support",
    lt: "Slauga ir pagalba",
    en: "Care & support",
    ru: "Уход и помощь",
    pl: "Opieka i wsparcie",
    types: [
      { slug: "care_assistant", lt: "Slaugos pagalbininkas", en: "Care assistant", ru: "Помощник по уходу", pl: "Opiekun / asystent opieki" },
      { slug: "support_worker", lt: "Pagalbos darbuotojas", en: "Support worker", ru: "Социальный работник", pl: "Pracownik wsparcia" },
      { slug: "elderly_carer", lt: "Pagyvenusių žmonių slaugytojas", en: "Elderly carer", ru: "Сиделка", pl: "Opiekun osób starszych" },
    ],
  },
  {
    key: "machinery_operators",
    lt: "Technika ir operatoriai",
    en: "Machinery & operators",
    ru: "Техника и операторы",
    pl: "Maszyny i operatorzy",
    types: [
      { slug: "crane_operator", lt: "Krano operatorius", en: "Crane operator", ru: "Крановщик", pl: "Operator dźwigu" },
      { slug: "excavator_operator", lt: "Ekskavatoriaus operatorius", en: "Excavator operator", ru: "Экскаваторщик", pl: "Operator koparki" },
      { slug: "heavy_equipment_operator", lt: "Sunkiosios technikos operatorius", en: "Heavy equipment operator", ru: "Оператор спецтехники", pl: "Operator maszyn ciężkich" },
    ],
  },
  {
    key: "other",
    lt: "Kiti darbai",
    en: "Other work",
    ru: "Другая работа",
    pl: "Inne prace",
    types: [
      { slug: "other_general", lt: "Kita / pagalbinis darbas", en: "Other / general work", ru: "Другая / подсобная работа", pl: "Inne / prace pomocnicze" },
    ],
  },
];

export type WorkLocale = "lt" | "en" | "ru" | "pl";

function pick(label: WorkLabel, locale: string): string {
  // 2026-09-20: `pl` resolves to the Polish label (PL is an active UI locale); lt/en/ru
  // are unchanged and every other locale keeps the pre-existing `lt` fallback.
  return locale === "en"
    ? label.en
    : locale === "ru"
      ? label.ru
      : locale === "pl"
        ? label.pl
        : label.lt;
}

export interface WorkCategoryOptionGroup {
  readonly key: WorkCategoryKey;
  readonly sector: string;
  readonly options: readonly { readonly slug: string; readonly label: string }[];
}

/** Build locale-aware, sector-grouped options for a native <select> with
 *  <optgroup>. Used by the worker intake and company need forms. */
export function buildWorkCategoryOptions(locale: string): WorkCategoryOptionGroup[] {
  return WORK_CATEGORIES.map((c) => ({
    key: c.key,
    sector: pick(c, locale),
    options: c.types.map((t) => ({ slug: t.slug, label: pick(t, locale) })),
  }));
}

/** Every valid work-type slug (flattened). Backward-compatible superset of the
 *  former construction-only list. */
export const ALL_WORK_TYPE_SLUGS: readonly string[] = WORK_CATEGORIES.flatMap((c) =>
  c.types.map((t) => t.slug),
);

/** Whether a slug is a known work type (for validating stored values). */
export function isWorkTypeSlug(slug: string): boolean {
  return ALL_WORK_TYPE_SLUGS.includes(slug);
}

/** The construction-sector work-type slugs (config-derived, single source). */
export const CONSTRUCTION_WORK_TYPE_SLUGS: readonly string[] =
  WORK_CATEGORIES.find((c) => c.key === "construction")?.types.map((t) => t.slug) ?? [];

/** Whether a submitted `profession` slug is a construction-sector work type.
 *  Used only to decide whether the public /company-need response shows the
 *  honest LT/PL partner-company fallback route (copy-only; no behavior change). */
export function isConstructionWorkType(slug: string | undefined | null): boolean {
  return !!slug && CONSTRUCTION_WORK_TYPE_SLUGS.includes(slug);
}

/** Tiered global country model (PR-G — global location model):
 *
 *  - `ACTIVE_MARKETS` — the ISO-3166 alpha-2 markets the platform actively
 *    serves today (Baltic + Northern Europe core, the 2026-07-17 open markets
 *    GE/BE/FR/ES/AT/CH, and the 2026-07 US market). Used as the allowed
 *    country set for structured demand intake; display names come from the
 *    `labourMarket.countryNames` i18n catalogue. The DB column behind demand
 *    intake (`customer_requests.country`) is free text — no CHECK constraint —
 *    so this list needs no migration.
 *  - `ALL_ISO_COUNTRIES` (re-exported from lib/location/country-model) — every
 *    officially assigned ISO country; the model supports all of them, nothing
 *    may assume Europe or default to Lithuania.
 */
export { ALL_ISO_COUNTRIES, isIsoCountry } from "@/lib/location/country-model";

export const ACTIVE_MARKETS = [
  "LT", "LV", "EE", "PL", "DE", "NL", "DK", "NO", "SE", "FI",
  "GE", "BE", "FR", "ES", "AT", "CH", "US",
] as const;

/** Back-compat alias — existing imports keep working; new code should prefer
 *  the explicit tier name `ACTIVE_MARKETS`. */
export const MARKET_COUNTRIES = ACTIVE_MARKETS;
export type MarketCountry = (typeof ACTIVE_MARKETS)[number];
export function isMarketCountry(code: string): code is MarketCountry {
  return (ACTIVE_MARKETS as readonly string[]).includes(code);
}

/** Locale-aware slug → label map for every work type. Used where a stored
 *  `profession` slug must be rendered (e.g. the operator candidate pool). */
export function buildWorkTypeLabelMap(locale: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const c of WORK_CATEGORIES) {
    for (const t of c.types) out[t.slug] = pick(t, locale);
  }
  return out;
}
