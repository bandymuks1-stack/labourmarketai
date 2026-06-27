/**
 * New (undeclared) skill suggestions — sector-neutral catalogue (Recognition
 * v1.1, "Whole Labour Market Correction").
 *
 * Recognition v1 only ever surfaced skills the worker had ALREADY declared,
 * and its lexicon was construction-only — so the Work Journal could not help a
 * worker DISCOVER a new skill, and the product read as construction-only.
 *
 * This module adds the missing half: a small, explicitly SECTOR-TAGGED
 * catalogue spanning the whole labour market (transport, hospitality, retail,
 * care, cleaning, agriculture, office, IT, customer service — construction is
 * deliberately NOT duplicated here; undeclared construction skills already flow
 * from the existing engine). A match here becomes a "Galimas naujas įgūdis"
 * (possible new skill) suggestion the worker may add to their profile.
 *
 * Honesty (doctrine §7): a suggestion is NEVER a fact. Adding one creates only
 * a SELF-DECLARED profile claim (`profile_skill_claims`, status
 * `self_declared`, visibility `closed`). It is never verified, never
 * manager-confirmed, and never becomes Work-Journal evidence until the worker
 * explicitly links it to an entry. This module produces SUGGESTIONS ONLY — it
 * performs no IO and asserts nothing.
 *
 * Adding a sector or skill is a one-row data change here — no component edits,
 * no DB migration, no construction special-case. Pure + deterministic.
 */
import type { SectorKey } from "./sectors";
import { foldText } from "./normalize";
import { applyMisspellings } from "./misspellings";

/** Localized display labels for a catalogue skill (active locales lt/en/ru;
 *  other locales fall back to EN — these are free-text claim labels, not DB
 *  taxonomy, so they live here rather than in skill-names.json). */
export interface SkillLabels {
  readonly lt: string;
  readonly en: string;
  readonly ru: string;
}

/** One sector-neutral catalogue skill. `needles` are strong folded stems
 *  (high confidence). `weakNeedles` are shorter/more generic stems that still
 *  evidence the skill but only at medium confidence. */
interface CatalogSkill {
  readonly slug: string;
  readonly sector: SectorKey;
  readonly labels: SkillLabels;
  readonly needles: readonly string[];
  readonly weakNeedles?: readonly string[];
}

/**
 * The whole-labour-market catalogue. One entry per cross-sector skill. Slugs
 * are namespaced-free kebab-case and intentionally do NOT collide with the
 * construction skill slugs in skill-names.json (those flow from the existing
 * engine). LT needles are written without diacritics where workers commonly
 * drop them; everything is folded at build time so both forms match.
 */
