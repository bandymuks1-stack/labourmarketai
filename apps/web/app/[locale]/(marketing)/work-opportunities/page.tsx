import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { Link } from "@/lib/i18n/navigation";
import { buttonLinkClassName } from "@/components/ui/Button";
import { buildPageMetadataFor, resolveActiveLocale } from "@/lib/seo/metadata";
import type { ActiveLocale } from "@/lib/i18n/config";
import { SEO_PROBLEMS, pick } from "@/lib/seo/profession-problem-content";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return buildPageMetadataFor("workOpportunities", locale, "/work-opportunities");
}

type L = Record<ActiveLocale, string>;

const CTA_PROFILE: L = {
  en: "Build your profile / CV →",
  lt: "Susikurti profilį / CV →",
  ru: "Создать профиль / CV →",
  nl: "Maak je profiel / CV →",
  de: "Profil / Lebenslauf erstellen →",
};

const CTA_SKILLS: L = {
  en: "About skills",
  lt: "Apie įgūdžius",
  ru: "О навыках",
  nl: "Over vaardigheden",
  de: "Über Fähigkeiten",
};

const INTRO: Record<string, L> = {
  eyebrow: {
    en: "Work opportunities",
    lt: "Darbo galimybės",
    ru: "Возможности работы",
    nl: "Werkmogelijkheden",
    de: "Arbeitsmöglichkeiten",
  },
  title: {
    en: "Find work across sectors in Europe",
    lt: "Rask darbą įvairiuose sektoriuose Europoje",
    ru: "Найдите работу в разных секторах Европы",
    nl: "Vind werk in verschillende sectoren in Europa",
    de: "Finden Sie Arbeit in verschiedenen Branchen in Europa",
  },
  subcopy: {
    en: "Whatever your trade — construction, logistics, manufacturing, hospitality, care, cleaning, agriculture or office work — LabourMarket.ai helps you turn real experience into a profile employers can act on.",
    lt: "Kad ir kokia tavo profesija — statyba, logistika, gamyba, apgyvendinimas, priežiūra, valymas, žemės ūkis ar biuras — LabourMarket.ai padeda paversti realią patirtį profiliu, į kurį darbdaviai gali reaguoti.",
    ru: "Какой бы ни была ваша специальность — строительство, логистика, производство, гостеприимство, уход, уборка, сельское хозяйство или офис — LabourMarket.ai помогает превратить реальный опыт в профиль, на который реагируют работодатели.",
    nl: "Wat je vak ook is — bouw, logistiek, productie, horeca, zorg, schoonmaak, landbouw of kantoorwerk — LabourMarket.ai helpt je om echte ervaring om te zetten in een profiel waar werkgevers op kunnen reageren.",
    de: "Ganz gleich, welches Gewerk Sie ausüben — Bau, Logistik, Produktion, Gastgewerbe, Pflege, Reinigung, Landwirtschaft oder Büroarbeit — LabourMarket.ai hilft Ihnen, echte Erfahrung in ein Profil zu verwandeln, auf das Arbeitgeber reagieren können.",
  },
  stepsTitle: {
    en: "How it works for workers",
    lt: "Kaip tai veikia darbuotojams",
    ru: "Как это работает для работников",
    nl: "Hoe het werkt voor werknemers",
    de: "So funktioniert es für Arbeitskräfte",
  },
  problemsTitle: {
    en: "Questions workers search for",
    lt: "Klausimai, kurių ieško darbuotojai",
    ru: "Что ищут работники",
    nl: "Vragen waar werknemers naar zoeken",
    de: "Fragen, nach denen Arbeitskräfte suchen",
  },
};

