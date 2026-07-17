/**
 * Answer Engine — page chrome + localized taxonomy labels + CTA mapping.
 *
 * Per-locale (5 active locales) strings for the hub / category / question page
 * chrome, the 16 localized category names, and a capability → real public route
 * CTA map. Kept as typed data outside messages/*.json (no i18n-debt coupling).
 * Every CTA points at a REAL existing public marketing route; unknown/none → no
 * CTA (never a misleading or dead CTA).
 */
import type { ActiveLocale } from "@/lib/i18n/config";
import type { AnswerCategoryKey } from "@/lib/answer-engine/contract";

export type L = Record<ActiveLocale, string>;

export const CHROME = {
  hubTitle: {
    en: "Questions & answers",
    lt: "Klausimai ir atsakymai",
    ru: "Вопросы и ответы",
    nl: "Vragen en antwoorden",
    de: "Fragen & Antworten",
  } satisfies L,
  hubIntro: {
    en: "Clear, honest answers about work, skills, careers, learning and hiring across Europe.",
    lt: "Aiškūs, sąžiningi atsakymai apie darbą, įgūdžius, karjerą, mokymąsi ir įdarbinimą Europoje.",
    ru: "Понятные и честные ответы о работе, навыках, карьере, обучении и найме в Европе.",
    nl: "Duidelijke, eerlijke antwoorden over werk, vaardigheden, loopbaan, leren en werving in Europa.",
    de: "Klare, ehrliche Antworten zu Arbeit, Fähigkeiten, Karriere, Lernen und Einstellung in Europa.",
  } satisfies L,
  hubEmpty: {
    en: "Answers are being prepared and reviewed. Published questions will appear here.",
    lt: "Atsakymai ruošiami ir peržiūrimi. Publikuoti klausimai atsiras čia.",
    ru: "Ответы готовятся и проверяются. Опубликованные вопросы появятся здесь.",
    nl: "Antwoorden worden voorbereid en beoordeeld. Gepubliceerde vragen verschijnen hier.",
    de: "Antworten werden vorbereitet und geprüft. Veröffentlichte Fragen erscheinen hier.",
  } satisfies L,
  breadcrumbHome: { en: "Home", lt: "Pradžia", ru: "Главная", nl: "Home", de: "Start" } satisfies L,
  breadcrumbQuestions: {
    en: "Questions", lt: "Klausimai", ru: "Вопросы", nl: "Vragen", de: "Fragen",
  } satisfies L,
  breadcrumbAria: {
    en: "Breadcrumb", lt: "Naršymo kelias", ru: "Хлебные крошки", nl: "Kruimelpad", de: "Brotkrümelnavigation",
  } satisfies L,
  shortAnswer: {
    en: "Short answer", lt: "Trumpas atsakymas", ru: "Краткий ответ", nl: "Kort antwoord", de: "Kurze Antwort",
  } satisfies L,
  practicalSteps: {
    en: "Practical steps", lt: "Praktiniai veiksmai", ru: "Практические шаги", nl: "Praktische stappen", de: "Praktische Schritte",
  } satisfies L,
  limitations: {
    en: "Good to know", lt: "Verta žinoti", ru: "Важно знать", nl: "Goed om te weten", de: "Gut zu wissen",
  } satisfies L,
  countryScope: {
    en: "Where this applies", lt: "Kur tai galioja", ru: "Где это применимо", nl: "Waar dit geldt", de: "Wo dies gilt",
  } satisfies L,
  sources: { en: "Sources", lt: "Šaltiniai", ru: "Источники", nl: "Bronnen", de: "Quellen" } satisfies L,
  lastReviewed: {
    en: "Last reviewed", lt: "Paskutinį kartą peržiūrėta", ru: "Последняя проверка", nl: "Laatst herzien", de: "Zuletzt geprüft",
  } satisfies L,
  editorialBy: {
    en: "Editorial responsibility", lt: "Redakcinė atsakomybė", ru: "Редакционная ответственность", nl: "Redactionele verantwoordelijkheid", de: "Redaktionelle Verantwortung",
  } satisfies L,
  related: {
    en: "Related questions", lt: "Susiję klausimai", ru: "Похожие вопросы", nl: "Gerelateerde vragen", de: "Verwandte Fragen",
  } satisfies L,
  inCategory: { en: "Category", lt: "Kategorija", ru: "Категория", nl: "Categorie", de: "Kategorie" } satisfies L,
  notLegalAdvice: {
    en: "Informational only — not legal advice. Confirm specifics with the competent authority.",
    lt: "Tik informacinio pobūdžio — ne teisinė konsultacija. Konkrečius atvejus tikslinkite kompetentingoje institucijoje.",
    ru: "Только информация — не юридическая консультация. Уточняйте детали в компетентном органе.",
    nl: "Alleen informatief — geen juridisch advies. Bevestig details bij de bevoegde autoriteit.",
    de: "Nur zur Information — keine Rechtsberatung. Details bei der zuständigen Behörde bestätigen.",
  } satisfies L,
} as const;

