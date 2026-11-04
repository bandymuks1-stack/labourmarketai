/**
 * Public SEO metadata — single source of truth for brand title /
 * description and per-page canonical + hreflang on the apex public
 * marketing surface (https://labourmarket.ai).
 *
 * Positioning (2026-06-15, owner — cross-sector, NOT construction-first):
 * LabourMarket.ai is a whole-labour-market platform — workers, employers,
 * companies and agencies across many sectors and countries in Europe.
 * Construction is one sector among the 11 in lib/structuring/sectors.ts
 * (manufacturing, transport & logistics, retail, hospitality, care,
 * office/admin, IT, education, cleaning, agriculture, …) — it must NOT be
 * the brand centre of the title/description/H1. The apex is the canonical
 * host (see lib/domain/canonical.ts); every public canonical URL, hreflang
 * alternate and OpenGraph URL points there.
 *
 * Copy lives here as a pure per-locale map (lt / en / ru / nl / de — the
 * active locales) rather than in messages/*.json so the SEO layer has no
 * i18n-debt / 11-file-parity coupling. RU is included because the
 * worker audience operates in Russian.
 *
 * PURE. No fs / net / env. Safe to import from server components,
 * route handlers (robots/sitemap) and tests.
 */
import type { Metadata } from "next";
import { MARKETING_ORIGIN } from "@/lib/domain/canonical";
import { activeLocales, defaultLocale, type ActiveLocale } from "@/lib/i18n/config";

/** Brand name as it must appear in public SEO signals. */
export const BRAND_NAME = "LabourMarket.ai";

/** A page title with the brand exactly once: " · LabourMarket.ai" is appended
 *  only when the title does not already name the brand ("What is
 *  LabourMarket.ai · LabourMarket.ai", SEO audit 2026-11-03). */
export function brandedTitle(title: string): string {
  return title.includes(BRAND_NAME) ? title : `${title} · ${BRAND_NAME}`;
}

/**
 * One-sentence organisation description (owner's wording, 2026-11-04, GEO-6).
 * The SINGLE source for app/manifest.ts `description` and the Organization
 * JSON-LD `description` — never duplicate the literal.
 */
export const BRAND_ORGANIZATION_DESCRIPTION =
  "International platform for work, specialists and services, where people and companies find jobs, workers, clients, services and project partners.";

type BrandCopy = { title: string; description: string };

/** Per-locale brand title + description (homepage / site default). */
export const BRAND_SEO: Readonly<Record<ActiveLocale, BrandCopy>> = {
  en: {
    title:
      "LabourMarket.ai — International platform for work and services",
    description:
      "LabourMarket.ai: international platform for work, specialists and services. In any sector, find jobs, workers, clients, services and project partners.",
  },
  lt: {
    title:
      "LabourMarket.ai — tarptautinė darbo ir paslaugų platforma",
    description:
      "LabourMarket.ai – tarptautinė darbo, specialistų ir paslaugų platforma. Bet kuriame sektoriuje rask darbą, darbuotojus, užsakovus, paslaugas ir projektų partnerius.",
  },
  ru: {
    title:
      "LabourMarket.ai — международная платформа работы и услуг",
    description:
      "LabourMarket.ai — международная платформа работы, специалистов и услуг. В любом секторе найдите работу, работников, заказчиков, услуги и партнёров по проектам.",
  },
  nl: {
    title:
      "LabourMarket.ai — Internationaal platform voor werk en diensten",
    description:
      "LabourMarket.ai: internationaal platform voor werk, specialisten en diensten. Vind in elke sector werk, werknemers, opdrachtgevers, diensten en projectpartners.",
  },
  de: {
    title:
      "LabourMarket.ai — Plattform für Arbeit und Dienstleistungen in Europa",
    description:
      "LabourMarket.ai: internationale Plattform für Arbeit, Fachkräfte und Dienstleistungen. In jeder Branche Arbeit, Personal, Auftraggeber und Projektpartner finden.",
  },
  pl: {
    title:
      "LabourMarket.ai — międzynarodowa platforma pracy i usług",
    description:
      "LabourMarket.ai: międzynarodowa platforma pracy, specjalistów i usług. W każdej branży znajdź pracę, pracowników, zleceniodawców, usługi i partnerów do projektów.",
  },
};