const STEPS: { title: L; body: L }[] = [
  {
    title: {
      en: "1. Build your profile & CV",
      lt: "1. Susikurk profilį ir CV",
      ru: "1. Создайте профиль и CV",
      nl: "1. Maak je profiel en CV aan",
      de: "1. Erstellen Sie Ihr Profil und Ihren Lebenslauf",
    },
    body: {
      en: "A structured intake captures your professions, skills, experience and availability — even if you have no written CV yet.",
      lt: "Struktūruota anketa surenka tavo profesijas, įgūdžius, patirtį ir prieinamumą — net jei dar neturi parašyto CV.",
      ru: "Структурированная анкета фиксирует профессии, навыки, опыт и доступность — даже без готового CV.",
      nl: "Een gestructureerde intake legt je beroepen, vaardigheden, ervaring en beschikbaarheid vast — ook als je nog geen geschreven CV hebt.",
      de: "Eine strukturierte Erfassung hält Ihre Berufe, Fähigkeiten, Erfahrung und Verfügbarkeit fest — auch wenn Sie noch keinen geschriebenen Lebenslauf haben.",
    },
  },
  {
    title: {
      en: "2. Show real skills",
      lt: "2. Parodyk realius įgūdžius",
      ru: "2. Покажите реальные навыки",
      nl: "2. Laat echte vaardigheden zien",
      de: "2. Zeigen Sie echte Fähigkeiten",
    },
    body: {
      en: "Skills appear as verified or self-declared, so employers see what you can actually do.",
      lt: "Įgūdžiai rodomi kaip patvirtinti arba savideklaruoti, kad darbdaviai matytų, ką iš tikrųjų moki.",
      ru: "Навыки показаны как подтверждённые или самозаявленные, чтобы работодатели видели реальные умения.",
      nl: "Vaardigheden worden getoond als bevestigd of zelf opgegeven, zodat werkgevers zien wat je echt kunt.",
      de: "Fähigkeiten werden als bestätigt oder selbst angegeben angezeigt, damit Arbeitgeber sehen, was Sie wirklich können.",
    },
  },
  {
    title: {
      en: "3. Reach real needs",
      lt: "3. Pasiek realius poreikius",
      ru: "3. Выходите на реальные потребности",
      nl: "3. Bereik echte behoeften",
      de: "3. Erreichen Sie echten Bedarf",
    },
    body: {
      en: "Your profile is reviewed against employer and agency needs across countries — no fake job promises.",
      lt: "Tavo profilis gretinamas su darbdavių ir agentūrų poreikiais skirtingose šalyse — be tuščių darbo pažadų.",
      ru: "Ваш профиль сопоставляется с потребностями работодателей и агентств в разных странах — без пустых обещаний.",
      nl: "Je profiel wordt beoordeeld aan de hand van de behoeften van werkgevers en uitzendbureaus in verschillende landen — geen valse baanbeloftes.",
      de: "Ihr Profil wird anhand der Bedarfe von Arbeitgebern und Agenturen in verschiedenen Ländern geprüft — keine falschen Jobversprechen.",
    },
  },
];

export default async function WorkOpportunitiesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const l = resolveActiveLocale(locale);
  const workerProblems = SEO_PROBLEMS.filter((p) => p.audience === "worker");

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
          {pick(INTRO.stepsTitle, l)}
        </h2>
        <ol className="mt-6 grid gap-4 sm:grid-cols-3">
          {STEPS.map((s) => (
            <li
              key={pick(s.title, "en")}
              className="rounded-card border border-border-subtle bg-surface-1 p-5"
            >
              <h3 className="font-display text-base font-semibold text-text-primary">
                {pick(s.title, l)}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-text-secondary">
                {pick(s.body, l)}
              </p>
            </li>
          ))}
        </ol>
      </section>

      <section className="mt-12">
        <h2 className="font-display text-2xl font-bold text-text-primary">
          {pick(INTRO.problemsTitle, l)}
        </h2>
        <ul className="mt-6 grid gap-4 lg:grid-cols-2">
          {workerProblems.map((p) => (
            <li
              key={p.key}
              className="rounded-card border border-border-subtle bg-surface-1 p-5"
            >
              <h3 className="font-display text-base font-semibold text-text-primary">
                “{pick(p.question, l)}”
              </h3>
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
        <Link href="/skills" className={buttonLinkClassName("secondary")}>
          {pick(CTA_SKILLS, l)}
        </Link>
      </section>
    </div>
  );
}
