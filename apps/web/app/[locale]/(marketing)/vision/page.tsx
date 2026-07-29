import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { LabourMarketOsMap } from "@/components/marketing/labour-market-os-map";
import { isVisionPublic } from "@/lib/config/vision-publication";

/**
 * Public vision page — the one-page system explanation for
 * labourmarket.ai. Server-rendered, no auth required, no user data
 * touched. The whole body is composed of catalogue-driven cards (roles
 * + features + activity types) so the page can never claim a capability
 * the catalogue says is `preparing` or `hidden`.
 *
 * Publication state is gated on `lib/config/vision-publication.ts`:
 *
 * - `VISION_PUBLIC = false` (current) — route stays reachable by direct
 *   URL so the owner can run the smoke checklist against it, but
 *   metadata emits `robots: noindex,nofollow`, the marketing site nav
 *   drops the link, and the page itself renders an "internal preview"
 *   banner above the hero. Founders can still share the URL one-on-one
 *   with invited pilot participants.
 * - `VISION_PUBLIC = true` — back to a normal indexable marketing page.
 *   The flip is a one-line owner-authored PR after smoke PASSES.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("vision");
  const publishedPublicly = isVisionPublic();
  return {
    title: t("metaTitle"),
    description: t("metaDescription"),
    robots: publishedPublicly
      ? undefined
      : { index: false, follow: false, googleBot: { index: false, follow: false } },
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
  const publishedPublicly = isVisionPublic();

  return (
    <article className="mx-auto flex max-w-container flex-col gap-12 px-6 py-12 sm:gap-16 sm:px-12 sm:py-16">
      {/* Internal-preview banner — present while VISION_PUBLIC === false.
          Lives ABOVE the hero so anyone with the URL sees the "do not
          share publicly" signal before any other vision content. */}
      {!publishedPublicly && (
        <aside
          role="note"
          aria-label={t("internalPreviewBadge")}
          data-testid="vision-internal-preview"
          className="flex flex-col gap-2 rounded-md border border-state-warning/40 bg-state-warning/5 p-4"
        >
          <span className="inline-flex w-fit items-center gap-2 rounded-sm border border-state-warning/40 bg-state-warning/10 px-2 py-0.5 font-mono text-meta uppercase tracking-label text-state-warning">
            {t("internalPreviewBadge")}
          </span>
          <p className="text-sm leading-relaxed text-text-secondary">
            {t("internalPreviewBanner")}
          </p>
        </aside>
      )}

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
