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

type BrandCopy = { title: string; description: string };

/** Per-locale brand title + description (homepage / site default). */
export const BRAND_SEO: Readonly<Record<ActiveLocale, BrandCopy>> = {
  en: {
    title:
      "LabourMarket.ai — Workers, Employers, Skills and Work Opportunities in Europe",
    description:
      "LabourMarket.ai is a general labour-market platform where people and companies see needs, readiness, skills, work opportunities and market signals — locally and internationally, across sectors.",
  },
  lt: {
    title:
      "LabourMarket.ai — darbuotojai, darbdaviai, įgūdžiai ir darbo galimybės Europoje",
    description:
      "LabourMarket.ai — bendra darbo rinkos platforma, kurioje žmonės ir įmonės mato poreikius, pasirengimą, įgūdžius, darbo galimybes ir rinkos signalus — vietoje ir tarptautiniu mastu, įvairiuose sektoriuose.",
  },
  ru: {
    title:
      "LabourMarket.ai — работники, работодатели, навыки и возможности работы в Европе",
    description:
      "LabourMarket.ai — общая платформа рынка труда, где люди и компании видят потребности, готовность, навыки, рабочие возможности и рыночные сигналы — локально и на международном уровне, в разных секторах.",
  },
  nl: {
    title:
      "LabourMarket.ai — Werknemers, werkgevers, vaardigheden en werkkansen in Europa",
    description:
      "LabourMarket.ai is een algemeen arbeidsmarktplatform waar mensen en bedrijven behoeften, gereedheid, vaardigheden, werkkansen en marktsignalen zien — lokaal en internationaal, in verschillende sectoren.",
  },
  de: {
    title:
      "LabourMarket.ai — Arbeitskräfte, Arbeitgeber, Fähigkeiten und Arbeitsmöglichkeiten in Europa",
    description:
      "LabourMarket.ai ist eine allgemeine Arbeitsmarktplattform, auf der Menschen und Unternehmen Bedarfe, Bereitschaft, Fähigkeiten, Arbeitsmöglichkeiten und Marktsignale sehen — lokal und international, über viele Branchen hinweg.",
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

/** hreflang alternates map for a path across all active locales + x-default. */
export function hreflangAlternates(path: string = ""): Record<string, string> {
  const languages: Record<string, string> = {};
  for (const locale of activeLocales) {
    languages[locale] = localizedUrl(locale, path);
  }
  languages["x-default"] = localizedUrl(defaultLocale, path);
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
        "Workers across sectors — from logistics and manufacturing to hospitality, care, construction and more: create a profile and CV on LabourMarket.ai, show your skills and availability, and be visible for work opportunities and employer needs across Europe.",
    },
    lt: {
      title: "Darbuotojams — susikurk profilį ir CV",
      description:
        "Įvairių sektorių darbuotojai — nuo logistikos ir gamybos iki apgyvendinimo, priežiūros, statybos ir kt.: susikurk profilį ir CV LabourMarket.ai, parodyk įgūdžius ir prieinamumą ir būk matomas darbo galimybėms bei darbdavių poreikiams Europoje.",
    },
    ru: {
      title: "Работникам — создайте профиль и CV",
      description:
        "Работники разных секторов — от логистики и производства до гостеприимства, ухода, строительства и других: создайте профиль и CV на LabourMarket.ai, покажите навыки и доступность и будьте видимы для рабочих возможностей и потребностей работодателей в Европе.",
    },
    nl: {
      title: "Voor werknemers — Bouw je profiel en cv",
      description:
        "Werknemers uit allerlei sectoren — van logistiek en productie tot horeca, zorg, bouw en meer: maak een profiel en cv op LabourMarket.ai, laat je vaardigheden en beschikbaarheid zien en wees zichtbaar voor werkkansen en personeelsbehoeften van werkgevers in heel Europa.",
    },
    de: {
      title: "Für Arbeitskräfte — Erstellen Sie Ihr Profil und Ihren Lebenslauf",
      description:
        "Arbeitskräfte aus vielen Branchen — von Logistik und Produktion bis Gastgewerbe, Pflege, Bau und mehr: Erstellen Sie ein Profil und einen Lebenslauf auf LabourMarket.ai, zeigen Sie Ihre Fähigkeiten und Verfügbarkeit und werden Sie sichtbar für Arbeitsmöglichkeiten und Arbeitgeberbedarfe in ganz Europa.",
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
        "Employers and contractors: describe the workers, teams and skills you need. LabourMarket.ai structures your workforce inquiry and helps organise matching and next steps across Europe.",
    },
    lt: {
      title: "Darbdaviams — pateik darbo jėgos užklausą",
      description:
        "Darbdaviai ir rangovai: aprašyk reikalingus darbuotojus, brigadas ir įgūdžius. LabourMarket.ai struktūruoja užklausą ir padeda organizuoti atranką bei tolimesnius veiksmus Europoje.",
    },
    ru: {
      title: "Работодателям — подайте запрос на работников",
      description:
        "Работодатели и подрядчики: опишите нужных работников, бригады и навыки. LabourMarket.ai структурирует запрос и помогает организовать подбор и дальнейшие шаги в Европе.",
    },
    nl: {
      title: "Voor werkgevers — Dien je personeelsaanvraag in",
      description:
        "Werkgevers en aannemers: beschrijf de werknemers, ploegen en vaardigheden die je nodig hebt. LabourMarket.ai structureert je personeelsaanvraag en helpt de selectie en vervolgstappen in Europa te organiseren.",
    },
    de: {
      title: "Für Arbeitgeber — Stellen Sie Ihre Personalanfrage",
      description:
        "Arbeitgeber und Auftragnehmer: Beschreiben Sie die Arbeitskräfte, Kolonnen und Fähigkeiten, die Sie benötigen. LabourMarket.ai strukturiert Ihre Personalanfrage und hilft, Auswahl und nächste Schritte in Europa zu organisieren.",
    },
  },
  agencies: {
    en: {
      title: "For Agencies — Coordinate workers and teams",
      description:
        "Staffing agencies: coordinate workers, teams and employer needs in one place. LabourMarket.ai helps structure intake, matching and accommodation across European markets.",
    },
    lt: {
      title: "Agentūroms — koordinuok darbuotojus ir brigadas",
      description:
        "Įdarbinimo agentūros: koordinuok darbuotojus, brigadas ir darbdavių poreikius vienoje vietoje. LabourMarket.ai padeda struktūruoti priėmimą, atranką ir apgyvendinimą Europos rinkose.",
    },
    ru: {
      title: "Агентствам — координируйте работников и бригады",
      description:
        "Кадровые агентства: координируйте работников, бригады и потребности работодателей в одном месте. LabourMarket.ai помогает структурировать приём, подбор и проживание на рынках Европы.",
    },
    nl: {
      title: "Voor uitzendbureaus — Coördineer werknemers en ploegen",
      description:
        "Uitzendbureaus: coördineer werknemers, ploegen en personeelsbehoeften van werkgevers op één plek. LabourMarket.ai helpt intake, selectie en huisvesting op Europese markten te structureren.",
    },
    de: {
      title: "Für Personalagenturen — Koordinieren Sie Arbeitskräfte und Kolonnen",
      description:
        "Personalagenturen: Koordinieren Sie Arbeitskräfte, Kolonnen und Arbeitgeberbedarfe an einem Ort. LabourMarket.ai hilft, Aufnahme, Auswahl und Unterkunft auf europäischen Märkten zu strukturieren.",
    },
  },
  workAbroad: {
    en: {
      title: "Work Abroad — Jobs across sectors in Europe",
      description:
        "Considering work abroad in any sector? See how LabourMarket.ai structures skills, selection, documents and accommodation so workers and employers can plan the next steps across Europe.",
    },
    lt: {
      title: "Darbas užsienyje — darbai įvairiuose sektoriuose Europoje",
      description:
        "Svarstai darbą užsienyje bet kuriame sektoriuje? Sužinok, kaip LabourMarket.ai struktūruoja įgūdžius, atranką, dokumentus ir apgyvendinimą, kad darbuotojai ir darbdaviai galėtų planuoti tolimesnius veiksmus Europoje.",
    },
    ru: {
      title: "Работа за границей — вакансии в разных секторах Европы",
      description:
        "Думаете о работе за границей в любом секторе? Узнайте, как LabourMarket.ai структурирует навыки, подбор, документы и проживание, чтобы работники и работодатели планировали дальнейшие шаги в Европе.",
    },
    nl: {
      title: "Werken in het buitenland — Banen in verschillende sectoren in Europa",
      description:
        "Denk je aan werken in het buitenland, in welke sector dan ook? Ontdek hoe LabourMarket.ai vaardigheden, selectie, documenten en huisvesting structureert, zodat werknemers en werkgevers de volgende stappen in Europa kunnen plannen.",
    },
    de: {
      title: "Arbeiten im Ausland — Jobs in verschiedenen Branchen in Europa",
      description:
        "Sie überlegen, im Ausland zu arbeiten — in welcher Branche auch immer? Erfahren Sie, wie LabourMarket.ai Fähigkeiten, Auswahl, Dokumente und Unterkunft strukturiert, damit Arbeitskräfte und Arbeitgeber die nächsten Schritte in Europa planen können.",
    },
  },
  companyNeed: {
    en: {
      title: "Workforce Inquiry — Describe the workforce you need",
      description:
        "Tell LabourMarket.ai what your project needs: professions, skills, team size, location and start. We prepare a structured draft you review — nothing is published automatically.",
    },
    lt: {
      title: "Darbuotojų užklausa — aprašyk reikalingą darbo jėgą",
      description:
        "Pasakyk LabourMarket.ai, ko reikia projektui: profesijos, įgūdžiai, komandos dydis, vieta ir pradžia. Paruošiame struktūruotą juodraštį, kurį peržiūri — niekas nepublikuojama automatiškai.",
    },
    ru: {
      title: "Запрос на работников — опишите нужную рабочую силу",
      description:
        "Расскажите LabourMarket.ai, что нужно проекту: профессии, навыки, размер бригады, локация и старт. Мы готовим структурированный черновик, который вы проверяете — ничего не публикуется автоматически.",
    },
    nl: {
      title: "Personeelsaanvraag — Beschrijf de werknemers die je nodig hebt",
      description:
        "Vertel LabourMarket.ai wat je project nodig heeft: beroepen, vaardigheden, teamgrootte, locatie en startdatum. Wij bereiden een gestructureerd concept voor dat jij beoordeelt — niets wordt automatisch gepubliceerd.",
    },
    de: {
      title: "Personalanfrage — Beschreiben Sie die Arbeitskräfte, die Sie benötigen",
      description:
        "Sagen Sie LabourMarket.ai, was Ihr Projekt braucht: Berufe, Fähigkeiten, Teamgröße, Standort und Start. Wir erstellen einen strukturierten Entwurf, den Sie prüfen — nichts wird automatisch veröffentlicht.",
    },
  },
  workerIntake: {
    en: {
      title: "Worker Intake — Create your profile and CV",
      description:
        "Start your LabourMarket.ai worker profile: professions, skills, experience and availability. A structured intake builds your CV and prepares you for employer review and selection.",
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
        "Start je LabourMarket.ai-werknemersprofiel: beroepen, vaardigheden, ervaring en beschikbaarheid. Een gestructureerde intake bouwt je cv op en bereidt je voor op beoordeling en selectie door werkgevers.",
    },
    de: {
      title: "Anmeldung für Arbeitskräfte — Erstellen Sie Ihr Profil und Ihren Lebenslauf",
      description:
        "Starten Sie Ihr Profil als Arbeitskraft auf LabourMarket.ai: Berufe, Fähigkeiten, Erfahrung und Verfügbarkeit. Eine strukturierte Aufnahme erstellt Ihren Lebenslauf und bereitet Sie auf Prüfung und Auswahl durch Arbeitgeber vor.",
    },
  },
  labourMarket: {
    en: {
      title: "Labour Market — Evidence and country signals in Europe",
      description:
        "Source-backed labour-market signals for European markets: workforce demand, skills and mobility. LabourMarket.ai uses honest, qualitative evidence — no invented numbers.",
    },
    lt: {
      title: "Darbo rinka — duomenys ir šalių signalai Europoje",
      description:
        "Šaltiniais grįsti darbo rinkos signalai Europos rinkoms: darbo jėgos paklausa, įgūdžiai ir mobilumas. LabourMarket.ai naudoja sąžiningus, kokybinius duomenis — be sugalvotų skaičių.",
    },
    ru: {
      title: "Рынок труда — данные и сигналы по странам Европы",
      description:
        "Подтверждённые источниками сигналы рынка труда по рынкам Европы: спрос на рабочую силу, навыки и мобильность. LabourMarket.ai использует честные качественные данные — без выдуманных цифр.",
    },
    nl: {
      title: "Arbeidsmarkt — Onderbouwde gegevens en landensignalen in Europa",
      description:
        "Op bronnen gebaseerde arbeidsmarktsignalen voor Europese markten: vraag naar arbeidskrachten, vaardigheden en mobiliteit. LabourMarket.ai gebruikt eerlijke, kwalitatieve gegevens — zonder verzonnen cijfers.",
    },
    de: {
      title: "Arbeitsmarkt — Belege und Ländersignale in Europa",
      description:
        "Quellengestützte Arbeitsmarktsignale für europäische Märkte: Nachfrage nach Arbeitskräften, Fähigkeiten und Mobilität. LabourMarket.ai nutzt ehrliche, qualitative Belege — keine erfundenen Zahlen.",
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
        "Kaip veikia LabourMarket.ai kainodara ankstyvos prieigos metu. Aiški, sąžininga kainodara darbuotojams, darbdaviams ir agentūroms — be paslėptų mokesčių ir tuščių pažadų.",
    },
    ru: {
      title: "Цены — честная модель раннего доступа",
      description:
        "Как работают цены LabourMarket.ai в период раннего доступа. Понятные и честные цены для работников, работодателей и агентств — без скрытых платежей и пустых обещаний.",
    },
    nl: {
      title: "Prijzen — Eerlijk early-access-model",
      description:
        "Zo werken de prijzen van LabourMarket.ai tijdens early access. Duidelijke, eerlijke prijzen voor werknemers, werkgevers en uitzendbureaus — geen verborgen kosten, geen valse beloften.",
    },
    de: {
      title: "Preise — Ehrliches Early-Access-Modell",
      description:
        "So funktionieren die Preise von LabourMarket.ai während des Early Access. Klare, ehrliche Preise für Arbeitskräfte, Arbeitgeber und Personalagenturen — keine versteckten Gebühren, keine falschen Versprechen.",
    },
  },
  workOpportunities: {
    en: {
      title: "Work Opportunities — Find work across sectors",
      description:
        "Looking for work in Europe? LabourMarket.ai helps workers across sectors — construction, logistics, manufacturing, hospitality, care and more — build a profile and CV and reach real employer needs.",
    },
    lt: {
      title: "Darbo galimybės — rask darbą įvairiuose sektoriuose",
      description:
        "Ieškai darbo Europoje? LabourMarket.ai padeda įvairių sektorių darbuotojams — statyba, logistika, gamyba, apgyvendinimas, priežiūra ir kt. — susikurti profilį ir CV ir pasiekti realius darbdavių poreikius.",
    },
    ru: {
      title: "Возможности работы — найдите работу в разных секторах",
      description:
        "Ищете работу в Европе? LabourMarket.ai помогает работникам разных секторов — строительство, логистика, производство, гостеприимство, уход и др. — создать профиль и CV и выйти на реальные потребности работодателей.",
    },
    nl: {
      title: "Werkkansen — Vind werk in verschillende sectoren",
      description:
        "Op zoek naar werk in Europa? LabourMarket.ai helpt werknemers in allerlei sectoren — bouw, logistiek, productie, horeca, zorg en meer — een profiel en cv op te bouwen en echte personeelsbehoeften van werkgevers te bereiken.",
    },
    de: {
      title: "Arbeitsmöglichkeiten — Arbeit in verschiedenen Branchen finden",
      description:
        "Sie suchen Arbeit in Europa? LabourMarket.ai hilft Arbeitskräften in vielen Branchen — Bau, Logistik, Produktion, Gastgewerbe, Pflege und mehr — ein Profil und einen Lebenslauf zu erstellen und echte Arbeitgeberbedarfe zu erreichen.",
    },
  },
  skills: {
    en: {
      title: "Skills — Verified and self-declared, never mixed",
      description:
        "Show and check real skills on LabourMarket.ai. Skills are marked verified or self-declared so workers can prove what they can do and employers can see real experience.",
    },
    lt: {
      title: "Įgūdžiai — patvirtinti ir savideklaruoti, nesumaišomi",
      description:
        "Parodyk ir patikrink realius įgūdžius LabourMarket.ai. Įgūdžiai žymimi kaip patvirtinti arba savideklaruoti, kad darbuotojai įrodytų, ką moka, o darbdaviai matytų realią patirtį.",
    },
    ru: {
      title: "Навыки — подтверждённые и самозаявленные, без смешивания",
      description:
        "Показывайте и проверяйте реальные навыки на LabourMarket.ai. Навыки помечены как подтверждённые или самозаявленные, чтобы работники доказали умения, а работодатели видели реальный опыт.",
    },
    nl: {
      title: "Vaardigheden — Geverifieerd en zelf opgegeven, nooit vermengd",
      description:
        "Laat echte vaardigheden zien en controleer ze op LabourMarket.ai. Vaardigheden worden gemarkeerd als geverifieerd of zelf opgegeven, zodat werknemers kunnen aantonen wat ze kunnen en werkgevers echte ervaring zien.",
    },
    de: {
      title: "Fähigkeiten — Verifiziert und selbst angegeben, nie vermischt",
      description:
        "Zeigen und prüfen Sie echte Fähigkeiten auf LabourMarket.ai. Fähigkeiten werden als verifiziert oder selbst angegeben gekennzeichnet, damit Arbeitskräfte belegen, was sie können, und Arbeitgeber echte Erfahrung sehen.",
    },
  },
  jobs: {
    en: {
      title: "Open jobs — LabourMarket.ai",
      description:
        "Browse live vacancies imported from official public employment sources. Job title, category, employment form and working time are open to everyone; sign in free to see the employer, the location and how to apply.",
    },
    lt: {
      title: "Laisvos darbo vietos — LabourMarket.ai",
      description:
        "Naršyk gyvas darbo vietas iš oficialių viešų užimtumo šaltinių. Pareigos, kategorija, sutarties tipas ir darbo laikas matomi visiems; prisijunk nemokamai, kad matytum darbdavį, vietovę ir kaip kandidatuoti.",
    },
    ru: {
      title: "Открытые вакансии — LabourMarket.ai",
      description:
        "Смотрите актуальные вакансии из официальных публичных источников занятости. Название, категория, тип занятости и рабочее время открыты всем; зарегистрируйтесь бесплатно, чтобы увидеть работодателя, местоположение и способ подачи заявки.",
    },
    nl: {
      title: "Openstaande vacatures — LabourMarket.ai",
      description:
        "Bekijk actuele vacatures uit officiële openbare arbeidsbronnen. Functietitel, categorie, contractvorm en werktijd zijn voor iedereen zichtbaar; maak gratis een account om de werkgever, de locatie en de sollicitatiewijze te zien.",
    },
    de: {
      title: "Offene Stellen — LabourMarket.ai",
      description:
        "Aktuelle Stellen aus offiziellen öffentlichen Arbeitsmarktquellen. Bezeichnung, Kategorie, Vertragsform und Arbeitszeit sind für alle sichtbar; kostenlos anmelden, um Arbeitgeber, Ort und Bewerbungsweg zu sehen.",
    },
  },
  professions: {
    en: {
      title: "Professions & Sectors — Who LabourMarket.ai is for",
      description:
        "From construction workers, welders and drivers to warehouse, production, cleaning, hospitality, care and admin roles — LabourMarket.ai covers professions and sectors across Europe, plus teams, agencies and employers.",
    },
    lt: {
      title: "Profesijos ir sektoriai — kam skirta LabourMarket.ai",
      description:
        "Nuo statybininkų, suvirintojų ir vairuotojų iki sandėlio, gamybos, valymo, apgyvendinimo, priežiūros ir administracijos — LabourMarket.ai apima profesijas ir sektorius Europoje, taip pat brigadas, agentūras ir darbdavius.",
    },
    ru: {
      title: "Профессии и секторы — для кого LabourMarket.ai",
      description:
        "От строителей, сварщиков и водителей до склада, производства, уборки, гостеприимства, ухода и администрации — LabourMarket.ai охватывает профессии и секторы Европы, а также бригады, агентства и работодателей.",
    },
    nl: {
      title: "Beroepen en sectoren — Voor wie LabourMarket.ai is",
      description:
        "Van bouwvakkers, lassers en chauffeurs tot magazijn-, productie-, schoonmaak-, horeca-, zorg- en administratieve functies — LabourMarket.ai dekt beroepen en sectoren in heel Europa, plus ploegen, uitzendbureaus en werkgevers.",
    },
    de: {
      title: "Berufe und Branchen — Für wen LabourMarket.ai gedacht ist",
      description:
        "Von Bauarbeitern, Schweißern und Fahrern bis zu Lager-, Produktions-, Reinigungs-, Gastgewerbe-, Pflege- und Verwaltungsrollen — LabourMarket.ai deckt Berufe und Branchen in ganz Europa ab, dazu Kolonnen, Personalagenturen und Arbeitgeber.",
    },
  },
  projectCostCalculator: {
    en: {
      title: "Project Calculator — Estimate work and project costs",
      description:
        "Free work and project cost calculator: enter your own workers, hours, rates, materials and extras and get a transparent preliminary estimate. Cross-sector — logistics, cleaning, manufacturing, hospitality, care, construction and more. No account needed; your numbers are not stored.",
    },
    lt: {
      title: "Darbų ir projekto skaičiuoklė — apskaičiuok darbų kainą",
      description:
        "Nemokama darbų ir projekto kainos skaičiuoklė: įvesk savo darbuotojus, valandas, įkainius, medžiagas ir papildomas išlaidas — gauk skaidrią preliminarią sąmatą. Įvairiems sektoriams — logistikai, valymui, gamybai, svetingumui, priežiūrai, statybai ir kt. Nereikia paskyros; tavo skaičiai nesaugomi.",
    },
    ru: {
      title: "Калькулятор проекта — оцените стоимость работ",
      description:
        "Бесплатный калькулятор стоимости работ и проектов: введите своих работников, часы, ставки, материалы и дополнительные расходы — получите прозрачную предварительную смету. Для разных секторов — логистика, уборка, производство, гостеприимство, уход, строительство и др. Без аккаунта; ваши цифры не сохраняются.",
    },
    nl: {
      title: "Projectcalculator — Bereken werk- en projectkosten",
      description:
        "Gratis calculator voor werk- en projectkosten: voer je eigen werknemers, uren, tarieven, materialen en extra's in en krijg een transparante voorlopige raming. Voor allerlei sectoren — logistiek, schoonmaak, productie, horeca, zorg, bouw en meer. Geen account nodig; je cijfers worden niet opgeslagen.",
    },
    de: {
      title: "Projektrechner — Arbeits- und Projektkosten kalkulieren",
      description:
        "Kostenloser Arbeits- und Projektkostenrechner: Geben Sie Ihre eigenen Arbeitskräfte, Stunden, Sätze, Material- und Zusatzkosten ein und erhalten Sie eine transparente vorläufige Schätzung. Branchenübergreifend — Logistik, Reinigung, Produktion, Gastgewerbe, Pflege, Bau und mehr. Ohne Konto; Ihre Zahlen werden nicht gespeichert.",
    },
  },
  createCv: {
    en: {
      title: "Free CV Builder — Create a professional CV online",
      description:
        "Create a professional CV free on LabourMarket.ai: import an existing PDF or DOCX or start from scratch, review every extracted fact, choose a clean template and download as PDF. Optionally build your worker profile, structure your skills with the European ESCO taxonomy and see real job ads from official public sources.",
    },
    lt: {
      title: "Nemokamas CV kūrimas — susikurk profesionalų CV internetu",
      description:
        "Susikurk profesionalų CV nemokamai LabourMarket.ai: importuok esamą PDF ar DOCX arba pradėk nuo nulio, peržiūrėk kiekvieną faktą, pasirink tvarkingą šabloną ir atsisiųsk PDF. Papildomai gali susikurti darbuotojo profilį, struktūruoti įgūdžius pagal Europos ESCO klasifikatorių ir matyti tikrus darbo skelbimus iš oficialių viešų šaltinių.",
    },
    ru: {
      title: "Бесплатный конструктор CV — создайте профессиональное резюме онлайн",
      description:
        "Создайте профессиональное CV бесплатно на LabourMarket.ai: импортируйте существующий PDF или DOCX либо начните с нуля, проверьте каждый факт, выберите аккуратный шаблон и скачайте PDF. По желанию — создайте профиль работника, структурируйте навыки по европейской классификации ESCO и смотрите реальные вакансии из официальных публичных источников.",
    },
    nl: {
      title: "Gratis cv-maker — Maak online een professioneel cv",
      description:
        "Maak gratis een professioneel cv op LabourMarket.ai: importeer een bestaand PDF- of DOCX-bestand of begin vanaf nul, controleer elk feit, kies een strakke template en download als PDF. Optioneel bouw je je werknemersprofiel op, structureer je je vaardigheden met de Europese ESCO-taxonomie en zie je echte vacatures uit officiële publieke bronnen.",
    },
    de: {
      title: "Kostenloser Lebenslauf-Generator — Professionellen Lebenslauf online erstellen",
      description:
        "Erstellen Sie kostenlos einen professionellen Lebenslauf auf LabourMarket.ai: Importieren Sie ein vorhandenes PDF oder DOCX oder beginnen Sie bei null, prüfen Sie jeden Fakt, wählen Sie eine klare Vorlage und laden Sie als PDF herunter. Optional bauen Sie Ihr Arbeitskraft-Profil auf, strukturieren Ihre Fähigkeiten mit der europäischen ESCO-Taxonomie und sehen echte Stellenanzeigen aus offiziellen öffentlichen Quellen.",
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
  const resolvedTitle = title ? `${title} · ${BRAND_NAME}` : brand.title;
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
