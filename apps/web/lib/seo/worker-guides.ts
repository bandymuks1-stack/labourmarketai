/**
 * WORKER ACQUISITION GUIDES — country and profession × country pages for
 * workers already living in Europe, in the languages they search in
 * (owner P0 2026-11-09: Russian and Turkish first, then Ukrainian, Polish,
 * Romanian).
 *
 * WHERE A GUIDE LIVES. A guide is written in its CONTENT language and served
 * under a ROUTED UI locale:
 *
 *   ru → /ru/work-abroad/<slug>   Russian has a full UI, so the page, its
 *                                 navigation and the sign-up it leads to are
 *                                 all Russian.
 *   tr → /en/work-abroad/<slug>   Turkish has no UI catalog (it is listed in
 *                                 ACQUISITION_ONLY_LANGUAGES, and `/tr` is sent
 *                                 to `/en`). The guide body is Turkish and
 *                                 marked `lang="tr"`; the chrome and sign-up
 *                                 are English, and the guide SAYS so. Turkish
 *                                 is never claimed as a UI language.
 *
 * Activating a UI locale stays a one-row change in config.ts after catalog
 * parity; when Turkish gets one, `GUIDE_HOME_LOCALE.tr` moves and every guide
 * URL moves with it.
 *
 * WHY NOT THE ANSWER ENGINE. /questions publishes one question in ALL six UI
 * locales from one canonical id and only HUMAN_APPROVED answers. A guide is a
 * country/profession landing in ONE content language that may have no UI
 * locale at all — the opposite shape. Both stay: guides link to the jobs board,
 * the sign-up and each other; questions stay questions.
 *
 * PURE. No fs / net / env.
 */
import { localizedUrl } from "@/lib/seo/metadata";
import type { ActiveLocale } from "@/lib/i18n/config";
import {
  GUIDE_COUNTRIES,
  GUIDE_EU_SOURCES,
  type CountryEntry,
  type GuideCountry,
  type GuideLanguage,
  type GuideSource,
} from "@/content/worker-guides/countries";
import {
  GUIDE_COMBOS,
  GUIDE_PROFESSIONS,
  type ComboEntry,
  type GuideProfession,
  type ProfessionEntry,
} from "@/content/worker-guides/professions";

export type { GuideCountry, GuideLanguage, GuideProfession, GuideSource };

/** Guide languages, in the owner's priority order. */
export const GUIDE_LANGUAGES: readonly GuideLanguage[] = ["ru", "tr"];

/** The routed UI locale each guide language is served under. */
export const GUIDE_HOME_LOCALE: Readonly<Record<GuideLanguage, ActiveLocale>> = {
  ru: "ru",
  tr: "en",
};

/** OpenGraph locale per guide language. */
export const GUIDE_OG_LOCALE: Readonly<Record<GuideLanguage, string>> = {
  ru: "ru_RU",
  tr: "tr_TR",
};

/**
 * Review state, said out loud (doctrine §7.4): the copy is AI-drafted by the
 * editorial agent from the official sources it cites, and no native speaker
 * has reviewed it yet. The page shows this; it never claims HUMAN_APPROVED.
 */
export const GUIDE_REVIEW_STATE = "AI_DRAFT_PENDING_NATIVE_REVIEW" as const;

/** The base path every guide hangs under (the existing /work-abroad hub). */
export const GUIDE_BASE_PATH = "/work-abroad";

export const GUIDE_SIGNUP_NEXT = "/dashboard/profile";

export interface WorkerGuide {
  /** Stable identity across languages: "country:de" or "electrician:de". */
  readonly key: string;
  readonly language: GuideLanguage;
  readonly homeLocale: ActiveLocale;
  readonly slug: string;
  readonly path: string;
  readonly country: CountryEntry;
  readonly profession: ProfessionEntry | null;
  readonly title: string;
  readonly description: string;
  readonly h1: string;
  readonly lede: string;
  readonly professionNotes: readonly string[];
  readonly sources: readonly GuideSource[];
}

function professionEntry(key: GuideProfession): ProfessionEntry {
  const p = GUIDE_PROFESSIONS.find((x) => x.key === key);
  if (!p) throw new Error(`unknown guide profession ${key}`);
  return p;
}

function countryEntry(code: GuideCountry): CountryEntry {
  const c = GUIDE_COUNTRIES.find((x) => x.code === code);
  if (!c) throw new Error(`unknown guide country ${code}`);
  return c;
}