/**
 * Social share card dimensions (social-acquisition readiness v1) — the
 * standard 1.91:1 OG/Twitter `summary_large_image` canvas. Single source for
 * both the metadata wiring below and the generated image route
 * (`app/[locale]/opengraph-image.tsx`, reused by `twitter-image.tsx`).
 */
export const OG_IMAGE_SIZE = { width: 1200, height: 630 } as const;

/** OpenGraph locale tag per active locale (BCP-47-ish region form). */
const OG_LOCALE: Readonly<Record<ActiveLocale, string>> = {
  en: "en_GB",
  lt: "lt_LT",
  ru: "ru_RU",
  nl: "nl_NL",
  de: "de_DE",
  pl: "pl_PL",
};

function isActiveLocale(locale: string): locale is ActiveLocale {
  return (activeLocales as readonly string[]).includes(locale);
}

/** Resolve a locale to an active one, falling back to the default. */
export function resolveActiveLocale(locale: string): ActiveLocale {
  return isActiveLocale(locale) ? locale : defaultLocale;
}

/** Normalize a path segment to "" (root) or "/foo". No trailing slash. */
function normalizePath(path: string): string {
  if (!path || path === "/") return "";
  const withSlash = path.startsWith("/") ? path : `/${path}`;
  return withSlash.replace(/\/$/, "");
}

/** Absolute apex URL for a given active locale + path. */
export function localizedUrl(locale: ActiveLocale, path: string = ""): string {
  return `${MARKETING_ORIGIN}/${locale}${normalizePath(path)}`;
}

/** hreflang alternates map for a path across all active locales + x-default.
 *
 *  `x-default` is ENGLISH (audit 2026-10-16, U-2): it is the page a search
 *  engine serves to a searcher whose language matches none of the routed
 *  locales. It was the Lithuanian default, on every public page and on all
 *  ~39k job URLs — so a Swedish, Finnish or French searcher was sent to a
 *  Lithuanian page. The product's own default locale is unchanged. */
export function hreflangAlternates(path: string = ""): Record<string, string> {
  const languages: Record<string, string> = {};
  for (const locale of activeLocales) {
    languages[locale] = localizedUrl(locale, path);
  }
  languages["x-default"] = localizedUrl("en", path);
  return languages;
}

/** Stable keys for the public marketing pages that carry curated SEO copy. */
export type PageKey =
  | "workers"
  | "companies"
  | "agencies"
  | "workAbroad"
  | "companyNeed"
  | "workerIntake"
  | "labourMarket"
  | "pricing"
  | "workOpportunities"
  | "skills"
  | "professions"
  | "projectCostCalculator"
  | "createCv"
  | "jobs";

/**
 * Curated, honest per-page SEO copy (active locales). No fabricated
 * numbers / clients / matches — only what the page actually offers.
 */
export const PAGE_SEO: Readonly<
  Record<PageKey, Readonly<Record<ActiveLocale, BrandCopy>>>
