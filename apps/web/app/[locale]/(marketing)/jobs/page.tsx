import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link, redirect } from "@/lib/i18n/navigation";
import { matchProfessionByLabel } from "@/lib/vacancy-store/public-vacancy-profession-match";
import { buttonLinkClassName } from "@/components/ui/Button";
import { buildPageMetadataFor, resolveActiveLocale } from "@/lib/seo/metadata";
import type { ActiveLocale } from "@/lib/i18n/config";
import {
  searchPublicVacancyPreviews,
  readPublicVacancyCountryFacetCached,
  readCountryParam,
  type PublicVacancyPreview,
} from "@/lib/vacancy-store/public-vacancy-preview";
import { PublicVacancyCard } from "@/components/marketing/public-vacancy-card";
import { displayLanguageName } from "@/lib/i18n/language-name";
import { TelemetryView } from "@/components/app/telemetry-view";
import { FUNNEL_EVENTS } from "@/lib/telemetry/funnel-events";
import { createClient } from "@/lib/supabase/server";
import { hasSessionCookie } from "@/lib/supabase/session-cookie";
import {
  listSavedPublicVacancyIds,
  resolveOwnWorkerId,
} from "@/lib/opportunities/saved-opportunities";
import { listPublicVacancyPreviewsByIds } from "@/lib/vacancy-store/vacancy-read";
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
  pl: "Otwarte oferty pracy",
};

const INTRO: L = {
  en: "Live vacancies imported from official public employment sources. Sign in to see the employer, the location and how to apply.",
  lt: "Gyvos darbo vietos iš oficialių viešų užimtumo šaltinių. Prisijunk, kad matytum darbdavį, vietovę ir kaip kandidatuoti.",
  ru: "Актуальные вакансии из официальных публичных источников занятости. Войдите, чтобы увидеть работодателя, местоположение и способ подачи заявки.",
  nl: "Actuele vacatures uit officiële openbare arbeidsbronnen. Log in om de werkgever, de locatie en de sollicitatiewijze te zien.",
  de: "Aktuelle Stellen aus offiziellen öffentlichen Arbeitsmarktquellen. Melden Sie sich an, um Arbeitgeber, Ort und Bewerbungsweg zu sehen.",
  pl: "Aktualne oferty pracy importowane z oficjalnych publicznych źródeł zatrudnienia. Zaloguj się, aby zobaczyć pracodawcę, lokalizację i sposób aplikowania.",
};

/** The intro for someone who is ALREADY signed in. The anonymous intro above
 *  promises the employer, location and apply route "after you sign in" — said to
 *  a signed-in worker it is a false instruction (the board never reads it as
 *  such, but the sentence did). They get the same facts, one tap away. */
const INTRO_MEMBER: L = {
  en: "Live vacancies imported from official public employment sources. Open a vacancy to see the employer, the location and how to apply.",
  lt: "Gyvos darbo vietos iš oficialių viešų užimtumo šaltinių. Atidaryk skelbimą — pamatysi darbdavį, vietovę ir kaip kandidatuoti.",
  ru: "Актуальные вакансии из официальных публичных источников занятости. Откройте вакансию, чтобы увидеть работодателя, местоположение и способ подачи заявки.",
  nl: "Actuele vacatures uit officiële openbare arbeidsbronnen. Open een vacature om de werkgever, de locatie en de sollicitatiewijze te zien.",
  de: "Aktuelle Stellen aus offiziellen öffentlichen Arbeitsmarktquellen. Öffnen Sie eine Stelle, um Arbeitgeber, Ort und Bewerbungsweg zu sehen.",
  pl: "Aktualne oferty pracy importowane z oficjalnych publicznych źródeł zatrudnienia. Otwórz ofertę, aby zobaczyć pracodawcę, lokalizację i sposób aplikowania.",
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
  pl: "Szukaj według zawodu",
};

const SEARCH_BUTTON: L = {
  en: "Search",
  lt: "Ieškoti",
  ru: "Искать",
  nl: "Zoeken",
  de: "Suchen",
  pl: "Szukaj",
};

const PROFESSION_LABEL: L = {
  en: "Profession",
  lt: "Profesija",
  ru: "Профессия",
  nl: "Beroep",
  de: "Beruf",
  pl: "Zawód",
};

const PROFESSION_ANY: L = {
  en: "All professions",
  lt: "Visos profesijos",
  ru: "Все профессии",
  nl: "Alle beroepen",
  de: "Alle Berufe",
  pl: "Wszystkie zawody",
};

