/**
 * Curated command / action registry — the ONLY data source of the dashboard
 * command finder (WAGON 3, Commercial Readiness & Human Usability Train).
 *
 * A user types a normal word ("cv", "kortelė", "žurnalas", "brigada",
 * "paklausa", "kainos", "gdpr" …) and gets a short list of links to the
 * right EXISTING surface. Design contract:
 *
 *  - Pure data + pure matching. No AI, no external search provider, no
 *    fuzzy-search dependency — deterministic in-house scoring over labels +
 *    synonyms in the viewer's active locale, with an EN fallback. Ranking
 *    (unified-text-navigation v1): exact label > label prefix > synonym
 *    exact > synonym prefix > substring > all-tokens-prefix > bounded
 *    typo tolerance (in-house Damerau-Levenshtein, distance ≤1 for tokens
 *    ≥5 chars, ≤2 for tokens ≥8 chars). Same order every time — ties keep
 *    catalogue order. Object search (dashboard-search-model) reuses the
 *    SAME text-matching truth via `queryMatchesText`.
 *  - Every route points at a REAL page that exists today. Dashboard routes
 *    are REAL_LAUNCH_SURFACE in the route truth map (or INTERNAL_ADMIN for
 *    the single audience:"admin" entry). No GATED_PREVIEW, no
 *    DUPLICATE_DRIFT, no REDIRECT_STUB, no dead route, no invented page.
 *    The guard test (lib/guards/command-finder.test.ts) enforces this
 *    against the app tree on every run.
 *  - No payment / checkout action. /pricing is the honest marketing
 *    explanation page only (payment provider stays disconnected).
 *  - Audience is a DISPLAY convenience, never a security boundary — every
 *    destination page keeps enforcing its own auth / role / superadmin
 *    gates server-side. "admin" entries surface only for admin viewers.
 *
 * WAGON 10 (shipped): the "recruiter help", "accounting help" and
 * "legal help" terms route to the REAL typed help-request panel on the
 * company workspace, where submitting creates an internal
 * customer_requests record reviewed by a human (owner lock #1 flipped
 * together with command-finder.test.ts). Ids and synonyms stayed stable;
 * labels moved from "(information)" to truthful request-action phrasing.
 *
 * Control room PR B: entries whose destination is a dashboard MODULE now
 * resolve their route through the one module registry
 * (lib/dashboard/dashboard-module-registry.ts → getModuleRoute), so the
 * finder can never drift to a different route than the control-room grid
 * and the nav. Non-module destinations (marketing/legal pages, admin,
 * anchors like the demand intake) keep their literal routes.
 */

import type { ActiveLocale } from "@/lib/i18n/config";
import { getModuleRoute } from "@/lib/dashboard/dashboard-module-registry";

export type CommandAudience = "public" | "worker" | "company" | "admin";

export type CommandEntry = {
  /** Stable id (telemetry / tests / React keys). */
  id: string;
  /** User-facing label per ACTIVE locale (lt/en/ru). */
  labels: Readonly<Record<ActiveLocale, string>>;
  /** Search terms per ACTIVE locale. Lithuanian terms matter most — they
   *  are what a worker on a site actually types. */
  synonyms: Readonly<Record<ActiveLocale, readonly string[]>>;
  /** Locale-prefix-free app route. MUST resolve to an existing page. */
  route: string;
  /**
   * Who the result is useful for. Semantics (display-only filter):
   *  - "public"  — every finder viewer (the finder ships only inside the
   *                authenticated dashboard; marketing/legal routes are
   *                additionally reachable logged-out);
   *  - "worker"  — shown when the viewer has the worker role;
   *  - "company" — shown when the viewer has the company or agency role;
   *  - "admin"   — shown ONLY for admin viewers (server-derived signal).
   */
  audience: CommandAudience;
};

