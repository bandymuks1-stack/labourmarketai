import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { Link } from "@/lib/i18n/navigation";
import { DIRECTORY_TERM_MAX, searchPublicDirectory } from "@/lib/company/public-directory";
import { buildPageMetadata } from "@/lib/seo/metadata";

export const dynamic = "force-dynamic";

/**
 * PUBLIC COMPANY SEARCH (owner decision 2026-11-11). A plain GET form and one read. A company that
 * has not taken over its profile shows its name and country only, marked "Unconfirmed", with no
 * link, contact or management action. A confirmed company links to its public profile.
 */

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ q?: string | string[] }>;
};

const termOf = (q: string | string[] | undefined): string =>
  (Array.isArray(q) ? q[0] : q ?? "").slice(0, DIRECTORY_TERM_MAX);

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "businessDirectory" });
  const metadata = buildPageMetadata({ locale, path: "/business", title: t("title"), description: t("intro") });
  // A results page is a search, not content: it is not indexed.
  return termOf((await searchParams).q) ? { ...metadata, robots: { index: false, follow: true } } : metadata;
}

export default async function BusinessDirectoryPage({ params, searchParams }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("businessDirectory");
  const term = termOf((await searchParams).q);
  const result = await searchPublicDirectory(term);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-10 sm:px-6 sm:py-14" data-testid="business-directory">
      <header className="flex flex-col gap-2">
        <h1 className="font-display text-3xl font-bold tracking-tightest text-text-primary sm:text-4xl">{t("title")}</h1>
        <p className="text-text-secondary">{t("intro")}</p>
      </header>

      <form action={`/${locale}/business`} method="get" className="flex flex-wrap gap-2">
        <label htmlFor="q" className="sr-only">
          {t("searchLabel")}
        </label>
        <input
          id="q"
          name="q"
          type="search"
          defaultValue={term}
          minLength={2}
          maxLength={DIRECTORY_TERM_MAX}
          placeholder={t("searchLabel")}
          className="min-w-0 basis-full rounded-md border border-border-subtle bg-surface-1 px-3 py-2 text-base sm:flex-1 sm:basis-0"
        />
        <button type="submit" className="min-h-11 rounded-md border border-ink-500 px-4 py-2 text-sm font-semibold text-text-primary hover:border-brand-blue">
          {t("searchButton")}
        </button>
      </form>

      {result.kind === "idle" && <p className="text-sm text-text-muted">{t("hint")}</p>}
      {(result.kind === "not_enabled" || result.kind === "unavailable") && (
        <p role="status" className="rounded-md border border-dashed border-ink-500 p-4 text-sm text-text-secondary">
          {t(result.kind === "not_enabled" ? "notEnabled" : "unavailable")}
        </p>
      )}
      {result.kind === "ok" && result.entries.length === 0 && (
        <p role="status" className="text-sm text-text-secondary">{t("empty")}</p>
      )}
      {result.kind === "ok" && result.entries.length > 0 && (
        <ul className="flex flex-col divide-y divide-border-subtle" data-testid="business-directory-results">
          {result.entries.map((e) => (
            <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
              <div className="flex min-w-0 flex-col">
                {e.slug ? (
                  <Link href={`/business/${e.slug}`} className="font-medium text-brand-blue hover:underline">
                    {e.name}
                  </Link>
                ) : (
                  <span className="font-medium text-text-primary">{e.name}</span>
                )}
                {e.country && <span className="text-meta text-text-muted">{e.country}</span>}
              </div>
              {!e.confirmed && (
                <span
                  className="rounded-full border border-ink-500 px-2 py-0.5 text-meta text-text-secondary"
                  title={t("unconfirmedHint")}
                  data-testid="business-directory-unconfirmed"
                >
                  {t("unconfirmed")}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
      {result.kind === "ok" && result.entries.some((e) => !e.confirmed) && (
        <p className="text-meta text-text-muted">{t("unconfirmedHint")}</p>
      )}
    </main>
  );
}