const CLEAR_FILTER: L = {
  en: "Clear filter",
  lt: "Išvalyti filtrą",
  ru: "Сбросить фильтр",
  nl: "Filter wissen",
  de: "Filter zurücksetzen",
  pl: "Wyczyść filtr",
};

/* `ORIGINAL_LANGUAGE_NOTE` WAS REMOVED HERE (owner rule §1, 2026-09-27).
 *
 * It read "Profesijų pavadinimai rodomi ta kalba, kuria juos paskelbė
 * darbdavys. Filtruok pagal profesiją, kad ieškotum sava kalba." and its own
 * comment said why it existed: "rather than letting a visitor wonder why a
 * Lithuanian page lists Swedish occupation labels."
 *
 * That is a DISCLAIMER COMPENSATING FOR A CONFUSING COMPONENT, which the owner
 * banned outright — and it is now also FALSE. Since the card fix, a mapped ad
 * heads with the localized catalogue name ("Sandėlio darbuotojas") and each card
 * names its own source language on one compact line ("Skelbimo kalba: švedų ·
 * Lagerarbetare"). Verified on deployed production /lt/jobs and /lt.
 *
 * So the page-level sentence was saying something untrue about the page, to
 * excuse a confusion that no longer exists, in a paragraph nobody needed to act
 * on. Removing it loses nothing: the language is still named, per ad, where the
 * reader is actually looking.
 */

const RESULTS: L = {
  en: "vacancies found",
  lt: "rasta darbo vietų",
  ru: "найдено вакансий",
  nl: "vacatures gevonden",
  de: "Stellen gefunden",
  pl: "znalezionych ofert pracy",
};

/** Named, so a zero result is an answer about THIS filter rather than a
 *  vague nothing. {profession} is the catalogue name in the reader's locale. */
const EMPTY_FOR_PROFESSION: Record<ActiveLocale, (p: string) => string> = {
  en: (p) => `No open jobs for ${p} right now.`,
  lt: (p) => `Šiuo metu nėra laisvų darbo vietų: ${p}.`,
  ru: (p) => `Сейчас нет открытых вакансий: ${p}.`,
  nl: (p) => `Momenteel geen openstaande vacatures voor ${p}.`,
  de: (p) => `Derzeit keine offenen Stellen für ${p}.`,
  pl: (p) => `Obecnie brak otwartych ofert pracy: ${p}.`,
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
  pl: (p, q) => `Obecnie brak otwartych ofert pracy: ${p} dla „${q}”.`,
};

const EMPTY: L = {
  en: "No vacancies match this search right now. Try a broader job title.",
  lt: "Pagal šią paiešką darbo vietų nerasta. Pabandyk platesnį pareigų pavadinimą.",
  ru: "По этому запросу вакансий не найдено. Попробуйте более общее название.",
  nl: "Geen vacatures voor deze zoekopdracht. Probeer een bredere functietitel.",
  de: "Keine Stellen für diese Suche. Versuchen Sie eine breitere Bezeichnung.",
  pl: "Żadna oferta pracy nie pasuje teraz do tego wyszukiwania. Spróbuj ogólniejszej nazwy stanowiska.",
};

/** Honest state: the feature is not switched on — NOT "there are no jobs". */
const NOT_PROVISIONED: L = {
  en: "The public job board is not enabled yet.",
  lt: "Vieša darbo skelbimų lenta dar neįjungta.",
  ru: "Публичная доска вакансий ещё не включена.",
  nl: "Het openbare vacaturebord is nog niet ingeschakeld.",
  de: "Das öffentliche Stellenboard ist noch nicht aktiviert.",
  pl: "Publiczna tablica ofert pracy nie jest jeszcze włączona.",
};

/** Honest state: the read did not answer in time — NOT "0 vacancies found",
 *  NOT an error page. Three different facts, and the person is owed the true
 *  one. The cause that produced 1,595 of these in 24 h was fixed on
 *  2026-09-08 (ledger 20260908110702); this state remains because a timeout
 *  is always possible and its SHAPE must never regress into a fake zero. */