> = {
  workers: {
    en: {
      title: "For Workers — Build your profile and CV",
      description:
        "Workers in any sector: create a profile and CV on LabourMarket.ai, show your skills and availability, and be visible to employers across Europe.",
    },
    lt: {
      title: "Darbuotojams — susikurk profilį ir CV",
      description:
        "Bet kurio sektoriaus darbuotojams: susikurk profilį ir CV LabourMarket.ai, parodyk įgūdžius ir prieinamumą ir būk matomas darbdaviams Europoje.",
    },
    ru: {
      title: "Работникам — создайте профиль и CV",
      description:
        "Работникам любых секторов: создайте профиль и CV на LabourMarket.ai, покажите навыки и доступность и будьте видны работодателям в Европе.",
    },
    nl: {
      title: "Voor werknemers — Bouw je profiel en cv",
      description:
        "Werknemers in elke sector: maak een profiel en cv op LabourMarket.ai, laat je vaardigheden en beschikbaarheid zien en wees zichtbaar voor werkgevers.",
    },
    de: {
      title: "Für Arbeitskräfte — Profil und Lebenslauf",
      description:
        "Arbeitskräfte jeder Branche: Profil und Lebenslauf auf LabourMarket.ai erstellen, Fähigkeiten und Verfügbarkeit zeigen, für Arbeitgeber sichtbar sein.",
    },
    pl: {
      title: "Dla pracowników — zbuduj swój profil i CV",
      description:
        "Pracownicy z każdej branży: załóż profil i CV na LabourMarket.ai, pokaż umiejętności i dostępność i bądź widoczny dla pracodawców w Europie.",
    },
  },
  companies: {
    // §19 terminology: the employer's SUBMITTED REQUEST is an "inquiry", matching
    // the already-migrated `companyNeed` block below (en inquiry / lt užklausa /
    // ru запрос / nl aanvraag / de Anfrage). Ordinary-language "the skills you
    // need" is deliberately KEPT — that is a real need, not the artefact.
    en: {
      title: "For Employers — Submit your workforce inquiry",
      description:
        "Employers and contractors: describe the workers, teams and skills you need. LabourMarket.ai structures your inquiry and organises the next steps in Europe.",
    },
    lt: {
      title: "Darbdaviams — pateik darbo jėgos užklausą",
      description:
        "Darbdaviai ir rangovai: aprašyk reikalingus darbuotojus, brigadas ir įgūdžius. LabourMarket.ai struktūruoja užklausą ir padeda planuoti atranką Europoje.",
    },
    ru: {
      title: "Работодателям — подайте запрос на работников",
      description:
        "Работодатели и подрядчики: опишите нужных работников, бригады и навыки. LabourMarket.ai структурирует запрос и помогает организовать подбор в Европе.",
    },
    nl: {
      title: "Voor werkgevers — Dien je personeelsaanvraag in",
      description:
        "Werkgevers en aannemers: beschrijf de werknemers, ploegen en vaardigheden die je zoekt. LabourMarket.ai structureert je aanvraag en de selectie in Europa.",
    },
    de: {
      title: "Für Arbeitgeber — Stellen Sie Ihre Personalanfrage",
      description:
        "Arbeitgeber und Auftragnehmer: Beschreiben Sie benötigte Arbeitskräfte, Kolonnen und Fähigkeiten. LabourMarket.ai strukturiert Anfrage und Auswahl in Europa.",
    },
    pl: {
      title: "Dla pracodawców — złóż zapytanie o pracowników",
      description:
        "Pracodawcy i wykonawcy: opisz potrzebnych pracowników, zespoły i umiejętności. LabourMarket.ai porządkuje zapytanie i pomaga w dopasowaniu w Europie.",
    },
  },
  agencies: {
    en: {
      title: "For Agencies — Coordinate workers and teams",
      description:
        "Staffing agencies: coordinate workers, teams and employer needs in one place. LabourMarket.ai helps structure intake, matching and accommodation in Europe.",
    },
    lt: {
      title: "Agentūroms — koordinuok darbuotojus ir brigadas",
      description:
        "Įdarbinimo agentūros: koordinuok darbuotojus, brigadas ir darbdavių poreikius vienoje vietoje. LabourMarket.ai padeda struktūruoti priėmimą ir apgyvendinimą.",
    },
    ru: {
      title: "Агентствам — координируйте работников и бригады",
      description:
        "Кадровые агентства: координируйте работников, бригады и потребности работодателей в одном месте. Приём, подбор и проживание — в LabourMarket.ai.",
    },
    nl: {
      title: "Uitzendbureaus — Coördineer werknemers en ploegen",
      description:
        "Uitzendbureaus: coördineer werknemers, ploegen en personeelsbehoeften op één plek. LabourMarket.ai helpt intake, selectie en huisvesting te structureren.",
    },
    de: {
      title: "Personalagenturen — Arbeitskräfte koordinieren",
      description:
        "Personalagenturen: Arbeitskräfte, Kolonnen und Arbeitgeberbedarfe an einem Ort koordinieren. LabourMarket.ai strukturiert Aufnahme, Auswahl und Unterkunft.",
    },
    pl: {
      title: "Dla agencji — koordynuj pracowników i zespoły",
      description:
        "Agencje pracy: koordynuj pracowników, zespoły i zapotrzebowanie pracodawców w jednym miejscu. LabourMarket.ai porządkuje zgłoszenia i zakwaterowanie.",
    },
  },
  workAbroad: {
    en: {
      title: "Work Abroad — Jobs across sectors in Europe",
      description:
        "Considering work abroad in any sector? See how LabourMarket.ai structures skills, selection, documents and accommodation to plan next steps in Europe.",
    },
    lt: {
      title: "Darbas užsienyje — įvairūs sektoriai Europoje",
      description:
        "Svarstai darbą užsienyje? Sužinok, kaip LabourMarket.ai struktūruoja įgūdžius, atranką, dokumentus ir apgyvendinimą, kad planuotum kitus žingsnius.",
    },
    ru: {
      title: "Работа за границей — разные секторы Европы",
      description:
        "Думаете о работе за границей? Узнайте, как LabourMarket.ai структурирует навыки, подбор, документы и проживание, чтобы планировать шаги в Европе.",
    },
    nl: {
      title: "Werken in het buitenland — Alle sectoren in Europa",
      description:
        "Denk je aan werken in het buitenland? Ontdek hoe LabourMarket.ai vaardigheden, selectie, documenten en huisvesting structureert voor je volgende stap.",
    },
    de: {
      title: "Arbeiten im Ausland — Alle Branchen in Europa",
      description:
        "Arbeiten im Ausland? Erfahren Sie, wie LabourMarket.ai Fähigkeiten, Auswahl, Dokumente und Unterkunft strukturiert, um die nächsten Schritte zu planen.",
    },
    pl: {
      title: "Praca za granicą — różne branże w Europie",
      description:
        "Rozważasz pracę za granicą? Zobacz, jak LabourMarket.ai porządkuje umiejętności, dopasowanie, dokumenty i zakwaterowanie, aby zaplanować kolejne kroki.",
    },
  },
  companyNeed: {
    en: {
      title: "Workforce Inquiry — Describe the workforce you need",
      description:
        "Tell LabourMarket.ai what your project needs: professions, skills, team size, place, start. You review the draft; nothing is published automatically.",
    },
    lt: {
      title: "Darbuotojų užklausa — aprašyk reikalingą darbo jėgą",
      description:
        "Pasakyk LabourMarket.ai, ko reikia projektui: profesijos, įgūdžiai, komanda, vieta, pradžia. Peržiūri juodraštį — niekas nepublikuojama automatiškai.",
    },
    ru: {
      title: "Запрос на работников — опишите нужную рабочую силу",
      description:
        "Расскажите LabourMarket.ai, что нужно проекту: профессии, навыки, бригада, локация, старт. Вы проверяете черновик — ничего не публикуется автоматически.",
    },
    nl: {
      title: "Personeelsaanvraag — Beschrijf wie je nodig hebt",
      description:
        "Vertel LabourMarket.ai wat je project nodig heeft: beroepen, vaardigheden, team, locatie, start. Jij beoordeelt het concept; niets gaat automatisch online.",
    },
    de: {
      title: "Personalanfrage — Beschreiben Sie Ihren Bedarf",
      description:
        "Sagen Sie LabourMarket.ai, was Ihr Projekt braucht: Berufe, Fähigkeiten, Team, Ort, Start. Sie prüfen den Entwurf; nichts wird automatisch veröffentlicht.",
    },
    pl: {
      title: "Zapytanie o pracowników — opisz potrzebną kadrę",
      description:
        "Powiedz LabourMarket.ai, czego potrzebuje projekt: zawody, umiejętności, zespół, miejsce, start. Sprawdzasz szkic — nic nie jest publikowane automatycznie.",
    },
  },
  workerIntake: {
    en: {
      title: "Worker Intake — Create your profile and CV",
      description:
        "Start your LabourMarket.ai worker profile: professions, skills, experience and availability. A structured intake builds your CV for employer review.",
    },
    lt: {
      title: "Darbuotojo anketa — susikurk profilį ir CV",
      description:
        "Pradėk LabourMarket.ai darbuotojo profilį: profesijos, įgūdžiai, patirtis ir prieinamumas. Struktūruota anketa sukuria CV ir paruošia tave darbdavių atrankai.",
    },
    ru: {
      title: "Анкета работника — создайте профиль и CV",
      description:
        "Начните профиль работника LabourMarket.ai: профессии, навыки, опыт и доступность. Структурированная анкета формирует CV и готовит вас к отбору работодателями.",
    },
    nl: {
      title: "Werknemersintake — Maak je profiel en cv",
      description:
        "Start je LabourMarket.ai-werknemersprofiel: beroepen, vaardigheden, ervaring en beschikbaarheid. Een intake bouwt je cv op voor beoordeling door werkgevers.",
    },
    de: {
      title: "Anmeldung für Arbeitskräfte — Profil und Lebenslauf",
      description:
        "Starten Sie Ihr Profil auf LabourMarket.ai: Berufe, Fähigkeiten, Erfahrung, Verfügbarkeit. Die Aufnahme erstellt Ihren Lebenslauf für die Arbeitgeberprüfung.",
    },
    pl: {
      title: "Zgłoszenie pracownika — utwórz profil i CV",
      description:
        "Zacznij profil pracownika na LabourMarket.ai: zawody, umiejętności, doświadczenie, dostępność. Zgłoszenie tworzy Twoje CV do oceny przez pracodawców.",
    },
  },
  labourMarket: {
    en: {
      title: "Labour Market — Evidence and signals in Europe",
      description:
        "Source-backed labour-market signals for Europe: demand, skills and mobility. LabourMarket.ai uses honest, qualitative evidence — no invented numbers.",
    },
    lt: {
      title: "Darbo rinka — duomenys ir šalių signalai Europoje",
      description:
        "Šaltiniais grįsti darbo rinkos signalai Europai: paklausa, įgūdžiai, mobilumas. LabourMarket.ai naudoja kokybinius duomenis — be sugalvotų skaičių.",
    },
    ru: {
      title: "Рынок труда — данные и сигналы по странам Европы",
      description:
        "Сигналы рынка труда Европы из источников: спрос, навыки и мобильность. LabourMarket.ai использует качественные данные — без выдуманных цифр.",
    },
    nl: {
      title: "Arbeidsmarkt — Gegevens en signalen in Europa",
      description:
        "Op bronnen gebaseerde signalen voor Europa: vraag, vaardigheden en mobiliteit. LabourMarket.ai gebruikt kwalitatieve gegevens, geen verzonnen cijfers.",
    },
    de: {
      title: "Arbeitsmarkt — Belege und Ländersignale in Europa",
      description:
        "Quellengestützte Signale für Europa: Nachfrage, Fähigkeiten und Mobilität. LabourMarket.ai nutzt qualitative Belege — keine erfundenen Zahlen.",
    },
    pl: {
      title: "Rynek pracy — dowody i sygnały krajowe w Europie",
      description:
        "Poparte źródłami sygnały rynku pracy w Europie: popyt, umiejętności, mobilność. LabourMarket.ai korzysta z dowodów jakościowych — bez wymyślonych liczb.",
    },
  },
  pricing: {
    en: {
      title: "Pricing — Honest, early-access model",
      description:
        "How LabourMarket.ai pricing works during early access. Clear, honest pricing for workers, employers and agencies — no hidden fees, no fake promises.",
    },
    lt: {
      title: "Kainodara — sąžiningas ankstyvos prieigos modelis",
      description:
        "Kaip veikia LabourMarket.ai kainodara ankstyvos prieigos metu: aiški ir sąžininga darbuotojams, darbdaviams ir agentūroms, be paslėptų mokesčių.",
    },
    ru: {
      title: "Цены — честная модель раннего доступа",
      description:
        "Как работают цены LabourMarket.ai в период раннего доступа: понятно и честно для работников, работодателей и агентств, без скрытых платежей.",
    },
    nl: {
      title: "Prijzen — Eerlijk early-access-model",
      description:
        "Zo werken de prijzen van LabourMarket.ai tijdens early access: duidelijk en eerlijk voor werknemers, werkgevers en bureaus, zonder verborgen kosten.",
    },
    de: {
      title: "Preise — Ehrliches Early-Access-Modell",
      description:
        "So funktionieren die Preise von LabourMarket.ai im Early Access: klar und ehrlich für Arbeitskräfte, Arbeitgeber und Agenturen, ohne versteckte Gebühren.",
    },
    pl: {
      title: "Cennik — uczciwy model wczesnego dostępu",
      description:
        "Jak działa cennik LabourMarket.ai we wczesnym dostępie: jasno i uczciwie dla pracowników, pracodawców i agencji, bez ukrytych opłat.",
    },
  },
  workOpportunities: {
    en: {
      title: "Work Opportunities — Find work across sectors",
      description:
        "Looking for work in Europe? LabourMarket.ai helps workers in every sector build a profile and CV and reach real employer needs.",
    },
    lt: {
      title: "Darbo galimybės — rask darbą įvairiuose sektoriuose",
      description:
        "Ieškai darbo Europoje? LabourMarket.ai padeda bet kurio sektoriaus darbuotojams susikurti profilį ir CV ir pasiekti realius darbdavių poreikius.",
    },
    ru: {
      title: "Возможности работы — работа в разных секторах",
      description:
        "Ищете работу в Европе? LabourMarket.ai помогает работникам любых секторов создать профиль и CV и выйти на реальные потребности работодателей.",
    },
    nl: {
      title: "Werkkansen — Vind werk in verschillende sectoren",
      description:
        "Op zoek naar werk in Europa? LabourMarket.ai helpt werknemers in elke sector een profiel en cv op te bouwen en echte vraag van werkgevers te bereiken.",
    },
    de: {
      title: "Arbeitsmöglichkeiten — Arbeit in allen Branchen",
      description:
        "Sie suchen Arbeit in Europa? LabourMarket.ai hilft Arbeitskräften jeder Branche, Profil und Lebenslauf zu erstellen und echten Arbeitgeberbedarf zu erreichen.",
    },
    pl: {
      title: "Możliwości pracy — znajdź pracę w różnych branżach",
      description:
        "Szukasz pracy w Europie? LabourMarket.ai pomaga pracownikom z każdej branży zbudować profil i CV oraz dotrzeć do realnego zapotrzebowania pracodawców.",
    },
  },
  skills: {
    en: {
      title: "Skills — Verified and self-declared, never mixed",
      description:
        "Show and check real skills on LabourMarket.ai. Skills are marked verified or self-declared, so workers can prove them and employers see real experience.",
    },
    lt: {
      title: "Įgūdžiai — patvirtinti ir savideklaruoti atskirai",
      description:
        "Parodyk ir patikrink realius įgūdžius LabourMarket.ai. Jie žymimi kaip patvirtinti arba savideklaruoti, kad darbdaviai matytų realią patirtį.",
    },
    ru: {
      title: "Навыки — подтверждённые и самозаявленные отдельно",
      description:
        "Показывайте и проверяйте реальные навыки на LabourMarket.ai. Они помечены как подтверждённые или самозаявленные, чтобы работодатели видели реальный опыт.",
    },
    nl: {
      title: "Vaardigheden — Geverifieerd of zelf opgegeven",
      description:
        "Laat echte vaardigheden zien op LabourMarket.ai. Ze zijn gemarkeerd als geverifieerd of zelf opgegeven, zodat werkgevers echte ervaring zien.",
    },
    de: {
      title: "Fähigkeiten — Verifiziert oder selbst angegeben",
      description:
        "Zeigen und prüfen Sie echte Fähigkeiten auf LabourMarket.ai. Sie sind als verifiziert oder selbst angegeben markiert, damit Arbeitgeber Erfahrung sehen.",
    },
    pl: {
      title: "Umiejętności — zweryfikowane lub zadeklarowane",
      description:
        "Pokazuj i sprawdzaj realne umiejętności na LabourMarket.ai. Są oznaczone jako zweryfikowane lub zadeklarowane, aby pracodawcy widzieli doświadczenie.",
    },
  },
  // Titles carry NO brand: buildPageMetadata appends " · LabourMarket.ai"
  // once. Embedding it here rendered "Open jobs — LabourMarket.ai ·
  // LabourMarket.ai" on every locale (SEO/GEO gap, 2026-09-20).
  jobs: {
    en: {
      title: "Open jobs",
      description:
        "Live vacancies from official public job sources. Title, category, contract and hours are open to all; sign in free to see employer, location and how to apply.",
    },
    lt: {
      title: "Laisvos darbo vietos",
      description:
        "Gyvos darbo vietos iš oficialių viešų užimtumo šaltinių. Pareigos, kategorija ir darbo laikas matomi visiems; prisijunk nemokamai — matysi darbdavį ir vietovę.",
    },
    ru: {
      title: "Открытые вакансии",
      description:
        "Актуальные вакансии из официальных публичных источников. Должность, категория и график открыты всем; войдите бесплатно, чтобы увидеть работодателя и место.",
    },
    nl: {
      title: "Openstaande vacatures",
      description:
        "Actuele vacatures uit officiële openbare bronnen. Functie, categorie, contract en werktijd zijn openbaar; log gratis in voor werkgever, locatie en solliciteren.",
    },
    de: {
      title: "Offene Stellen",
      description:
        "Aktuelle Stellen aus offiziellen öffentlichen Quellen. Titel, Kategorie, Vertrag und Arbeitszeit für alle sichtbar; kostenlos anmelden für Arbeitgeber und Ort.",
    },
    pl: {
      title: "Otwarte oferty pracy",
      description:
        "Aktualne oferty z oficjalnych publicznych źródeł. Stanowisko, kategoria, umowa i czas pracy są jawne; zaloguj się za darmo, by zobaczyć pracodawcę i miejsce.",
    },
  },
  professions: {
    en: {
      title: "Professions & Sectors — Who LabourMarket.ai is for",
      description:
        "From warehouse, production, cleaning, hospitality and care to construction, welding and driving: the professions and sectors LabourMarket.ai covers.",
    },
    lt: {
      title: "Profesijos ir sektoriai — kam skirta LabourMarket.ai",
      description:
        "Nuo sandėlio, gamybos, valymo, apgyvendinimo ir priežiūros iki statybos, suvirinimo ir vairavimo: profesijos ir sektoriai LabourMarket.ai.",
    },
    ru: {
      title: "Профессии и секторы — для кого LabourMarket.ai",
      description:
        "От склада, производства, уборки, гостеприимства и ухода до стройки, сварки и вождения: профессии и секторы, которые охватывает LabourMarket.ai.",
    },
    nl: {
      title: "Beroepen en sectoren — Voor wie LabourMarket.ai is",
      description:
        "Van magazijn, productie, schoonmaak, horeca en zorg tot bouw, lassen en transport: de beroepen en sectoren die LabourMarket.ai dekt.",
    },
    de: {
      title: "Berufe und Branchen — Für wen LabourMarket.ai gedacht ist",
      description:
        "Von Lager, Produktion, Reinigung, Gastgewerbe und Pflege bis Bau, Schweißen und Fahren: die Berufe und Branchen von LabourMarket.ai.",
    },
    pl: {
      title: "Zawody i branże — dla kogo jest LabourMarket.ai",
      description:
        "Od magazynu, produkcji, sprzątania, hotelarstwa i opieki po budownictwo, spawanie i transport: zawody i branże, które obejmuje LabourMarket.ai.",
    },
  },
  projectCostCalculator: {
    en: {
      title: "Project Calculator — Estimate work and project costs",
      description:
        "Free work and project cost calculator: enter your own workers, hours, rates and materials for a transparent preliminary estimate. No account; nothing stored.",
    },
    lt: {
      title: "Darbų ir projekto skaičiuoklė — apskaičiuok kainą",
      description:
        "Nemokama darbų ir projekto kainos skaičiuoklė: įvesk darbuotojus, valandas, įkainius ir medžiagas — gauk skaidrią preliminarią sąmatą. Be paskyros.",
    },
    ru: {
      title: "Калькулятор проекта — оцените стоимость работ",
      description:
        "Бесплатный калькулятор стоимости работ: введите работников, часы, ставки и материалы — получите прозрачную предварительную смету. Без аккаунта.",
    },
    nl: {
      title: "Projectcalculator — Bereken werk- en projectkosten",
      description:
        "Gratis calculator voor werk- en projectkosten: voer werknemers, uren, tarieven en materialen in voor een transparante raming. Geen account nodig.",
    },
    de: {
      title: "Projektrechner — Arbeits- und Projektkosten",
      description:
        "Kostenloser Projektkostenrechner: Arbeitskräfte, Stunden, Sätze und Material eingeben und eine transparente vorläufige Schätzung erhalten. Ohne Konto.",
    },
    pl: {
      title: "Kalkulator projektu — oszacuj koszty prac i projektu",
      description:
        "Darmowy kalkulator kosztów prac: wpisz pracowników, godziny, stawki i materiały, by dostać przejrzysty wstępny kosztorys. Bez zakładania konta.",
    },
  },
  createCv: {
    en: {
      title: "Free CV Builder — Create a professional CV online",
      description:
        "Create a professional CV free: import a PDF or DOCX or start from scratch, check every extracted fact, pick a clean template and download it as a PDF.",
    },
    lt: {
      title: "Nemokamas CV kūrimas — profesionalus CV internetu",
      description:
        "Susikurk profesionalų CV nemokamai: importuok PDF ar DOCX arba pradėk nuo nulio, patikrink kiekvieną faktą, pasirink šabloną ir atsisiųsk PDF.",
    },
    ru: {
      title: "Бесплатный конструктор CV — резюме онлайн",
      description:
        "Создайте профессиональное CV бесплатно: импортируйте PDF или DOCX либо начните с нуля, проверьте каждый факт, выберите шаблон и скачайте PDF.",
    },
    nl: {
      title: "Gratis cv-maker — Maak online een professioneel cv",
      description:
        "Maak gratis een professioneel cv: importeer een PDF of DOCX of begin vanaf nul, controleer elk feit, kies een template en download als PDF.",
    },
    de: {
      title: "Kostenloser Lebenslauf-Generator — online erstellen",
      description:
        "Kostenlos einen professionellen Lebenslauf erstellen: PDF oder DOCX importieren oder neu beginnen, jeden Fakt prüfen, Vorlage wählen, als PDF laden.",
    },
    pl: {
      title: "Darmowy kreator CV — stwórz profesjonalne CV online",
      description:
        "Stwórz profesjonalne CV za darmo: zaimportuj PDF lub DOCX albo zacznij od zera, sprawdź każdy fakt, wybierz szablon i pobierz PDF.",
    },
  },
};

