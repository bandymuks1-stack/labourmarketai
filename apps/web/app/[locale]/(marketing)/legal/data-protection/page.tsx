import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/lib/i18n/navigation";
import { buildPageMetadata } from "@/lib/seo/metadata";
import {
  LegalDisclaimer,
  LegalSectionList,
  PendingLegalItems,
  PendingLegalNotice,
  type LegalSection,
} from "@/components/marketing/legal-notes";

/**
 * Data protection explanation page (CR train WAGON 2, audit areas 2+4).
 *
 * Plain-language, source-derived description of how data is protected TODAY:
 * closed-by-default database access rules, revocation-as-record history,
 * no trackers/profiling (privacy-base guard), aggregate-only statistics with
 * sample floors, private storage with short-lived links, fail-closed admin
 * gating, and the honest MANUAL export/deletion process. Claims nothing
 * broader than the audited guards/policies. Binding wording stays
 * owner/lawyer-gated → pending notice + explicit pending-items list.
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
    path: "/legal/data-protection",
    title: t("dataProtection.title"),
    description: t("dataProtection.intro"),
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
  const sections = t.raw("dataProtection.sections") as LegalSection[];
  const pendingItems = t.raw("dataProtection.pendingItems") as string[];

  return (
    <article
      className="mx-auto max-w-3xl px-6 py-16 sm:px-12"
      data-testid="legal-data-protection"
    >
      <h1 className="font-display text-4xl font-bold tracking-tightest text-text-primary">
        {t("dataProtection.title")}
      </h1>
      <div className="mt-6">
        <PendingLegalNotice />
      </div>
      <p className="mt-6 text-sm leading-relaxed text-text-secondary">
        {t("dataProtection.intro")}
      </p>
      <LegalSectionList sections={sections} />
      <PendingLegalItems title={t("dataProtection.pendingTitle")} items={pendingItems} />
      <div className="mt-8 flex flex-col gap-3">
        <p className="text-sm leading-relaxed text-text-secondary">{t("requestContact")}</p>
        <LegalDisclaimer />
      </div>
      <nav aria-label={t("related")} className="mt-8 flex flex-wrap gap-x-6 gap-y-2">
        <Link
          href="/legal/privacy"
          className="text-sm text-text-secondary hover:text-text-primary"
        >
          {t("privacy.title")} →
        </Link>
        <Link
          href="/legal/data-access"
          className="text-sm text-text-secondary hover:text-text-primary"
        >
          {t("dataAccess.title")} →
        </Link>
      </nav>
    </article>
  );
}
