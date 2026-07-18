/**
 * Answer Engine — SEO: metadata, JSON-LD, sitemap. Pure.
 *
 * Question pages get a SELF-referential canonical, reciprocal hreflang limited to
 * locales where a HUMAN_APPROVED answer exists (never a 404, never an English
 * fallback), and robots reflecting the page state. Structured data is limited to
 * the allowed types: a single answer is an Article + BreadcrumbList + Organization
 * (a Q&A-page schema type is never used for one editorial answer). The sitemap emits ONLY indexable answers, capped at 200,
 * with per-locale lastModified from the review date.
 */
import type { Metadata, MetadataRoute } from "next";
import { MARKETING_ORIGIN, MARKETING_HOST } from "@/lib/domain/canonical";
import { BRAND_NAME } from "@/lib/seo/metadata";
import { activeLocales, defaultLocale, type ActiveLocale } from "@/lib/i18n/config";
import {
  getAnswer,
  isIndexable,
  publishedLocales,
  publishedParams,
  type LocalizedAnswer,
} from "@/lib/answer-engine/publishing";

const OG_LOCALE: Record<ActiveLocale, string> = {
  en: "en_GB", lt: "lt_LT", ru: "ru_RU", nl: "nl_NL", de: "de_DE",
};

const url = (locale: ActiveLocale, path: string) => `${MARKETING_ORIGIN}/${locale}${path}`;
const questionPath = (slug: string) => `/questions/${slug}`;

/** Reciprocal hreflang across ONLY the locales where this question is published. */
function questionHreflang(id: string): Record<string, string> | undefined {
  const langs: Record<string, string> = {};
  const published = publishedLocales(id);
  for (const l of published) {
    const a = getAnswer(id, l);
    if (a) langs[l] = url(l, questionPath(a.localizedSlug));
  }
  // x-default → LT only when the LT version is actually published.
  const ltAnswer = published.includes(defaultLocale) ? getAnswer(id, defaultLocale) : null;
  if (ltAnswer) langs["x-default"] = url(defaultLocale, questionPath(ltAnswer.localizedSlug));
  return Object.keys(langs).length > 0 ? langs : undefined;
}

export function buildQuestionMetadata(answer: LocalizedAnswer): Metadata {
  const indexable = isIndexable(answer.canonicalQuestionId, answer.locale);
  const canonical = url(answer.locale, questionPath(answer.localizedSlug));
  return {
    title: `${answer.title} · ${BRAND_NAME}`,
    description: answer.description,
    alternates: { canonical, languages: questionHreflang(answer.canonicalQuestionId) },
    robots: indexable ? { index: true, follow: true } : { index: false, follow: false },
    openGraph: {
      type: "article",
      siteName: BRAND_NAME,
      title: answer.title,
      description: answer.description,
      url: canonical,
      locale: OG_LOCALE[answer.locale],
    },
  };
}

/** Hub / category metadata: static public pages, self-canonical + full hreflang. */
export function buildStaticQuestionsMetadata(
  locale: ActiveLocale,
  path: string,
  title: string,
  description: string,
): Metadata {
  const langs: Record<string, string> = {};
  for (const l of activeLocales) langs[l] = url(l, path);
  langs["x-default"] = url(defaultLocale, path);
  const canonical = url(locale, path);
  return {
    title: `${title} · ${BRAND_NAME}`,
    description,
    alternates: { canonical, languages: langs },
    robots: { index: true, follow: true },
    openGraph: {
      type: "website",
      siteName: BRAND_NAME,
      title,
      description,
      url: canonical,
      locale: OG_LOCALE[locale],
    },
  };
}

// ── JSON-LD ─────────────────────────────────────────────────────────────────
export interface BreadcrumbItem {
  readonly name: string;
  readonly url: string;
}

export function organizationJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: BRAND_NAME,
    url: MARKETING_ORIGIN,
  };
}

export function breadcrumbJsonLd(items: readonly BreadcrumbItem[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: it.name,
      item: it.url,
    })),
  };
}

/** A SINGLE editorial answer → Article (Q&A-page schema types are not used here). */
export function answerArticleJsonLd(answer: LocalizedAnswer) {
  // Official evidence sources become schema.org `citation` entries — real,
  // machine-readable provenance for the factual claims (never a fake rating/
  // review/author). Discovery signals are editorial-only and never cited here.
  const citation = (answer.evidenceSources ?? []).map((s) => ({
    "@type": "CreativeWork",
    name: s.title,
    url: s.url,
    publisher: { "@type": "Organization", name: s.publisher },
  }));
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: answer.h1,
    description: answer.shortAnswer,
    inLanguage: answer.locale,
    datePublished: answer.reviewDate,
    dateModified: answer.reviewDate,
    author: { "@type": "Organization", name: BRAND_NAME },
    publisher: { "@type": "Organization", name: BRAND_NAME },
    mainEntityOfPage: url(answer.locale, questionPath(answer.localizedSlug)),
    ...(citation.length > 0 ? { citation } : {}),
  };
}

// ── Sitemap ─────────────────────────────────────────────────────────────────
// Upper bound on URLs in a single sitemap file = the sitemaps.org per-file
// limit (50,000). This is a safety ceiling, not a content cap: every indexable
// answer page is listed until that limit is reached. (Was 200 in Wave 1, which
// truncated once the published set passed 200 pages.)
export const ANSWER_SITEMAP_MAX = 50000;

export function buildAnswerSitemap(): MetadataRoute.Sitemap {
  const params = publishedParams().slice(0, ANSWER_SITEMAP_MAX);
  return params.map(({ id, locale, slug }) => {
    const a = getAnswer(id, locale)!;
    const languages: Record<string, string> = {};
    for (const l of publishedLocales(id)) {
      const la = getAnswer(id, l);
      if (la) languages[l] = url(l, questionPath(la.localizedSlug));
    }
    return {
      url: url(locale, questionPath(slug)),
      lastModified: a.reviewDate,
      changeFrequency: "monthly" as const,
      priority: 0.7,
      alternates: { languages },
    };
  });
}

/** Guard helper: the marketing origin the sitemap/canonical must use. */
export const ANSWER_ORIGIN = MARKETING_ORIGIN;
export const ANSWER_HOST = MARKETING_HOST;
