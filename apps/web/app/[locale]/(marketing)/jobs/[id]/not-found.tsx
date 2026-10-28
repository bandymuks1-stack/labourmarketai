import { getTranslations } from "next-intl/server";
import { Link } from "@/lib/i18n/navigation";

/**
 * A job address that does not exist (or is no longer listed). The generic 404
 * sent the person to the home page; someone who opened a job link wants the
 * board. Same honest copy as the branded 404, the job board as the one way
 * back, home as the second. Rendered inside the marketing layout, so the
 * header and theme are already there.
 */
export default async function JobNotFound() {
  const [t, tm] = await Promise.all([
    getTranslations("notFound"),
    getTranslations("marketplaceListings"),
  ]);
  return (
    <main
      className="mx-auto flex min-h-[60vh] max-w-xl flex-col items-center justify-center gap-4 px-6 text-center"
      data-testid="job-not-found"
    >
      <p className="font-mono text-xs uppercase tracking-label text-text-muted">{t("code")}</p>
      <h1 className="font-display text-3xl font-bold tracking-tightest text-text-primary">{t("title")}</h1>
      <p className="max-w-md text-sm leading-relaxed text-text-secondary">{t("body")}</p>
      <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
        <Link
          href="/jobs"
          className="inline-flex min-h-11 items-center rounded-md bg-gradient-cta px-4 py-2 text-sm font-semibold text-text-on-brand transition-opacity hover:opacity-90"
          data-testid="job-not-found-board"
        >
          {tm("allJobsLink")}
        </Link>
        <Link
          href="/"
          className="inline-flex min-h-11 items-center rounded-md border border-ink-500 px-4 py-2 text-sm text-text-secondary hover:border-brand-blue hover:text-text-primary"
          data-testid="not-found-home-cta"
        >
          {t("cta")}
        </Link>
      </div>
    </main>
  );
}
