/**
 * Locale-aware DISPLAY labels for capability / label-only work signals
 * (work-journal-perfect-flow-p0, owner round 5).
 *
 * Capability signals (extractProfileSkillClaims) and the cross-sector
 * ACTIVITY_HINTS_LT labels carry a single canonical LT string. That LT string is
 * the right value to DEDUPE on and to STORE as a self-declared claim — but it
 * must NOT leak into the EN/RU UI. This map gives a localized label per canonical
 * LT label; the resolver returns the locale variant for display and falls back to
 * the LT label when a translation is not provided yet.
 *
 * Scope (per owner): the new client-handover signal + the capability/activity
 * labels that appear in PR #513's owner examples are translated here. Broader
 * LT-only capability/activity labels remain a documented, separate RED (full
 * capability i18n) — they still render their LT label until then, never a raw slug.
 *
 * Pure + deterministic, unit-tested; display-only — callers keep the canonical
 * LT label for dedupe and for the stored profile claim.
 */

type LocalizedLabel = { en: string; ru: string };

/** Keyed by the canonical LT label (the DICTIONARY / ACTIVITY_HINTS_LT `label`). */
export const CAPABILITY_LABEL_I18N: Readonly<Record<string, LocalizedLabel>> = {
  // Round 4–5 client-facing work handover signal.
  "Darbų pristatymas klientui": {
    en: "Work handover to client",
    ru: "Передача работ клиенту",
  },
  // Owner-example capability/activity signals touched by PR #513.
  Programavimas: { en: "Programming", ru: "Программирование" },
  "Interneto svetainės dizainas": { en: "Website design", ru: "Дизайн сайта" },
  "Sunkiosios technikos operavimas": {
    en: "Heavy machinery operation",
    ru: "Управление тяжёлой техникой",
  },
  "Sodininkystė / aplinkos tvarkymas": {
    en: "Gardening / grounds keeping",
    ru: "Садоводство / благоустройство",
  },
  "Pavežėjimas / vairavimas": {
    en: "Driving / ride service",
    ru: "Перевозка / вождение",
  },
  "Sandėlio / logistikos darbai": {
    en: "Warehouse / logistics",
    ru: "Склад / логистика",
  },
  Komunikacija: { en: "Communication", ru: "Коммуникация" },
  Vairavimas: { en: "Driving", ru: "Вождение" },
  // Real-world recognition audit (journal-real-world-recognition-audit-p0):
  // these capability/activity labels surfaced from the 50-entry blind pack and
  // were leaking their LT string into EN/RU. Translating the labels that
  // actually occur keeps the fix bounded and deterministic; the remaining
  // LT-only labels stay a documented RED (full capability i18n).
  Santechnika: { en: "Plumbing", ru: "Сантехника" },
  "Apskaitos sistemos": { en: "Accounting systems", ru: "Системы учёта" },
  "Stogų dengimas": { en: "Roofing", ru: "Кровельные работы" },
  Pardavimai: { en: "Sales", ru: "Продажи" },
  "Dokumentų tvarkymas": { en: "Document handling", ru: "Делопроизводство" },
  "Maisto gaminimas / virtuvė": {
    en: "Cooking / kitchen",
    ru: "Готовка / кухня",
  },
  "Klientų aptarnavimas": {
    en: "Customer service",
    ru: "Обслуживание клиентов",
  },
  "Valymo darbai": { en: "Cleaning", ru: "Уборка" },
  "Programavimas / kodo pataisymai": {
    en: "Programming / code fixes",
    ru: "Программирование / правки кода",
  },
  // Cross-sector recognition (feat/cc/cross-sector-skills, mandate §8.7): the
  // profile recognizer now fires for cooking / care / languages, so their
  // canonical LT labels must localize too (no LT leak into EN/RU).
  "Maisto gamyba": { en: "Cooking", ru: "Готовка" },
  "Asmens priežiūra / globa": {
    en: "Personal care / assistance",
    ru: "Уход за людьми / помощь",
  },
  "Kalbų mokėjimas": { en: "Languages", ru: "Знание языков" },
  // Maximal activity recognition (PR #562): newly-reachable capability/activity
  // labels — localized so they never leak LT into the EN/RU UI.
  "Gyvūnų priežiūra": { en: "Animal / pet care", ru: "Уход за животными" },
  "Skaitiklių keitimas / priežiūra": {
    en: "Meter replacement / upkeep",
    ru: "Замена / обслуживание счётчиков",
  },
  "Tvoros priežiūra / dažymas": {
    en: "Fence upkeep / painting",
    ru: "Уход за забором / покраска",
  },
  "Smulkūs remonto darbai": { en: "Minor repairs", ru: "Мелкий ремонт" },
  "Paviršių šlifavimas": {
    en: "Surface sanding / prep",
    ru: "Шлифовка поверхностей",
  },
  Dažymas: { en: "Painting", ru: "Покраска" },
  // Owner smoke P0 (2026-07-02): generic event/inventory-preparation signal
  // added to the activity + capability lexicons — localized so the new
  // canonical LT label never leaks into the EN/RU UI.
  "Renginių / inventoriaus paruošimas": {
    en: "Event / inventory preparation",
    ru: "Подготовка мероприятий / инвентаря",
  },
};

/**
 * Resolve a canonical LT capability/activity label to its display label for the
 * given locale. LT (or any unknown locale) returns the LT label unchanged; EN/RU
 * return the translation when present, else the LT label (documented fallback).
 */
export function localizeCapabilityLabel(
  ltLabel: string,
  locale: string,
): string {
  if (locale === "en") return CAPABILITY_LABEL_I18N[ltLabel]?.en ?? ltLabel;
  if (locale === "ru") return CAPABILITY_LABEL_I18N[ltLabel]?.ru ?? ltLabel;
  return ltLabel;
}
