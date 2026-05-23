import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { LabourMarketOsMap } from "@/components/marketing/labour-market-os-map";

/**
 * Public vision page — the one-page system explanation for
 * labourmarket.ai. Server-rendered, no auth required, no user data
 * touched. The whole body is composed of catalogue-driven cards (roles
 * + features + activity types) so the page can never claim a capability
 * the catalogue says is `preparing` or `hidden`.
 *
 * Founders can share the URL with prospective pilot participants; the
 * page also serves as the honest map a worker sees if they wonder
 * "where is this going?".
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("vision");
  return {
    title: t("metaTitle"),
    description: t("metaDescription"),
  };
}

export default async function VisionPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("vision");

  return (
    <article className="mx-auto flex max-w-container flex-col gap-12 px-6 py-12 sm:gap-16 sm:px-12 sm:py-16">
      <header className="flex flex-col gap-4">
        <span className="font-mono text-xs uppercase tracking-label text-brand-orange">
          {t("eyebrow")}
        </span>
        <h1 className="font-display text-3xl font-bold tracking-tightest text-text-primary sm:text-5xl">
          {t("headline")}
        </h1>
        <p className="max-w-prose text-base leading-relaxed text-text-secondary sm:text-lg">
          {t("lede")}
        </p>
        <p className="max-w-prose rounded-md border border-brand-blue/30 bg-brand-blue/5 px-3 py-2 text-xs leading-relaxed text-text-secondary">
          {t("honesty")}
        </p>
      </header>

      <LabourMarketOsMap />
    </article>
  );
}
