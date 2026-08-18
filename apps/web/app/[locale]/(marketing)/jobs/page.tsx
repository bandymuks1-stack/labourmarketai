import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { Link } from "@/lib/i18n/navigation";
import { buttonLinkClassName } from "@/components/ui/Button";
import { buildPageMetadataFor, resolveActiveLocale } from "@/lib/seo/metadata";
import type { ActiveLocale } from "@/lib/i18n/config";
import { searchPublicVacancyPreviews } from "@/lib/vacancy-store/public-vacancy-preview";
import { PublicVacancyCard } from "@/components/marketing/public-vacancy-card";

/**
 * THE PUBLIC JOB BOARD.
 *
 * 38,142 live ads existed in production with no PUBLIC surface at all. Members
 * already reach them via /dashboard/opportunities (external-vacancies.ts calls
 * searchPublicVacancies), so the gap was never wiring: `public_vacancies` grants
 * SELECT to `authenticated` only, so every anonymous visitor and every crawler
 * saw nothing and the supply produced zero acquisition. This page is that
 * missing public surface.
 *
 * It shows the ANONYMOUS PROJECTION only (owner directive §5): title, category,
 * employment form, working time, positions, publication date, and compensation
 * where genuinely supplied. Employer identity, location, the full description
 * and the application URL are member-only and are never fetched here — the
 * database function this calls cannot return them.
 */
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return buildPageMetadataFor("jobs", locale, "/jobs");
}

type L = Record<ActiveLocale, string>;

const H1: L = {
  en: "Open jobs",
  lt: "Laisvos darbo vietos",
  ru: "Открытые вакансии",
  nl: "Openstaande vacatures",
  de: "Offene Stellen",
};

const INTRO: L = {
  en: "Live vacancies imported from official public employment sources. Sign in to see the employer, the location and how to apply.",
  lt: "Gyvos darbo vietos iš oficialių viešų užimtumo šaltinių. Prisijunk, kad matytum darbdavį, vietovę ir kaip kandidatuoti.",
  ru: "Актуальные вакансии из официальных публичных источников занятости. Войдите, чтобы увидеть работодателя, местоположение и способ подачи заявки.",
  nl: "Actuele vacatures uit officiële openbare arbeidsbronnen. Log in om de werkgever, de locatie en de sollicitatiewijze te zien.",
  de: "Aktuelle Stellen aus offiziellen öffentlichen Arbeitsmarktquellen. Melden Sie sich an, um Arbeitgeber, Ort und Bewerbungsweg zu sehen.",
};

const SEARCH_LABEL: L = {
  en: "Search by job title",
  lt: "Ieškoti pagal pareigas",
  ru: "Поиск по названию вакансии",
  nl: "Zoeken op functietitel",
  de: "Nach Stellenbezeichnung suchen",
};

const SEARCH_BUTTON: L = {
  en: "Search",
  lt: "Ieškoti",
  ru: "Искать",
  nl: "Zoeken",
  de: "Suchen",
};

const RESULTS: L = {
  en: "vacancies found",
  lt: "rasta darbo vietų",
  ru: "найдено вакансий",
  nl: "vacatures gevonden",
  de: "Stellen gefunden",
};

const EMPTY: L = {
  en: "No vacancies match this search right now. Try a broader job title.",
  lt: "Pagal šią paiešką darbo vietų nerasta. Pabandyk platesnį pareigų pavadinimą.",
  ru: "По этому запросу вакансий не найдено. Попробуйте более общее название.",
  nl: "Geen vacatures voor deze zoekopdracht. Probeer een bredere functietitel.",
  de: "Keine Stellen für diese Suche. Versuchen Sie eine breitere Bezeichnung.",
};

/** Honest state: the feature is not switched on — NOT "there are no jobs". */
const NOT_PROVISIONED: L = {
  en: "The public job board is not enabled yet.",
  lt: "Vieša darbo skelbimų lenta dar neįjungta.",
  ru: "Публичная доска вакансий ещё не включена.",
  nl: "Het openbare vacaturebord is nog niet ingeschakeld.",
  de: "Das öffentliche Stellenboard ist noch nicht aktiviert.",
};

const PREV: L = {
  en: "Previous",
  lt: "Ankstesnis",
  ru: "Назад",
  nl: "Vorige",
  de: "Zurück",
};

const NEXT: L = {
  en: "Next",
  lt: "Kitas",
  ru: "Далее",
  nl: "Volgende",
  de: "Weiter",
};

export default async function JobsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const active = resolveActiveLocale(locale);
  const sp = await searchParams;

  const query = typeof sp.q === "string" ? sp.q.slice(0, 120) : "";
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);

  const result = await searchPublicVacancyPreviews({ query, page });

  const pageHref = (p: number) => {
    const qs = new URLSearchParams();
    if (query) qs.set("q", query);
    if (p > 1) qs.set("page", String(p));
    const s = qs.toString();
    return s ? `/jobs?${s}` : "/jobs";
  };

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6 sm:py-14">
      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
        {H1[active]}
      </h1>
      <p className="mt-3 max-w-2xl text-sm text-muted-foreground sm:text-base">
        {INTRO[active]}
      </p>

      <form action={`/${active}/jobs`} method="get" className="mt-6 flex flex-wrap gap-2">
        <label htmlFor="q" className="sr-only">
          {SEARCH_LABEL[active]}
        </label>
        <input
          id="q"
          name="q"
          type="search"
          defaultValue={query}
          placeholder={SEARCH_LABEL[active]}
          maxLength={120}
          className="min-w-0 flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
        />
        <button type="submit" className={buttonLinkClassName("primary")}>
          {SEARCH_BUTTON[active]}
        </button>
      </form>

      {result.status === "not_provisioned" ? (
        <p className="mt-10 rounded-md border border-dashed p-6 text-sm text-muted-foreground">
          {NOT_PROVISIONED[active]}
        </p>
      ) : (
        <>
          {/* role="status": a search is a full navigation, so the result count
              is the one thing a screen reader must hear after it lands. */}
          <p role="status" className="mt-6 text-sm text-muted-foreground">
            {result.totalCount.toLocaleString()} {RESULTS[active]}
          </p>

          {result.vacancies.length === 0 ? (
            <p className="mt-8 rounded-md border border-dashed p-6 text-sm text-muted-foreground">
              {EMPTY[active]}
            </p>
          ) : (
            <ul className="mt-6 space-y-3">
              {result.vacancies.map((v) => (
                <li key={v.id}>
                  <PublicVacancyCard vacancy={v} locale={active} />
                </li>
              ))}
            </ul>
          )}

          {(page > 1 || result.hasMore) && (
            <nav className="mt-8 flex items-center justify-between gap-3">
              {page > 1 ? (
                <Link
                  href={pageHref(page - 1)}
                  className={buttonLinkClassName("secondary")}
                >
                  ← {PREV[active]}
                </Link>
              ) : (
                <span />
              )}
              {result.hasMore && (
                <Link
                  href={pageHref(page + 1)}
                  className={buttonLinkClassName("secondary")}
                >
                  {NEXT[active]} →
                </Link>
              )}
            </nav>
          )}
        </>
      )}
    </main>
  );
}

