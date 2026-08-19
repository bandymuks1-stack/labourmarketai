import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
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
  searchParams: Promise<{ q?: string; page?: string; saved?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const active = resolveActiveLocale(locale);
  const sp = await searchParams;

  const query = typeof sp.q === "string" ? sp.q.slice(0, 120) : "";
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
    : await searchPublicVacancyPreviews({ query, page });

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
            <p className="mt-8 rounded-md border border-dashed p-6 text-sm text-muted-foreground">
              {EMPTY[active]}
            </p>
          ) : (
            <ul className="mt-6 space-y-3">
              {result.vacancies.map((v) => (
                <li key={v.id}>
                  <PublicVacancyCard
                    vacancy={v}
                    locale={active}
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