export const COMMAND_REGISTRY: readonly CommandEntry[] = [
  // ── Person / worker surfaces ──────────────────────────────────────────
  {
    id: "profile",
    route: getModuleRoute("profile"),
    audience: "public",
    labels: {
      en: "My profile",
      lt: "Mano profilis",
      ru: "Мой профиль",
      nl: "Mijn profiel",
      de: "Mein Profil",
    },
    synonyms: {
      en: ["profile", "my page", "identity"],
      lt: ["profilis", "mano puslapis", "anketa"],
      ru: ["профиль", "анкета", "моя страница"],
      nl: ["profiel", "mijn pagina", "mijn gegevens"],
      de: ["profil", "meine seite", "persönliche daten"],
    },
  },
  {
    id: "player_card",
    // Canonical Player Card home is the profile (the old /dashboard/player-card
    // route is a REDIRECT_STUB — we link the real destination directly).
    route: "/dashboard/profile",
    audience: "worker",
    labels: {
      en: "Player Card (work card)",
      lt: "Žaidėjo kortelė (darbo kortelė)",
      ru: "Карточка игрока (рабочая карточка)",
      nl: "Spelerskaart (werkkaart)",
      de: "Spielerkarte (Arbeitskarte)",
    },
    synonyms: {
      en: ["player card", "work card", "card"],
      lt: ["kortelė", "žaidėjo kortelė", "darbo kortelė"],
      ru: ["карточка", "карта игрока", "рабочая карточка"],
      nl: ["spelerskaart", "werkkaart", "kaart"],
      de: ["spielerkarte", "arbeitskarte", "karte"],
    },
  },
  {
    id: "cv",
    route: "/cv",
    audience: "worker",
    labels: {
      en: "CV (print / export)",
      lt: "CV (gyvenimo aprašymas)",
      ru: "CV (резюме)",
      nl: "CV (afdrukken / exporteren)",
      de: "Lebenslauf (drucken / exportieren)",
    },
    synonyms: {
      en: ["cv", "resume", "curriculum vitae", "print cv", "create cv"],
      lt: ["cv", "gyvenimo aprašymas", "spausdinti cv", "sukurti cv"],
      ru: ["резюме", "cv", "печать резюме", "создать резюме"],
      nl: ["cv", "curriculum vitae", "cv afdrukken", "cv maken"],
      de: ["lebenslauf", "cv", "lebenslauf drucken", "lebenslauf erstellen"],
    },
  },
  // "Pridėti patirtį" — experience lives on the profile (the journal feeds
  // it with evidence). The finder answers the owner phrase with the surface
  // where experience is actually edited — no new page invented.
  {
    id: "add_experience",
    route: getModuleRoute("profile"),
    audience: "worker",
    labels: {
      en: "Add experience (profile)",
      lt: "Pridėti patirtį (profilyje)",
      ru: "Добавить опыт (в профиле)",
      nl: "Ervaring toevoegen (profiel)",
      de: "Erfahrung hinzufügen (Profil)",
    },
    synonyms: {
      en: ["add experience", "experience", "work history"],
      lt: ["pridėti patirtį", "patirtis", "darbo patirtis"],
      ru: ["добавить опыт", "опыт", "опыт работы"],
      nl: ["ervaring toevoegen", "ervaring", "werkervaring"],
      de: ["erfahrung hinzufügen", "erfahrung", "berufserfahrung"],
    },
  },
  {
    id: "work_journal",
    route: getModuleRoute("journal"),
    audience: "worker",
    labels: {
      en: "Work journal",
      lt: "Darbo žurnalas",
      ru: "Рабочий журнал",
      nl: "Werkdagboek",
      de: "Arbeitsjournal",
    },
    synonyms: {
      en: ["journal", "diary", "log work", "record work"],
      lt: ["žurnalas", "darbo žurnalas", "užrašyti darbą", "dienynas"],
      ru: ["журнал", "дневник", "записать работу"],
      nl: ["dagboek", "werkdagboek", "logboek", "werk vastleggen"],
      de: ["journal", "arbeitsjournal", "tagebuch", "arbeit erfassen"],
    },
  },
  // Photo report = a work JOURNAL entry mode (owner clarification 2026-07-05,
  // browser-smoke finding) — NOT a separate system. The finder must answer
  // "foto ataskaita / foto report" with the journal, where the mode lives.
  {
    id: "photo_report",
    route: getModuleRoute("journal"),
    audience: "worker",
    labels: {
      en: "Photo report (work journal)",
      lt: "Foto ataskaita (darbo žurnale)",
      ru: "Фотоотчёт (журнал работ)",
      nl: "Fotoverslag (werkdagboek)",
      de: "Fotobericht (Arbeitsjournal)",
    },
    synonyms: {
      en: ["photo report", "work photos", "photo entry"],
      lt: ["foto ataskaita", "foto report", "darbų nuotraukos", "nuotraukų ataskaita"],
      ru: ["фотоотчёт", "фото отчет", "рабочие фото"],
      nl: ["fotoverslag", "foto rapport", "werkfoto's"],
      de: ["fotobericht", "fotoreport", "arbeitsfotos"],
    },
  },
  // Work gallery = the manager-side read of those SAME journal photos on the
  // project pages (WAGON 8) — one photo system, two honest surfaces.
  {
    id: "work_gallery",
    // Control room PR G: projects is now a dashboard module — every entry
    // whose destination is the projects surface resolves through the one
    // module registry (route-drift killer).
    route: getModuleRoute("projects"),
    audience: "company",
    labels: {
      en: "Work gallery (project photo reports)",
      lt: "Darbų galerija (projekto foto ataskaitos)",
      ru: "Галерея работ (фотоотчёты проекта)",
      nl: "Werkgalerij (projectfotoverslagen)",
      de: "Arbeitsgalerie (Projekt-Fotoberichte)",
    },
    synonyms: {
      en: ["gallery", "work gallery", "project photos"],
      lt: ["galerija", "darbų galerija", "projekto nuotraukos"],
      ru: ["галерея", "галерея работ", "фото проекта"],
      nl: ["galerij", "werkgalerij", "projectfoto's"],
      de: ["galerie", "arbeitsgalerie", "projektfotos"],
    },
  },
  {
    id: "skills",
    // Skills live on the profile (journal feeds them) — no separate page.
    route: getModuleRoute("profile"),
    audience: "worker",
    labels: {
      en: "Skills",
      lt: "Įgūdžiai",
      ru: "Навыки",
      nl: "Vaardigheden",
      de: "Fähigkeiten",
    },
    synonyms: {
      en: ["skills", "abilities", "competences"],
      lt: ["įgūdžiai", "gebėjimai", "kompetencijos"],
      ru: ["навыки", "умения", "компетенции"],
      nl: ["vaardigheden", "skills", "competenties"],
      de: ["fähigkeiten", "kompetenzen", "qualifikationen"],
    },
  },
  {
    id: "find_work",
    route: getModuleRoute("opportunities"),
    audience: "worker",
    labels: {
      en: "Find work (opportunities)",
      lt: "Rasti darbą (galimybės)",
      ru: "Найти работу (возможности)",
      nl: "Werk vinden (kansen)",
      de: "Arbeit finden (Angebote)",
    },
    synonyms: {
      en: ["job", "work", "find work", "vacancies", "opportunities", "job opportunities"],
      lt: ["darbas", "darbo paieška", "pasiūlymai", "galimybės", "darbo galimybės"],
      ru: ["работа", "вакансии", "поиск работы", "возможности работы"],
      nl: ["werk", "baan", "vacatures", "werk zoeken", "kansen", "werkkansen"],
      de: ["arbeit", "job", "stellenangebote", "arbeit suchen", "jobangebote"],
    },
  },
  // "Paraiškos / susidomėjimai" — the worker's expressions of interest live
  // on the opportunities board (express / withdraw / honest company-response
  // status). Links the list surface where the user picks the object —
  // object-specific actions stay on the page itself.
  {
    id: "interests",
    route: getModuleRoute("opportunities"),
    audience: "worker",
    labels: {
      en: "Applications & interests",
      lt: "Paraiškos ir susidomėjimai",
      ru: "Заявки и отклики",
      nl: "Aanmeldingen en interesses",
      de: "Bewerbungen und Interessen",
    },
    synonyms: {
      en: ["applications", "interests", "expressed interest", "my applications"],
      lt: ["paraiškos", "susidomėjimai", "pareikšti susidomėjimą", "mano paraiškos"],
      ru: ["заявки", "отклики", "интерес", "мои заявки"],
      nl: ["aanmeldingen", "interesses", "interesse tonen", "mijn aanmeldingen"],
      de: ["bewerbungen", "interessen", "interesse zeigen", "meine bewerbungen"],
    },
  },
  // Transport / tools / accommodation are honest work-condition fields on
  // the opportunities surface — not separate products. Linking them there
  // is the closest real answer to what the user is asking about.
  {
    id: "transport",
    route: getModuleRoute("opportunities"),
    audience: "worker",
    labels: {
      en: "Transport (work conditions)",
      lt: "Transportas (darbo sąlygos)",
      ru: "Транспорт (условия работы)",
      nl: "Vervoer (werkomstandigheden)",
      de: "Transport (Arbeitsbedingungen)",
    },
    synonyms: {
      en: ["transport", "travel", "commute"],
      lt: ["transportas", "kelionė", "pavėžėjimas"],
      ru: ["транспорт", "проезд"],
      nl: ["vervoer", "transport", "reizen", "woon-werkverkeer"],
      de: ["transport", "anfahrt", "fahrt", "pendeln"],
    },
  },
  {
    id: "tools",
    route: getModuleRoute("opportunities"),
    audience: "worker",
    labels: {
      en: "Tools & equipment (work conditions)",
      lt: "Įrankiai ir įranga (darbo sąlygos)",
      ru: "Инструменты и оборудование (условия работы)",
      nl: "Gereedschap en uitrusting (werkomstandigheden)",
      de: "Werkzeuge und Ausrüstung (Arbeitsbedingungen)",
    },
    synonyms: {
      en: ["tools", "equipment"],
      lt: ["įrankiai", "įranga"],
      ru: ["инструменты", "оборудование"],
      nl: ["gereedschap", "uitrusting", "materiaal"],
      de: ["werkzeug", "werkzeuge", "ausrüstung", "geräte"],
    },
  },
  {
    id: "accommodation",
    route: getModuleRoute("opportunities"),
    audience: "worker",
    labels: {
      en: "Accommodation (work conditions)",
      lt: "Apgyvendinimas (darbo sąlygos)",
      ru: "Проживание (условия работы)",
      nl: "Huisvesting (werkomstandigheden)",
      de: "Unterkunft (Arbeitsbedingungen)",
    },
    synonyms: {
      en: ["accommodation", "housing", "lodging"],
      lt: ["apgyvendinimas", "būstas"],
      ru: ["проживание", "жильё", "жилье"],
      nl: ["huisvesting", "woning", "accommodatie", "onderdak"],
      de: ["unterkunft", "wohnung", "wohnen"],
    },
  },

  // ── Company / organisation surfaces ───────────────────────────────────
  {
    id: "team_brigade",
    route: getModuleRoute("company"),
    audience: "company",
    labels: {
      en: "Team & brigades (company workspace)",
      lt: "Komanda ir brigados (įmonės erdvė)",
      ru: "Команда и бригады (пространство компании)",
      nl: "Team en ploegen (bedrijfsomgeving)",
      de: "Team und Kolonnen (Firmenbereich)",
    },
    synonyms: {
      en: ["team", "brigade", "crew", "company", "workers list"],
      lt: ["komanda", "brigada", "įmonė", "darbuotojų sąrašas"],
      ru: ["команда", "бригада", "компания"],
      nl: ["team", "ploeg", "brigade", "bedrijf", "medewerkerslijst"],
      de: ["team", "kolonne", "brigade", "firma", "mitarbeiterliste"],
    },
  },
  {
    id: "workforce_planning",
    // Labour Market OS P10: the workforce-planning zone inside the company
    // workspace (upcoming work vs. capacity, gaps, risk date).
    route: getModuleRoute("workforce_planning"),
    audience: "company",
    labels: {
      en: "Workforce planning",
      lt: "Darbo jėgos planavimas",
      ru: "Планирование персонала",
      nl: "Personeelsplanning",
      de: "Personalplanung",
    },
    synonyms: {
      en: ["workforce", "capacity", "skill gap", "headcount", "planning zone"],
      lt: ["darbo jėga", "pajėgumas", "trūkumai", "žmonių poreikis"],
      ru: ["персонал", "мощность", "нехватка", "потребность в людях"],
      nl: ["personeel", "capaciteit", "tekort", "personeelsbehoefte"],
      de: ["personal", "kapazität", "engpass", "personalbedarf"],
    },
  },
  {
    id: "objects_projects",
    route: getModuleRoute("projects"),
    audience: "company",
    labels: {
      en: "Objects & projects",
      lt: "Objektai ir projektai",
      ru: "Объекты и проекты",
      nl: "Objecten en projecten",
      de: "Objekte und Projekte",
    },
    synonyms: {
      en: ["object", "project", "projects", "site", "construction site"],
      lt: ["objektas", "projektas", "projektai", "statybvietė", "aikštelė"],
      ru: ["объект", "проект", "проекты", "стройка"],
      nl: ["object", "project", "projecten", "bouwplaats", "werf"],
      de: ["objekt", "projekt", "projekte", "baustelle"],
    },
  },
  // Manager journal-review inbox — the dashboard chain-actions card links it
  // (components/app/dashboard-chain-actions.tsx); folded here so the ONE
  // search also finds it (destinations folded, the card stays).
  {
    id: "review_inbox",
    route: "/dashboard/inbox",
    audience: "company",
    labels: {
      en: "Review worker entries (inbox)",
      lt: "Peržiūrėti darbuotojų įrašus (gauta)",
      ru: "Проверка записей работников (входящие)",
      nl: "Werknemersinvoer beoordelen (inbox)",
      de: "Mitarbeitereinträge prüfen (Eingang)",
    },
    synonyms: {
      en: ["inbox", "review entries", "journal review", "approve entries"],
      lt: ["gauta", "peržiūrėti įrašus", "žurnalo peržiūra", "patvirtinti įrašus"],
      ru: ["входящие", "проверить записи", "проверка журнала"],
      nl: ["inbox", "invoer beoordelen", "dagboek beoordelen"],
      de: ["eingang", "einträge prüfen", "journalprüfung"],
    },
  },
  {
    id: "follow_up",
    // Follow-up chips / counters live in project operations under the
    // projects module surface.
    route: getModuleRoute("projects"),
    audience: "company",
    labels: {
      en: "Follow-up (project operations)",
      lt: "Tolesni veiksmai (projektų eiga)",
      ru: "Последующие действия (ход проектов)",
      nl: "Opvolging (projectvoortgang)",
      de: "Nachverfolgung (Projektablauf)",
    },
    synonyms: {
      en: ["follow-up", "follow up", "operations"],
      lt: ["tęsinys", "priminimai", "projektų eiga"],
      ru: ["напоминания", "операции", "ход работ"],
      nl: ["opvolging", "follow-up", "herinneringen"],
      de: ["nachverfolgung", "wiedervorlage", "erinnerungen"],
    },
  },
  {
    id: "work_demand",
    // The structured work-need (demand) intake lives on the dashboard
    // overview for company/agency roles (DemandRequestButton section).
    route: "/dashboard",
    audience: "company",
    labels: {
      en: "Post a work need (demand)",
      lt: "Paskelbti darbo poreikį (paklausa)",
      ru: "Разместить потребность в работниках (спрос)",
      nl: "Werkbehoefte plaatsen (vraag)",
      de: "Personalbedarf veröffentlichen (Nachfrage)",
    },
    synonyms: {
      en: [
        "demand",
        "work need",
        "need workers",
        "hiring request",
        "company needs",
        "create a work need",
      ],
      lt: [
        "paklausa",
        "poreikis",
        "darbo poreikis",
        "įmonės poreikiai",
        "sukurti darbo poreikį",
      ],
      ru: [
        "спрос",
        "потребность",
        "заявка на работников",
        "потребности компании",
        "создать потребность",
      ],
      nl: [
        "vraag",
        "behoefte",
        "werkbehoefte",
        "personeel nodig",
        "bedrijfsbehoeften",
        "werkbehoefte aanmaken",
      ],
      de: [
        "nachfrage",
        "bedarf",
        "personalbedarf",
        "arbeiter gesucht",
        "unternehmensbedarf",
        "personalbedarf erstellen",
      ],
    },
  },
  {
    id: "find_workers",
    route: "/dashboard/company/scouting",
    audience: "company",
    labels: {
      en: "Find workers (scouting)",
      lt: "Rasti darbuotojų (atranka)",
      ru: "Найти работников (скаутинг)",
      nl: "Werknemers vinden (scouting)",
      de: "Arbeitskräfte finden (Scouting)",
    },
    synonyms: {
      en: ["find workers", "scouting", "staff", "hire", "worker search", "find a team"],
      lt: ["darbuotojai", "rasti darbuotojų", "atranka", "samdyti", "darbuotojų paieška", "rasti komandą"],
      ru: ["работники", "найти работников", "подбор", "нанять", "поиск работников", "найти команду"],
      nl: ["werknemers", "personeel", "werknemers vinden", "werven", "personeel zoeken", "team vinden"],
      de: ["arbeiter", "arbeitskräfte", "personal finden", "einstellen", "personalsuche", "team finden"],
    },
  },
  {
    id: "candidates",
    route: "/dashboard/candidates",
    audience: "company",
    labels: {
      en: "Candidate drafts",
      lt: "Kandidatų juodraščiai",
      ru: "Черновики кандидатов",
      nl: "Kandidaat-concepten",
      de: "Kandidaten-Entwürfe",
    },
    synonyms: {
      en: ["candidates", "candidate pool", "drafts"],
      lt: ["kandidatai", "kandidatų sąrašas"],
      ru: ["кандидаты", "список кандидатов"],
      nl: ["kandidaten", "kandidatenlijst", "concepten"],
      de: ["kandidaten", "kandidatenliste", "entwürfe"],
    },
  },

  // ── Services / marketplace loop ───────────────────────────────────────
  {
    id: "services",
    route: getModuleRoute("services"),
    audience: "public",
    labels: {
      en: "Offer services",
      lt: "Siūlyti paslaugas",
      ru: "Предлагать услуги",
      nl: "Diensten aanbieden",
      de: "Dienstleistungen anbieten",
    },
    synonyms: {
      en: ["services", "my services", "offer a service", "publish service"],
      lt: ["paslaugos", "mano paslaugos", "teikti paslaugą"],
      ru: ["услуги", "мои услуги", "предложить услугу"],
      nl: ["diensten", "mijn diensten", "dienst aanbieden"],
      de: ["dienstleistungen", "meine dienstleistungen", "dienstleistung anbieten", "services"],
    },
  },
  {
    id: "service_requests",
    route: getModuleRoute("service_requests"),
    audience: "public",
    labels: {
      en: "Find services & service requests",
      lt: "Paslaugų paieška ir užklausos",
      ru: "Поиск услуг и заявки",
      nl: "Diensten zoeken en aanvragen",
      de: "Dienstleistungen finden und Anfragen",
    },
    synonyms: {
      en: ["service requests", "find services", "request a service"],
      lt: ["paslaugų užklausos", "rasti paslaugą", "užsakyti paslaugą"],
      ru: ["заявки на услуги", "найти услугу", "заказать услугу"],
      nl: ["dienstaanvragen", "dienst zoeken", "dienst aanvragen"],
      de: ["serviceanfragen", "dienstleistung finden", "dienstleistung anfragen"],
    },
  },
  // WAGON 10 SHIPPED (owner lock #1 flip, updated together with
  // command-finder.test.ts): the help terms now route to the REAL typed
  // help-request panel on the company workspace (#help), where submitting
  // creates an internal customer_requests record a human reviews. Action
  // phrasing is now truthful — a real internal request is created. The
  // platform still gives no legal/accounting advice, and no specialist is
  // auto-assigned; the panel says so.
  {
    id: "recruiter_help",
    route: getModuleRoute("company"),
    audience: "company",
    labels: {
      en: "Request recruiter / staffing help",
      lt: "Prašyti rekruterio / įdarbinimo pagalbos",
      ru: "Запросить помощь рекрутера / подбор персонала",
      nl: "Recruiter- / wervingshulp aanvragen",
      de: "Recruiter- / Personalhilfe anfordern",
    },
    synonyms: {
      en: ["recruiter", "staffing help", "recruitment"],
      lt: ["rekruteris", "įdarbinimo pagalba", "personalo atranka"],
      ru: ["рекрутер", "подбор персонала", "рекрутинг"],
      nl: ["recruiter", "wervingshulp", "werving en selectie"],
      de: ["recruiter", "personalvermittlung", "personalbeschaffung"],
    },
  },
  {
    id: "accounting_help",
    route: getModuleRoute("company"),
    audience: "company",
    labels: {
      en: "Request accounting help",
      lt: "Prašyti buhalterijos pagalbos",
      ru: "Запросить бухгалтерскую помощь",
      nl: "Boekhoudhulp aanvragen",
      de: "Buchhaltungshilfe anfordern",
    },
    synonyms: {
      en: ["accounting", "accountant", "bookkeeping", "taxes"],
      lt: ["buhalterija", "buhalteris", "apskaita", "mokesčiai"],
      ru: ["бухгалтерия", "бухгалтер", "налоги"],
      nl: ["boekhouding", "boekhouder", "administratie", "belastingen"],
      de: ["buchhaltung", "buchhalter", "steuern"],
    },
  },
  // Company sessions get the REAL legal/document help request (the typed
  // panel); the public "documents" entry below keeps the informational
  // documents room reachable for everyone (incl. WAGON 9 LT guidance).
  {
    id: "legal_help",
    route: getModuleRoute("company"),
    audience: "company",
    labels: {
      en: "Request legal & document help",
      lt: "Prašyti teisinės ir dokumentų pagalbos",
      ru: "Запросить юридическую и документную помощь",
      nl: "Juridische en documenthulp aanvragen",
      de: "Rechts- und Dokumentenhilfe anfordern",
    },
    synonyms: {
      en: ["legal help", "lawyer", "jurisdiction"],
      lt: ["teisinė pagalba", "teisininkas", "jurisdikcija"],
      ru: ["юридическая помощь", "юрист", "юрисдикция"],
      nl: ["juridische hulp", "jurist", "advocaat"],
      de: ["rechtshilfe", "anwalt", "jurist"],
    },
  },
  {
    id: "documents",
    route: getModuleRoute("documents"),
    audience: "public",
    labels: {
      en: "Documents",
      lt: "Dokumentai",
      ru: "Документы",
      nl: "Documenten",
      de: "Dokumente",
    },
    synonyms: {
      // PR H: the page is the document & work-proof centre — work-proof
      // language must land here too.
      en: [
        "documents",
        "my documents",
        "document records",
        "certificates",
        "work proof",
        "proof of work",
        "document centre",
        "expiring documents",
      ],
      lt: [
        "dokumentai",
        "mano dokumentai",
        "pažymos",
        "sertifikatai",
        "darbo įrodymai",
        "dokumentų centras",
        "besibaigiantys dokumentai",
      ],
      ru: [
        "документы",
        "справки",
        "сертификаты",
        "подтверждение работы",
        "центр документов",
      ],
      nl: [
        "documenten",
        "attesten",
        "certificaten",
        "werkbewijs",
        "documentencentrum",
      ],
      de: [
        "dokumente",
        "bescheinigungen",
        "zertifikate",
        "arbeitsnachweis",
        "dokumentenzentrum",
      ],
    },
  },

  // ── Communication / planning / map / account ──────────────────────────
  {
    id: "messages",
    route: getModuleRoute("communication"),
    audience: "public",
    labels: {
      en: "Messages",
      lt: "Žinutės",
      ru: "Сообщения",
      nl: "Berichten",
      de: "Nachrichten",
    },
    synonyms: {
      en: ["messages", "inbox", "chat", "communication"],
      lt: ["žinutės", "susirašinėjimas", "pokalbiai"],
      ru: ["сообщения", "чат", "переписка"],
      nl: ["berichten", "inbox", "chat", "communicatie"],
      de: ["nachrichten", "posteingang", "chat", "kommunikation"],
    },
  },
  {
    // Work tasks (control room PR D) — the "my tasks" list + simple board.
    // Route resolves through the module registry so it can never drift from
    // the grid card. Degrades honestly until the D2 migration is applied.
    id: "tasks",
    route: getModuleRoute("tasks"),
    audience: "public",
    labels: {
      en: "Tasks (my work list)",
      lt: "Užduotys (mano darbų sąrašas)",
      ru: "Задачи (мой список дел)",
      nl: "Taken (mijn werklijst)",
      de: "Aufgaben (meine Arbeitsliste)",
    },
    synonyms: {
      en: ["tasks", "task", "todo", "to-do", "my tasks", "task board"],
      lt: ["užduotys", "užduotis", "darbų sąrašas", "mano užduotys", "lenta"],
      ru: ["задачи", "задача", "список дел", "мои задачи", "доска задач"],
      nl: ["taken", "taak", "takenlijst", "mijn taken", "takenbord"],
      de: ["aufgaben", "aufgabe", "aufgabenliste", "meine aufgaben", "aufgabenboard"],
    },
  },
  {
    // Operational finance records (control room PR I) — manual invoices
    // issued/received + expenses. Route resolves through the module registry
    // so it can never drift from the grid card. Degrades honestly until the
    // I2 migration is applied. NOT a payment/checkout action — the guard's
    // payment-term ban stays satisfied (records only, nothing moves money).
    id: "finance",
    route: getModuleRoute("finance"),
    audience: "public",
    labels: {
      en: "Finance records (invoices & expenses)",
      lt: "Finansų įrašai (sąskaitos ir išlaidos)",
      ru: "Финансовые записи (счета и расходы)",
      nl: "Financiële registraties (facturen & uitgaven)",
      de: "Finanzeinträge (Rechnungen & Ausgaben)",
    },
    synonyms: {
      en: ["finance", "invoices", "invoice", "expenses", "expense", "overdue"],
      lt: ["finansai", "sąskaitos", "sąskaita faktūra", "išlaidos", "vėluojančios sąskaitos"],
      ru: ["финансы", "счета", "счёт", "расходы", "просроченные счета"],
      nl: ["financiën", "facturen", "factuur", "uitgaven", "kosten"],
      de: ["finanzen", "rechnungen", "rechnung", "ausgaben", "kosten"],
    },
  },
  {
    // Control room PR E: bookings speaks its own name; the generic
    // planning/calendar terms moved to the unified planning entry below.
    id: "bookings",
    route: getModuleRoute("bookings"),
    audience: "public",
    labels: {
      en: "Bookings",
      lt: "Rezervacijos",
      ru: "Бронирования",
      nl: "Boekingen",
      de: "Buchungen",
    },
    synonyms: {
      en: ["bookings", "booking", "proposals", "engagements"],
      lt: ["rezervacijos", "rezervacija", "pasiūlymai dirbti"],
      ru: ["бронирования", "бронирование", "предложения работы"],
      nl: ["boekingen", "boeking", "voorstellen"],
      de: ["buchungen", "buchung", "arbeitsangebote"],
    },
  },
  {
    // Unified planning agenda (control room PR E) — bookings + managed
    // project date bands + task due dates in one compact agenda. Route
    // resolves through the module registry so it can never drift from the
    // grid card.
    id: "planning",
    route: getModuleRoute("planning"),
    audience: "public",
    labels: {
      en: "Planning (agenda)",
      lt: "Planavimas (dienotvarkė)",
      ru: "Планирование (расписание)",
      nl: "Planning (agenda)",
      de: "Planung (Agenda)",
    },
    synonyms: {
      en: ["planning", "calendar", "agenda", "schedule", "plan"],
      lt: ["planavimas", "kalendorius", "dienotvarkė", "planas", "grafikas"],
      ru: ["планирование", "календарь", "расписание", "план", "график"],
      nl: ["planning", "agenda", "kalender", "schema", "plan"],
      de: ["planung", "kalender", "terminplanung", "zeitplan", "plan"],
    },
  },
  {
    // "Mano tinklas" (core-network area B) - organizations, relationships,
    // people/company search and the canonical invite action. Route resolves
    // through the module registry so it can never drift from the grid card.
    id: "network",
    route: getModuleRoute("network"),
    audience: "public",
    labels: {
      en: "My network (invite)",
      lt: "Mano tinklas (pakviesti)",
      ru: "Моя сеть (пригласить)",
      nl: "Mijn netwerk (uitnodigen)",
      de: "Mein Netzwerk (einladen)",
    },
    synonyms: {
      en: ["network", "invite", "invitation", "team members", "partners", "people search"],
      lt: ["tinklas", "pakviesti", "kvietimas", "komandos nariai", "partneriai", "žmonių paieška"],
      ru: ["сеть", "пригласить", "приглашение", "команда", "партнеры", "поиск людей"],
      nl: ["netwerk", "uitnodigen", "uitnodiging", "teamleden", "partners", "mensen zoeken"],
      de: ["netzwerk", "einladen", "einladung", "teammitglieder", "partner", "personensuche"],
    },
  },
  {
    id: "market_map",
    route: getModuleRoute("market_map"),
    audience: "public",
    labels: {
      en: "Market map",
      lt: "Žemėlapis",
      ru: "Карта рынка",
      nl: "Marktkaart",
      de: "Marktkarte",
    },
    synonyms: {
      en: ["map", "market map"],
      lt: ["žemėlapis", "rinkos žemėlapis"],
      ru: ["карта", "карта рынка"],
      nl: ["kaart", "marktkaart", "plattegrond"],
      de: ["karte", "marktkarte", "landkarte"],
    },
  },
  {
    // Unified activity centre (control room PR C) — every spine signal in
    // one place, with filters and honest read semantics. Route resolves
    // through the module registry so it can never drift from the grid card.
    id: "activity",
    route: getModuleRoute("activity"),
    audience: "public",
    labels: {
      en: "Activity centre",
      lt: "Veiklos centras",
      ru: "Центр активности",
      nl: "Activiteitencentrum",
      de: "Aktivitätszentrum",
    },
    synonyms: {
      en: ["activity", "notifications", "signals", "what's waiting"],
      lt: ["veikla", "pranešimai", "signalai", "kas laukia"],
      ru: ["активность", "уведомления", "сигналы", "что ждёт"],
      nl: ["activiteit", "meldingen", "signalen", "wat wacht"],
      de: ["aktivität", "benachrichtigungen", "signale", "was wartet"],
    },
  },
  {
    // AI assistance centre (control room PR J) — the deterministic "what
    // needs my attention" answer, deterministic role summaries and the
    // HONEST AI-provider state (disabled in production; nothing generated).
    // Route resolves through the module registry so it can never drift from
    // the grid card. Truthful label: assistance centre, not an active AI.
    id: "assist",
    route: getModuleRoute("assist"),
    audience: "public",
    labels: {
      en: "Assistance centre (what needs my attention)",
      lt: "Pagalbos centras (kam reikia mano dėmesio)",
      ru: "Центр помощи (что требует моего внимания)",
      nl: "Assistentiecentrum (wat heeft mijn aandacht nodig)",
      de: "Assistenzzentrum (was braucht meine Aufmerksamkeit)",
    },
    synonyms: {
      en: ["assist", "assistance", "ai", "attention", "summary", "overview of my data"],
      lt: ["pagalba", "asistentas", "ai", "dėmesio", "santrauka", "kas laukia manęs"],
      ru: ["помощь", "ассистент", "ai", "внимание", "сводка"],
      nl: ["assistentie", "assistent", "ai", "aandacht", "samenvatting"],
      de: ["assistenz", "assistent", "ki", "aufmerksamkeit", "zusammenfassung"],
    },
  },
  {
    // Reports hub (control room PR K) — the role-specific reports index:
    // real, basis-labelled counts over the caller's own records plus the
    // existing exports (evidence report, CV, journal CSV, finance CSV).
    // Route resolves through the module registry so it can never drift from
    // the grid card.
    id: "reports",
    route: getModuleRoute("reports"),
    audience: "public",
    labels: {
      en: "Reports (my data figures & exports)",
      lt: "Ataskaitos (mano duomenų rodikliai ir eksportai)",
      ru: "Отчёты (показатели моих данных и экспорт)",
      nl: "Rapporten (cijfers uit mijn gegevens & exports)",
      de: "Berichte (Kennzahlen aus meinen Daten & Exporte)",
    },
    synonyms: {
      en: ["reports", "report", "statistics", "figures", "export data"],
      lt: ["ataskaitos", "ataskaita", "statistika", "rodikliai", "eksportas"],
      ru: ["отчёты", "отчет", "статистика", "показатели", "экспорт"],
      nl: ["rapporten", "rapport", "statistieken", "cijfers", "exporteren"],
      de: ["berichte", "bericht", "statistiken", "kennzahlen", "export"],
    },
  },
  {
    id: "account_settings",
    route: "/dashboard/account",
    audience: "public",
    labels: {
      en: "Account settings",
      lt: "Paskyros nustatymai",
      ru: "Настройки аккаунта",
      nl: "Accountinstellingen",
      de: "Kontoeinstellungen",
    },
    synonyms: {
      en: ["account", "settings", "roles", "language"],
      lt: ["paskyra", "nustatymai", "rolės", "kalba"],
      ru: ["аккаунт", "настройки", "роли", "язык"],
      nl: ["account", "instellingen", "rollen", "taal"],
      de: ["konto", "einstellungen", "rollen", "sprache"],
    },
  },
  // Canonical privacy CONTROL screen (consent-and-disclosure v1) — consents,
  // discoverability, disclosure ledger, export & deletion. Distinct from the
  // public /legal/privacy POLICY text below.
  {
    id: "privacy_controls",
    route: "/dashboard/privacy",
    audience: "public",
    labels: {
      en: "Privacy controls (my consents)",
      lt: "Privatumo valdymas (mano sutikimai)",
      ru: "Управление приватностью (мои согласия)",
      nl: "Privacybeheer (mijn toestemmingen)",
      de: "Datenschutz-Verwaltung (meine Einwilligungen)",
    },
    synonyms: {
      en: ["privacy controls", "consents", "visibility", "data export", "delete account"],
      lt: ["privatumo valdymas", "sutikimai", "matomumas", "duomenų eksportas", "ištrinti paskyrą"],
      ru: ["управление приватностью", "согласия", "видимость", "экспорт данных"],
      nl: ["privacybeheer", "toestemmingen", "zichtbaarheid", "gegevensexport"],
      de: ["datenschutzverwaltung", "einwilligungen", "sichtbarkeit", "datenexport"],
    },
  },
  // "Kontakto prašymai" — employer contact-disclosure requests live on the
  // SAME canonical privacy screen (ContactDisclosureRequests section). Links
  // the list; the user acts on each request on the page itself.
  {
    id: "contact_requests",
    route: "/dashboard/privacy",
    audience: "worker",
    labels: {
      en: "Contact requests (privacy)",
      lt: "Kontakto prašymai (privatumas)",
      ru: "Запросы контактов (приватность)",
      nl: "Contactverzoeken (privacy)",
      de: "Kontaktanfragen (Datenschutz)",
    },
    synonyms: {
      en: ["contact requests", "disclosure requests", "who asked for my contact"],
      lt: ["kontakto prašymai", "atskleidimo prašymai", "kas prašė kontakto"],
      ru: ["запросы контактов", "запросы на раскрытие"],
      nl: ["contactverzoeken", "wie vroeg mijn contact"],
      de: ["kontaktanfragen", "offenlegungsanfragen"],
    },
  },
  // Market intelligence workspace — the ONLY command-surface module that had
  // no registry entry (bidirectional coverage guard closes this class of gap).
  {
    id: "market_intelligence",
    route: getModuleRoute("market_intelligence"),
    audience: "public",
    labels: {
      en: "Market intelligence (salary & demand signals)",
      lt: "Rinkos įžvalgos (atlyginimų ir paklausos signalai)",
      ru: "Рыночная аналитика (сигналы зарплат и спроса)",
      nl: "Marktinzichten (loon- en vraagsignalen)",
      de: "Markteinblicke (Lohn- und Nachfragesignale)",
    },
    synonyms: {
      en: ["intelligence", "market signals", "salary data", "demand data"],
      lt: ["įžvalgos", "rinkos signalai", "atlyginimų duomenys", "paklausos duomenys"],
      ru: ["аналитика", "рыночные сигналы", "данные о зарплатах"],
      nl: ["inzichten", "marktsignalen", "loongegevens"],
      de: ["einblicke", "marktsignale", "lohndaten"],
    },
  },
  // Spaces / role hub — the "Manage spaces" destination the identity card
  // links (components/app/identity-actions.tsx); folded so the ONE search
  // finds it too.
  {
    id: "spaces_start",
    route: "/dashboard/start",
    audience: "public",
    labels: {
      en: "Spaces & roles (start hub)",
      lt: "Erdvės ir rolės (pradžios centras)",
      ru: "Пространства и роли (стартовый центр)",
      nl: "Ruimtes en rollen (starthub)",
      de: "Bereiche und Rollen (Start-Hub)",
    },
    synonyms: {
      en: ["spaces", "manage spaces", "switch role", "start"],
      lt: ["erdvės", "valdyti erdves", "perjungti rolę", "pradžia"],
      ru: ["пространства", "управление пространствами", "сменить роль"],
      nl: ["ruimtes", "ruimtes beheren", "rol wisselen"],
      de: ["bereiche", "bereiche verwalten", "rolle wechseln"],
    },
  },
  // Create-company lane — the identity card's honest empty-state CTA
  // (identity-actions.tsx); a real page under /dashboard/start/company.
  {
    id: "create_company",
    route: "/dashboard/start/company",
    audience: "public",
    labels: {
      en: "Create a company",
      lt: "Sukurti įmonę",
      ru: "Создать компанию",
      nl: "Bedrijf aanmaken",
      de: "Firma erstellen",
    },
    synonyms: {
      en: ["create company", "new company", "register company"],
      lt: ["sukurti įmonę", "nauja įmonė", "registruoti įmonę"],
      ru: ["создать компанию", "новая компания", "зарегистрировать компанию"],
      nl: ["bedrijf aanmaken", "nieuw bedrijf", "bedrijf registreren"],
      de: ["firma erstellen", "neue firma", "firma registrieren"],
    },
  },
  // Dashboard overview itself — the primary-nav home tab, findable by name.
  {
    id: "overview_home",
    route: "/dashboard",
    audience: "public",
    labels: {
      en: "Overview (home)",
      lt: "Apžvalga (pradžios puslapis)",
      ru: "Обзор (главная)",
      nl: "Overzicht (home)",
      de: "Übersicht (Startseite)",
    },
    synonyms: {
      en: ["overview", "home", "dashboard"],
      lt: ["apžvalga", "pagrindinis", "skydelis"],
      ru: ["обзор", "главная", "панель"],
      nl: ["overzicht", "home", "dashboard"],
      de: ["übersicht", "startseite", "dashboard"],
    },
  },

  // ── Public marketing / legal explanations ─────────────────────────────
  {
    id: "pricing",
    // Honest pricing EXPLANATION page only — no checkout, no payment action
    // (payment provider stays disconnected; §4.1 of the train doc).
    route: "/pricing",
    audience: "public",
    labels: {
      en: "Pricing & plans",
      lt: "Kainos ir planai",
      ru: "Цены и планы",
      nl: "Prijzen en abonnementen",
      de: "Preise und Pläne",
    },
    synonyms: {
      en: ["pricing", "plans", "price", "free plan"],
      lt: ["kainos", "planai", "kaina", "nemokamas planas"],
      ru: ["цены", "планы", "тарифы"],
      nl: ["prijzen", "abonnementen", "prijs", "gratis abonnement"],
      de: ["preise", "pläne", "tarife", "kostenloser plan"],
    },
  },
  {
    id: "privacy",
    route: "/legal/privacy",
    audience: "public",
    labels: {
      en: "Privacy policy",
      lt: "Privatumo politika",
      ru: "Политика конфиденциальности",
      nl: "Privacybeleid",
      de: "Datenschutzerklärung",
    },
    synonyms: {
      en: ["privacy", "personal data"],
      lt: ["privatumas", "asmens duomenys"],
      ru: ["конфиденциальность", "личные данные"],
      nl: ["privacy", "persoonsgegevens"],
      de: ["datenschutz", "personenbezogene daten"],
    },
  },
  {
    id: "gdpr",
    route: "/legal/data-protection",
    audience: "public",
    labels: {
      en: "GDPR & data protection",
      lt: "BDAR ir duomenų apsauga",
      ru: "GDPR и защита данных",
      nl: "AVG en gegevensbescherming",
      de: "DSGVO und Datenschutz",
    },
    synonyms: {
      en: ["gdpr", "data protection", "data rights"],
      lt: ["bdar", "gdpr", "duomenų apsauga", "duomenų teisės"],
      ru: ["gdpr", "защита данных", "права на данные"],
      nl: ["avg", "gdpr", "gegevensbescherming", "datarechten"],
      de: ["dsgvo", "gdpr", "datenschutz", "datenrechte"],
    },
  },
  {
    id: "about",
    route: "/about",
    audience: "public",
    labels: {
      en: "About Labour Market AI",
      lt: "Apie Labour Market AI",
      ru: "О Labour Market AI",
      nl: "Over Labour Market AI",
      de: "Über Labour Market AI",
    },
    synonyms: {
      en: ["about", "what is this", "how it works"],
      lt: ["apie", "kas tai", "kaip veikia"],
      ru: ["о платформе", "что это", "как работает"],
      nl: ["over", "wat is dit", "hoe werkt het"],
      de: ["über", "was ist das", "wie funktioniert es"],
    },
  },

  // ── Admin (surfaces ONLY for admin viewers; page enforces its own gate) ─
  {
    id: "admin_control_room",
    route: "/dashboard/admin",
    audience: "admin",
    labels: {
      en: "Admin control room",
      lt: "Administravimo pultas",
      ru: "Панель администратора",
      nl: "Beheerderspaneel",
      de: "Admin-Kontrollraum",
    },
    synonyms: {
      en: ["admin", "control room", "operator"],
      lt: ["administravimas", "adminas", "valdymas"],
      ru: ["админ", "администрирование"],
      nl: ["admin", "beheer", "beheerder"],
      de: ["admin", "verwaltung", "administrator"],
    },
  },
  {
    // CRM / demand pipeline (control room PR F) — ONE read queue over every
    // existing demand source (requests, public intakes, leads, waitlist).
    // Read-only consolidation; statuses stay verbatim, changes stay on each
    // row's own surface.
    id: "admin_pipeline",
    route: "/dashboard/admin/pipeline",
    audience: "admin",
    labels: {
      en: "Demand pipeline (operator queue)",
      lt: "Paklausos eiga (operatoriaus eilė)",
      ru: "Воронка спроса (очередь оператора)",
      nl: "Vraagpijplijn (operatorwachtrij)",
      de: "Nachfrage-Pipeline (Operator-Warteschlange)",
    },
    synonyms: {
      en: ["pipeline", "crm", "demand pipeline", "sales queue"],
      lt: ["eiga", "crm", "paklausos eiga", "pardavimų eilė"],
      ru: ["воронка", "crm", "очередь спроса"],
      nl: ["pijplijn", "crm", "verkooppijplijn"],
      de: ["pipeline", "crm", "vertriebspipeline"],
    },
  },
] as const;