const UNAVAILABLE: L = {
  en: "The job board did not answer in time. Please try again in a moment.",
  lt: "Darbo skelbimų lenta laiku neatsakė. Pabandyk dar kartą po akimirkos.",
  ru: "Доска вакансий не ответила вовремя. Попробуйте ещё раз через минуту.",
  nl: "Het vacaturebord antwoordde niet op tijd. Probeer het zo opnieuw.",
  de: "Das Stellenboard hat nicht rechtzeitig geantwortet. Bitte gleich noch einmal versuchen.",
  pl: "Tablica ofert pracy nie odpowiedziała na czas. Spróbuj ponownie za chwilę.",
};

const COUNTRY_LABEL: L = {
  en: "Country",
  lt: "Šalis",
  ru: "Страна",
  nl: "Land",
  de: "Land",
  pl: "Kraj",
};

const COUNTRY_ANY: L = {
  en: "All countries",
  lt: "Visos šalys",
  ru: "Все страны",
  nl: "Alle landen",
  de: "Alle Länder",
  pl: "Wszystkie kraje",
};

/** A country with no live ad answers for ITSELF - it never falls back to
 *  showing every country's ads under a filter the reader asked for. */
const EMPTY_FOR_COUNTRY: Record<ActiveLocale, (c: string) => string> = {
  en: (c) => `No open jobs in ${c} right now.`,
  lt: (c) => `Šiuo metu nėra laisvų darbo vietų šalyje: ${c}.`,
  ru: (c) => `Сейчас нет открытых вакансий: ${c}.`,
  nl: (c) => `Momenteel geen openstaande vacatures in ${c}.`,
  de: (c) => `Derzeit keine offenen Stellen in ${c}.`,
  pl: (c) => `Obecnie brak otwartych ofert pracy: ${c}.`,
};

/** Region names come from the platform's own CLDR data (no hand-kept list). */
function countryName(code: string, locale: ActiveLocale): string {
  try {
    return new Intl.DisplayNames([locale], { type: "region" }).of(code) ?? code;
  } catch {
    return code;
  }
}

const SAVED_TAB: L = {
  en: "Saved",
  lt: "Išsaugoti",
  ru: "Сохранённые",
  nl: "Bewaard",
  de: "Gemerkt",
  pl: "Zapisane",
};

const ALL_TAB: L = {
  en: "All jobs",
  lt: "Visos darbo vietos",
  ru: "Все вакансии",
  nl: "Alle vacatures",
  de: "Alle Stellen",
  pl: "Wszystkie oferty pracy",
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
  pl: "Twoje prywatne zakładki. Tylko Ty widzisz tę listę — zapisanie nic nie mówi pracodawcy.",
};

const SAVED_EMPTY: L = {
  en: "You have not saved any job yet. Open a job and use Save to keep it here.",
  lt: "Kol kas neišsaugojai nė vienos darbo vietos. Atidaryk skelbimą ir paspausk „Išsaugoti“.",
  ru: "Вы ещё ничего не сохранили. Откройте вакансию и нажмите «Сохранить».",
  nl: "Je hebt nog niets bewaard. Open een vacature en gebruik Bewaren.",
  de: "Sie haben noch nichts gemerkt. Öffnen Sie eine Stelle und nutzen Sie Merken.",
  pl: "Nie masz jeszcze zapisanej żadnej oferty pracy. Otwórz ofertę i użyj „Zapisz”.",
};

const SAVED_BADGE: L = {
  en: "Saved",
  lt: "Išsaugota",
  ru: "Сохранено",
  nl: "Bewaard",
  de: "Gemerkt",
  pl: "Zapisano",
};

const PREV: L = {
  en: "Previous",
  lt: "Ankstesnis",
  ru: "Назад",
  nl: "Vorige",
  de: "Zurück",
  pl: "Poprzednia",
};

