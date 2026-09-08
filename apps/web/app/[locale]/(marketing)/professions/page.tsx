import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { Link } from "@/lib/i18n/navigation";
import { buttonLinkClassName } from "@/components/ui/Button";
import { buildPageMetadataFor, resolveActiveLocale } from "@/lib/seo/metadata";
import type { ActiveLocale } from "@/lib/i18n/config";
import type { SectorKey } from "@/lib/structuring/sectors";
import {
  SEO_PROFESSIONS,
  SEO_ACTORS,
  SEO_PROBLEMS,
  pick,
} from "@/lib/seo/profession-problem-content";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return buildPageMetadataFor("professions", locale, "/professions");
}

type L = Record<ActiveLocale, string>;

const CTA_PROFILE: L = {
  en: "Build your profile / CV →",
  lt: "Susikurti profilį / CV →",
  ru: "Создать профиль / CV →",
  nl: "Maak je profiel / CV →",
  de: "Profil / Lebenslauf erstellen →",
};

const CTA_NEED: L = {
  en: "Submit a workforce need",
  lt: "Pateikti darbuotojų poreikį",
  ru: "Подать кадровую потребность",
  nl: "Dien een personeelsbehoefte in",
  de: "Personalbedarf einreichen",
};

const CTA_AGENCIES: L = {
  en: "For agencies",
  lt: "Agentūroms",
  ru: "Агентствам",
  nl: "Voor uitzendbureaus",
  de: "Für Personalagenturen",
};

const INTRO: Record<string, L> = {
  eyebrow: {
    en: "Professions & sectors",
    lt: "Profesijos ir sektoriai",
    ru: "Профессии и секторы",
    nl: "Beroepen & sectoren",
    de: "Berufe & Branchen",
  },
  title: {
    en: "Every profession, not one platform for one trade",
    lt: "Visos profesijos, ne viena platforma vienai profesijai",
    ru: "Все профессии, а не платформа для одной специальности",
    nl: "Elk beroep, niet één platform voor één vak",
    de: "Jeder Beruf, nicht eine Plattform für ein einzelnes Gewerk",
  },
  subcopy: {
    en: "LabourMarket.ai is a broad labour-market platform for every profession — construction and logistics as much as accounting, law, engineering, IT, sales, education and design. It also covers services: when you need someone to do a job, or you offer yours. Here are the professions, teams and employers it is built for.",
    lt: "LabourMarket.ai — plati darbo rinkos platforma visoms profesijoms: statybai ir logistikai lygiai taip pat, kaip buhalterijai, teisei, inžinerijai, IT, pardavimams, švietimui ir dizainui. Ji apima ir paslaugas — kai reikia, kad kas nors atliktų darbą, arba kai siūlote savo. Štai profesijos, brigados ir darbdaviai, kuriems ji skirta.",
    ru: "LabourMarket.ai — широкая платформа рынка труда для всех профессий: строительство и логистика так же, как бухгалтерия, право, инженерия, IT, продажи, образование и дизайн. Она охватывает и услуги — когда нужно, чтобы кто-то выполнил работу, или когда вы предлагаете свою. Вот профессии, бригады и работодатели, для которых она создана.",
    nl: "LabourMarket.ai is een breed arbeidsmarktplatform voor elk beroep — bouw en logistiek net zo goed als boekhouding, recht, engineering, IT, verkoop, onderwijs en design. Het omvat ook diensten: wanneer je iemand nodig hebt voor een klus, of je eigen dienst aanbiedt. Dit zijn de beroepen, teams en werkgevers waarvoor het is gebouwd.",
    de: "LabourMarket.ai ist eine breite Arbeitsmarktplattform für jeden Beruf — Bau und Logistik genauso wie Buchhaltung, Recht, Ingenieurwesen, IT, Vertrieb, Bildung und Design. Sie umfasst auch Dienstleistungen: wenn Sie jemanden für eine Arbeit brauchen oder Ihre eigene anbieten. Hier sind die Berufe, Teams und Arbeitgeber, für die sie gebaut wurde.",
  },
  profTitle: {
    en: "Professions we cover",
    lt: "Profesijos, kurias apimame",
    ru: "Профессии, которые мы охватываем",
    nl: "Beroepen die we bestrijken",
    de: "Berufe, die wir abdecken",
  },
  actorTitle: {
    en: "Teams, agencies and employers",
    lt: "Brigados, agentūros ir darbdaviai",
    ru: "Бригады, агентства и работодатели",
    nl: "Teams, uitzendbureaus en werkgevers",
    de: "Teams, Agenturen und Arbeitgeber",
  },
  problemsTitle: {
    en: "Real questions LabourMarket.ai answers",
    lt: "Realūs klausimai, į kuriuos atsako LabourMarket.ai",
    ru: "Реальные вопросы, на которые отвечает LabourMarket.ai",
    nl: "Echte vragen die LabourMarket.ai beantwoordt",
    de: "Echte Fragen, die LabourMarket.ai beantwortet",
  },
};

