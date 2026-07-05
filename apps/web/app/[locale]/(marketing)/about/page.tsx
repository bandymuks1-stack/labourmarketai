import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/lib/i18n/navigation";
import { buildPageMetadata } from "@/lib/seo/metadata";

/**
 * Project explanation page (CR train WAGON 2, audit area 1).
 *
 * The user-facing "what Labour Market AI is and how it works" page the wagon-1
 * audit found missing: the marketing tree explained the product per audience,
 * but nothing reachable explained the whole loop (worker / company / team) plus
 * the honest limits in one place. Lives in the marketing tree (NOT a new
 * dashboard) and reuses the honest copy patterns of the existing pages: only
 * shipped behaviour is described, prepared features are named as prepared,
 * payments stay explicitly not active, and the data explanation links to the
 * legal pack. The vision page stays separately owner-gated — this page is the
 * public, catalogue-consistent explanation.
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

export default async function AboutPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("about");
  const legal = await getTranslations("legal");
  const loops = t.raw("loops") as { heading: string; points: string[] }[];
  const notYetPoints = t.raw("notYet.points") as string[];

  return (
    <article
      className="mx-auto flex max-w-container flex-col gap-12 px-6 py-12 sm:gap-16 sm:px-12 sm:py-16"
      data-testid="about-page"
    >
      <header className="flex flex-col gap-4">
        <span className="font-mono text-xs uppercase tracking-label text-brand-orange">
          {t("eyebrow")}
        </span>
        <h1 className="font-display text-3xl font-bold tracking-tightest text-text-primary sm:text-5xl">
          {t("title")}
        </h1>
        <p className="max-w-prose text-base leading-relaxed text-text-secondary sm:text-lg">
          {t("lede")}
        </p>
        <p className="max-w-prose rounded-md border border-brand-blue/30 bg-brand-blue/5 px-3 py-2 text-xs leading-relaxed text-text-secondary">
          {t("honesty")}
        </p>
      </header>

      <section className="grid gap-6 lg:grid-cols-3" data-testid="about-loops">
        {loops.map((loop) => (
          <div
            key={loop.heading}
            className="flex flex-col gap-3 rounded-md border border-border-subtle bg-surface-1 p-5"
          >
            <h2 className="font-display text-xl font-bold tracking-tightest text-text-primary">
              {loop.heading}
            </h2>
            <ul className="flex flex-col gap-2">
              {loop.points.map((point, i) => (
                <li key={i} className="flex items-start gap-2 text-sm leading-relaxed text-text-secondary">
                  <span aria-hidden className="mt-0.5 font-mono text-xs text-text-muted">
                    •
                  </span>
                  <span>{point}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>

      <section
        className="max-w-prose rounded-md border border-state-warning/40 bg-state-warning/5 p-5"
        data-testid="about-not-yet"
      >
        <h2 className="font-display text-xl font-bold tracking-tightest text-text-primary">
          {t("notYet.heading")}
        </h2>
        <ul className="mt-3 flex flex-col gap-2">
          {notYetPoints.map((point, i) => (
            <li key={i} className="flex items-start gap-2 text-sm leading-relaxed text-text-secondary">
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
          <Link
            href="/legal/privacy"
            className="text-sm text-text-secondary hover:text-text-primary"
          >
            {legal("privacy.title")} →
          </Link>
          <Link
            href="/legal/data-access"
            className="text-sm text-text-secondary hover:text-text-primary"
          >
            {legal("dataAccess.title")} →
          </Link>
          <Link
            href="/legal/data-protection"
            className="text-sm text-text-secondary hover:text-text-primary"
          >
            {legal("dataProtection.title")} →
          </Link>
        </div>
      </section>

      <nav className="flex flex-wrap gap-x-6 gap-y-2 border-t border-ink-600/60 pt-6">
        <Link href="/for-workers" className="text-sm text-text-secondary hover:text-text-primary">
          {t("links.workers")} →
        </Link>
        <Link
          href="/for-companies"
          className="text-sm text-text-secondary hover:text-text-primary"
        >
          {t("links.companies")} →
        </Link>
      </nav>
    </article>
  );
}