const NEXT: L = {
  en: "Next",
  lt: "Kitas",
  ru: "Далее",
  nl: "Volgende",
  de: "Weiter",
  pl: "Następna",
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
    country?: string;
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
  // THE AD'S OWN LANGUAGE, named only when it is not the reader's — the SAME
  // condition and the SAME copy `/jobs/[id]` already uses, so the board and the
  // detail page say one thing (owner §6, 2026-09-27). Nothing is translated and
  // nothing leaves the platform; this is the honest fallback that stops a
  // Swedish occupation standing on the card as an unexplained second title.
  const tRoot = await getTranslations();
  const sourceLanguageLabel = (code: string | null): string | undefined =>
    code && code.slice(0, 2) !== active
      ? tRoot("vacancySources.language.originalIn", {
          language: displayLanguageName(code, active),
        })
      : undefined;
  const professionOptions = PUBLIC_VACANCY_PROFESSION_SLUGS.map((slug) => ({
    slug,
    label: professionName(slug),
  })).sort((a, b) => a.label.localeCompare(b.label, active));
  // A typed word that IS a catalogue profession in the reader's language
  // ("valytojas") would otherwise search Swedish publisher labels and report a
  // false zero. Resolve it through the same slug filter, in the URL, so reload,
  // share and "clear filter" all behave as for a picked profession.
  if (!profession && query && sp.saved !== "1") {
    const mapped = matchProfessionByLabel(query, professionOptions);
    if (mapped) redirect({ href: `/jobs?profession=${mapped}`, locale: active });
  }
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

  // ── COUNTRY (Norway vs Sweden) ─────────────────────────────────────────────
  // The facet is the MAINTAINED per-country row (constant cost) and doubles as
  // the allow-list. The country filter is country-only: a typed word or a
  // profession wins and the country param is ignored (country+profession is not
  // provably within the anonymous 3 s timeout). The plain default view still
  // calls the generic path below with no country argument.
  const rawCountry =
    typeof sp.country === "string" && /^[A-Za-z]{2}$/.test(sp.country.trim())
      ? sp.country.trim().toUpperCase()
      : null;
  const countryRequested = !query && !profession && !showSaved ? rawCountry : null;
  // No country asked for: the facet read runs IN PARALLEL with the generic
  // search, so the default board waits for neither.
  const facetPromise = showSaved
    ? Promise.resolve({ status: "ok" as const, countries: [] })
    : readPublicVacancyCountryFacetCached();
  const defaultSearch =
    !showSaved && !countryRequested
      ? searchPublicVacancyPreviews({ query, professionSlug: profession, page })
      : null;
  const facet = await facetPromise;
  const country = countryRequested ? readCountryParam(countryRequested, facet) : null;
  // A requested country the facet does not list is an honest empty answer; one
  // the facet could not confirm is "unavailable" - never "all jobs".
  const countryUnknown =
    countryRequested !== null && country === null && facet.status === "ok";
  const countryUnconfirmed =
    countryRequested !== null && country === null && facet.status !== "ok";
  const countryOptions = facet.countries
    .map((c) => ({ ...c, label: countryName(c.code, active) }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, active));

  const result = showSaved
    ? { status: "ok" as const, vacancies: [], totalCount: 0, hasMore: false }
    : countryUnconfirmed
      ? {
          status: (facet.status === "unavailable"
            ? "unavailable"
            : "not_provisioned") as "unavailable" | "not_provisioned",
          vacancies: [],
          totalCount: 0,
          hasMore: false,
        }
      : countryUnknown
        ? { status: "ok" as const, vacancies: [], totalCount: 0, hasMore: false }
        : defaultSearch
          ? await defaultSearch
          : await searchPublicVacancyPreviews({
              query,
              professionSlug: profession,
              country,
              page,
            });

  const pageHref = (p: number) => {
    const qs = new URLSearchParams();
    if (query) qs.set("q", query);
    // Dropping the filter on page 2 would silently widen the result set under
    // the reader — the same bug class as a search box that forgets its term.
    if (profession) qs.set("profession", profession);
    if (country) qs.set("country", country);
    if (p > 1) qs.set("page", String(p));
    const s = qs.toString();
    return s ? `/jobs?${s}` : "/jobs";
  };

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6 sm:py-14">
      {/* FUNNEL (acquisition loop P0): JOB_IMPRESSION — one board render per
          tab session, with how many ads it showed. An `unavailable` read
          (the search did not answer in time) is `success:false` with a zero
          count, never "zero jobs": the two are different facts and the
          owner's question is where visitors leave. */}
      <TelemetryView
        event={FUNNEL_EVENTS.jobBoardViewed}
        metadata={{
          surface: showSaved ? "public_jobs_saved" : profession ? "public_jobs_profession" : "public_jobs",
          role_context: user ? "member" : "anonymous",
          success: result.status !== "unavailable",
          candidate_count: showSaved ? savedPreviews.length : result.vacancies.length,
        }}
      />
      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
        {H1[active]}
      </h1>
      <p className="mt-3 max-w-2xl text-sm text-text-muted sm:text-base">
        {(user ? INTRO_MEMBER : INTRO)[active]}
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
          className="min-w-0 basis-full rounded-md border border-border-subtle bg-surface-1 px-3 py-2 text-sm sm:flex-1 sm:basis-0"
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
          className="min-w-0 rounded-md border border-border-subtle bg-surface-1 px-3 py-2 text-sm"
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

      {/* COUNTRY SELECTOR: plain links (real URLs, no client JS). Hidden when the
          facet could not be read - no fake chips. Choosing a country starts a
          country view; typing a search or picking a profession above searches
          every country. */}
      {!showSaved && countryOptions.length > 1 && (
        <nav
          aria-label={COUNTRY_LABEL[active]}
          data-testid="jobs-country-selector"
          className="mt-4 flex flex-wrap items-center gap-2 text-sm"
        >
          <span className="text-text-muted">{COUNTRY_LABEL[active]}:</span>
          <Link
            href="/jobs"
            aria-current={country || countryRequested ? undefined : "page"}
            className={
              country || countryRequested
                ? "rounded-full border px-3 py-1 text-text-muted"
                : "rounded-full border border-text-primary px-3 py-1 font-medium"
            }
          >
            {COUNTRY_ANY[active]}
          </Link>
          {countryOptions.map((c) => (
            <Link
              key={c.code}
              href={`/jobs?country=${c.code}`}
              aria-current={country === c.code ? "page" : undefined}
              className={
                country === c.code
                  ? "rounded-full border border-text-primary px-3 py-1 font-medium"
                  : "rounded-full border px-3 py-1 text-text-muted"
              }
            >
              {c.label} ({c.count.toLocaleString()})
            </Link>
          ))}
        </nav>
      )}

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
                ? "rounded-full border px-3 py-1 text-text-muted"
                : "rounded-full border border-text-primary px-3 py-1 font-medium"
            }
          >
            {ALL_TAB[active]}
          </Link>
          <Link
            href="/jobs?saved=1"
            aria-current={showSaved ? "page" : undefined}
            className={
              showSaved
                ? "rounded-full border border-text-primary px-3 py-1 font-medium"
                : "rounded-full border px-3 py-1 text-text-muted"
            }
          >
            {SAVED_TAB[active]} ({mySaved.vacancyIds.size})
          </Link>
        </nav>
      )}

      {showSaved ? (
        <>
          <p className="mt-6 text-sm text-text-muted">
            {SAVED_NOTE[active]}
          </p>
          {savedPreviews.length === 0 ? (
            <p className="mt-8 rounded-md border border-dashed p-6 text-sm text-text-muted">
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
                    sourceLanguageLabel={sourceLanguageLabel(v.sourceLanguage)}
                    savedLabel={SAVED_BADGE[active]}
                  />
                </li>
              ))}
            </ul>
          )}
        </>
      ) : result.status === "not_provisioned" ? (
        <p className="mt-10 rounded-md border border-dashed p-6 text-sm text-text-muted">
          {NOT_PROVISIONED[active]}
        </p>
      ) : result.status === "unavailable" ? (
        <p
          role="status"
          data-testid="public-jobs-unavailable"
          className="mt-10 rounded-md border border-dashed p-6 text-sm text-text-muted"
        >
          {UNAVAILABLE[active]}
        </p>
      ) : (
        <>
          {/* role="status": a search is a full navigation, so the result count
              is the one thing a screen reader must hear after it lands. */}
          <p role="status" className="mt-6 text-sm text-text-muted">
            {result.totalCount.toLocaleString()} {RESULTS[active]}
          </p>

          {result.vacancies.length === 0 ? (
            <div className="mt-8 rounded-md border border-dashed p-6 text-sm text-text-muted">
              {/* A zero result NAMES the filter that produced it. Ten catalogue
                  professions have no live ad today, and "nothing found" without
                  saying what was asked reads as "the board is broken". */}
              <p>
                {countryUnknown && countryRequested
                  ? EMPTY_FOR_COUNTRY[active](countryName(countryRequested, active))
                  : profession && query
                  ? EMPTY_FOR_PROFESSION_AND_QUERY[active](
                      professionName(profession),
                      query,
                    )
                  : profession
                    ? EMPTY_FOR_PROFESSION[active](professionName(profession))
                    : EMPTY[active]}
              </p>
              {countryUnknown && (
                <Link
                  href="/jobs"
                  className="mt-3 inline-block underline underline-offset-4"
                >
                  {COUNTRY_ANY[active]}
                </Link>
              )}
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
                    sourceLanguageLabel={sourceLanguageLabel(v.sourceLanguage)}
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
    </main>
  );
}