function uniqueSources(list: readonly GuideSource[]): GuideSource[] {
  const seen = new Set<string>();
  const out: GuideSource[] = [];
  for (const s of list) {
    if (seen.has(s.url)) continue;
    seen.add(s.url);
    out.push(s);
  }
  return out;
}

function countryGuide(c: CountryEntry, language: GuideLanguage): WorkerGuide {
  const copy = c[language];
  return {
    key: `country:${c.code}`,
    language,
    homeLocale: GUIDE_HOME_LOCALE[language],
    slug: copy.slug,
    path: `${GUIDE_BASE_PATH}/${copy.slug}`,
    country: c,
    profession: null,
    title: copy.title,
    description: copy.description,
    h1: copy.h1,
    lede: copy.lede,
    professionNotes: [],
    sources: uniqueSources([...c.sources, ...GUIDE_EU_SOURCES]),
  };
}

function comboGuide(combo: ComboEntry, language: GuideLanguage): WorkerGuide {
  const copy = combo[language];
  const c = countryEntry(combo.country);
  return {
    key: `${combo.profession}:${combo.country}`,
    language,
    homeLocale: GUIDE_HOME_LOCALE[language],
    slug: copy.slug,
    path: `${GUIDE_BASE_PATH}/${copy.slug}`,
    country: c,
    profession: professionEntry(combo.profession),
    title: copy.title,
    description: copy.description,
    h1: copy.h1,
    lede: copy.lede,
    professionNotes: copy.notes,
    sources: uniqueSources([...combo.sources, ...c.sources, ...GUIDE_EU_SOURCES]),
  };
}

/** Every published guide, all languages. Country guides first, then combos. */
export const WORKER_GUIDES: readonly WorkerGuide[] = GUIDE_LANGUAGES.flatMap((language) => [
  ...GUIDE_COUNTRIES.map((c) => countryGuide(c, language)),
  ...GUIDE_COMBOS.map((combo) => comboGuide(combo, language)),
]);

/** The guide a (UI locale, slug) pair serves, or null (→ 404). */
export function resolveWorkerGuide(locale: string, slug: string): WorkerGuide | null {
  let wanted = slug;
  try {
    wanted = decodeURIComponent(slug);
  } catch {
    // keep the raw segment
  }
  return WORKER_GUIDES.find((g) => g.homeLocale === locale && g.slug === wanted) ?? null;
}

/** Guides written in one language. */
export function guidesInLanguage(language: GuideLanguage): WorkerGuide[] {
  return WORKER_GUIDES.filter((g) => g.language === language);
}

/** Guides served under one UI locale (the hub lists these). */
export function guidesForUiLocale(locale: string): WorkerGuide[] {
  return WORKER_GUIDES.filter((g) => g.homeLocale === locale);
}

/** Absolute URL of a guide. */
export function guideUrl(g: WorkerGuide): string {
  return localizedUrl(g.homeLocale, g.path);
}

/**
 * hreflang cluster of a guide: the same key in every guide language.
 * Keys are content-language codes (ru, tr), never the UI locale the page is
 * served under — a Turkish guide at /en/... is `tr`, not `en`.
 */
export function guideHreflang(g: WorkerGuide): Record<string, string> {
  const out: Record<string, string> = {};
  for (const other of WORKER_GUIDES) {
    if (other.key === g.key) out[other.language] = guideUrl(other);
  }
  return out;
}

/** Other country guides in the same language (internal linking). */
export function relatedCountryGuides(g: WorkerGuide): WorkerGuide[] {
  return WORKER_GUIDES.filter(
    (o) => o.language === g.language && o.profession === null && o.key !== g.key,
  );
}

/** The same profession in other countries, same language. */
export function relatedProfessionGuides(g: WorkerGuide): WorkerGuide[] {
  if (!g.profession) {
    return WORKER_GUIDES.filter(
      (o) => o.language === g.language && o.profession !== null && o.country.code === g.country.code,
    );
  }
  return WORKER_GUIDES.filter(
    (o) =>
      o.language === g.language &&
      o.profession?.key === g.profession?.key &&
      o.key !== g.key,
  );
}

/** The country guide a profession guide belongs to. */
export function parentCountryGuide(g: WorkerGuide): WorkerGuide | null {
  if (!g.profession) return null;
  return (
    WORKER_GUIDES.find(
      (o) => o.language === g.language && o.profession === null && o.country.code === g.country.code,
    ) ?? null
  );
}

export { GUIDE_PROFESSIONS };
