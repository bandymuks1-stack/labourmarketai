import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/lib/i18n/navigation";
import { buildPageMetadata } from "@/lib/seo/metadata";
import {
  LegalDisclaimer,
  LegalSectionList,
  PendingLegalNotice,
  type LegalSection,
} from "@/components/marketing/legal-notes";

/**
 * "Your data and who can see it" — security / data-access explanation page
 * (CR train WAGON 2, audit area 4: previously RED — the access rules were
 * real and heavily audited, but there was ZERO user-facing explanation).
 *
 * Every statement is derived from audited source, claiming NOTHING broader:
 *   - closed-by-default row ownership (RLS policies across migrations),
 *   - scouting anonymization (scout-safe-view) + contacts only by permission,
 *   - employers can never read a worker's saved locations (boundary pin),
 *   - worker documents shared only with consent, counts-only aggregates,
 *   - conversation visibility limited to participants, grant/revoke history
 *     (docs/audits/CHAT_VISIBILITY_AUDIT.md),
 *   - fail-closed superadmin gating of admin queues.
 * Wording is deliberately non-technical ("your rows are yours").
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
    path: "/legal/data-access",
    title: t("dataAccess.title"),
    description: t("dataAccess.intro"),
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
  const sections = t.raw("dataAccess.sections") as LegalSection[];

  return (
    <article className="mx-auto max-w-3xl px-6 py-16 sm:px-12" data-testid="legal-data-access">
      <h1 className="font-display text-4xl font-bold tracking-tightest text-text-primary">
        {t("dataAccess.title")}
      </h1>
      <div className="mt-6">
        <PendingLegalNotice />
      </div>
      <p className="mt-6 text-sm leading-relaxed text-text-secondary">{t("dataAccess.intro")}</p>
      <LegalSectionList sections={sections} />
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
          href="/legal/data-protection"
          className="text-sm text-text-secondary hover:text-text-primary"
        >
          {t("dataProtection.title")} →
        </Link>
      </nav>
    </article>
  );
}
