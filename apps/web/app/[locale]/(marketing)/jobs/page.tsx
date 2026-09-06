import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/lib/i18n/navigation";
import { buttonLinkClassName } from "@/components/ui/Button";
import { buildPageMetadataFor, resolveActiveLocale } from "@/lib/seo/metadata";
import type { ActiveLocale } from "@/lib/i18n/config";
import {
  searchPublicVacancyPreviews,
  type PublicVacancyPreview,
} from "@/lib/vacancy-store/public-vacancy-preview";
import { PublicVacancyCard } from "@/components/marketing/public-vacancy-card";
import { createClient } from "@/lib/supabase/server";
import { hasSessionCookie } from "@/lib/supabase/session-cookie";
import {
  listSavedPublicVacancyIds,
  resolveOwnWorkerId,
} from "@/lib/opportunities/saved-opportunities";
import { listPublicVacancyPreviewsByIds } from "@/lib/vacancy-store/vacancy-read";
import { jsonLdScript } from "@/lib/seo/json-ld";
import { buildJobsListJsonLd } from "@/lib/seo/public-job-json-ld";
import { MARKETING_ORIGIN } from "@/lib/domain/canonical";
import {
  PUBLIC_VACANCY_PROFESSION_SLUGS,
  readProfessionSlugParam,
} from "@/lib/vacancy-store/public-vacancy-professions";

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

/** Position name when the preview carries no occupation label (K3 JSON-LD);
 *  the same generic noun the detail page uses for its heading. */
const GENERIC_TITLE: L = {
  en: "Job opening",
  lt: "Darbo pasiūlymas",
  ru: "Вакансия",
  nl: "Vacature",
  de: "Stellenangebot",
};

/** The anonymous search matches the OCCUPATION label (the field the card
 *  shows), never the hidden raw title — matching a hidden field would let a
 *  visitor probe for employer or city names (owner directive 2026-08-24). */
const SEARCH_LABEL: L = {
  en: "Search by occupation",
  lt: "Ieškoti pagal profesiją",
  ru: "Поиск по профессии",
  nl: "Zoeken op beroep",
  de: "Nach Beruf suchen",
};

const SEARCH_BUTTON: L = {
  en: "Search",
  lt: "Ieškoti",
  ru: "Искать",
  nl: "Zoeken",
  de: "Suchen",
};

const PROFESSION_LABEL: L = {
  en: "Profession",
  lt: "Profesija",
  ru: "Профессия",
  nl: "Beroep",
  de: "Beruf",
};

const PROFESSION_ANY: L = {
  en: "All professions",
  lt: "Visos profesijos",
  ru: "Все профессии",
  nl: "Alle beroepen",
  de: "Alle Berufe",
};

const CLEAR_FILTER: L = {
  en: "Clear filter",
  lt: "Išvalyti filtrą",
  ru: "Сбросить фильтр",
  nl: "Filter wissen",
  de: "Filter zurücksetzen",
};

/** The supply is published in the employer's own language. Say so once, rather
 *  than letting a visitor wonder why a Lithuanian page lists Swedish
 *  occupation labels. */
const ORIGINAL_LANGUAGE_NOTE: L = {
  en: "Occupation labels are shown in the language the employer published them in. Filter by profession to search in your own language.",
  lt: "Profesijų pavadinimai rodomi ta kalba, kuria juos paskelbė darbdavys. Filtruok pagal profesiją, kad ieškotum sava kalba.",
  ru: "Названия профессий показаны на языке, на котором их опубликовал работодатель. Фильтруйте по профессии, чтобы искать на своём языке.",
  nl: "Beroepslabels staan in de taal waarin de werkgever ze publiceerde. Filter op beroep om in je eigen taal te zoeken.",
  de: "Berufsbezeichnungen erscheinen in der Sprache, in der der Arbeitgeber sie veröffentlicht hat. Filtern Sie nach Beruf, um in Ihrer Sprache zu suchen.",
};

const RESULTS: L = {
  en: "vacancies found",
  lt: "rasta darbo vietų",
  ru: "найдено вакансий",
  nl: "vacatures gevonden",
  de: "Stellen gefunden",
};