const SECTOR_LABEL: Record<SectorKey, L> = {
  construction: { en: "Construction", lt: "Statyba", ru: "Строительство", nl: "Bouw", de: "Bau" },
  manufacturing: { en: "Manufacturing", lt: "Gamyba", ru: "Производство", nl: "Productie", de: "Produktion" },
  transport_logistics: { en: "Transport & logistics", lt: "Transportas ir logistika", ru: "Транспорт и логистика", nl: "Transport & logistiek", de: "Transport & Logistik" },
  retail_sales: { en: "Retail & sales", lt: "Prekyba", ru: "Торговля и продажи", nl: "Retail & verkoop", de: "Handel & Vertrieb" },
  hospitality_food: { en: "Hospitality & food", lt: "Apgyvendinimas ir maitinimas", ru: "Гостеприимство и питание", nl: "Horeca & voeding", de: "Gastgewerbe & Gastronomie" },
  care_health: { en: "Care & health", lt: "Priežiūra ir sveikata", ru: "Уход и здоровье", nl: "Zorg & gezondheid", de: "Pflege & Gesundheit" },
  office_admin: { en: "Office & admin", lt: "Biuras ir administravimas", ru: "Офис и администрирование", nl: "Kantoor & administratie", de: "Büro & Verwaltung" },
  it_software: { en: "IT & software", lt: "IT ir programinė įranga", ru: "IT и ПО", nl: "IT & software", de: "IT & Software" },
  education: { en: "Education & training", lt: "Švietimas ir mokymai", ru: "Образование и обучение", nl: "Onderwijs & training", de: "Bildung & Schulung" },
  cleaning_facility: { en: "Cleaning & facilities", lt: "Valymas ir patalpos", ru: "Уборка и помещения", nl: "Schoonmaak & facilitair", de: "Reinigung & Gebäudeservice" },
  agriculture: { en: "Agriculture", lt: "Žemės ūkis", ru: "Сельское хозяйство", nl: "Landbouw", de: "Landwirtschaft" },
  repair_maintenance: { en: "Repair & maintenance", lt: "Remontas ir priežiūra", ru: "Ремонт и обслуживание", nl: "Reparatie & onderhoud", de: "Reparatur & Instandhaltung" },
  beauty_services: { en: "Beauty & personal services", lt: "Grožio paslaugos", ru: "Красота и персональные услуги", nl: "Beauty & persoonlijke verzorging", de: "Schönheit & persönliche Dienstleistungen" },
  hr_recruitment: { en: "HR & recruitment", lt: "Personalas ir atranka", ru: "HR и подбор персонала", nl: "HR & werving", de: "HR & Recruiting" },
  other: { en: "Other", lt: "Kita", ru: "Другое", nl: "Overig", de: "Sonstiges" },
};

export default async function ProfessionsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const l = resolveActiveLocale(locale);

  return (
    <div className="mx-auto max-w-container px-6 py-14 sm:px-12">
      <header className="max-w-3xl">
        <p className="font-mono text-meta uppercase tracking-label text-brand-blue">
          {pick(INTRO.eyebrow, l)}
        </p>
        <h1 className="mt-3 font-display text-4xl font-bold tracking-tightest text-text-primary sm:text-5xl">
          {pick(INTRO.title, l)}
        </h1>
        <p className="mt-4 text-sm leading-relaxed text-text-secondary sm:text-base">
          {pick(INTRO.subcopy, l)}
        </p>
      </header>

      <section className="mt-12">
        <h2 className="font-display text-2xl font-bold text-text-primary">
          {pick(INTRO.profTitle, l)}
        </h2>
        <ul className="mt-6 flex flex-wrap gap-2">
          {SEO_PROFESSIONS.map((p) => (
            <li
              key={p.key}
              className="rounded-full border border-border-subtle bg-surface-1 px-3 py-1.5 text-sm text-text-secondary"
            >
              <span className="text-text-primary">{pick(p.label, l)}</span>
              <span className="ml-2 text-meta uppercase tracking-label text-text-muted">
                {pick(SECTOR_LABEL[p.sector], l)}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-12">
        <h2 className="font-display text-2xl font-bold text-text-primary">
          {pick(INTRO.actorTitle, l)}
        </h2>
        <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {SEO_ACTORS.map((a) => (
            <li
              key={a.key}
              className="rounded-card border border-border-subtle bg-surface-1 p-5"
            >
              <h3 className="font-display text-base font-semibold text-text-primary">
                {pick(a.label, l)}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-text-secondary">
                {pick(a.blurb, l)}
              </p>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-12">
        <h2 className="font-display text-2xl font-bold text-text-primary">
          {pick(INTRO.problemsTitle, l)}
        </h2>
        <ul className="mt-6 grid gap-4 lg:grid-cols-2">
          {SEO_PROBLEMS.map((p) => (
            <li
              key={p.key}
              className="rounded-card border border-border-subtle bg-surface-1 p-5"
            >
              <h3 className="font-display text-base font-semibold text-text-primary">
                “{pick(p.question, l)}”
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-text-muted">
                {pick(p.pain, l)}
              </p>
              <p className="mt-2 text-sm leading-relaxed text-text-secondary">
                {pick(p.help, l)}
              </p>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-12 flex flex-wrap gap-3">
        <Link href="/worker-intake" className={buttonLinkClassName()}>
          {pick(CTA_PROFILE, l)}
        </Link>
        <Link href="/company-need" className={buttonLinkClassName("secondary")}>
          {pick(CTA_NEED, l)}
        </Link>
        <Link href="/for-agencies" className={buttonLinkClassName("secondary")}>
          {pick(CTA_AGENCIES, l)}
        </Link>
      </section>
    </div>
  );
}
