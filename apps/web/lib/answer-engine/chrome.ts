/**
 * Answer Engine — page chrome + localized taxonomy labels + CTA mapping.
 *
 * Per-locale (every active locale) strings for the hub / category / question page
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
    pl: "Pytania i odpowiedzi",
    sv: "Frågor och svar",
  } satisfies L,
  hubIntro: {
    en: "Clear, honest answers about work, skills, careers, learning and hiring — wherever you work.",
    lt: "Aiškūs, sąžiningi atsakymai apie darbą, įgūdžius, karjerą, mokymąsi ir įdarbinimą — kad ir kur dirbtumėte.",
    ru: "Понятные и честные ответы о работе, навыках, карьере, обучении и найме — где бы вы ни работали.",
    nl: "Duidelijke, eerlijke antwoorden over werk, vaardigheden, loopbaan, leren en werving — waar je ook werkt.",
    de: "Klare, ehrliche Antworten zu Arbeit, Fähigkeiten, Karriere, Lernen und Einstellung — wo immer Sie arbeiten.",
    pl: "Jasne, uczciwe odpowiedzi o pracy, umiejętnościach, karierze, nauce i rekrutacji — gdziekolwiek pracujesz.",
    sv: "Tydliga, ärliga svar om arbete, färdigheter, karriär, lärande och rekrytering — var du än arbetar.",
  } satisfies L,
  hubEmpty: {
    en: "Answers are being prepared and reviewed. Published questions will appear here.",
    lt: "Atsakymai ruošiami ir peržiūrimi. Publikuoti klausimai atsiras čia.",
    ru: "Ответы готовятся и проверяются. Опубликованные вопросы появятся здесь.",
    nl: "Antwoorden worden voorbereid en beoordeeld. Gepubliceerde vragen verschijnen hier.",
    de: "Antworten werden vorbereitet und geprüft. Veröffentlichte Fragen erscheinen hier.",
    pl: "Odpowiedzi są przygotowywane i sprawdzane. Opublikowane pytania pojawią się tutaj.",
    sv: "Svaren förbereds och granskas. Publicerade frågor visas här.",
  } satisfies L,
  breadcrumbHome: { en: "Home", lt: "Pradžia", ru: "Главная", nl: "Home", de: "Start", pl: "Strona główna", sv: "Start" } satisfies L,
  breadcrumbQuestions: {
    en: "Questions", lt: "Klausimai", ru: "Вопросы", nl: "Vragen", de: "Fragen", pl: "Pytania", sv: "Frågor",
  } satisfies L,
  breadcrumbAria: {
    en: "Breadcrumb", lt: "Naršymo kelias", ru: "Хлебные крошки", nl: "Kruimelpad", de: "Brotkrümelnavigation", pl: "Ścieżka nawigacji", sv: "Brödsmulor",
  } satisfies L,
  shortAnswer: {
    en: "Short answer", lt: "Trumpas atsakymas", ru: "Краткий ответ", nl: "Kort antwoord", de: "Kurze Antwort", pl: "Krótka odpowiedź", sv: "Kort svar",
  } satisfies L,
  practicalSteps: {
    en: "Practical steps", lt: "Praktiniai veiksmai", ru: "Практические шаги", nl: "Praktische stappen", de: "Praktische Schritte", pl: "Praktyczne kroki", sv: "Praktiska steg",
  } satisfies L,
  limitations: {
    en: "Good to know", lt: "Verta žinoti", ru: "Важно знать", nl: "Goed om te weten", de: "Gut zu wissen", pl: "Warto wiedzieć", sv: "Bra att veta",
  } satisfies L,
  countryScope: {
    en: "Where this applies", lt: "Kur tai galioja", ru: "Где это применимо", nl: "Waar dit geldt", de: "Wo dies gilt", pl: "Gdzie to obowiązuje", sv: "Var detta gäller",
  } satisfies L,
  sources: { en: "Sources", lt: "Šaltiniai", ru: "Источники", nl: "Bronnen", de: "Quellen", pl: "Źródła", sv: "Källor" } satisfies L,
  lastReviewed: {
    en: "Last reviewed", lt: "Paskutinį kartą peržiūrėta", ru: "Последняя проверка", nl: "Laatst herzien", de: "Zuletzt geprüft", pl: "Ostatnio sprawdzone", sv: "Senast granskad",
  } satisfies L,
  editorialBy: {
    en: "Editorial responsibility", lt: "Redakcinė atsakomybė", ru: "Редакционная ответственность", nl: "Redactionele verantwoordelijkheid", de: "Redaktionelle Verantwortung", pl: "Odpowiedzialność redakcyjna", sv: "Redaktionellt ansvar",
  } satisfies L,
  related: {
    en: "Related questions", lt: "Susiję klausimai", ru: "Похожие вопросы", nl: "Gerelateerde vragen", de: "Verwandte Fragen", pl: "Powiązane pytania", sv: "Relaterade frågor",
  } satisfies L,
  inCategory: { en: "Category", lt: "Kategorija", ru: "Категория", nl: "Categorie", de: "Kategorie", pl: "Kategoria", sv: "Kategori" } satisfies L,
  notLegalAdvice: {
    en: "Informational only — not legal advice. Confirm specifics with the competent authority.",
    lt: "Tik informacinio pobūdžio — ne teisinė konsultacija. Konkrečius atvejus tikslinkite kompetentingoje institucijoje.",
    ru: "Только информация — не юридическая консультация. Уточняйте детали в компетентном органе.",
    nl: "Alleen informatief — geen juridisch advies. Bevestig details bij de bevoegde autoriteit.",
    de: "Nur zur Information — keine Rechtsberatung. Details bei der zuständigen Behörde bestätigen.",
    pl: "Wyłącznie informacyjnie — to nie jest porada prawna. Szczegóły potwierdź we właściwym urzędzie.",
    sv: "Endast information — inte juridisk rådgivning. Bekräfta detaljerna hos ansvarig myndighet.",
  } satisfies L,
} as const;

export const CATEGORY_LABELS: Readonly<Record<AnswerCategoryKey, L>> = {
  job_search_discovery: { en: "Finding work & opportunities", lt: "Darbo ir galimybių paieška", ru: "Поиск работы и возможностей", nl: "Werk & kansen vinden", de: "Arbeit & Chancen finden", pl: "Znajdowanie pracy i możliwości", sv: "Hitta arbete och möjligheter" },
  cv_profile_experience: { en: "CV, profile & experience", lt: "CV, profilis ir patirtis", ru: "Резюме, профиль и опыт", nl: "CV, profiel & ervaring", de: "Lebenslauf, Profil & Erfahrung", pl: "CV, profil i doświadczenie", sv: "CV, profil och erfarenhet" },
  skills_competencies: { en: "Skills & competencies", lt: "Įgūdžiai ir kompetencijos", ru: "Навыки и компетенции", nl: "Vaardigheden & competenties", de: "Fähigkeiten & Kompetenzen", pl: "Umiejętności i kompetencje", sv: "Färdigheter och kompetenser" },
  professions_directions: { en: "Professions & directions", lt: "Profesijos ir kryptys", ru: "Профессии и направления", nl: "Beroepen & richtingen", de: "Berufe & Richtungen", pl: "Zawody i kierunki", sv: "Yrken och inriktningar" },
  career_change_transferable: { en: "Career change & transferable skills", lt: "Karjeros keitimas ir perkeliami įgūdžiai", ru: "Смена карьеры и переносимые навыки", nl: "Loopbaanverandering & overdraagbare vaardigheden", de: "Berufswechsel & übertragbare Fähigkeiten", pl: "Zmiana kariery i umiejętności przenoszalne", sv: "Karriärbyte och överförbara färdigheter" },
  reskilling_learning: { en: "Reskilling & learning", lt: "Persikvalifikavimas ir mokymasis", ru: "Переквалификация и обучение", nl: "Omscholing & leren", de: "Umschulung & Lernen", pl: "Przekwalifikowanie i nauka", sv: "Omskolning och lärande" },
  salary_conditions: { en: "Pay & working conditions", lt: "Atlyginimas ir darbo sąlygos", ru: "Оплата и условия труда", nl: "Loon & arbeidsvoorwaarden", de: "Bezahlung & Arbeitsbedingungen", pl: "Wynagrodzenie i warunki pracy", sv: "Lön och arbetsvillkor" },
  working_in_eu_countries: { en: "Working in EU countries", lt: "Darbas ES šalyse", ru: "Работа в странах ЕС", nl: "Werken in EU-landen", de: "Arbeiten in EU-Ländern", pl: "Praca w krajach UE", sv: "Arbeta i EU-länder" },
  international_regional_mobility: { en: "International & regional mobility", lt: "Tarptautinis ir regioninis mobilumas", ru: "Международная и региональная мобильность", nl: "Internationale & regionale mobiliteit", de: "Internationale & regionale Mobilität", pl: "Mobilność międzynarodowa i regionalna", sv: "Internationell och regional rörlighet" },
  employers_finding_workers: { en: "Employers & finding workers", lt: "Darbdaviams ir darbuotojų paieška", ru: "Работодателям и поиск работников", nl: "Werkgevers & personeel vinden", de: "Arbeitgeber & Personalsuche", pl: "Pracodawcy i szukanie pracowników", sv: "Arbetsgivare och att hitta personal" },
  companies_teams_projects: { en: "Companies, teams & projects", lt: "Įmonės, komandos ir projektai", ru: "Компании, команды и проекты", nl: "Bedrijven, teams & projecten", de: "Unternehmen, Teams & Projekte", pl: "Firmy, zespoły i projekty", sv: "Företag, team och projekt" },
  students_graduates_institutions: { en: "Students, graduates & institutions", lt: "Studentai, absolventai ir įstaigos", ru: "Студенты, выпускники и учреждения", nl: "Studenten, afgestudeerden & instellingen", de: "Studierende, Absolventen & Einrichtungen", pl: "Studenci, absolwenci i instytucje", sv: "Studenter, nyutexaminerade och lärosäten" },
  agencies_partners: { en: "Agencies & partners", lt: "Agentūros ir partneriai", ru: "Агентства и партнёры", nl: "Bureaus & partners", de: "Agenturen & Partner", pl: "Agencje i partnerzy", sv: "Bemanningsföretag och partner" },
  labour_market_data_trends: { en: "Labour-market data & trends", lt: "Darbo rinkos duomenys ir tendencijos", ru: "Данные и тренды рынка труда", nl: "Arbeidsmarktgegevens & trends", de: "Arbeitsmarktdaten & Trends", pl: "Dane i trendy rynku pracy", sv: "Arbetsmarknadsdata och trender" },
  ai_automation_future: { en: "AI, automation & the future of work", lt: "DI, automatizacija ir darbo ateitis", ru: "ИИ, автоматизация и будущее труда", nl: "AI, automatisering & de toekomst van werk", de: "KI, Automatisierung & Zukunft der Arbeit", pl: "AI, automatyzacja i przyszłość pracy", sv: "AI, automatisering och framtidens arbete" },
  platform_usage_security_privacy: { en: "Using LabourMarket.ai, security & privacy", lt: "LabourMarket.ai naudojimas, sauga ir privatumas", ru: "Использование LabourMarket.ai, безопасность и приватность", nl: "LabourMarket.ai gebruiken, beveiliging & privacy", de: "LabourMarket.ai nutzen, Sicherheit & Datenschutz", pl: "Korzystanie z LabourMarket.ai, bezpieczeństwo i prywatność", sv: "Använda LabourMarket.ai, säkerhet och integritet" },
};

/** capability → real public route + localized CTA label (or null = no CTA). */
export const CTA_FOR_CAPABILITY: Readonly<Record<string, { href: string; label: L } | null>> = {
  "opportunity-board": { href: "/work-opportunities", label: { en: "See work opportunities", lt: "Žiūrėti darbo galimybes", ru: "Смотреть возможности работы", nl: "Bekijk werkkansen", de: "Arbeitsmöglichkeiten ansehen", pl: "Zobacz możliwości pracy", sv: "Se arbetsmöjligheter" } },
  "adjacent-directions": { href: "/professions", label: { en: "Explore professions", lt: "Naršyti profesijas", ru: "Изучить профессии", nl: "Verken beroepen", de: "Berufe entdecken", pl: "Poznaj zawody", sv: "Utforska yrken" } },
  profile: { href: "/for-workers", label: { en: "Build your profile", lt: "Susikurti profilį", ru: "Создать профиль", nl: "Bouw je profiel", de: "Profil erstellen", pl: "Zbuduj swój profil", sv: "Bygg din profil" } },
  cv: { href: "/for-workers", label: { en: "Build your profile", lt: "Susikurti profilį", ru: "Создать профиль", nl: "Bouw je profiel", de: "Profil erstellen", pl: "Zbuduj swój profil", sv: "Bygg din profil" } },
  "work-journal": { href: "/for-workers", label: { en: "Build your profile", lt: "Susikurti profilį", ru: "Создать профиль", nl: "Bouw je profiel", de: "Profil erstellen", pl: "Zbuduj swój profil", sv: "Bygg din profil" } },
  skills: { href: "/skills", label: { en: "See how skills work", lt: "Kaip veikia įgūdžiai", ru: "Как работают навыки", nl: "Hoe vaardigheden werken", de: "Wie Fähigkeiten funktionieren", pl: "Jak działają umiejętności", sv: "Så fungerar färdigheter" } },
  matching: { href: "/for-companies", label: { en: "For employers", lt: "Darbdaviams", ru: "Работодателям", nl: "Voor werkgevers", de: "Für Arbeitgeber", pl: "Dla pracodawców", sv: "För arbetsgivare" } },
  scouting: { href: "/for-companies", label: { en: "For employers", lt: "Darbdaviams", ru: "Работодателям", nl: "Voor werkgevers", de: "Für Arbeitgeber", pl: "Dla pracodawców", sv: "För arbetsgivare" } },
  company: { href: "/for-companies", label: { en: "For companies", lt: "Įmonėms", ru: "Компаниям", nl: "Voor bedrijven", de: "Für Unternehmen", pl: "Dla firm", sv: "För företag" } },
  teams: { href: "/for-companies", label: { en: "For companies", lt: "Įmonėms", ru: "Компаниям", nl: "Voor bedrijven", de: "Für Unternehmen", pl: "Dla firm", sv: "För företag" } },
  "country-readiness": { href: "/work-abroad", label: { en: "Working abroad", lt: "Darbas užsienyje", ru: "Работа за рубежом", nl: "Werken in het buitenland", de: "Arbeiten im Ausland", pl: "Praca za granicą", sv: "Arbeta utomlands" } },
  intelligence: { href: "/labour-market", label: { en: "Labour-market signals", lt: "Darbo rinkos signalai", ru: "Сигналы рынка труда", nl: "Arbeidsmarktsignalen", de: "Arbeitsmarktsignale", pl: "Sygnały rynku pracy", sv: "Arbetsmarknadssignaler" } },
  professions: { href: "/professions", label: { en: "Explore professions", lt: "Naršyti profesijas", ru: "Изучить профессии", nl: "Verken beroepen", de: "Berufe entdecken", pl: "Poznaj zawody", sv: "Utforska yrken" } },
  privacy: { href: "/legal/privacy", label: { en: "Read the privacy policy", lt: "Skaityti privatumo politiką", ru: "Политика конфиденциальности", nl: "Lees het privacybeleid", de: "Datenschutzerklärung lesen", pl: "Przeczytaj politykę prywatności", sv: "Läs integritetspolicyn" } },
  none: null,
};

export function pickL(map: L, locale: ActiveLocale): string {
  return map[locale];
}
