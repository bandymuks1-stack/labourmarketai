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
 *  - Labels are inline (lt/en/ru) so the taxonomy stays in one place and does
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
    types: [
      { slug: "general_laborer", lt: "Statybos pagalbinis darbininkas", en: "General laborer", ru: "Разнорабочий" },
      { slug: "carpenter", lt: "Stalius", en: "Carpenter", ru: "Плотник" },
      { slug: "mason", lt: "Mūrininkas", en: "Mason", ru: "Каменщик" },
      { slug: "electrician", lt: "Elektrikas", en: "Electrician", ru: "Электрик" },
      { slug: "plumber", lt: "Santechnikas", en: "Plumber", ru: "Сантехник" },
      { slug: "painter", lt: "Dažytojas", en: "Painter", ru: "Маляр" },
      { slug: "tiler", lt: "Plytelių klojėjas", en: "Tiler", ru: "Плиточник" },
      { slug: "welder", lt: "Suvirintojas", en: "Welder", ru: "Сварщик" },
      { slug: "roofer", lt: "Stogdengys", en: "Roofer", ru: "Кровельщик" },
    ],
  },
  {
    key: "manufacturing",
    lt: "Gamyba",
    en: "Manufacturing",
    ru: "Производство",
    types: [
      { slug: "production_worker", lt: "Gamybos darbininkas", en: "Production worker", ru: "Производственный рабочий" },
      { slug: "assembler", lt: "Surinkėjas", en: "Assembler", ru: "Сборщик" },
      { slug: "machine_operator", lt: "Staklių operatorius", en: "Machine operator", ru: "Оператор станка" },
      { slug: "quality_control", lt: "Kokybės kontrolierius", en: "Quality control", ru: "Контролёр качества" },
    ],
  },
  {
    key: "warehouse_logistics",
    lt: "Sandėliai ir logistika",
    en: "Warehouse & logistics",
    ru: "Склады и логистика",
    types: [
      { slug: "warehouse_worker", lt: "Sandėlio darbininkas", en: "Warehouse worker", ru: "Складской работник" },
      { slug: "order_picker", lt: "Prekių rinkėjas", en: "Order picker", ru: "Комплектовщик" },
      { slug: "forklift_operator", lt: "Krautuvo vairuotojas", en: "Forklift operator", ru: "Водитель погрузчика" },
      { slug: "packer", lt: "Pakuotojas", en: "Packer", ru: "Упаковщик" },
    ],
  },
  {
    key: "transport",
    lt: "Transportas",
    en: "Transport",
    ru: "Транспорт",
    types: [
      { slug: "delivery_driver", lt: "Pristatymo vairuotojas", en: "Delivery driver", ru: "Водитель-курьер" },
      { slug: "truck_driver_c", lt: "Sunkvežimio vairuotojas (C)", en: "Truck driver (C)", ru: "Водитель грузовика (C)" },
      { slug: "truck_driver_ce", lt: "Vilkiko vairuotojas (CE)", en: "Truck driver (CE)", ru: "Водитель фуры (CE)" },
      { slug: "courier", lt: "Kurjeris", en: "Courier", ru: "Курьер" },
    ],
  },
  {
    key: "agriculture",
    lt: "Žemės ūkis",
    en: "Agriculture",
    ru: "Сельское хозяйство",
    types: [
      { slug: "farm_worker", lt: "Žemės ūkio darbininkas", en: "Farm worker", ru: "Сельхозработник" },
      { slug: "harvest_worker", lt: "Derliaus rinkėjas", en: "Harvest worker", ru: "Сборщик урожая" },
      { slug: "greenhouse_worker", lt: "Šiltnamio darbininkas", en: "Greenhouse worker", ru: "Тепличный работник" },
    ],
  },
  {
    key: "cleaning_facility",
    lt: "Valymas ir priežiūra",
    en: "Cleaning & facilities",
    ru: "Уборка и обслуживание",
    types: [
      { slug: "cleaner", lt: "Valytojas", en: "Cleaner", ru: "Уборщик" },
      { slug: "industrial_cleaner", lt: "Pramoninis valytojas", en: "Industrial cleaner", ru: "Промышленный уборщик" },
      { slug: "facility_worker", lt: "Patalpų prižiūrėtojas", en: "Facility worker", ru: "Работник по обслуживанию" },
    ],
  },
  {
    key: "hospitality_food",
    lt: "Viešbučiai ir maitinimas",
    en: "Hospitality & food",
    ru: "Гостиницы и общепит",
    types: [
      { slug: "kitchen_helper", lt: "Virtuvės pagalbininkas", en: "Kitchen helper", ru: "Помощник повара" },
      { slug: "cook", lt: "Virėjas", en: "Cook", ru: "Повар" },
      { slug: "waiter", lt: "Padavėjas", en: "Waiter", ru: "Официант" },
      { slug: "housekeeper", lt: "Kambarinė", en: "Housekeeper", ru: "Горничная" },
      { slug: "dishwasher", lt: "Indų plovėjas", en: "Dishwasher", ru: "Посудомойщик" },
    ],
  },
  {
    key: "care_support",
    lt: "Slauga ir pagalba",
    en: "Care & support",
    ru: "Уход и помощь",
    types: [
      { slug: "care_assistant", lt: "Slaugos pagalbininkas", en: "Care assistant", ru: "Помощник по уходу" },
      { slug: "support_worker", lt: "Pagalbos darbuotojas", en: "Support worker", ru: "Социальный работник" },
      { slug: "elderly_carer", lt: "Pagyvenusių žmonių slaugytojas", en: "Elderly carer", ru: "Сиделка" },
    ],
  },
  {
    key: "machinery_operators",
    lt: "Technika ir operatoriai",
    en: "Machinery & operators",
    ru: "Техника и операторы",
    types: [
      { slug: "crane_operator", lt: "Krano operatorius", en: "Crane operator", ru: "Крановщик" },
      { slug: "excavator_operator", lt: "Ekskavatoriaus operatorius", en: "Excavator operator", ru: "Экскаваторщик" },
      { slug: "heavy_equipment_operator", lt: "Sunkiosios technikos operatorius", en: "Heavy equipment operator", ru: "Оператор спецтехники" },
    ],
  },
  {
    key: "other",
    lt: "Kiti darbai",
    en: "Other work",
    ru: "Другая работа",
    types: [
      { slug: "other_general", lt: "Kita / pagalbinis darbas", en: "Other / general work", ru: "Другая / подсобная работа" },
    ],
  },
];

export type WorkLocale = "lt" | "en" | "ru";

function pick(label: WorkLabel, locale: string): string {
  return locale === "en" ? label.en : locale === "ru" ? label.ru : label.lt;
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

/** The ISO-3166 alpha-2 markets the platform serves (Baltic + Northern Europe).
 *  Used as the allowed country set for structured demand intake; display names
 *  come from the `labourMarket.countryNames` i18n catalogue. */
export const MARKET_COUNTRIES = [
  "LT", "LV", "EE", "PL", "DE", "NL", "DK", "NO", "SE", "FI",
] as const;
export type MarketCountry = (typeof MARKET_COUNTRIES)[number];
export function isMarketCountry(code: string): code is MarketCountry {
  return (MARKET_COUNTRIES as readonly string[]).includes(code);
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
