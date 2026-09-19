import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/lib/i18n/navigation";
import { CountrySignals } from "@/components/marketing/country-signals";
import { LabourMarketEvidence } from "@/components/marketing/labour-market-evidence";
import { CountryReadinessRequirements } from "@/components/marketing/country-readiness-requirements";
import {
  SUPPORTED_COUNTRIES,
  isSupportedCountry,
} from "@/lib/labour-market/country-evidence";
import type { Metadata } from "next";
import { buildPageMetadata } from "@/lib/seo/metadata";

/**
 * Per-country labour-market evidence page (Step 5/6). Source-backed, honest:
 * a per-country qualitative signal set (EURES / Cedefop) + the EU evidence
 * module as the regional backdrop. No invented figures, no fake charts.
 */
export function generateStaticParams() {
  return SUPPORTED_COUNTRIES.map((c) => ({ country: c.toLowerCase() }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; country: string }>;
}): Promise<Metadata> {
  const { locale, country } = await params;
  const code = country.toUpperCase();
  if (!(SUPPORTED_COUNTRIES as readonly string[]).includes(code)) {
    return { robots: { index: false, follow: false } };
  }
  const t = await getTranslations({ locale, namespace: "labourMarket" });
  return buildPageMetadata({
    locale,
    path: `/labour-market/${country.toLowerCase()}`,
    title: t(`countryNames.${code}`),
    description: t(`countryEvidence.${code}.intro`),
  });
}

export default async function CountryPage({
  params,
}: {
  params: Promise<{ locale: string; country: string }>;
}) {
  const { locale, country } = await params;
  setRequestLocale(locale);
  const code = country.toUpperCase();
  if (!isSupportedCountry(code)) notFound();

  const t = await getTranslations("labourMarket");
  const name = t(`countryNames.${code}`);

  return (
    <div className="mx-auto max-w-container px-6 py-14 sm:px-12" id="main-content">
      <Link
        href="/labour-market"
        className="font-mono text-meta uppercase tracking-label text-brand-blue hover:text-brand-champagne"
      >
        ← {t("countryBackToIndex")}
      </Link>

      <header className="mt-5">
        <h1 className="font-display text-4xl font-bold tracking-tightest text-text-primary sm:text-5xl">
          {name}
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-text-secondary sm:text-base">
          {t(`countryEvidence.${code}.intro`)}
        </p>
      </header>

      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <p className="rounded-md border border-ink-600 bg-ink-800/40 p-3 text-xs leading-relaxed text-text-secondary">
          {t("countryWorkerFraming")}
        </p>
        <p className="rounded-md border border-ink-600 bg-ink-800/40 p-3 text-xs leading-relaxed text-text-secondary">
          {t("countryEmployerFraming")}
        </p>
      </div>

      <section className="mt-10">
        <CountrySignals country={code} />
      </section>

      {/* SKL-8 + GEO-3. The researched country-readiness matrix — 18 sourced
          requirements across all four mobility scopes — had exactly one
          reader before this: the personal document checklist, which uses the
          `worker_posted` scope only. This page is where the chain that
          already pointed here (capability -> /work-abroad -> /labour-market ->
          here) finally arrives at the requirements themselves. */}
      <CountryReadinessRequirements country={code} />

      {/* EU regional backdrop — the already-verified EU evidence module. */}
      <LabourMarketEvidence />
    </div>
  );
}