const CATALOG: readonly CatalogSkill[] = [
  // ── transport & logistics ────────────────────────────────────────────────
  {
    slug: "forklift-operation",
    sector: "transport_logistics",
    labels: {
      lt: "Krautuvo vairavimas",
      en: "Forklift operation",
      ru: "Управление погрузчиком",
    },
    needles: ["krautuv", "autokrautuv", "forklift", "погрузчик", "штабел"],
  },
  {
    slug: "warehouse-operations",
    sector: "transport_logistics",
    labels: {
      lt: "Sandėlio darbai",
      en: "Warehouse operations",
      ru: "Складские работы",
    },
    needles: ["sandel", "warehouse", "складск", "комплектовщик"],
    weakNeedles: ["склад"],
  },
  {
    slug: "delivery-driving",
    sector: "transport_logistics",
    labels: {
      lt: "Pristatymas / kurjerio darbas",
      en: "Delivery / courier driving",
      ru: "Доставка / курьер",
    },
    // Real-world audit: bare "pristatym" missed "pristačiau siuntas" (courier
    // delivery). Courier-anchored phrasings + RU/EN added. Still candidate-only.
    needles: [
      "pristatym", "kurjer", "courier", "delivery driv", "доставк", "курьер",
      "pristaciau siunt", "siuntas po miest", "siuntu pristat", "kurjeriu",
      "posiuntini", "parcel deliver", "развозил посылк",
    ],
    weakNeedles: ["vairav", "водител"],
  },
  {
    // Order picking / packing line — SAFE-EMPTY sector in the audit (#17
    // "rinkau uzsakymus, pakavau, etiketavau"). Candidate-only; needles are
    // multi-word so they don't over-fire on a bare "rinkau"/"pakavau".
    slug: "order-picking",
    sector: "transport_logistics",
    labels: {
      lt: "Užsakymų rinkimas / komplektavimas",
      en: "Order picking / packing",
      ru: "Комплектация заказов",
    },
    needles: [
      "rinkau uzsakym", "uzsakymu rink", "surinkau uzsakym", "prekiu surink",
      "uzsakymu komplekt", "komplektav uzsakym", "order pick", "order-pick",
      "pakavau ir etiket", "komplektovsc", "сборка заказ", "комплектац заказ",
      "комплектовщик",
    ],
  },
  // ── hospitality & food ───────────────────────────────────────────────────
  {
    slug: "cooking",
    sector: "hospitality_food",
    labels: { lt: "Maisto gaminimas", en: "Cooking", ru: "Приготовление пищи" },
    needles: ["virtuvej", "virej", "gaminau maist", "cook", "chef", "повар", "кухн"],
  },
  {
    slug: "waiting-tables",
    sector: "hospitality_food",
    labels: { lt: "Padavėjo darbas", en: "Waiting tables", ru: "Работа официантом" },
    needles: ["padavej", "aptarnavau stal", "waiter", "waitress", "официант"],
  },
  {
    slug: "bartending",
    sector: "hospitality_food",
    labels: { lt: "Barmeno darbas", en: "Bartending", ru: "Работа барменом" },
    needles: ["barmen", "bartend", "бармен"],
  },
  // ── retail & sales ───────────────────────────────────────────────────────
  {
    slug: "cashier",
    sector: "retail_sales",
    labels: { lt: "Kasininko darbas", en: "Cashier", ru: "Работа кассиром" },
    needles: ["kasinink", "prie kasos", "cashier", "кассир", "касса"],
  },
  {
    slug: "sales-assistant",
    sector: "retail_sales",
    labels: {
      lt: "Pardavėjo konsultanto darbas",
      en: "Sales assistant",
      ru: "Продавец-консультант",
    },
    needles: ["pardavej", "sales assistant", "shop assistant", "продавец", "консультант"],
  },
  // ── care & health support ────────────────────────────────────────────────
  {
    slug: "elderly-care",
    sector: "care_health",
    labels: { lt: "Senjorų priežiūra", en: "Elderly care", ru: "Уход за пожилыми" },
    // Real-world audit (#31 "Prižiūrėjau senelius, daviau vaistus") was SAFE
    // EMPTY: "senel"/"slaug" stems added so the elder-care candidate surfaces.
    needles: [
      "senjor", "senel", "slaug", "slaugiau", "elderly care", "caregiver",
      "сиделк", "уход за пожил", "ухаживал за пожил",
    ],
  },
  {
    slug: "childcare",
    sector: "care_health",
    labels: { lt: "Vaikų priežiūra", en: "Childcare", ru: "Присмотр за детьми" },
    needles: [
      "vaiku prieziur", "aukle", "auklejau", "darzel", "childcare", "nanny",
      "няня", "уход за детьми", "присматривал за дет",
    ],
  },
  // ── cleaning & facilities ────────────────────────────────────────────────
  {
    slug: "cleaning-services",
    sector: "cleaning_facility",
    labels: { lt: "Valymo paslaugos", en: "Cleaning services", ru: "Клининговые услуги" },
    // Bare "valym" is deliberately excluded — it overlaps construction
    // site-cleaning; we match the cleaner-role stems instead.
    needles: ["valytoj", "patalp prieziur", "cleaner", "cleaning serv", "клинин", "уборщи"],
  },
  {
    // Hotel / accommodation housekeeping — SAFE-EMPTY in the audit (#24
    // "tvarkiau kambarius viesbuty, patalyne"). Candidate-only. Needles anchor
    // to the hotel-room / bedding context so they don't fire on generic "tvark".
    slug: "housekeeping",
    sector: "cleaning_facility",
    labels: { lt: "Kambarių tvarkymas (viešbutis)", en: "Housekeeping", ru: "Уборка номеров" },
    needles: [
      "kambari viesbut", "kambarius viesbut", "viesbut kambar", "kambarines",
      "patalyne", "patalynes keit", "housekeep", "room attendant",
      "горничн", "уборка номер", "смена белья",
    ],
  },
  {
    // Winter / snow & ice service — SAFE-EMPTY in the audit (#20 "valiau sniega
    // nuo taku, bariau druska"). Candidate-only. "valiau snieg" / snow-anchored.
    slug: "winter-service",
    sector: "cleaning_facility",
    labels: { lt: "Sniego valymas / žiemos priežiūra", en: "Snow & ice service", ru: "Уборка снега / зимняя служба" },
    needles: [
      "valiau snieg", "sniego valym", "snieg nuo tak", "kasiau snieg",
      "barst drusk", "druska nuo led", "led barst", "snow remov", "snow clear",
      "gritting", "уборка снег", "чистил снег", "посыпал реагент",
    ],
  },
  // ── agriculture ──────────────────────────────────────────────────────────
  {
    slug: "farm-work",
    sector: "agriculture",
    labels: { lt: "Žemės ūkio darbai", en: "Farm work", ru: "Сельхозработы" },
    needles: ["zemes uki", "ukio darb", "derliaus", "farm work", "сельхоз", "ферм", "урожай"],
  },
  // ── office & administration ──────────────────────────────────────────────
  {
    slug: "administration",
    sector: "office_admin",
    labels: { lt: "Administravimas", en: "Administration", ru: "Администрирование" },
    needles: ["administrav", "rastved", "office admin", "делопроизвод", "администрир"],
  },
  {
    slug: "bookkeeping",
    sector: "office_admin",
    labels: { lt: "Apskaita", en: "Bookkeeping", ru: "Бухгалтерия" },
    needles: ["apskait", "buhalter", "bookkeep", "accounting", "бухгалтер"],
  },
  // ── IT & digital ─────────────────────────────────────────────────────────
  {
    slug: "programming",
    sector: "it_software",
    labels: { lt: "Programavimas", en: "Programming", ru: "Программирование" },
    needles: ["programav", "programuoj", "kodav", "programming", "разработ", "программир"],
    weakNeedles: ["developer", "kodas"],
  },
  {
    slug: "it-support",
    sector: "it_software",
    labels: { lt: "IT pagalba", en: "IT support", ru: "ИТ-поддержка" },
    needles: ["it pagalb", "sistem administr", "it support", "helpdesk", "техподдержк"],
  },
  {
    // Graphic / visual design — SAFE-EMPTY in the audit (#10 "kuriau logotipą,
    // maketavau bukletą"). Candidate-only. "logotip"/"maketav" + tool names.
    slug: "graphic-design",
    sector: "it_software",
    labels: { lt: "Grafinis dizainas", en: "Graphic design", ru: "Графический дизайн" },
    needles: [
      "logotip", "maketav", "grafik dizain", "grafin dizain", "bukleto dizain",
      "plakato dizain", "graphic design", "logo design", "photoshop",
      "illustrator", "логотип", "макет", "графическ дизайн",
    ],
  },
  {
    // Software testing / QA — SAFE-EMPTY in the audit (#12 "Testavau aplikaciją,
    // radau klaidas"). Candidate-only. Strong needles are QA-anchored; bare
    // "testav" is a weak (medium) signal so it never poses as a confident hit.
    slug: "qa-testing",
    sector: "it_software",
    labels: { lt: "Programinės įrangos testavimas", en: "Software testing / QA", ru: "Тестирование ПО / QA" },
    needles: [
      "programos testav", "aplikacijos testav", "qa inzinier", "qa specialist",
      "manual testing", "test case", "software testing", "тестировщик",
      "тестирование приложен", "тестирование по",
    ],
    weakNeedles: ["testav", "тестировал"],
  },
  // ── sales / customer service ─────────────────────────────────────────────
  {
    slug: "customer-service",
    sector: "office_admin",
    labels: {
      lt: "Klientų aptarnavimas",
      en: "Customer service",
      ru: "Обслуживание клиентов",
    },
    needles: ["klient aptarnav", "customer service", "call cent", "клиентск", "колл-центр"],
  },
];