/** Named, so a zero result is an answer about THIS filter rather than a
 *  vague nothing. {profession} is the catalogue name in the reader's locale. */
const EMPTY_FOR_PROFESSION: Record<ActiveLocale, (p: string) => string> = {
  en: (p) => `No open jobs for ${p} right now.`,
  lt: (p) => `Šiuo metu nėra laisvų darbo vietų: ${p}.`,
  ru: (p) => `Сейчас нет открытых вакансий: ${p}.`,
  nl: (p) => `Momenteel geen openstaande vacatures voor ${p}.`,
  de: (p) => `Derzeit keine offenen Stellen für ${p}.`,
};

/**
 * BOTH filters were applied, so both are named.
 *
 * The RPC ANDs the profession and the search term. Reporting only the
 * profession would state "there are no welder jobs" when the truth is "no
 * welder job also matched your words" — a false claim about the supply,
 * produced by an empty state that forgot half of what was asked. The two
 * predicates are stated together for the same reason the filtered message
 * names the profession at all.
 */
const EMPTY_FOR_PROFESSION_AND_QUERY: Record<
  ActiveLocale,
  (p: string, q: string) => string
> = {
  en: (p, q) => `No open jobs for ${p} matching “${q}” right now.`,
  lt: (p, q) => `Šiuo metu nėra laisvų darbo vietų: ${p} pagal „${q}“.`,
  ru: (p, q) => `Сейчас нет открытых вакансий: ${p} по запросу «${q}».`,
  nl: (p, q) => `Momenteel geen openstaande vacatures voor ${p} met “${q}”.`,
  de: (p, q) => `Derzeit keine offenen Stellen für ${p} mit „${q}“.`,
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

const SAVED_TAB: L = {
  en: "Saved",
  lt: "Išsaugoti",
  ru: "Сохранённые",
  nl: "Bewaard",
  de: "Gemerkt",
};

const ALL_TAB: L = {
  en: "All jobs",
  lt: "Visos darbo vietos",
  ru: "Все вакансии",
  nl: "Alle vacatures",
  de: "Alle Stellen",
};

/** The saved list is a PRIVATE bookmark list: nobody but this worker ever sees
 *  it, and saving tells no employer anything. Say so, so it is not read as an
 *  application or an expression of interest. */
const SAVED_NOTE: L = {
  en: "Your private bookmarks. Only you can see this list — saving tells the employer nothing.",
  lt: "Tavo privatūs žymekliai. Šį sąrašą matai tik tu — išsaugojimas darbdaviui nieko nepraneša.",
  ru: "Ваши личные закладки. Этот список видите только вы — сохранение ничего не сообщает работодателю.",
  nl: "Je privé-bladwijzers. Alleen jij ziet deze lijst — bewaren laat de werkgever niets weten.",
  de: "Ihre privaten Lesezeichen. Nur Sie sehen diese Liste — das Merken teilt dem Arbeitgeber nichts mit.",
};

const SAVED_EMPTY: L = {
  en: "You have not saved any job yet. Open a job and use Save to keep it here.",
  lt: "Kol kas neišsaugojai nė vienos darbo vietos. Atidaryk skelbimą ir paspausk „Išsaugoti“.",
  ru: "Вы ещё ничего не сохранили. Откройте вакансию и нажмите «Сохранить».",
  nl: "Je hebt nog niets bewaard. Open een vacature en gebruik Bewaren.",
  de: "Sie haben noch nichts gemerkt. Öffnen Sie eine Stelle und nutzen Sie Merken.",
};

const SAVED_BADGE: L = {
  en: "Saved",
  lt: "Išsaugota",
  ru: "Сохранено",
  nl: "Bewaard",
  de: "Gemerkt",
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
  searchParams: Promise<{
    q?: string;
    page?: string;
    saved?: string;
    profession?: string;
  }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const active = resolveActiveLocale(locale);
  const sp = await searchParams;

  const query = typeof sp.q === "string" ? sp.q.slice(0, 120) : "";
  // Closed set: an unknown slug becomes "no filter" rather than reaching the
  // SQL function as free text.
  const profession = readProfessionSlugParam(sp.profession);
  // The ONE registry — slug → name in the reader's language. 17,145 browsable
  // ads carry a slug the categorizer derived, so this is how a worker searches
  // Swedish supply in Lithuanian without knowing a word of Swedish.
  const tProfession = await getTranslations("professions");
  const professionName = (slug: string): string =>
    tProfession.has(slug as never) ? tProfession(slug as never) : slug;
  const professionOptions = PUBLIC_VACANCY_PROFESSION_SLUGS.map((slug) => ({
    slug,
    label: professionName(slug),
  })).sort((a, b) => a.label.localeCompare(b.label, active));
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);
  const wantsSaved = sp.saved === "1";

  // ── THE RETURN PATH ────────────────────────────────────────────────────────
  // A bookmark a worker cannot get back to is not a bookmark. Saving lives on
  // /jobs/[id]; this is where the saved ads are READ back, on the same board,
  // in the same card — one list, not a second product surface.
  //
  // The whole block is skipped for a caller with no session cookie, so the
  // anonymous board (and every crawler hit) still costs exactly one query and
  // never touches the auth server.
  const signedIn = await hasSessionCookie();
  const supabase = signedIn ? await createClient() : null;
  const user = supabase ? (await supabase.auth.getUser()).data.user : null;
  const workerId =
    supabase && user ? await resolveOwnWorkerId(supabase, user.id) : null;
  const mySaved =
    supabase && workerId
      ? await listSavedPublicVacancyIds(supabase, workerId)
      : { vacancyIds: new Set<string>(), available: false };

  // Saved view: the worker's own ids, resolved to previews through the member
  // read path under their OWN client. Expired/withdrawn bookmarks drop out
  // there, so this list can never show a job the board itself refuses to show.
  let savedPreviews: readonly PublicVacancyPreview[] = [];
  const showSaved = wantsSaved && mySaved.available;
  if (showSaved && supabase) {
    const r = await listPublicVacancyPreviewsByIds(
      supabase,
      [...mySaved.vacancyIds],
      new Date().toISOString(),
    );
    if (r.status === "ok") savedPreviews = r.previews;
  }

  const result = showSaved
    ? { status: "ok" as const, vacancies: [], totalCount: 0, hasMore: false }
    : await searchPublicVacancyPreviews({
        query,
        professionSlug: profession,
        page,
      });

  const pageHref = (p: number) => {
    const qs = new URLSearchParams();
    if (query) qs.set("q", query);
    // Dropping the filter on page 2 would silently widen the result set under
    // the reader — the same bug class as a search box that forgets its term.
    if (profession) qs.set("profession", profession);
    if (p > 1) qs.set("page", String(p));
    const s = qs.toString();
    return s ? `/jobs?${s}` : "/jobs";
  };

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6 sm:py-14">
      {/* K3 (2026-09-02): anonymous-safe JSON-LD — a CollectionPage/ItemList of
          positions by occupation label. Built ONLY from the anonymous preview
          shape, so employer / location / title / links cannot appear (guard:
          lib/seo/public-job-json-ld.test.ts). JobPosting is deliberately NOT
          emitted: it would require the employer and the workplace. */}
      {result.status === "ok" && result.vacancies.length > 0 && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: jsonLdScript(
              buildJobsListJsonLd({
                origin: MARKETING_ORIGIN,
                locale: active,
                name: H1[active],
                description: INTRO[active],
                previews: result.vacancies,
                genericTitle: GENERIC_TITLE[active],
              }),
            ),
          }}
        />
      )}
      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
        {H1[active]}
      </h1>
      <p className="mt-3 max-w-2xl text-sm text-muted-foreground sm:text-base">
        {INTRO[active]}
      </p>

      {/* A PLAIN GET FORM, no client JS. The board is the crawler-facing
          surface and the first thing a worker with a poor connection loads;
          every filter state is therefore a real URL that can be linked,
          shared and indexed. */}
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
        {/* THE FILTER THAT LETS A WORKER SEARCH IN THEIR OWN LANGUAGE. The
            free-text box matches the publisher's own words, so on a supply
            that is 100% Swedish it only answers Swedish. The slug does not
            care what language the ad is in. */}
        <label htmlFor="profession" className="sr-only">
          {PROFESSION_LABEL[active]}
        </label>
        <select
          id="profession"
          name="profession"
          defaultValue={profession ?? ""}
          className="min-w-0 rounded-md border border-input bg-background px-3 py-2 text-sm"
        >
          <option value="">{PROFESSION_ANY[active]}</option>
          {professionOptions.map((o) => (
            <option key={o.slug} value={o.slug}>
              {o.label}
            </option>
          ))}
        </select>
        <button type="submit" className={buttonLinkClassName("primary")}>
          {SEARCH_BUTTON[active]}
        </button>
      </form>

      <p className="mt-2 text-xs text-muted-foreground">
        {ORIGINAL_LANGUAGE_NOTE[active]}
      </p>

      {/* The saved view exists only for a signed-in worker whose bookmark read
          succeeded. Anonymous visitors and non-workers see no tab at all —
          honest invisibility rather than a control that leads nowhere. */}
      {mySaved.available && (
        <nav className="mt-6 flex flex-wrap gap-2 text-sm">
          <Link
            href="/jobs"
            aria-current={showSaved ? undefined : "page"}
            className={
              showSaved
                ? "rounded-full border px-3 py-1 text-muted-foreground"
                : "rounded-full border border-foreground px-3 py-1 font-medium"
            }
          >
            {ALL_TAB[active]}
          </Link>
          <Link
            href="/jobs?saved=1"
            aria-current={showSaved ? "page" : undefined}
            className={
              showSaved
                ? "rounded-full border border-foreground px-3 py-1 font-medium"
                : "rounded-full border px-3 py-1 text-muted-foreground"
            }
          >
            {SAVED_TAB[active]} ({mySaved.vacancyIds.size})
          </Link>
        </nav>
      )}

      {showSaved ? (
        <>
          <p className="mt-6 text-sm text-muted-foreground">
            {SAVED_NOTE[active]}
          </p>
          {savedPreviews.length === 0 ? (
            <p className="mt-8 rounded-md border border-dashed p-6 text-sm text-muted-foreground">
              {SAVED_EMPTY[active]}
            </p>
          ) : (
            <ul className="mt-6 space-y-3">
              {savedPreviews.map((v) => (
                <li key={v.id}>
                  <PublicVacancyCard
                    vacancy={v}
                    locale={active}
                    headingFallback={
                      v.professionSlug ? professionName(v.professionSlug) : undefined
                    }
                    savedLabel={SAVED_BADGE[active]}
                  />
                </li>
              ))}
            </ul>
          )}
        </>
      ) : result.status === "not_provisioned" ? (
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
            <div className="mt-8 rounded-md border border-dashed p-6 text-sm text-muted-foreground">
              {/* A zero result NAMES the filter that produced it. Ten catalogue
                  professions have no live ad today, and "nothing found" without
                  saying what was asked reads as "the board is broken". */}
              <p>
                {profession && query
                  ? EMPTY_FOR_PROFESSION_AND_QUERY[active](
                      professionName(profession),
                      query,
                    )
                  : profession
                    ? EMPTY_FOR_PROFESSION[active](professionName(profession))
                    : EMPTY[active]}
              </p>
              {profession && (
                <Link
                  href={query ? `/jobs?q=${encodeURIComponent(query)}` : "/jobs"}
                  className="mt-3 inline-block underline underline-offset-4"
                >
                  {CLEAR_FILTER[active]}
                </Link>
              )}
            </div>
          ) : (
            <ul className="mt-6 space-y-3">
              {result.vacancies.map((v) => (
                <li key={v.id}>
                  <PublicVacancyCard
                    vacancy={v}
                    locale={active}
                    headingFallback={
                      v.professionSlug ? professionName(v.professionSlug) : undefined
                    }
                    savedLabel={
                      mySaved.vacancyIds.has(v.id)
                        ? SAVED_BADGE[active]
                        : undefined
                    }
                  />
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
    </div>
  );
}

