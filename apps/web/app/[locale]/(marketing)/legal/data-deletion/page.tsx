import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/lib/i18n/navigation";
import { buildPageMetadata } from "@/lib/seo/metadata";

/**
 * Account and data deletion — the person-reviewed request process (#1819),
 * also the public data-deletion URL registered with Meta.
 *
 * Copy lives in `legal.dataDeletion` for every ACTIVE locale: the first
 * version was hard-coded English, so `/lt`, `/ru` and `/pl` served an
 * English page (title included) inside an otherwise localized site
 * (production 2026-09-21). The process, the controller and the retention
 * exceptions are the same facts as before — only the language follows the
 * route now.
 */
const PRIVACY_EMAIL = "info@labourmarket.ai";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "legal.dataDeletion" });
  return buildPageMetadata({
    locale,
    path: "/legal/data-deletion",
    title: t("title"),
    description: t("description"),
  });
}

export default async function DataDeletionPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("legal.dataDeletion");
  const steps = t.raw("howSteps") as string[];
  const mailto = `mailto:${PRIVACY_EMAIL}?subject=${encodeURIComponent(t("mailSubject"))}`;
  const emailLink = (href: string) => (
    <a href={href} className="underline underline-offset-4 hover:text-text-primary">
      {PRIVACY_EMAIL}
    </a>
  );
  /** Replace the `{email}` placeholder with the mailto link (text before / after kept verbatim). */
  const withEmail = (text: string, href: string) => {
    const [before, after] = text.split("{email}");
    if (after === undefined) return text;
    return (
      <>
        {before}
        {emailLink(href)}
        {after}
      </>
    );
  };

  return (
    <article
      className="mx-auto max-w-3xl px-6 py-16 sm:px-12"
      data-testid="legal-data-deletion"
    >
      <h1 className="font-display text-4xl font-bold tracking-tightest text-text-primary">
        {t("title")}
      </h1>

      <p className="mt-6 text-sm leading-relaxed text-text-secondary">{t("intro")}</p>

      <section className="mt-10">
        <h2 className="font-display text-2xl font-semibold text-text-primary">
          {t("howTitle")}
        </h2>
        <ol className="mt-4 list-decimal space-y-3 pl-6 text-sm leading-relaxed text-text-secondary">
          {steps.map((step, i) => (
            <li key={i}>{withEmail(step, mailto)}</li>
          ))}
        </ol>
      </section>

      <section className="mt-10">
        <h2 className="font-display text-2xl font-semibold text-text-primary">
          {t("coversTitle")}
        </h2>
        <p className="mt-4 text-sm leading-relaxed text-text-secondary">{t("coversBody")}</p>
      </section>

      <section className="mt-10">
        <h2 className="font-display text-2xl font-semibold text-text-primary">
          {t("facebookTitle")}
        </h2>
        <p className="mt-4 text-sm leading-relaxed text-text-secondary">{t("facebookBody")}</p>
      </section>

      <section className="mt-10">
        <h2 className="font-display text-2xl font-semibold text-text-primary">
          {t("controllerTitle")}
        </h2>
        <p className="mt-4 text-sm leading-relaxed text-text-secondary">
          {withEmail(t.raw("controllerBody") as string, `mailto:${PRIVACY_EMAIL}`)}
        </p>
      </section>

      <nav aria-label={t("relatedLabel")} className="mt-10 flex flex-wrap gap-x-6 gap-y-2">
        <Link href="/legal/privacy" className="text-sm text-text-secondary hover:text-text-primary">
          {t("relatedPrivacy")} →
        </Link>
        <Link
          href="/legal/data-access"
          className="text-sm text-text-secondary hover:text-text-primary"
        >
          {t("relatedDataAccess")} →
        </Link>
      </nav>
    </article>
  );
}