export type NewSkillConfidence = "high" | "medium";

export interface NewSkillSuggestion {
  readonly slug: string;
  readonly sector: SectorKey;
  readonly labels: SkillLabels;
  readonly confidence: NewSkillConfidence;
  /** The folded stem that triggered the match (for the "reason" line). */
  readonly matchedText: string;
}

/** Cap on new-skill suggestions surfaced for one entry (owner: 3–5 per group). */
export const NEW_SKILL_LIMIT = 4;

type FoldedTerm = {
  slug: string;
  sector: SectorKey;
  labels: SkillLabels;
  term: string;
  confidence: NewSkillConfidence;
  len: number;
};

const TERMS: readonly FoldedTerm[] = (() => {
  const out: FoldedTerm[] = [];
  for (const row of CATALOG) {
    for (const n of row.needles) {
      const t = foldText(n).trim();
      if (t)
        out.push({
          slug: row.slug,
          sector: row.sector,
          labels: row.labels,
          term: t,
          confidence: "high",
          len: t.length,
        });
    }
    for (const n of row.weakNeedles ?? []) {
      const t = foldText(n).trim();
      if (t)
        out.push({
          slug: row.slug,
          sector: row.sector,
          labels: row.labels,
          term: t,
          confidence: "medium",
          len: t.length,
        });
    }
  }
  return out;
})();