export const CATEGORY_LABELS: Readonly<Record<AnswerCategoryKey, L>> = {
  job_search_discovery: { en: "Finding work & opportunities", lt: "Darbo ir galimybių paieška", ru: "Поиск работы и возможностей", nl: "Werk & kansen vinden", de: "Arbeit & Chancen finden" },
  cv_profile_experience: { en: "CV, profile & experience", lt: "CV, profilis ir patirtis", ru: "Резюме, профиль и опыт", nl: "CV, profiel & ervaring", de: "Lebenslauf, Profil & Erfahrung" },
  skills_competencies: { en: "Skills & competencies", lt: "Įgūdžiai ir kompetencijos", ru: "Навыки и компетенции", nl: "Vaardigheden & competenties", de: "Fähigkeiten & Kompetenzen" },
  professions_directions: { en: "Professions & directions", lt: "Profesijos ir kryptys", ru: "Профессии и направления", nl: "Beroepen & richtingen", de: "Berufe & Richtungen" },
  career_change_transferable: { en: "Career change & transferable skills", lt: "Karjeros keitimas ir perkeliami įgūdžiai", ru: "Смена карьеры и переносимые навыки", nl: "Loopbaanverandering & overdraagbare vaardigheden", de: "Berufswechsel & übertragbare Fähigkeiten" },
  reskilling_learning: { en: "Reskilling & learning", lt: "Persikvalifikavimas ir mokymasis", ru: "Переквалификация и обучение", nl: "Omscholing & leren", de: "Umschulung & Lernen" },
  salary_conditions: { en: "Pay & working conditions", lt: "Atlyginimas ir darbo sąlygos", ru: "Оплата и условия труда", nl: "Loon & arbeidsvoorwaarden", de: "Bezahlung & Arbeitsbedingungen" },
  working_in_eu_countries: { en: "Working in EU countries", lt: "Darbas ES šalyse", ru: "Работа в странах ЕС", nl: "Werken in EU-landen", de: "Arbeiten in EU-Ländern" },
  international_regional_mobility: { en: "International & regional mobility", lt: "Tarptautinis ir regioninis mobilumas", ru: "Международная и региональная мобильность", nl: "Internationale & regionale mobiliteit", de: "Internationale & regionale Mobilität" },
  employers_finding_workers: { en: "Employers & finding workers", lt: "Darbdaviams ir darbuotojų paieška", ru: "Работодателям и поиск работников", nl: "Werkgevers & personeel vinden", de: "Arbeitgeber & Personalsuche" },
  companies_teams_projects: { en: "Companies, teams & projects", lt: "Įmonės, komandos ir projektai", ru: "Компании, команды и проекты", nl: "Bedrijven, teams & projecten", de: "Unternehmen, Teams & Projekte" },
  students_graduates_institutions: { en: "Students, graduates & institutions", lt: "Studentai, absolventai ir įstaigos", ru: "Студенты, выпускники и учреждения", nl: "Studenten, afgestudeerden & instellingen", de: "Studierende, Absolventen & Einrichtungen" },
  agencies_partners: { en: "Agencies & partners", lt: "Agentūros ir partneriai", ru: "Агентства и партнёры", nl: "Bureaus & partners", de: "Agenturen & Partner" },
  labour_market_data_trends: { en: "Labour-market data & trends", lt: "Darbo rinkos duomenys ir tendencijos", ru: "Данные и тренды рынка труда", nl: "Arbeidsmarktgegevens & trends", de: "Arbeitsmarktdaten & Trends" },
  ai_automation_future: { en: "AI, automation & the future of work", lt: "DI, automatizacija ir darbo ateitis", ru: "ИИ, автоматизация и будущее труда", nl: "AI, automatisering & de toekomst van werk", de: "KI, Automatisierung & Zukunft der Arbeit" },
  platform_usage_security_privacy: { en: "Using LabourMarket.ai, security & privacy", lt: "LabourMarket.ai naudojimas, sauga ir privatumas", ru: "Использование LabourMarket.ai, безопасность и приватность", nl: "LabourMarket.ai gebruiken, beveiliging & privacy", de: "LabourMarket.ai nutzen, Sicherheit & Datenschutz" },
};

