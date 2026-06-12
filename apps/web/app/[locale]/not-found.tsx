import { getTranslations } from "next-intl/server";
import { Link } from "@/lib/i18n/navigation";
import { ThemeReapply } from "@/components/app/theme-reapply";

/**
 * Branded 404 — rendered inside the [locale] layout, so the font CSS vars and
 * colour tokens apply (dark default, light via [data-theme]; no raw hex —
 * design-tokens guard). Honest tone (doctrine §18): this address really
 * doesn't exist, no blame, one clear way back. Every unmatched in-locale path
 * lands here via the `app/[locale]/[...rest]` catch-all; non-active locale
 * prefixes (e.g. /lv/… before that locale is promoted) arrive after the
 * middleware's default-locale redirect.
 */
export default async function NotFound() {
  const t = await getTranslations("notFound");
  return (
    <main
      className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center"
      data-testid="branded-not-found"
    >
      {/* 404 hydration re-mounts <html> and strips the bootstrap's
          data-theme — re-apply it so light-theme users get a light 404. */}
      <ThemeReapply />
      <p className="font-mono text-xs uppercase tracking-label text-text-muted">
        {t("code")}
      </p>
      <h1 className="font-display text-4xl font-bold tracking-tightest text-text-primary">
        {t("title")}
      </h1>
      <p className="max-w-md text-sm leading-relaxed text-text-secondary">
        {t("body")}
      </p>
      <Link
        href="/"
        className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-gradient-to-r from-brand-blue to-brand-cyan px-4 py-2 text-sm font-semibold text-ink-900 transition-opacity hover:opacity-90"
        data-testid="not-found-home-cta"
      >
        {t("cta")}
      </Link>
    </main>
  );
}
