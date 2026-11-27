import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/lib/i18n/navigation";
import { PageTitle } from "@/components/app/premium/page-title";
import { EmptyState } from "@/components/app/empty-state";
import { buttonLinkClassName } from "@/components/ui/Button";
import { PersonServiceRequestButton } from "@/components/app/person-service-request-button";
import { getPublicServiceOffering } from "@/lib/services/public-service-offerings";
import { readServiceOfferingOwnership } from "@/lib/services/service-offerings";
import { hasSessionCookie } from "@/lib/supabase/session-cookie";
import { countryDisplayName } from "@/lib/location/country-model";
import { buildPageMetadata, resolveActiveLocale } from "@/lib/seo/metadata";

export const dynamic = "force-dynamic";

type Params = Promise<{ locale: string; id: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { locale, id } = await params;
  const result = await getPublicServiceOffering(id);
  if (result.kind !== "ok") return { robots: { index: false, follow: false } };
  const t = await getTranslations({ locale, namespace: "publicServices" });
  return {
    ...buildPageMetadata({
      locale: resolveActiveLocale(locale),
      path: "/services/" + id,
      title: result.offering.title,
      description: result.offering.description?.slice(0, 160) || t("lead"),
    }),
    robots: { index: false, follow: true },
  };
}

export default async function PublicServicePage({ params }: { params: Params }) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const [t, result] = await Promise.all([getTranslations("publicServices"), getPublicServiceOffering(id)]);
  if (result.kind === "not-found") notFound();
  if (result.kind !== "ok") return (
    <section className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-8 sm:px-6">
      <PageTitle>{t("title")}</PageTitle>
      <EmptyState title={t("unavailable")} why={t("unavailableHint")} cta={{ label: t("back"), href: "/services", variant: "secondary" }} testId="public-service-unavailable" />
    </section>
  );
  const offering = result.offering;
  // Anonymous visitors never require an auth round trip to read the offering.
  // Ownership is a targeted caller-scoped read, never a public identity join.
  const ownership = await hasSessionCookie() ? await readServiceOfferingOwnership(id) : "not-authed";
  const tRequest = await getTranslations("marketplace");
  const next = "/" + locale + "/services/" + id;
  const facts = [
    [t("category"), offering.categorySlug],
    [t("country"), offering.locationCountry ? countryDisplayName(offering.locationCountry, locale) : null],
    [t("delivery"), offering.remote ? t("remote") : null],
    [t("rate"), offering.rateText],
  ].filter(([, value]) => value);

  return (
    <article className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8 sm:px-6 sm:py-12" data-testid="public-service-detail">
      <Link href="/services" className={buttonLinkClassName("ghost", "sm")}>{t("back")}</Link>
      <header className="space-y-2">
        <p className="text-xs text-text-muted">{t("personalService")}</p>
        <PageTitle className="break-words">{offering.title}</PageTitle>
      </header>
      {facts.length > 0 ? <dl className="grid grid-cols-2 gap-4 border-y border-ink-500 py-4">
        {facts.map(([label, value]) => <div key={label} className="min-w-0">
          <dt className="text-xs text-text-muted">{label}</dt>
          <dd className="mt-1 break-words text-sm text-text-primary">{value}</dd>
        </div>)}
      </dl> : null}
      {offering.description ? <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-text-secondary">{offering.description}</p> : null}
      <div className="flex flex-wrap items-center gap-3">
        {ownership === "not-authed" ? (
          <Link href={"/auth/login?next=" + encodeURIComponent(next)} className={buttonLinkClassName()} data-testid="public-service-login">
            {t("signInToRequest")}
          </Link>
        ) : ownership === "own" ? (
          <Link href="/dashboard/services" className={buttonLinkClassName("secondary")}>{t("manage")}</Link>
        ) : ownership === "not-own" ? (
          <PersonServiceRequestButton offeringId={id} labels={{
            request: tRequest("request"),
            requested: tRequest("requested"),
            myRequests: tRequest("outgoingHeading"),
            duplicate: tRequest("duplicate"),
            offeringInactive: tRequest("offeringInactive"),
            notAvailable: tRequest("notAvailable"),
            errorGeneric: tRequest("errorGeneric"),
          }} />
        ) : <p role="status" className="text-sm text-text-secondary">{t("contactUnavailable")}</p>}
      </div>
    </article>
  );
}
