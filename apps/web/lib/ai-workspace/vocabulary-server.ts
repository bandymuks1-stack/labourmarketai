import "server-only";

import { getTranslations } from "next-intl/server";

import { countryDisplayName } from "@/lib/location/country-model";
import { collectDiscoveryFacets, type DiscoveryFacets } from "@/lib/opportunities/discovery-filters";
import type { OpportunityNeed } from "@/lib/opportunities/opportunity-fit";
import { activeLocales } from "@/lib/i18n/config";
import { buildWorkTypeLabelMap, MARKET_COUNTRIES } from "@/lib/taxonomy/work-categories";
import type { VocabularyTerm, WorldStateDimension } from "./world-state-language";

/**
 * The words the AI knows, built from the person's REAL world (W4).
 *
 * Two rules decide everything here:
 *
 * 1. **Terms come from the canonical catalogues, never from a new list.**
 *    Country names come from the platform's own `labourMarket.countryNames`
 *    catalogue and the ICU region names; professions from the work-type
 *    taxonomy; accommodation / transport / start from the `opportunities.*`
 *    enum labels; tools from the `skillNames` catalogue. Adding a language or a
 *    work type anywhere makes the AI understand it here, with no edit.
 *
 * 2. **Values come from the rows the person can actually see.**
 *    `collectDiscoveryFacets` over their own authorized board decides which
 *    values are `available`. So "find me work in Germany" can only filter to DE
 *    when a German demand is really visible to them — otherwise the word is
 *    still understood, and the caller says what IS there instead of returning
 *    an unexplained empty list.
 *
 * Terms are collected across the ACTIVE locales, not just the current one: a
 * Lithuanian worker types "Vokietijoje" one moment and "Germany" the next, and
 * both are their own words.
 */

/** Enum dimensions and the `opportunities.*` subtree that labels each one. */
const ENUM_LABEL_NAMESPACES = {
  accommodation: "accommodation",
  transport: "transport",
  start: "urgency",
} as const satisfies Partial<Record<WorldStateDimension, string>>;

export interface WorkspaceVocabulary {
  readonly terms: readonly VocabularyTerm[];
  readonly facets: DiscoveryFacets;
}

/**
 * Build the vocabulary for one person's board.
 *
 * `needs` are the needs of the rows they are authorized to see — the caller
 * passes them straight from the canonical marketplace use case, so this module
 * reads nothing of its own.
 */