const CONF_RANK: Record<NewSkillConfidence, number> = { high: 2, medium: 1 };

/**
 * Recognise possible NEW (undeclared) skills in a free-text entry.
 *
 * @param text          the worker's raw entry
 * @param declaredSlugs slugs the worker has already declared — excluded so we
 *                      only ever suggest something genuinely new
 * @param limit         max suggestions (default {@link NEW_SKILL_LIMIT})
 *
 * Returns at most `limit` suggestions, strongest-evidence first. A match found
 * only after applying the curated misspelling map is demoted to `medium`
 * (a corrected typo is weaker evidence than a clean hit).
 */
export function recognizeNewSkillSuggestions(
  text: string,
  declaredSlugs: ReadonlySet<string> = new Set(),
  limit: number = NEW_SKILL_LIMIT,
): NewSkillSuggestion[] {
  if (!text || text.trim().length === 0) return [];
  const folded = foldText(text);
  const { text: corrected, corrected: didCorrect } = applyMisspellings(folded);

  const best = new Map<
    string,
    {
      sector: SectorKey;
      labels: SkillLabels;
      confidence: NewSkillConfidence;
      len: number;
      matchedText: string;
    }
  >();

  for (const t of TERMS) {
    if (declaredSlugs.has(t.slug)) continue;
    const inOriginal = folded.includes(t.term);
    const inCorrected = !inOriginal && didCorrect && corrected.includes(t.term);
    if (!inOriginal && !inCorrected) continue;
    // A hit only visible after typo-correction is weaker evidence.
    const confidence: NewSkillConfidence =
      inOriginal ? t.confidence : "medium";
    const prior = best.get(t.slug);
    const better =
      !prior ||
      CONF_RANK[confidence] > CONF_RANK[prior.confidence] ||
      (CONF_RANK[confidence] === CONF_RANK[prior.confidence] &&
        t.len > prior.len);
    if (better) {
      best.set(t.slug, {
        sector: t.sector,
        labels: t.labels,
        confidence,
        len: t.len,
        matchedText: t.term,
      });
    }
  }

  const list: NewSkillSuggestion[] = [...best.entries()].map(([slug, b]) => ({
    slug,
    sector: b.sector,
    labels: b.labels,
    confidence: b.confidence,
    matchedText: b.matchedText,
  }));

  list.sort(
    (a, b) =>
      CONF_RANK[b.confidence] - CONF_RANK[a.confidence] ||
      b.matchedText.length - a.matchedText.length ||
      a.slug.localeCompare(b.slug),
  );

  return list.slice(0, Math.max(0, limit));
}

/** Resolve a catalogue label for the active locale (EN fallback). */
export function labelForLocale(labels: SkillLabels, locale: string): string {
  if (locale === "lt") return labels.lt;
  if (locale === "ru") return labels.ru;
  return labels.en;
}
