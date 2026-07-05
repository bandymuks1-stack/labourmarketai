import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/lib/i18n/navigation";
import { buildPageMetadata } from "@/lib/seo/metadata";
import { LegalDisclaimer, PendingLegalNotice } from "@/components/marketing/legal-notes";

/**
 * Cookie policy page (CR train WAGON 2, audit area 3).
 *
 * Upgraded from the "being prepared" stub to a FACTUAL list of what the app
 * actually stores in the browser today, derived from source (no vendor names):
 *   - sign-in session cookies (auth layer; essential),
 *   - the language cookie the localization layer may set (NEXT_LOCALE),
 *   - the admin-only display preference cookie (lm_hide_admin_ui),
 *   - theme choice lives in localStorage, NOT a cookie,
 *   - NO analytics / advertising / third-party tracking cookies exist.
 * The binding legal wording stays owner/lawyer-gated → pending notice shown.
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
    path: "/legal/cookies",
    title: t("cookies.title"),
    description: t("cookies.intro"),
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
  const items = t.raw("cookies.items") as { name: string; purpose: string }[];

  return (
    <article className="mx-auto max-w-3xl px-6 py-16 sm:px-12" data-testid="legal-cookies">
      <h1 className="font-display text-4xl font-bold tracking-tightest text-text-primary">
        {t("cookies.title")}
      </h1>
      <div className="mt-6">
        <PendingLegalNotice />
      </div>
      <p className="mt-6 text-sm leading-relaxed text-text-secondary">{t("cookies.intro")}</p>
      <ul className="mt-8 flex flex-col gap-3">
        {items.map((item) => (
          <li
            key={item.name}
            className="rounded-md border border-border-subtle bg-surface-1 px-4 py-3"
          >
            <p className="text-sm font-semibold text-text-primary">{item.name}</p>
            <p className="mt-1 text-sm leading-relaxed text-text-secondary">{item.purpose}</p>
          </li>
        ))}
      </ul>
      <div className="mt-6 flex flex-col gap-3 text-sm leading-relaxed text-text-secondary">
        <p>{t("cookies.localStorageNote")}</p>
        <p>{t("cookies.noTracking")}</p>
      </div>
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
