/**
 * Answer Engine — publishing layer (Wave 1).
 *
 * The canonical registry (Wave 0) owns question IDENTITY + relations +
 * classification. THIS layer owns the localized ANSWER content and derives what
 * is publishable/indexable. A question is published in a locale ONLY when a
 * HUMAN_APPROVED, complete, non-placeholder answer exists for it. No English
 * fallback, no machine-draft indexing, no empty page from a bare question ID.
 *
 * Content data lives in content/answer-engine/pilot-answers.ts (the versioned
 * content file — empty until real reviewed answers land). This module is pure:
 * registry + content in, view models / indexing decisions out.
 */
import { ANSWER_QUESTIONS } from "@/lib/answer-engine/registry";
import { ANSWER_ENGINE_LOCALES } from "@/lib/answer-engine/contract";
import type { CanonicalQuestion, AnswerCategoryKey } from "@/lib/answer-engine/contract";
import type { ActiveLocale } from "@/lib/i18n/config";
import { PILOT_ANSWERS } from "@/content/answer-engine/pilot-answers";
import { WAVE2B_ANSWERS } from "@/content/answer-engine/wave2b-answers";

/** Route segments that a question slug may NEVER take (reserved). */
export const RESERVED_QUESTION_SLUGS: ReadonlySet<string> = new Set([
  "category",
  "sitemap",
  "sitemap.xml",
]);

/** A localized, human-reviewed answer for one (question, locale). */
export interface LocalizedAnswer {
  readonly canonicalQuestionId: string;
  readonly locale: ActiveLocale;
  /** Localized slug for the URL (kebab-case, per locale). */
  readonly localizedSlug: string;
  /** Localized H1 question. */
  readonly h1: string;
  /** Short direct answer shown first (AI/search friendly). */
  readonly shortAnswer: string;
  /** Full answer paragraphs. */
  readonly fullAnswer: readonly string[];
  /** Real practical steps (optional). */
  readonly practicalActions?: readonly string[];
  /** Honest limitations (optional). */
  readonly limitations?: string;
  /** Country scope note when relevant (optional). */
  readonly countryScope?: string;
  /** Unique page title + description (never shared across pages). */
  readonly title: string;
  readonly description: string;
  /** Translation review status; only HUMAN_APPROVED may be indexed. */
  readonly reviewStatus: "MACHINE_DRAFT" | "LOCAL_REVIEW_REQUIRED" | "HUMAN_APPROVED";
  /** ISO date of the last human review. */
  readonly reviewDate: string;
  /** Editorial responsibility (role label, never a fake person). */
  readonly editorialResponsibility: string;
}

const REGISTRY_BY_ID = new Map<string, CanonicalQuestion>(
  ANSWER_QUESTIONS.map((q) => [q.canonicalQuestionId, q]),
);
const ANSWERS: readonly LocalizedAnswer[] = [...PILOT_ANSWERS, ...WAVE2B_ANSWERS];

function isComplete(a: LocalizedAnswer): boolean {
  return (
    a.h1.trim().length > 0 &&
    a.shortAnswer.trim().length > 0 &&
    a.fullAnswer.length > 0 &&
    a.fullAnswer.every((p) => p.trim().length > 0) &&
    a.title.trim().length > 0 &&
    a.description.trim().length > 0
  );
}

/**
 * The single indexability decision. A (question, locale) is indexable ONLY if:
 *  - a complete answer exists AND is HUMAN_APPROVED;
 *  - the slug is not reserved;
 *  - HIGH-risk questions carry sources (registry) — pilot excludes HIGH-risk,
 *    but the rule is enforced here for later waves.
 */
export function isIndexable(id: string, locale: ActiveLocale): boolean {
  const a = ANSWERS.find((x) => x.canonicalQuestionId === id && x.locale === locale);
  const q = REGISTRY_BY_ID.get(id);
  if (!a || !q) return false;
  if (a.reviewStatus !== "HUMAN_APPROVED") return false;
  if (!isComplete(a)) return false;
  if (RESERVED_QUESTION_SLUGS.has(a.localizedSlug)) return false;
  if (q.riskLevel === "HIGH" && (q.sourceReferences?.length ?? 0) === 0) return false;
  return true;
}

/** Active locales in which a question is indexable (published). */
export function publishedLocales(id: string): ActiveLocale[] {
  return ANSWER_ENGINE_LOCALES.filter((l) => isIndexable(id, l));
}

export function getAnswer(id: string, locale: ActiveLocale): LocalizedAnswer | null {
  return ANSWERS.find((a) => a.canonicalQuestionId === id && a.locale === locale) ?? null;
}

export function getRegistryQuestion(id: string): CanonicalQuestion | undefined {
  return REGISTRY_BY_ID.get(id);
}

/** Resolve a localized slug to its indexable answer in a locale (or null). */
export function resolveSlug(slug: string, locale: ActiveLocale): LocalizedAnswer | null {
  if (RESERVED_QUESTION_SLUGS.has(slug)) return null;
  const a = ANSWERS.find((x) => x.locale === locale && x.localizedSlug === slug);
  if (!a || !isIndexable(a.canonicalQuestionId, locale)) return null;
  return a;
}

/** All (id, locale) pairs that are indexable — the static-params + sitemap set. */
export function publishedParams(): { id: string; locale: ActiveLocale; slug: string }[] {
  const out: { id: string; locale: ActiveLocale; slug: string }[] = [];
  for (const a of ANSWERS) {
    if (isIndexable(a.canonicalQuestionId, a.locale)) {
      out.push({ id: a.canonicalQuestionId, locale: a.locale, slug: a.localizedSlug });
    }
  }
  return out;
}

/** Indexable questions for a category in a locale (for category pages). */
export function publishedInCategory(
  category: AnswerCategoryKey,
  locale: ActiveLocale,
): { question: CanonicalQuestion; answer: LocalizedAnswer }[] {
  const out: { question: CanonicalQuestion; answer: LocalizedAnswer }[] = [];
  for (const q of ANSWER_QUESTIONS) {
    if (q.category !== category) continue;
    if (!isIndexable(q.canonicalQuestionId, locale)) continue;
    const a = getAnswer(q.canonicalQuestionId, locale);
    if (a) out.push({ question: q, answer: a });
  }
  return out;
}

/** Categories that have at least one indexable question in a locale. */
export function publishedCategories(locale: ActiveLocale): AnswerCategoryKey[] {
  const set = new Set<AnswerCategoryKey>();
  for (const q of ANSWER_QUESTIONS) {
    if (isIndexable(q.canonicalQuestionId, locale)) set.add(q.category);
  }
  return [...set];
}

/**
 * Related questions to show on a page: registry relatedQuestionIds, filtered to
 * ones INDEXABLE in the same locale (never self, never 404), capped 3..8.
 */
export function relatedPublished(id: string, locale: ActiveLocale, max = 8): {
  question: CanonicalQuestion;
  answer: LocalizedAnswer;
}[] {
  const q = REGISTRY_BY_ID.get(id);
  if (!q) return [];
  const out: { question: CanonicalQuestion; answer: LocalizedAnswer }[] = [];
  for (const rid of q.relatedQuestionIds) {
    if (rid === id) continue;
    if (!isIndexable(rid, locale)) continue;
    const rq = REGISTRY_BY_ID.get(rid);
    const ra = getAnswer(rid, locale);
    if (rq && ra) out.push({ question: rq, answer: ra });
    if (out.length >= max) break;
  }
  return out;
}
