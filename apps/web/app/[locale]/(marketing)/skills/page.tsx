import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { Link } from "@/lib/i18n/navigation";
import { Button } from "@/components/ui/Button";
import { buildPageMetadataFor, resolveActiveLocale } from "@/lib/seo/metadata";
import type { ActiveLocale } from "@/lib/i18n/config";
import { SEO_PROBLEMS, pick } from "@/lib/seo/profession-problem-content";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return buildPageMetadataFor("skills", locale, "/skills");
}

type L = Record<ActiveLocale, string>;

const SKILL_PROBLEM_KEYS = new Set([
  "verify-skills",
  "worker-without-cv",
  "unknown-real-experience",
  "show-skills",
]);

const INTRO: Record<string, L> = {
  eyebrow: { en: "Skills", lt: "Įgūdžiai", ru: "Навыки" },
  title: {
    en: "Prove and check real skills",
    lt: "Įrodyk ir patikrink realius įgūdžius",
    ru: "Докажите и проверьте реальные навыки",
  },
  subcopy: {
    en: "The hardest part of the labour market is knowing what someone can really do. LabourMarket.ai keeps skills honest: every skill is shown as verified or self-declared — never silently mixed.",
    lt: "Sunkiausia darbo rinkoje — žinoti, ką žmogus iš tikrųjų moka. LabourMarket.ai laiko įgūdžius sąžiningus: kiekvienas įgūdis rodomas kaip patvirtintas arba savideklaruotas — niekada tyliai nesumaišomas.",
    ru: "Самое сложное на рынке труда — понять, что человек действительно умеет. LabourMarket.ai держит навыки честными: каждый навык показан как подтверждённый или самозаявленный — без тихого смешивания.",
  },
  cardsTitle: { en: "Two honest skill states", lt: "Du sąžiningi įgūdžių būsenos", ru: "Два честных состояния навыка" },
  problemsTitle: { en: "Skill questions people search for", lt: "Klausimai apie įgūdžius, kurių ieško žmonės", ru: "Что ищут про навыки" },
};

const CARDS: { title: L; body: L }[] = [
  {
    title: { en: "Verified", lt: "Patvirtinta", ru: "Подтверждено" },
    body: {
      en: "Backed by evidence in the system — a manager confirmation, a work-journal link, or a checked document. Not a claim.",
      lt: "Pagrįsta įrodymais sistemoje — vadovo patvirtinimu, darbo žurnalo nuoroda arba patikrintu dokumentu. Ne deklaracija.",
      ru: "Подкреплено доказательством в системе — подтверждением руководителя, ссылкой в журнале работ или проверенным документом. Не заявление.",
    },
  },
  {
    title: { en: "Self-declared", lt: "Savideklaruota", ru: "Самозаявлено" },
    body: {
      en: "The worker's own statement of a skill. Useful and visible — but clearly marked as not yet verified, so no one is misled.",
      lt: "Paties darbuotojo nurodytas įgūdis. Naudingas ir matomas — bet aiškiai pažymėtas kaip dar nepatvirtintas, kad niekas nebūtų suklaidintas.",
      ru: "Заявление самого работника о навыке. Полезно и видно — но чётко помечено как непроверенное, чтобы никого не вводить в заблуждение.",
    },
  },
];

export default async function SkillsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const l = resolveActiveLocale(locale);
  const skillProblems = SEO_PROBLEMS.filter((p) => SKILL_PROBLEM_KEYS.has(p.key));

  return (
    <div className="mx-auto max-w-container px-6 py-14 sm:px-12">
      <header className="max-w-3xl">
        <p className="font-mono text-[11px] uppercase tracking-label text-brand-blue">
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
          {pick(INTRO.cardsTitle, l)}
        </h2>
        <ul className="mt-6 grid gap-4 sm:grid-cols-2">
          {CARDS.map((c) => (
            <li
              key={pick(c.title, "en")}
              className="rounded-2xl border border-border-subtle bg-surface-1 p-5"
            >
              <h3 className="font-display text-base font-semibold text-text-primary">
                {pick(c.title, l)}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-text-secondary">
                {pick(c.body, l)}
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
          {skillProblems.map((p) => (
            <li
              key={p.key}
              className="rounded-2xl border border-border-subtle bg-surface-1 p-5"
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
        <Link href="/worker-intake">
          <Button>
            {l === "lt"
              ? "Susikurti profilį / CV →"
              : l === "ru"
                ? "Создать профиль / CV →"
                : "Build your profile / CV →"}
          </Button>
        </Link>
        <Link href="/company-need">
          <Button variant="secondary">
            {l === "lt"
              ? "Darbdaviams"
              : l === "ru"
                ? "Работодателям"
                : "For employers"}
          </Button>
        </Link>
      </section>
    </div>
  );
}
