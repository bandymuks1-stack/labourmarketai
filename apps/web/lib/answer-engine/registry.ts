/**
 * Answer-Engine registry loader + pure validators (Wave 0).
 *
 * Loads the committed canonical question registry and exposes pure validation
 * functions shared by the generator and the guard. No IO beyond the static JSON
 * import; no network; safe to import from tests and server components.
 */
import registryJson from "@/content/answer-engine/question-registry.json";
import {
  ANSWER_ENGINE_LOCALES,
  ANSWER_CATEGORY_KEYS,
  CATEGORY_MIN,
  CANONICAL_QUESTION_MINIMUM,
  INDEXABLE_CONTENT_STATES,
  type CanonicalQuestion,
  type AnswerCategoryKey,
} from "./contract";

export const ANSWER_QUESTIONS = registryJson.questions as unknown as CanonicalQuestion[];
export const ANSWER_REGISTRY_META = registryJson;

// Interrogatives (what/who/where/when/which/why) are deliberately NOT stopwords:
// short definitional questions ("What is X?" vs "Who is X for?") differ only by
// them, and dropping them would false-flag distinct questions as near-duplicates.
const STOPWORDS = new Set([
  "a","an","the","how","do","i","my","me","is","are","can","of","to","in","on","for","and","or",
  "with","without","it","this","that","does","should","will","be","as",
  "if","not","by","from","your","you","at","about","into","its","so","than","more","most",
]);

