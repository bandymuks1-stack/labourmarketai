import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/lib/i18n/navigation";
import { buildPageMetadata } from "@/lib/seo/metadata";
import { LegalSectionList, type LegalSection } from "@/components/marketing/legal-notes";

/**
 * Privacy Policy (CR train WAGON 2, audit area 2): what data is used, why,
 * social sign-in (Google / Facebook / LinkedIn), who can see it, the service
 * providers that process it, consent, rights and retention. Every fact is
 * derived from the shipped product. This is also the privacy policy URL the
 * OAuth provider consoles (Meta, Google, LinkedIn) point to.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "legal" });
  return buildPageMetadata({
    locale,
    path: "/legal/privacy",
    title: t("privacy.title"),
    description: t("privacy.intro"),
  });
}

export default async function LegalPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("legal");
  const sections = t.raw("privacy.sections") as LegalSection[];

  return (
    <article className="mx-auto max-w-3xl px-6 py-16 sm:px-12" data-testid="legal-privacy">
      <h1 className="font-display text-4xl font-bold tracking-tightest text-text-primary">
        {t("privacy.title")}
      </h1>
      <p className="mt-6 text-sm leading-relaxed text-text-secondary">{t("privacy.intro")}</p>
      <LegalSectionList sections={sections} />
      <div className="mt-8 flex flex-col gap-3">
        <p className="text-sm leading-relaxed text-text-secondary">{t("requestContact")}</p>
      </div>
      <nav aria-label={t("related")} className="mt-8 flex flex-wrap gap-x-6 gap-y-2">
        <Link
          href="/legal/data-access"
          className="text-sm text-text-secondary hover:text-text-primary"
        >
          {t("dataAccess.title")} →
        </Link>
        <Link
          href="/legal/data-deletion"
          className="text-sm text-text-secondary hover:text-text-primary"
        >
          {t("dataDeletion.title")} →
        </Link>
        <Link
          href="/legal/data-protection"
          className="text-sm text-text-secondary hover:text-text-primary"
        >
          {t("dataProtection.title")} →
        </Link>
        <Link
          href="/legal/cookies"
          className="text-sm text-text-secondary hover:text-text-primary"
        >
          {t("cookies.title")} →
        </Link>
      </nav>
    </article>
  );
}
