import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/lib/i18n/navigation";
import { PageTitle } from "@/components/app/premium/page-title";
import { EmptyState } from "@/components/app/empty-state";
import { buttonLinkClassName } from "@/components/ui/Button";
import { ServiceSearchForm } from "./search-form";
import { Select } from "@/components/ui/Select";
import { countryOptionsForLocale } from "@/lib/location/country-options";
import { PublicServiceOfferingCard } from "@/components/marketing/public-service-offering";
import { searchPublicServiceOfferings } from "@/lib/services/public-service-offerings";
import { normalizePublicServiceSearch, PUBLIC_SERVICE_MAX_PAGE } from "@/lib/services/public-service-offerings-shared";
import { buildPageMetadata, resolveActiveLocale } from "@/lib/seo/metadata";

export const dynamic = "force-dynamic";

type SearchParams = { q?: string | string[]; country?: string | string[]; category?: string | string[]; page?: string | string[] };
const first = (value: string | string[] | undefined) => (typeof value === "string" ? value : "").trim();
const fieldClass = "min-h-11 w-full rounded-md border border-ink-500 bg-ink-800 px-3 py-2 text-sm text-text-primary outline-none focus:border-brand-blue";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "publicServices" });
  return {
    ...buildPageMetadata({ locale: resolveActiveLocale(locale), path: "/services", title: t("title"), description: t("lead") }),
    robots: { index: false, follow: true },
  };
}

export default async function PublicServicesPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const sp = await searchParams;
  const filter = normalizePublicServiceSearch({
    query: first(sp.q), country: first(sp.country), category: first(sp.category), page: first(sp.page),
  });
  const query = filter.query ?? "";
  const country = filter.country ?? "";
  const category = filter.category ?? "";
  const [t, result, common] = await Promise.all([
    getTranslations("publicServices"),
    searchPublicServiceOfferings(filter),
    getTranslations("common"),
  ]);
  const countries = countryOptionsForLocale(locale);
  const filtered = !!(query || country || category);
  function pageHref(page: number) {
    const next = new URLSearchParams();
    if (query) next.set("q", query);
    if (country) next.set("country", country);
    if (category) next.set("category", category);
    next.set("page", String(page));
    return "/services?" + next.toString();
  }

  return (
    <section className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8 sm:px-6 sm:py-12" data-testid="public-services-page">
      <header className="space-y-2">
        <PageTitle>{t("title")}</PageTitle>
        <p className="max-w-prose text-sm text-text-secondary">{t("lead")}</p>
      </header>
      <ServiceSearchForm key={JSON.stringify(filter)} action={"/" + locale + "/services"} label={t("search")} pendingLabel={common("loading")}>
        <label className="flex flex-col gap-1 text-xs text-text-secondary">
          {t("query")}
          <input type="search" name="q" defaultValue={query} maxLength={120} className={fieldClass} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-text-secondary">
          {t("country")}
          <Select name="country" defaultValue={country} className="min-h-11" data-testid="public-services-country">
            <option value="">{t("allCountries")}</option>
            {country && !countries.some((option) => option.value === country) ? <option value={country}>{country}</option> : null}
            {countries.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </Select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-text-secondary">
          {t("category")}
          <input name="category" defaultValue={category} maxLength={80} className={fieldClass} />
        </label>
      </ServiceSearchForm>
      {filtered && result.kind === "ok" && result.rows.length > 0 ? <Link href="/services" className={buttonLinkClassName("ghost", "sm")}>{t("clear")}</Link> : null}
      {result.kind !== "ok" ? (
        <EmptyState title={t("unavailable")} why={t("unavailableHint")} cta={{ label: t("retry"), href: pageHref(1), variant: "secondary" }} testId="public-services-unavailable" />
      ) : result.rows.length === 0 ? (
        <EmptyState
          title={t(filtered || result.page > 1 ? "emptyFiltered" : "empty")}
          cta={filtered || result.page > 1 ? { label: t("clear"), href: "/services", variant: "secondary" } : undefined}
          testId="public-services-empty"
        />
      ) : (
        <ul className="grid gap-x-8 sm:grid-cols-2" aria-label={t("results")}>
          {result.rows.map((offering) => <PublicServiceOfferingCard key={offering.id} offering={offering} locale={locale} remoteLabel={t("remote")} />)}
        </ul>
      )}
      {result.kind === "ok" && (result.page > 1 || result.hasMore) ? (
        <nav className="flex flex-wrap items-center justify-between gap-3" aria-label={t("pagination")}>
          {result.page > 1 ? <Link href={pageHref(result.page - 1)} className={buttonLinkClassName("secondary", "sm")}>{t("previous")}</Link> : <span />}
          <span className="text-sm text-text-secondary">{t("page", { page: result.page })}</span>
          {result.hasMore && result.page < PUBLIC_SERVICE_MAX_PAGE ? <Link href={pageHref(result.page + 1)} className={buttonLinkClassName("secondary", "sm")}>{t("next")}</Link> : <span />}
          {result.hasMore && result.page >= PUBLIC_SERVICE_MAX_PAGE ? <p className="w-full text-sm text-text-secondary">{t("refine")}</p> : null}
        </nav>
      ) : null}
    </section>
  );
}