/** capability → real public route + localized CTA label (or null = no CTA). */
export const CTA_FOR_CAPABILITY: Readonly<Record<string, { href: string; label: L } | null>> = {
  "opportunity-board": { href: "/work-opportunities", label: { en: "See work opportunities", lt: "Žiūrėti darbo galimybes", ru: "Смотреть возможности работы", nl: "Bekijk werkkansen", de: "Arbeitsmöglichkeiten ansehen" } },
  "adjacent-directions": { href: "/professions", label: { en: "Explore professions", lt: "Naršyti profesijas", ru: "Изучить профессии", nl: "Verken beroepen", de: "Berufe entdecken" } },
  profile: { href: "/for-workers", label: { en: "Build your profile", lt: "Susikurti profilį", ru: "Создать профиль", nl: "Bouw je profiel", de: "Profil erstellen" } },
  cv: { href: "/for-workers", label: { en: "Build your profile", lt: "Susikurti profilį", ru: "Создать профиль", nl: "Bouw je profiel", de: "Profil erstellen" } },
  "work-journal": { href: "/for-workers", label: { en: "Build your profile", lt: "Susikurti profilį", ru: "Создать профиль", nl: "Bouw je profiel", de: "Profil erstellen" } },
  skills: { href: "/skills", label: { en: "See how skills work", lt: "Kaip veikia įgūdžiai", ru: "Как работают навыки", nl: "Hoe vaardigheden werken", de: "Wie Fähigkeiten funktionieren" } },
  matching: { href: "/for-companies", label: { en: "For employers", lt: "Darbdaviams", ru: "Работодателям", nl: "Voor werkgevers", de: "Für Arbeitgeber" } },
  scouting: { href: "/for-companies", label: { en: "For employers", lt: "Darbdaviams", ru: "Работодателям", nl: "Voor werkgevers", de: "Für Arbeitgeber" } },
  company: { href: "/for-companies", label: { en: "For companies", lt: "Įmonėms", ru: "Компаниям", nl: "Voor bedrijven", de: "Für Unternehmen" } },
  teams: { href: "/for-companies", label: { en: "For companies", lt: "Įmonėms", ru: "Компаниям", nl: "Voor bedrijven", de: "Für Unternehmen" } },
  "country-readiness": { href: "/work-abroad", label: { en: "Working across Europe", lt: "Darbas Europoje", ru: "Работа в Европе", nl: "Werken in Europa", de: "Arbeiten in Europa" } },
  intelligence: { href: "/labour-market", label: { en: "Labour-market signals", lt: "Darbo rinkos signalai", ru: "Сигналы рынка труда", nl: "Arbeidsmarktsignalen", de: "Arbeitsmarktsignale" } },
  professions: { href: "/professions", label: { en: "Explore professions", lt: "Naršyti profesijas", ru: "Изучить профессии", nl: "Verken beroepen", de: "Berufe entdecken" } },
  privacy: { href: "/legal/privacy", label: { en: "Read the privacy policy", lt: "Skaityti privatumo politiką", ru: "Политика конфиденциальности", nl: "Lees het privacybeleid", de: "Datenschutzerklärung lesen" } },
  none: null,
};

export function pickL(map: L, locale: ActiveLocale): string {
  return map[locale];
}
