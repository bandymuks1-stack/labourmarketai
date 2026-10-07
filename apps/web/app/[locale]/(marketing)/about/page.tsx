import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/lib/i18n/navigation";
import { buildPageMetadata } from "@/lib/seo/metadata";
import {
  AboutAudience,
  AboutBeforeAfter,
  AboutEvidenceGraph,
  AboutLifecycle,
  AboutPrivacySplit,
  AboutSystemMap,
  AboutTrustTiers,
} from "@/components/marketing/about-visuals";

/**
 * "What is LabourMarket.ai" — the public explanation of the whole system.
 *
 * REBUILT 2026-09-30 on an owner decision: the platform is a labour-market
 * operating platform for real people, professions, companies, projects, hours,
 * evidence and income — NOT a game. The earlier page carried a "sports
 * operating model" section (player cards, playing field, divisions/leagues);
 * that vocabulary is gone from this page and from every public string, and a
 * guard (`no-gamification-terms.test.ts`) keeps it gone.
 *
 * The page explains how the system works; it is NOT a deployment-status page.
 * There is deliberately no "works today" / "not active yet" statement of any
 * kind: those are technical product states, not something a visitor can decide
 * or act on. It shows no live numbers (a stale or wrongly-defined vacancy count
 * on an explanatory page is worse than none). Copy: `about.*` in every
 * catalogue that carries it; visuals: `components/marketing/about-visuals.tsx`.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "about" });
  return buildPageMetadata({
    locale,
    path: "/about",
    title: t("metaTitle"),
    description: t("metaDescription"),
  });
}

type Audience = {
  id: string;
  heading: string;
  lead: string;
  flow: string[];
  participants?: string[];
  pointsLabel: string;
  points: string[];
};

export default async function AboutPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("about");
  const legal = await getTranslations("legal");
  const audiences = t.raw("loops") as Audience[];
  const tones = ["cyan", "blue", "violet"] as const;
  const notYetPoints = t.raw("notYet.points") as string[];
  const europePoints = t.raw("europe.points") as string[];
  const tiers = t.raw("trust.tiers") as { term: string; meaning: string; example: string }[];

  return (
    <article
      className="mx-auto flex max-w-container flex-col gap-16 px-6 py-12 sm:gap-20 sm:px-12 sm:py-16"
      data-testid="about-page"
    >
      <header className="flex flex-col gap-6">
        <p className="inline-flex w-fit items-center gap-2 rounded-sm border border-ink-500 px-3 py-1 font-mono text-meta uppercase tracking-label text-text-secondary">
          <span className="live-dot" aria-hidden />
          {t("eyebrow")}
        </p>
        <h1 className="max-w-3xl font-display text-4xl font-bold leading-[1.05] tracking-tightest text-text-primary sm:text-6xl">
          {t("title")}
        </h1>
        <p className="max-w-prose text-lg leading-relaxed text-text-secondary">{t("lede")}</p>

        <AboutSystemMap
          people={{ label: t("hero.railPeopleLabel"), steps: t.raw("hero.railPeople") as string[] }}
          companies={{ label: t("hero.railCompaniesLabel"), steps: t.raw("hero.railCompanies") as string[] }}
          accumulate={t("hero.accumulate")}
          ariaLabel={t("hero.railAria")}
        />

        <div className="grid max-w-4xl gap-4 md:grid-cols-2">
          <p className="text-base leading-relaxed text-text-secondary">{t("hero.lead")}</p>
          <p className="text-base leading-relaxed text-text-secondary">{t("hero.leadOrg")}</p>
        </div>

        <nav className="flex flex-wrap gap-x-6 gap-y-2" aria-label={t("navLabel")}>
          <Link href="/for-workers" className="text-sm font-semibold text-text-primary hover:text-brand-cyan">
            {t("links.workers")} →
          </Link>
          <Link href="/for-companies" className="text-sm font-semibold text-text-primary hover:text-brand-cyan">
            {t("links.companies")} →
          </Link>
          <Link href="/for-agencies" className="text-sm font-semibold text-text-primary hover:text-brand-cyan">
            {t("links.agencies")} →
          </Link>
        </nav>
      </header>

      <AboutLifecycle
        label={t("lifecycle.label")}
        steps={t.raw("lifecycle.steps") as string[]}
        note={t("lifecycle.note")}
      />

      <div className="flex flex-col gap-14" data-testid="about-loops">
        {audiences.map((a, i) => (
          <AboutAudience
            key={a.id}
            id={a.id}
            heading={a.heading}
            lead={a.lead}
            flow={a.flow}
            participants={a.participants}
            pointsLabel={a.pointsLabel}
            points={a.points}
            tone={tones[i] ?? "cyan"}
          />
        ))}
      </div>

      <AboutEvidenceGraph
        heading={t("evidence.heading")}
        lead={t("evidence.lead")}
        chainLabel={t("evidence.chainLabel")}
        chain={t.raw("evidence.chain") as string[]}
        projectionsLabel={t("evidence.projectionsLabel")}
        projections={t.raw("evidence.projections") as string[]}
        note={t("evidence.note")}
      />

      <AboutBeforeAfter
        heading={t("afterHire.heading")}
        lead={t("afterHire.lead")}
        stages={t.raw("afterHire.stages") as string[]}
        boardLabel={t("afterHire.boardLabel")}
        boardPoints={t.raw("afterHire.boardPoints") as string[]}
        platformLabel="LabourMarket.ai"
        platformPoints={t.raw("afterHire.platformPoints") as string[]}
        schematicNote={t("afterHire.schematicNote")}
        conclusion={t("afterHire.conclusion")}
      />

      <AboutTrustTiers
        heading={t("trust.heading")}
        lead={t("trust.lead")}
        tiers={tiers}
        noLabel={t("trust.noLabel")}
        no={t.raw("trust.no") as string[]}
      />

      <AboutPrivacySplit
        heading={t("privacy.heading")}
        lead={t("privacy.lead")}
        privateLabel={t("privacy.privateLabel")}
        privateItems={t.raw("privacy.private") as string[]}
        publicNotLabel={t("privacy.publicNotLabel")}
        publicNot={t.raw("privacy.publicNot") as string[]}
        control={t("privacy.control")}
      />

      <section id="europe" className="scroll-mt-24 flex max-w-prose flex-col gap-4" data-testid="about-europe">
        <h2 className="font-display text-2xl font-bold tracking-tightest text-text-primary sm:text-3xl">
          {t("europe.heading")}
        </h2>
        <p className="text-base leading-relaxed text-text-secondary">{t("europe.body")}</p>
        <ul className="flex flex-col gap-2">
          {europePoints.map((point) => (
            <li key={point} className="flex items-start gap-2 text-sm leading-relaxed text-text-secondary">
              <span aria-hidden className="mt-2 size-1 shrink-0 rounded-full bg-brand-blue" />
              <span>{point}</span>
            </li>
          ))}
        </ul>
      </section>

      <section
        className="max-w-prose rounded-md border border-state-warning/40 bg-state-warning/5 p-5"
        data-testid="about-not-yet"
      >
        <h2 className="font-display text-xl font-bold tracking-tightest text-text-primary">
          {t("notYet.heading")}
        </h2>
        <ul className="mt-3 flex flex-col gap-2">
          {notYetPoints.map((point) => (
            <li key={point} className="flex items-start gap-2 text-sm leading-relaxed text-text-secondary">
              <span aria-hidden className="mt-0.5 font-mono text-xs text-text-muted">
                •
              </span>
              <span>{point}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="max-w-prose" data-testid="about-data">
        <h2 className="font-display text-xl font-bold tracking-tightest text-text-primary">
          {t("data.heading")}
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-text-secondary">{t("data.body")}</p>
        <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2">
          <Link href="/legal/privacy" className="text-sm text-text-secondary hover:text-text-primary">
            {legal("privacy.title")} →
          </Link>
          <Link href="/legal/data-access" className="text-sm text-text-secondary hover:text-text-primary">
            {legal("dataAccess.title")} →
          </Link>
          <Link href="/legal/data-protection" className="text-sm text-text-secondary hover:text-text-primary">
            {legal("dataProtection.title")} →
          </Link>
        </div>
      </section>
    </article>
  );
}
