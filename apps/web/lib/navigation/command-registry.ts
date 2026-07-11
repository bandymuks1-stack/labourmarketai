/**
 * Curated command / action registry — the ONLY data source of the dashboard
 * command finder (WAGON 3, Commercial Readiness & Human Usability Train).
 *
 * A user types a normal word ("cv", "kortelė", "žurnalas", "brigada",
 * "paklausa", "kainos", "gdpr" …) and gets a short list of links to the
 * right EXISTING surface. Design contract:
 *
 *  - Pure data + pure matching. No AI, no external search provider, no
 *    fuzzy-search dependency — plain normalized substring matching over
 *    labels + synonyms in the viewer's active locale, with an EN fallback.
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
      en: ["cv", "resume", "curriculum vitae", "print cv"],
      lt: ["cv", "gyvenimo aprašymas", "spausdinti cv"],
      ru: ["резюме", "cv", "печать резюме"],
      nl: ["cv", "curriculum vitae", "cv afdrukken"],
      de: ["lebenslauf", "cv", "lebenslauf drucken"],
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
      en: ["job", "work", "find work", "vacancies", "opportunities"],
      lt: ["darbas", "darbo paieška", "pasiūlymai", "galimybės"],
      ru: ["работа", "вакансии", "поиск работы"],
      nl: ["werk", "baan", "vacatures", "werk zoeken", "kansen"],
      de: ["arbeit", "job", "stellenangebote", "arbeit suchen"],
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
      en: ["object", "project", "site", "construction site"],
      lt: ["objektas", "projektas", "statybvietė", "aikštelė"],
      ru: ["объект", "проект", "стройка"],
      nl: ["object", "project", "bouwplaats", "werf"],
      de: ["objekt", "projekt", "baustelle"],
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
      en: ["demand", "work need", "need workers", "hiring request"],
      lt: ["paklausa", "poreikis", "darbo poreikis"],
      ru: ["спрос", "потребность", "заявка на работников"],
      nl: ["vraag", "behoefte", "werkbehoefte", "personeel nodig"],
      de: ["nachfrage", "bedarf", "personalbedarf", "arbeiter gesucht"],
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
      en: ["find workers", "scouting", "staff", "hire"],
      lt: ["darbuotojai", "rasti darbuotojų", "atranka", "samdyti"],
      ru: ["работники", "найти работников", "подбор", "нанять"],
      nl: ["werknemers", "personeel", "werknemers vinden", "werven"],
      de: ["arbeiter", "arbeitskräfte", "personal finden", "einstellen"],
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
        "document records",
        "certificates",
        "work proof",
        "proof of work",
        "document centre",
        "expiring documents",
      ],
      lt: [
        "dokumentai",
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

/** Max results the finder shows — keeps the list scannable on mobile. */
export const MAX_COMMAND_RESULTS = 8;

/**
 * Normalize for matching: lowercase + strip diacritics so "kortele" finds
 * "kortelė" and "zurnalas" finds "žurnalas". Pure string work — no fuzzy
 * scoring, no external library.
 */
export function normalizeForSearch(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function entryMatches(
  entry: CommandEntry,
  q: string,
  locale: ActiveLocale,
): boolean {
  const haystacks: string[] = [entry.labels[locale], ...entry.synonyms[locale]];
  // EN fallback — a viewer on lt/ru can always type the English term.
  if (locale !== "en") {
    haystacks.push(entry.labels.en, ...entry.synonyms.en);
  }
  return haystacks.some((h) => normalizeForSearch(h).includes(q));
}

/**
 * Plain substring match over the registry in the viewer's locale (+ EN
 * fallback), restricted to the allowed audiences. Empty / whitespace query
 * → no results (the finder shows nothing until the user types).
 */
export function matchCommands(
  query: string,
  locale: ActiveLocale,
  allowedAudiences: ReadonlySet<CommandAudience>,
): readonly CommandEntry[] {
  const q = normalizeForSearch(query);
  if (q.length === 0) return [];
  return COMMAND_REGISTRY.filter(
    (e) => allowedAudiences.has(e.audience) && entryMatches(e, q, locale),
  ).slice(0, MAX_COMMAND_RESULTS);
}