/** Max results the finder shows — owner rule "max 5 best" (unified-text-
 *  navigation v1). Keeps the list scannable on mobile. */
export const MAX_COMMAND_RESULTS = 5;

/**
 * Normalize for matching: lowercase + strip diacritics so "kortele" finds
 * "kortelė" and "zurnalas" finds "žurnalas". Pure string work — no external
 * library.
 */
export function normalizeForSearch(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

/* ── ONE text-matching truth (commands + object search) ────────────────── */

/** Split an already-normalized string into word tokens (any script). */
export function tokenizeForSearch(normalized: string): readonly string[] {
  return normalized.split(/[^\p{L}\p{N}]+/u).filter((t) => t.length > 0);
}

/** Typo budget per owner rule: distance ≤1 for tokens ≥5 chars, ≤2 for
 *  tokens ≥8 chars, 0 below (short tokens must match exactly / by prefix). */
export function typoBudget(tokenLength: number): 0 | 1 | 2 {
  if (tokenLength >= 8) return 2;
  if (tokenLength >= 5) return 1;
  return 0;
}

/**
 * Bounded Damerau-Levenshtein (optimal string alignment) edit distance.
 * In-house, deterministic, no dependency (the guard bans fuzzy libraries).
 * Returns `max + 1` as soon as the distance provably exceeds `max`.
 */
export function boundedEditDistance(a: string, b: string, max: number): number {
  if (a === b) return 0;
  const la = a.length;
  const lb = b.length;
  if (Math.abs(la - lb) > max) return max + 1;
  if (la === 0 || lb === 0) {
    return Math.max(la, lb) <= max ? Math.max(la, lb) : max + 1;
  }
  let prev2: number[] | null = null;
  let prev: number[] = Array.from({ length: lb + 1 }, (_, j) => j);
  for (let i = 1; i <= la; i++) {
    const cur: number[] = [i];
    let rowMin = i;
    for (let j = 1; j <= lb; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (
        i > 1 &&
        j > 1 &&
        a[i - 1] === b[j - 2] &&
        a[i - 2] === b[j - 1] &&
        prev2 !== null
      ) {
        v = Math.min(v, prev2[j - 2] + 1); // transposition
      }
      cur.push(v);
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1;
    prev2 = prev;
    prev = cur;
  }
  return prev[lb] <= max ? prev[lb] : max + 1;
}

/** True when a query token matches a haystack token within the typo budget. */
function tokenWithinTypoBudget(
  queryToken: string,
  haystackToken: string,
): boolean {
  const budget = typoBudget(queryToken.length);
  if (budget === 0) return false;
  if (Math.abs(queryToken.length - haystackToken.length) > budget) return false;
  return boundedEditDistance(queryToken, haystackToken, budget) <= budget;
}

/**
 * The ONE text-matching truth shared by commands AND the object search
 * (lib/search/dashboard-search-model.ts `candidateMatches` calls this):
 * normalized substring first, then all-query-tokens matching haystack tokens
 * by prefix or bounded typo distance. Deterministic, no external library.
 */
export function queryMatchesText(
  text: string,
  normalizedQuery: string,
): boolean {
  const h = normalizeForSearch(text);
  if (h.includes(normalizedQuery)) return true;
  const queryTokens = tokenizeForSearch(normalizedQuery);
  if (queryTokens.length === 0) return false;
  const haystackTokens = tokenizeForSearch(h);
  return queryTokens.every((qt) =>
    haystackTokens.some(
      (ht) => ht.startsWith(qt) || tokenWithinTypoBudget(qt, ht),
    ),
  );
}

/* ── Deterministic ranking (unified-text-navigation v1) ────────────────── */

const SCORE_LABEL_EXACT = 100;
const SCORE_LABEL_PREFIX = 80;
const SCORE_SYNONYM_EXACT = 70;
const SCORE_SYNONYM_PREFIX = 60;
const SCORE_SUBSTRING = 40;
const SCORE_TOKEN_PREFIX = 30;
const SCORE_TOKEN_FUZZY = 20;

/**
 * Score one entry against a normalized query — the single ranking
 * choke-point. 0 = no match. Higher = shown first. Exact label > label
 * prefix > synonym exact > synonym prefix > substring > all-tokens-prefix >
 * bounded typo tolerance. EN label/synonyms participate at synonym rank
 * when the viewer locale is not EN (the EN fallback).
 */
export function scoreCommandEntry(
  entry: CommandEntry,
  normalizedQuery: string,
  locale: ActiveLocale,
): number {
  const q = normalizedQuery;
  const label = normalizeForSearch(entry.labels[locale]);
  const synonyms: string[] = entry.synonyms[locale].map(normalizeForSearch);
  if (locale !== "en") {
    // EN fallback — a viewer on lt/ru/nl/de can always type the English term.
    synonyms.push(
      normalizeForSearch(entry.labels.en),
      ...entry.synonyms.en.map(normalizeForSearch),
    );
  }
  if (label === q) return SCORE_LABEL_EXACT;
  if (label.startsWith(q)) return SCORE_LABEL_PREFIX;
  if (synonyms.some((s) => s === q)) return SCORE_SYNONYM_EXACT;
  if (synonyms.some((s) => s.startsWith(q))) return SCORE_SYNONYM_PREFIX;
  const haystacks = [label, ...synonyms];
  if (haystacks.some((h) => h.includes(q))) return SCORE_SUBSTRING;
  const queryTokens = tokenizeForSearch(q);
  if (queryTokens.length === 0) return 0;
  const haystackTokens = Array.from(
    new Set(haystacks.flatMap((h) => tokenizeForSearch(h))),
  );
  if (
    queryTokens.every((qt) => haystackTokens.some((ht) => ht.startsWith(qt)))
  ) {
    return SCORE_TOKEN_PREFIX;
  }
  if (
    queryTokens.every((qt) =>
      haystackTokens.some(
        (ht) => ht.startsWith(qt) || tokenWithinTypoBudget(qt, ht),
      ),
    )
  ) {
    return SCORE_TOKEN_FUZZY;
  }
  return 0;
}

/**
 * Deterministic scored match over the registry in the viewer's locale (+ EN
 * fallback), restricted to the allowed audiences. Empty / whitespace query
 * → no results (the finder shows nothing until the user types). Ties keep
 * catalogue order (stable explicit-index sort), capped at
 * MAX_COMMAND_RESULTS — the "max 5 best" owner rule.
 */
export function matchCommands(
  query: string,
  locale: ActiveLocale,
  allowedAudiences: ReadonlySet<CommandAudience>,
): readonly CommandEntry[] {
  const q = normalizeForSearch(query);
  if (q.length === 0) return [];
  const scored: { entry: CommandEntry; score: number; index: number }[] = [];
  COMMAND_REGISTRY.forEach((entry, index) => {
    if (!allowedAudiences.has(entry.audience)) return;
    const score = scoreCommandEntry(entry, q, locale);
    if (score > 0) scored.push({ entry, score, index });
  });
  scored.sort((a, b) => b.score - a.score || a.index - b.index);
  return scored.slice(0, MAX_COMMAND_RESULTS).map((s) => s.entry);
}
