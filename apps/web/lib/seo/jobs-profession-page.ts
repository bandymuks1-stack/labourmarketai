/**
 * The profession version of the public job board: `/jobs?profession=<slug>`
 * (owner P0, 2026-11-12, SEO recovery).
 *
 * Until now every profession filter named the board as its canonical and
 * carried the board's title, so "welder jobs" had no page a search engine
 * could show, though the board listed hundreds of them.
 *
 * A profession page is indexable only while it has REAL DEMAND: at least
 * `PROFESSION_PAGE_MIN_LIVE_ADS` live ads, read from the same search the page
 * renders. Below that it stays reachable for people and is `noindex, follow`
 * (the #3204 rule for thin pages). Its title, heading and description name the
 * profession in the reader's language and carry the live count.
 *
 * No country appears: the place of an ad is for signed-in members (directive
 * 2026-08-24). A profession and country page waits for RED drafts #2993/#3173.
 *
 * PURE: no fs / net / env.
 */
import type { ActiveLocale } from "@/lib/i18n/config";

type L<T = string> = Record<ActiveLocale, T>;

/** Fewer live ads than this and the page is a thin listing, not demand. */
export const PROFESSION_PAGE_MIN_LIVE_ADS = 10;

export type ProfessionPageRead =
  | { readonly status: "ok"; readonly totalCount: number }
  | { readonly status: "unavailable" | "not_provisioned" };

/**
 * May a search engine index this profession page?
 *
 * `unavailable` is a search that did not answer in time. The count is then
 * UNKNOWN, not zero, so the page keeps its indexable state instead of telling
 * a crawler to drop it over a slow query.
 */
export function isProfessionPageIndexable(read: ProfessionPageRead): boolean {
  if (read.status === "ok") return read.totalCount >= PROFESSION_PAGE_MIN_LIVE_ADS;
  return read.status === "unavailable";
}

/** The live count, or null when it is not known. */
export function knownLiveCount(read: ProfessionPageRead): number | null {
  return read.status === "ok" ? read.totalCount : null;
}

/** Title and h1: the profession in the nominative, then the noun. No
 *  inflection of the profession name is needed in any language. */
const HEADING: L<(name: string) => string> = {
  en: (n) => `${n}: open jobs`,
  lt: (n) => `${n}: darbo vietos`,
  ru: (n) => `${n}: вакансии`,
  nl: (n) => `${n}: vacatures`,
  de: (n) => `${n}: offene Stellen`,
  pl: (n) => `${n}: oferty pracy`,
  sv: (n) => `${n}: lediga jobb`,
};

/** "label: number" keeps the noun in one form for every count. */
const DESCRIPTION_WITH_COUNT: L<(name: string, count: string) => string> = {
  en: (n, c) =>
    `${n}: ${c} open vacancies from official public job sources. Sign in free to see the employer, the place and how to apply.`,
  lt: (n, c) =>
    `${n}: laisvų darbo vietų iš oficialių viešų šaltinių – ${c}. Prisijunk nemokamai: darbdavys, vieta ir kaip kandidatuoti.`,
  ru: (n, c) =>
    `${n}: открытых вакансий из официальных источников – ${c}. Войдите бесплатно: работодатель, место и как откликнуться.`,
  nl: (n, c) =>
    `${n}: ${c} openstaande vacatures uit officiële openbare bronnen. Log gratis in voor werkgever, plaats en sollicitatiewijze.`,
  de: (n, c) =>
    `${n}: ${c} offene Stellen aus offiziellen öffentlichen Quellen. Kostenlos anmelden für Arbeitgeber, Ort und Bewerbungsweg.`,
  pl: (n, c) =>
    `${n}: otwartych ofert pracy z oficjalnych źródeł – ${c}. Zaloguj się bezpłatnie: pracodawca, miejsce i sposób aplikowania.`,
  sv: (n, c) =>
    `${n}: lediga jobb från officiella offentliga källor – ${c}. Logga in gratis för att se arbetsgivaren, platsen och hur du söker.`,
};

const DESCRIPTION_NO_COUNT: L<(name: string) => string> = {
  en: (n) =>
    `${n}: open vacancies from official public job sources. Sign in free to see the employer, the place and how to apply.`,
  lt: (n) =>
    `${n}: laisvos darbo vietos iš oficialių viešų šaltinių. Prisijunk nemokamai: darbdavys, vieta ir kaip kandidatuoti.`,
  ru: (n) =>
    `${n}: открытые вакансии из официальных источников. Войдите бесплатно: работодатель, место и как откликнуться.`,
  nl: (n) =>
    `${n}: openstaande vacatures uit officiële openbare bronnen. Log gratis in voor werkgever, plaats en sollicitatiewijze.`,
  de: (n) =>
    `${n}: offene Stellen aus offiziellen öffentlichen Quellen. Kostenlos anmelden für Arbeitgeber, Ort und Bewerbungsweg.`,
  pl: (n) =>
    `${n}: otwarte oferty pracy z oficjalnych źródeł. Zaloguj się bezpłatnie: pracodawca, miejsce i sposób aplikowania.`,
  sv: (n) =>
    `${n}: lediga jobb från officiella offentliga källor. Logga in gratis för att se arbetsgivaren, platsen och hur du söker.`,
};

/** The line under the h1 that says which part of the board this is. */
const SCOPE_NOTE: L<(name: string) => string> = {
  en: (n) => `Only vacancies in the profession “${n}” are listed here.`,
  lt: (n) => `Čia rodomos tik profesijos „${n}“ darbo vietos.`,
  ru: (n) => `Здесь показаны только вакансии по профессии «${n}».`,
  nl: (n) => `Hier staan alleen vacatures voor het beroep “${n}”.`,
  de: (n) => `Hier stehen nur Stellen für den Beruf „${n}“.`,
  pl: (n) => `Tutaj są tylko oferty pracy w zawodzie „${n}”.`,
  sv: (n) => `Här visas bara lediga jobb inom yrket ”${n}”.`,
};

const ALL_JOBS_LINK: L = {
  en: "All open jobs",
  lt: "Visos laisvos darbo vietos",
  ru: "Все открытые вакансии",
  nl: "Alle openstaande vacatures",
  de: "Alle offenen Stellen",
  pl: "Wszystkie otwarte oferty pracy",
  sv: "Alla lediga jobb",
};

const BROWSE_HEADING: L = {
  en: "Jobs by profession",
  lt: "Darbo vietos pagal profesiją",
  ru: "Вакансии по профессиям",
  nl: "Vacatures per beroep",
  de: "Stellen nach Beruf",
  pl: "Oferty pracy według zawodu",
  sv: "Lediga jobb efter yrke",
};

export interface ProfessionPageCopy {
  /** Title before the brand suffix, and the page's h1. */
  readonly heading: string;
  readonly description: string;
  readonly scopeNote: string;
  readonly allJobsLink: string;
}

export function professionPageCopy(
  locale: ActiveLocale,
  professionName: string,
  liveCount: number | null,
): ProfessionPageCopy {
  return {
    heading: HEADING[locale](professionName),
    description:
      liveCount === null
        ? DESCRIPTION_NO_COUNT[locale](professionName)
        : DESCRIPTION_WITH_COUNT[locale](
            professionName,
            new Intl.NumberFormat(locale).format(liveCount),
          ),
    scopeNote: SCOPE_NOTE[locale](professionName),
    allJobsLink: ALL_JOBS_LINK[locale],
  };
}

export function browseByProfessionHeading(locale: ActiveLocale): string {
  return BROWSE_HEADING[locale];
}
