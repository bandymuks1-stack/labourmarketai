import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Metadata } from "next";
import { buildPageMetadata } from "@/lib/seo/metadata";

/**
 * Marketplace rules (full-completion train PR 9): no fake verification, no
 * legal-eligibility promise, no contacts without permission, moderation
 * before public visibility, no payments between users through the platform.
 * Rendered from real i18n content (not a placeholder).
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "legal.marketplaceRules" });
  return buildPageMetadata({ locale, path: "/legal/marketplace-rules", title: t("title") });
}

export default async function MarketplaceRulesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("legal.marketplaceRules");
  const rules = t.raw("rules") as string[];

  return (
    <article className="mx-auto max-w-3xl px-6 py-16 sm:px-12" data-testid="marketplace-rules">
      <h1 className="font-display text-4xl font-bold tracking-tightest text-text-primary">
        {t("title")}
      </h1>
      <p className="mt-4 text-sm leading-relaxed text-text-secondary">{t("intro")}</p>
      <ul className="mt-8 flex flex-col gap-3">
        {rules.map((rule, i) => (
          <li
            key={i}
            className="flex items-start gap-3 rounded-md border border-border-subtle bg-surface-1 px-4 py-3 text-sm leading-relaxed text-text-secondary"
          >
            <span aria-hidden className="mt-0.5 font-mono text-xs text-text-muted">
              {String(i + 1).padStart(2, "0")}
            </span>
            <span>{rule}</span>
          </li>
        ))}
      </ul>
    </article>
  );
}
