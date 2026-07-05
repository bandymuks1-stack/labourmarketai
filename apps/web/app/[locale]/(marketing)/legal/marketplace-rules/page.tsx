import { getTranslations, setRequestLocale } from "next-intl/server";
import { LegalDisclaimer } from "@/components/marketing/legal-notes";

/**
 * Marketplace rules (full-completion train PR 9). Honest, launch-ready rules:
 * no fake verification, no legal-eligibility promise, no contacts without
 * permission, moderation before public visibility, payments not active.
 * Rendered from real i18n content (not a placeholder).
 *
 * CR train WAGON 2 consistency pass: the rules keep their real content, and
 * the page now carries the same honesty framing as the rest of the legal
 * pack — a review note (final binding wording owner/lawyer-gated) and the
 * informational-only disclaimer.
 */
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
      <p
        className="mt-8 text-sm leading-relaxed text-text-secondary"
        data-testid="marketplace-rules-review-note"
      >
        {t("reviewNote")}
      </p>
      <div className="mt-4">
        <LegalDisclaimer />
      </div>
    </article>
  );
}
