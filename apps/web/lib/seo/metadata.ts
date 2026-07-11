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
 * Copy lives here as a pure per-locale map (lt / en / ru — the active
 * locales) rather than in messages/*.json so the SEO layer has no
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
};

/** OpenGraph locale tag per active locale (BCP-47-ish region form). */
const OG_LOCALE: Readonly<Record<ActiveLocale, string>> = {
  en: "en_GB",
  lt: "lt_LT",
  ru: "ru_RU",
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
  | "professions";

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
  },
  companies: {
    en: {
      title: "For Employers — Submit your workforce need",
      description:
        "Employers and contractors: describe the workers, teams and skills you need. LabourMarket.ai structures your workforce need and helps organise matching and next steps across Europe.",
    },
    lt: {
      title: "Darbdaviams — pateik darbo jėgos poreikį",
      description:
        "Darbdaviai ir rangovai: aprašyk reikalingus darbuotojus, brigadas ir įgūdžius. LabourMarket.ai struktūruoja poreikį ir padeda organizuoti atranką bei tolimesnius veiksmus Europoje.",
    },
    ru: {
      title: "Работодателям — подайте кадровую потребность",
      description:
        "Работодатели и подрядчики: опишите нужных работников, бригады и навыки. LabourMarket.ai структурирует потребность и помогает организовать подбор и дальнейшие шаги в Европе.",
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
  },
  companyNeed: {
    en: {
      title: "Company Need — Describe the workforce you need",
      description:
        "Tell LabourMarket.ai what your project needs: professions, skills, team size, location and start. We prepare a structured draft you review — nothing is published automatically.",
    },
    lt: {
      title: "Įmonės poreikis — aprašyk reikalingą darbo jėgą",
      description:
        "Pasakyk LabourMarket.ai, ko reikia projektui: profesijos, įgūdžiai, komandos dydis, vieta ir pradžia. Paruošiame struktūruotą juodraštį, kurį peržiūri — niekas nepublikuojama automatiškai.",
    },
    ru: {
      title: "Потребность компании — опишите нужную рабочую силу",
      description:
        "Расскажите LabourMarket.ai, что нужно проекту: профессии, навыки, размер бригады, локация и старт. Мы готовим структурированный черновик, который вы проверяете — ничего не публикуется автоматически.",
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
    },
    twitter: {
      card: "summary_large_image",
      title: resolvedTitle,
      description: resolvedDescription,
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
