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
 * WAGON-10 upgrade path: the train doc's "recruiter help", "accounting
 * help" and "legal help" terms have NO dedicated route yet — WAGON 10
 * lands the demand-support request surfaces. Until then those terms map
 * honestly to the CLOSEST real surface (service requests for staffing /
 * accounting help, the documents room for legal / document help). When
 * WAGON 10 ships, ONLY the `route` values of `recruiter_help`,
 * `accounting_help` and `legal_help` change — ids, labels and synonyms
 * stay stable.
 */

import type { ActiveLocale } from "@/lib/i18n/config";

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
    route: "/dashboard/profile",
    audience: "public",
    labels: {
      en: "My profile",
      lt: "Mano profilis",
      ru: "Мой профиль",
    },
    synonyms: {
      en: ["profile", "my page", "identity"],
      lt: ["profilis", "mano puslapis", "anketa"],
      ru: ["профиль", "анкета", "моя страница"],
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
    },
    synonyms: {
      en: ["player card", "work card", "card"],
      lt: ["kortelė", "žaidėjo kortelė", "darbo kortelė"],
      ru: ["карточка", "карта игрока", "рабочая карточка"],
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
    },
    synonyms: {
      en: ["cv", "resume", "curriculum vitae", "print cv"],
      lt: ["cv", "gyvenimo aprašymas", "spausdinti cv"],
      ru: ["резюме", "cv", "печать резюме"],
    },
  },
  {
    id: "work_journal",
    route: "/dashboard/journal",
    audience: "worker",
    labels: {
      en: "Work journal",
      lt: "Darbo žurnalas",
      ru: "Рабочий журнал",
    },
    synonyms: {
      en: ["journal", "diary", "log work", "record work"],
      lt: ["žurnalas", "darbo žurnalas", "užrašyti darbą", "dienynas"],
      ru: ["журнал", "дневник", "записать работу"],
    },
  },
  {
    id: "skills",
    // Skills live on the profile (journal feeds them) — no separate page.
    route: "/dashboard/profile",
    audience: "worker",
    labels: {
      en: "Skills",
      lt: "Įgūdžiai",
      ru: "Навыки",
    },
    synonyms: {
      en: ["skills", "abilities", "competences"],
      lt: ["įgūdžiai", "gebėjimai", "kompetencijos"],
      ru: ["навыки", "умения", "компетенции"],
    },
  },
  {
    id: "find_work",
    route: "/dashboard/opportunities",
    audience: "worker",
    labels: {
      en: "Find work (opportunities)",
      lt: "Rasti darbą (galimybės)",
      ru: "Найти работу (возможности)",
    },
    synonyms: {
      en: ["job", "work", "find work", "vacancies", "opportunities"],
      lt: ["darbas", "darbo paieška", "pasiūlymai", "galimybės"],
      ru: ["работа", "вакансии", "поиск работы"],
    },
  },
  // Transport / tools / accommodation are honest work-condition fields on
  // the opportunities surface — not separate products. Linking them there
  // is the closest real answer to what the user is asking about.
  {
    id: "transport",
    route: "/dashboard/opportunities",
    audience: "worker",
    labels: {
      en: "Transport (work conditions)",
      lt: "Transportas (darbo sąlygos)",
      ru: "Транспорт (условия работы)",
    },
    synonyms: {
      en: ["transport", "travel", "commute"],
      lt: ["transportas", "kelionė", "pavėžėjimas"],
      ru: ["транспорт", "проезд"],
    },
  },
  {
    id: "tools",
    route: "/dashboard/opportunities",
    audience: "worker",
    labels: {
      en: "Tools & equipment (work conditions)",
      lt: "Įrankiai ir įranga (darbo sąlygos)",
      ru: "Инструменты и оборудование (условия работы)",
    },
    synonyms: {
      en: ["tools", "equipment"],
      lt: ["įrankiai", "įranga"],
      ru: ["инструменты", "оборудование"],
    },
  },
  {
    id: "accommodation",
    route: "/dashboard/opportunities",
    audience: "worker",
    labels: {
      en: "Accommodation (work conditions)",
      lt: "Apgyvendinimas (darbo sąlygos)",
      ru: "Проживание (условия работы)",
    },
    synonyms: {
      en: ["accommodation", "housing", "lodging"],
      lt: ["apgyvendinimas", "būstas"],
      ru: ["проживание", "жильё", "жилье"],
    },
  },

  // ── Company / organisation surfaces ───────────────────────────────────
  {
    id: "team_brigade",
    route: "/dashboard/company",
    audience: "company",
    labels: {
      en: "Team & brigades (company workspace)",
      lt: "Komanda ir brigados (įmonės erdvė)",
      ru: "Команда и бригады (пространство компании)",
    },
    synonyms: {
      en: ["team", "brigade", "crew", "company", "workers list"],
      lt: ["komanda", "brigada", "įmonė", "darbuotojų sąrašas"],
      ru: ["команда", "бригада", "компания"],
    },
  },
  {
    id: "objects_projects",
    route: "/dashboard/projects",
    audience: "company",
    labels: {
      en: "Objects & projects",
      lt: "Objektai ir projektai",
      ru: "Объекты и проекты",
    },
    synonyms: {
      en: ["object", "project", "site", "construction site"],
      lt: ["objektas", "projektas", "statybvietė", "aikštelė"],
      ru: ["объект", "проект", "стройка"],
    },
  },
  {
    id: "follow_up",
    // Follow-up chips / counters live in project operations under /dashboard/projects.
    route: "/dashboard/projects",
    audience: "company",
    labels: {
      en: "Follow-up (project operations)",
      lt: "Tolesni veiksmai (projektų eiga)",
      ru: "Последующие действия (ход проектов)",
    },
    synonyms: {
      en: ["follow-up", "follow up", "operations"],
      lt: ["tęsinys", "priminimai", "projektų eiga"],
      ru: ["напоминания", "операции", "ход работ"],
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
    },
    synonyms: {
      en: ["demand", "work need", "need workers", "hiring request"],
      lt: ["paklausa", "poreikis", "darbo poreikis"],
      ru: ["спрос", "потребность", "заявка на работников"],
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
    },
    synonyms: {
      en: ["find workers", "scouting", "staff", "hire"],
      lt: ["darbuotojai", "rasti darbuotojų", "atranka", "samdyti"],
      ru: ["работники", "найти работников", "подбор", "нанять"],
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
    },
    synonyms: {
      en: ["candidates", "candidate pool", "drafts"],
      lt: ["kandidatai", "kandidatų sąrašas"],
      ru: ["кандидаты", "список кандидатов"],
    },
  },

  // ── Services / marketplace loop ───────────────────────────────────────
  {
    id: "services",
    route: "/dashboard/services",
    audience: "public",
    labels: {
      en: "Offer services",
      lt: "Siūlyti paslaugas",
      ru: "Предлагать услуги",
    },
    synonyms: {
      en: ["services", "my services", "offer a service", "publish service"],
      lt: ["paslaugos", "mano paslaugos", "teikti paslaugą"],
      ru: ["услуги", "мои услуги", "предложить услугу"],
    },
  },
  {
    id: "service_requests",
    route: "/dashboard/service-requests",
    audience: "public",
    labels: {
      en: "Find services & service requests",
      lt: "Paslaugų paieška ir užklausos",
      ru: "Поиск услуг и заявки",
    },
    synonyms: {
      en: ["service requests", "find services", "request a service"],
      lt: ["paslaugų užklausos", "rasti paslaugą", "užsakyti paslaugą"],
      ru: ["заявки на услуги", "найти услугу", "заказать услугу"],
    },
  },
  // WAGON-10-PENDING: recruiter / accounting help have no dedicated route
  // yet. Service requests is the closest REAL "ask for help" surface today.
  // When WAGON 10 lands the demand-support request routes, update ONLY the
  // `route` fields below.
  {
    id: "recruiter_help",
    route: "/dashboard/service-requests",
    audience: "company",
    labels: {
      en: "Recruiter / staffing help (via service requests)",
      lt: "Rekruterio / įdarbinimo pagalba (per paslaugų užklausas)",
      ru: "Помощь рекрутера / подбор персонала (через заявки на услуги)",
    },
    synonyms: {
      en: ["recruiter", "staffing help", "recruitment"],
      lt: ["rekruteris", "įdarbinimo pagalba", "personalo atranka"],
      ru: ["рекрутер", "подбор персонала", "рекрутинг"],
    },
  },
  {
    id: "accounting_help",
    route: "/dashboard/service-requests",
    audience: "company",
    labels: {
      en: "Accounting help (via service requests)",
      lt: "Buhalterijos pagalba (per paslaugų užklausas)",
      ru: "Бухгалтерская помощь (через заявки на услуги)",
    },
    synonyms: {
      en: ["accounting", "accountant", "bookkeeping", "taxes"],
      lt: ["buhalterija", "buhalteris", "apskaita", "mokesčiai"],
      ru: ["бухгалтерия", "бухгалтер", "налоги"],
    },
  },
  // WAGON-10-PENDING: legal / jurisdiction help routes to the real
  // documents room until the WAGON 9/10 guidance + help-request surfaces
  // exist. Informational routing only — the platform gives no legal advice.
  {
    id: "legal_help",
    route: "/dashboard/documents",
    audience: "public",
    labels: {
      en: "Legal & document help (documents room)",
      lt: "Teisinė ir dokumentų pagalba (dokumentų erdvė)",
      ru: "Юридическая и документная помощь (раздел документов)",
    },
    synonyms: {
      en: ["legal help", "lawyer", "jurisdiction"],
      lt: ["teisinė pagalba", "teisininkas", "jurisdikcija"],
      ru: ["юридическая помощь", "юрист", "юрисдикция"],
    },
  },
  {
    id: "documents",
    route: "/dashboard/documents",
    audience: "public",
    labels: {
      en: "Documents",
      lt: "Dokumentai",
      ru: "Документы",
    },
    synonyms: {
      en: ["documents", "document records", "certificates"],
      lt: ["dokumentai", "pažymos", "sertifikatai"],
      ru: ["документы", "справки", "сертификаты"],
    },
  },

  // ── Communication / planning / map / account ──────────────────────────
  {
    id: "messages",
    route: "/dashboard/communication",
    audience: "public",
    labels: {
      en: "Messages",
      lt: "Žinutės",
      ru: "Сообщения",
    },
    synonyms: {
      en: ["messages", "inbox", "chat", "communication"],
      lt: ["žinutės", "susirašinėjimas", "pokalbiai"],
      ru: ["сообщения", "чат", "переписка"],
    },
  },
  {
    id: "bookings",
    route: "/dashboard/bookings",
    audience: "public",
    labels: {
      en: "Bookings & planning",
      lt: "Rezervacijos ir planavimas",
      ru: "Бронирования и планирование",
    },
    synonyms: {
      en: ["bookings", "planning", "calendar"],
      lt: ["rezervacijos", "planavimas", "kalendorius"],
      ru: ["бронирования", "планирование", "календарь"],
    },
  },
  {
    id: "market_map",
    route: "/dashboard/market-map",
    audience: "public",
    labels: {
      en: "Market map",
      lt: "Žemėlapis",
      ru: "Карта рынка",
    },
    synonyms: {
      en: ["map", "market map"],
      lt: ["žemėlapis", "rinkos žemėlapis"],
      ru: ["карта", "карта рынка"],
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
    },
    synonyms: {
      en: ["account", "settings", "roles", "language"],
      lt: ["paskyra", "nustatymai", "rolės", "kalba"],
      ru: ["аккаунт", "настройки", "роли", "язык"],
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
    },
    synonyms: {
      en: ["pricing", "plans", "price", "free plan"],
      lt: ["kainos", "planai", "kaina", "nemokamas planas"],
      ru: ["цены", "планы", "тарифы"],
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
    },
    synonyms: {
      en: ["privacy", "personal data"],
      lt: ["privatumas", "asmens duomenys"],
      ru: ["конфиденциальность", "личные данные"],
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
    },
    synonyms: {
      en: ["gdpr", "data protection", "data rights"],
      lt: ["bdar", "gdpr", "duomenų apsauga", "duomenų teisės"],
      ru: ["gdpr", "защита данных", "права на данные"],
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
    },
    synonyms: {
      en: ["about", "what is this", "how it works"],
      lt: ["apie", "kas tai", "kaip veikia"],
      ru: ["о платформе", "что это", "как работает"],
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
    },
    synonyms: {
      en: ["admin", "control room", "operator"],
      lt: ["administravimas", "adminas", "valdymas"],
      ru: ["админ", "администрирование"],
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
