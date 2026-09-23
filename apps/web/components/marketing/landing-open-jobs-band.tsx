import { getTranslations } from "next-intl/server";
import { ArrowRight } from "lucide-react";

import { Link } from "@/lib/i18n/navigation";
import type { ActiveLocale } from "@/lib/i18n/config";
import type { LiveMarketVacancySample } from "@/lib/market/live-market-landing";
import { PublicVacancyCard } from "@/components/marketing/public-vacancy-card";
import { Reveal } from "@/components/marketing/reveal";

/**
 * REAL OPPORTUNITIES — a few live vacancies, on the landing, from the board.
 *
 * Owner directive (PUBLIC_LANDING_REAL_JOB_DISCOVERY): the landing exposes a
 * bounded section of REAL, CURRENT vacancies by reusing the canonical public
 * jobs query, card and presentation — no second jobs implementation, and no
 * gated field by accident.
 *
 * So this band owns NOTHING about a vacancy:
 *   · the rows are `snapshot.sample` — one unfiltered `/jobs` page-1 read,
 *     taken by the ONE landing reader (`lib/market/live-market-landing.ts`)
 *     with the same anonymous client it already builds, so the static landing
 *     reads no cookie;
 *   · each row renders through the UNMODIFIED `<PublicVacancyCard>` — the
 *     exact element `/jobs` renders — headed with the profession name in the
 *     visitor's language, exactly as the board heads it;
 *   · the privacy boundary is the database's: the anonymous preview function
 *     never returns employer, place, contact, raw title or named source, and
 *     the card has no slot for them. Pinned by rendering, in
 *     `lib/guards/landing-open-jobs-band.test.ts`.
 *
 * Omitted, never faked: when the read did not answer, the feature is not
 * switched on, or the page came back empty, the band does not render at all
 * — no placeholder rows, no "0 jobs".
 */
export async function LandingOpenJobsBand({
  sample,
  locale,
}: {
  readonly sample: LiveMarketVacancySample;
  readonly locale: ActiveLocale;
}) {
  if (sample.basis !== "live" || sample.vacancies.length === 0) return null;

  const [t, tProfession] = await Promise.all([
    getTranslations("landing.openJobs"),
    getTranslations("professions"),
  ]);
  // The board's own heading rule: the profession in the reader's language
  // when the catalogue has it. Unlike the board, a slug with no catalogue
  // entry falls back to the card's occupation line, never the raw slug.
  const professionName = (slug: string | null): string | undefined =>
    slug && tProfession.has(slug as never) ? tProfession(slug as never) : undefined;

  return (
    <section
      className="mt-16"
      aria-labelledby="landing-open-jobs-title"
      data-testid="landing-open-jobs"
    >
      <Reveal>
        <p className="font-mono text-meta uppercase tracking-label text-text-muted">
          {t("eyebrow")}
        </p>
        <h2
          id="landing-open-jobs-title"
          className="mt-3 max-w-2xl font-display text-3xl font-bold tracking-tightest text-text-primary sm:text-4xl"
        >
          {t("title")}
        </h2>
        <p className="mt-3 max-w-2xl text-basis text-text-secondary">{t("sub")}</p>
      </Reveal>

      {/* `grid-cols-1` is minmax(0, 1fr), and `overflow-wrap: anywhere` lets a
          publisher's long compound occupation word ("Behandlingsassistent…")
          break inside the card instead of widening it past a 320px phone —
          the card itself is shared with /jobs and is not edited here. */}
      <ul className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {sample.vacancies.map((vacancy) => (
          <li
            key={vacancy.id}
            data-testid="landing-open-job"
            className="min-w-0 [overflow-wrap:anywhere]"
          >
            <PublicVacancyCard
              vacancy={vacancy}
              locale={locale}
              headingFallback={professionName(vacancy.professionSlug)}
            />
          </li>
        ))}
      </ul>

      <Link
        href="/jobs"
        data-testid="landing-open-jobs-all"
        className="mt-5 inline-flex min-h-11 items-center gap-1.5 text-support font-semibold text-brand-blue underline-offset-4 hover:underline"
      >
        {t("all")}
        <ArrowRight className="size-3.5 shrink-0" aria-hidden />
      </Link>
    </section>
  );
}