export async function buildWorkspaceVocabulary(
  needs: readonly OpportunityNeed[],
): Promise<WorkspaceVocabulary> {
  const facets = collectDiscoveryFacets(needs);
  const terms: VocabularyTerm[] = [];

  // ── countries ────────────────────────────────────────────────────────────
  // Every country on the board, named in every active language. The platform
  // catalogue first (it is the product's own wording), then the ICU region name
  // as a fallback for a country the catalogue does not cover.
  const countryCatalogues = await Promise.all(
    activeLocales.map(async (locale) => ({
      locale,
      t: await getTranslations({ locale, namespace: "labourMarket.countryNames" }),
    })),
  );
  for (const code of facets.countries) {
    const names = new Set<string>();
    for (const { locale, t } of countryCatalogues) {
      if (t.has(code)) names.add(t(code));
      const icu = countryDisplayName(code, locale);
      // `countryDisplayName` returns the raw code when it cannot name it —
      // never add that, or "DE" would match any word starting with "de".
      if (icu && icu.toUpperCase() !== code.toUpperCase()) names.add(icu);
    }
    if (names.size > 0) {
      terms.push({ dimension: "country", value: code, terms: [...names], available: true });
    }
  }

  // ── professions ──────────────────────────────────────────────────────────
  // The work-type taxonomy labels the slug in each language. A demand whose
  // role is free text (not a taxonomy slug) contributes the raw value, so the
  // person can still name it the way the demand does.
  const workTypeMaps = activeLocales.map((locale) => buildWorkTypeLabelMap(locale));
  for (const slug of facets.professions) {
    const names = new Set<string>([slug]);
    for (const map of workTypeMaps) {
      const label = map[slug];
      if (label) names.add(label);
    }
    terms.push({ dimension: "profession", value: slug, terms: [...names], available: true });
  }

  // ── enum dimensions ──────────────────────────────────────────────────────
  const enumValues: Record<keyof typeof ENUM_LABEL_NAMESPACES, readonly string[]> = {
    accommodation: facets.accommodations,
    transport: facets.transports,
    start: facets.starts,
  };
  for (const [dimension, namespace] of Object.entries(ENUM_LABEL_NAMESPACES) as Array<
    [keyof typeof ENUM_LABEL_NAMESPACES, string]
  >) {
    const catalogues = await Promise.all(
      activeLocales.map((locale) =>
        getTranslations({ locale, namespace: `opportunities.${namespace}` }),
      ),
    );
    for (const value of enumValues[dimension]) {
      const names = new Set<string>();
      for (const t of catalogues) {
        if (t.has(value)) names.add(t(value) as string);
      }
      if (names.size > 0) {
        terms.push({ dimension, value, terms: [...names], available: true });
      }
    }
  }

  // ── tools ────────────────────────────────────────────────────────────────
  // The SAME closed taxonomy the demand's required-tools list is drawn from.
  const toolCatalogues = await Promise.all(
    activeLocales.map((locale) => getTranslations({ locale, namespace: "skillNames" })),
  );
  for (const slug of facets.tools) {
    const names = new Set<string>();
    for (const t of toolCatalogues) {
      if (t.has(slug)) names.add(t(slug) as string);
    }
    if (names.size > 0) {
      terms.push({ dimension: "tool", value: slug, terms: [...names], available: true });
    }
  }

  // ── opportunity types ────────────────────────────────────────────────────
  // Owner contract 2026-09-04 §4A/§15: "Where can I do an internship?" must
  // narrow the board to internships. Values are the DECLARED types present on
  // the board; the words are the catalogue labels in every active language
  // plus the everyday stems a person actually types ("praktika", "stažuotė",
  // "стажировка", "stage", "Praktikum", "pameistrystė", "apprenticeship").
  const typeCatalogues = await Promise.all(
    activeLocales.map((locale) =>
      getTranslations({ locale, namespace: "structuredDemand.opportunityType" }),
    ),
  );
  const EVERYDAY_TYPE_WORDS: Readonly<Record<string, readonly string[]>> = {
    internship: ["praktika", "stažuotė", "internship", "стажировка", "практика", "stage", "praktikum"],
    apprenticeship: ["pameistrystė", "apprenticeship", "ученичество", "leerwerkplek", "ausbildung", "lehrstelle"],
  };
  for (const value of facets.opportunityTypes) {
    const names = new Set<string>(EVERYDAY_TYPE_WORDS[value] ?? []);
    for (const t of typeCatalogues) {
      if (t.has(value)) names.add(t(value) as string);
    }
    if (names.size > 0) {
      terms.push({ dimension: "opportunityType", value, terms: [...names], available: true });
    }
  }

  return { terms, facets };
}

/**
 * Countries the person could ask about but which are NOT on their board.
 *
 * Recognising them is what lets the answer be useful: "no demands in Norway are
 * visible to you — these countries are." Built from the platform catalogue, so
 * it names exactly the markets the product actually speaks about.
 */
export async function buildUnavailableCountryTerms(
  facets: DiscoveryFacets,
): Promise<VocabularyTerm[]> {
  const onBoard = new Set(facets.countries.map((c) => c.toUpperCase()));
  const out: VocabularyTerm[] = [];
  const catalogues = await Promise.all(
    activeLocales.map(async (locale) => ({
      locale,
      t: await getTranslations({ locale, namespace: "labourMarket.countryNames" }),
    })),
  );
  // The canonical market list — the SAME set structured demand intake allows,
  // so the AI recognises exactly the markets the product speaks about. Not a
  // new list, and bounded (a 250-country vocabulary would be both slow and
  // full of two-letter false positives).
  for (const code of MARKET_COUNTRIES) {
    if (onBoard.has(code)) continue;
    const names = new Set<string>();
    for (const { locale, t } of catalogues) {
      if (t.has(code)) names.add(t(code));
      const icu = countryDisplayName(code, locale);
      if (icu && icu.toUpperCase() !== code.toUpperCase()) names.add(icu);
    }
    if (names.size > 0) {
      out.push({ dimension: "country", value: code, terms: [...names], available: false });
    }
  }
  return out;
}