function tokens(q: string): Set<string> {
  return new Set(
    q
      .toLowerCase()
      .replace(/[^a-z0-9 ]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 1 && !STOPWORDS.has(w)),
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  let shared = 0;
  for (const t of a) if (b.has(t)) shared += 1;
  const union = a.size + b.size - shared;
  return union === 0 ? 0 : shared / union;
}

export const NEAR_DUP_THRESHOLD = 0.8;

export interface RegistryIssues {
  readonly total: number;
  readonly duplicateIds: string[];
  readonly duplicateSlugs: string[];
  readonly categoryShortfalls: { category: AnswerCategoryKey; have: number; min: number }[];
  readonly missingAudience: string[];
  readonly missingCategory: string[];
  readonly missingIntent: string[];
  readonly missingFreshness: string[];
  readonly highRiskWithoutEvidence: string[];
  readonly highRiskWithoutSource: string[];
  readonly indexableButNotReady: string[];
  readonly nearDuplicatesWithoutCluster: string[];
  readonly localeStatusIncomplete: string[];
  readonly emptyQuestionText: string[];
  readonly slugNotKebab: string[];
  readonly localeKeyLeakInText: string[];
}

export function validateRegistry(
  qs: readonly CanonicalQuestion[] = ANSWER_QUESTIONS,
): RegistryIssues {
  const idCounts = new Map<string, number>();
  const slugCounts = new Map<string, number>();
  const catCounts = new Map<string, number>();
  const missingAudience: string[] = [];
  const missingCategory: string[] = [];
  const missingIntent: string[] = [];
  const missingFreshness: string[] = [];
  const highRiskWithoutEvidence: string[] = [];
  const highRiskWithoutSource: string[] = [];
  const indexableButNotReady: string[] = [];
  const localeStatusIncomplete: string[] = [];
  const emptyQuestionText: string[] = [];
  const slugNotKebab: string[] = [];
  const localeKeyLeakInText: string[] = [];

  for (const q of qs) {
    idCounts.set(q.canonicalQuestionId, (idCounts.get(q.canonicalQuestionId) ?? 0) + 1);
    slugCounts.set(q.canonicalSlug, (slugCounts.get(q.canonicalSlug) ?? 0) + 1);
    if (ANSWER_CATEGORY_KEYS.includes(q.category)) {
      catCounts.set(q.category, (catCounts.get(q.category) ?? 0) + 1);
    } else missingCategory.push(q.canonicalQuestionId);
    if (!q.audiences || q.audiences.length === 0) missingAudience.push(q.canonicalQuestionId);
    if (!q.searchIntent) missingIntent.push(q.canonicalQuestionId);
    if (!q.freshnessClass) missingFreshness.push(q.canonicalQuestionId);
    if (!q.canonicalQuestion || q.canonicalQuestion.trim().length < 8) {
      emptyQuestionText.push(q.canonicalQuestionId);
    }
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(q.canonicalSlug)) slugNotKebab.push(q.canonicalQuestionId);
    // A raw i18n key (e.g. "opportunityDirections.heading") must never sit in
    // the canonical question text — no locale-key leakage.
    if (/[a-zA-Z]+\.(heading|title|label|body|question|subcopy)\b/.test(q.canonicalQuestion)) {
      localeKeyLeakInText.push(q.canonicalQuestionId);
    }
    if (q.riskLevel === "HIGH") {
      if (q.evidenceStatus !== "EVIDENCE_REQUIRED" && q.evidenceStatus !== "EVIDENCE_PROVIDED") {
        highRiskWithoutEvidence.push(q.canonicalQuestionId);
      }
      if (!q.sourceReferences || q.sourceReferences.length === 0) {
        highRiskWithoutSource.push(q.canonicalQuestionId);
      }
    }
    // Wave 0: nothing is indexable. A question may only sit in an INDEXABLE
    // content state if every active locale's indexing status is PUBLISHED.
    if (INDEXABLE_CONTENT_STATES.includes(q.contentStatus)) {
      const allPublished = ANSWER_ENGINE_LOCALES.every(
        (l) => q.indexingStatusByLocale?.[l] === "PUBLISHED",
      );
      if (!allPublished) indexableButNotReady.push(q.canonicalQuestionId);
    }
    // Per-locale status maps must cover exactly the active locales.
    for (const l of ANSWER_ENGINE_LOCALES) {
      if (!q.translationStatusByLocale?.[l] || !q.indexingStatusByLocale?.[l]) {
        localeStatusIncomplete.push(q.canonicalQuestionId);
        break;
      }
    }
  }

  // Near-duplicate detection: pairs above threshold must share a cluster.
  const nearDuplicatesWithoutCluster: string[] = [];
  const tok = qs.map((q) => ({ q, t: tokens(q.canonicalQuestion) }));
  for (let i = 0; i < tok.length; i++) {
    for (let j = i + 1; j < tok.length; j++) {
      if (jaccard(tok[i].t, tok[j].t) >= NEAR_DUP_THRESHOLD) {
        const ci = tok[i].q.duplicateClusterId;
        const cj = tok[j].q.duplicateClusterId;
        if (!ci || !cj || ci !== cj) {
          nearDuplicatesWithoutCluster.push(
            `${tok[i].q.canonicalQuestionId}~${tok[j].q.canonicalQuestionId}`,
          );
        }
      }
    }
  }

  const categoryShortfalls = ANSWER_CATEGORY_KEYS.map((c) => ({
    category: c,
    have: catCounts.get(c) ?? 0,
    min: CATEGORY_MIN[c],
  })).filter((r) => r.have < r.min);

  return {
    total: qs.length,
    duplicateIds: [...idCounts].filter(([, n]) => n > 1).map(([id]) => id),
    duplicateSlugs: [...slugCounts].filter(([, n]) => n > 1).map(([s]) => s),
    categoryShortfalls,
    missingAudience,
    missingCategory,
    missingIntent,
    missingFreshness,
    highRiskWithoutEvidence,
    highRiskWithoutSource,
    indexableButNotReady,
    nearDuplicatesWithoutCluster,
    localeStatusIncomplete,
    emptyQuestionText,
    slugNotKebab,
    localeKeyLeakInText,
  };
}

export function localizedPageFloor(): number {
  return ANSWER_QUESTIONS.length * ANSWER_ENGINE_LOCALES.length;
}

export { CANONICAL_QUESTION_MINIMUM, CATEGORY_MIN, ANSWER_ENGINE_LOCALES };