export type PageMetaInput = {
  locale: string;
  /** Path AFTER the locale segment, e.g. "" (home) or "/pricing". */
  path?: string;
  /** Optional page-specific title (without the brand suffix). */
  title?: string;
  /** Optional page-specific description. */
  description?: string;
};

/**
 * Build a complete, SEO-correct Metadata object for a public page:
 * brand-aware title, canonical on the apex, hreflang alternates,
 * OpenGraph + Twitter, robots index/follow.
 */
export function buildPageMetadata({
  locale,
  path = "",
  title,
  description,
}: PageMetaInput): Metadata {
  const active = resolveActiveLocale(locale);
  const brand = BRAND_SEO[active];
  const resolvedTitle = title ? brandedTitle(title) : brand.title;
  const resolvedDescription = description ?? brand.description;
  const url = localizedUrl(active, path);
  // Brand share card (social-acquisition readiness v1): every public page
  // inherits the SAME per-locale generated image, served by
  // app/[locale]/opengraph-image.tsx via next/og — no external asset, no
  // per-page variance. Without this, social/chat link previews rendered as
  // bare text despite the `summary_large_image` card declaration.
  const shareImage = {
    url: localizedUrl(active, "/opengraph-image"),
    width: OG_IMAGE_SIZE.width,
    height: OG_IMAGE_SIZE.height,
    alt: brand.title,
  };

  return {
    title: resolvedTitle,
    description: resolvedDescription,
    alternates: {
      canonical: url,
      languages: hreflangAlternates(path),
    },
    robots: { index: true, follow: true },
    openGraph: {
      type: "website",
      siteName: BRAND_NAME,
      title: resolvedTitle,
      description: resolvedDescription,
      url,
      locale: OG_LOCALE[active],
      images: [shareImage],
    },
    twitter: {
      card: "summary_large_image",
      title: resolvedTitle,
      description: resolvedDescription,
      images: [shareImage],
    },
  };
}

/**
 * Build Metadata for a known marketing page from its curated PAGE_SEO
 * copy. Convenience wrapper around buildPageMetadata for the active
 * locale's localized title/description.
 */
export function buildPageMetadataFor(
  pageKey: PageKey,
  locale: string,
  path: string,
): Metadata {
  const active = resolveActiveLocale(locale);
  const copy = PAGE_SEO[pageKey][active];
  return buildPageMetadata({
    locale: active,
    path,
    title: copy.title,
    description: copy.description,
  });
}
