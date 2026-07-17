/**
 * Multilingual Answer Engine — canonical data contract (Wave 0).
 *
 * The ONE canonical shape for a labour-market answer-engine question. This is a
 * REGISTRY + TAXONOMY contract only — Wave 0 stores canonical questions and their
 * classification/status; it does NOT store the localized answer BODIES (those are
 * later waves) and it publishes NOTHING (no route, no sitemap entry, no indexing).
 *
 * Storage rationale: kept as typed data OUTSIDE messages/*.json (like
 * lib/seo/profession-problem-content.ts + lib/seo/metadata.ts) so the 550-question
 * set has zero i18n-debt / 11-file-parity coupling. It REFERENCES the single
 * canonical taxonomy (49 profession slugs, 152 skill slugs) — it never defines a
 * second professions/skills system.
 *
 * Active public locales are the source of truth in lib/i18n/config.ts
 * (lt, en, ru, nl, de). Every per-locale status map covers exactly those 5.
 */
import { activeLocales, type ActiveLocale } from "@/lib/i18n/config";

export const ANSWER_ENGINE_LOCALES = activeLocales;

/** Content lifecycle. Indexing is allowed ONLY for READY_FOR_INDEX / PUBLISHED. */
export const CONTENT_STATES = [
  "DISCOVERED",
  "CLUSTERED",
  "DRAFT",
  "EVIDENCE_REQUIRED",
  "TRANSLATION_PENDING",
  "LOCAL_REVIEW_REQUIRED",
  "READY_FOR_INDEX",
  "PUBLISHED",
  "STALE",
  "RETIRED",
] as const;
export type ContentState = (typeof CONTENT_STATES)[number];

/** The only states a page may be indexed in. */
export const INDEXABLE_CONTENT_STATES: readonly ContentState[] = [
  "READY_FOR_INDEX",
  "PUBLISHED",
];

export const RISK_LEVELS = ["LOW", "MEDIUM", "HIGH"] as const;
export type RiskLevel = (typeof RISK_LEVELS)[number];

/**
 * High-risk topics (owner + legal sensitive). A HIGH-risk question may never be
 * indexed without real sources, country scope, a date, a review status and human
 * confirmation (enforced by the high-risk policy + guards).
 */
export const HIGH_RISK_TOPICS = [
  "labour_law",
  "migration",
  "visas",
  "taxes",
  "salaries",
  "social_security",
  "safety",
  "discrimination",
  "licensed_professions",
  "personal_data",
] as const;
export type HighRiskTopic = (typeof HIGH_RISK_TOPICS)[number];

export const SEARCH_INTENTS = [
  "informational",
  "navigational",
  "commercial",
  "transactional",
] as const;
export type SearchIntent = (typeof SEARCH_INTENTS)[number];

export const FUNNEL_STAGES = [
  "awareness",
  "consideration",
  "decision",
  "retention",
] as const;
export type FunnelStage = (typeof FUNNEL_STAGES)[number];

export const FRESHNESS_CLASSES = ["evergreen", "slow", "volatile"] as const;
export type FreshnessClass = (typeof FRESHNESS_CLASSES)[number];

export const EVIDENCE_STATUSES = [
  "NONE_REQUIRED",
  "EVIDENCE_REQUIRED",
  "EVIDENCE_PROVIDED",
] as const;
export type EvidenceStatus = (typeof EVIDENCE_STATUSES)[number];

/** Per-locale translation status. Wave 0: all TRANSLATION_PENDING (no bodies). */
export const TRANSLATION_STATUSES = [
  "TRANSLATION_PENDING",
  "MACHINE_DRAFT",
  "LOCAL_REVIEW_REQUIRED",
  "HUMAN_APPROVED",
] as const;
export type TranslationStatus = (typeof TRANSLATION_STATUSES)[number];

/** Per-locale indexing status. Wave 0: all NOT_READY (nothing published). */
export const INDEXING_STATUSES = ["NOT_READY", "READY_FOR_INDEX", "PUBLISHED"] as const;
export type IndexingStatus = (typeof INDEXING_STATUSES)[number];

/** Audiences a question serves. Not a sector taxonomy — who is asking. */
export const ANSWER_AUDIENCES = [
  "worker",
  "job_seeker",
  "freelancer",
  "student",
  "graduate",
  "career_changer",
  "reskiller",
  "employer",
  "company",
  "team",
  "project_owner",
  "agency",
  "education_institution",
  "partner",
] as const;
export type AnswerAudience = (typeof ANSWER_AUDIENCES)[number];

/** The 16 canonical categories + their minimum question counts (sum = 550). */
export const ANSWER_CATEGORIES = [
  { key: "job_search_discovery", min: 55 },
  { key: "cv_profile_experience", min: 40 },
  { key: "skills_competencies", min: 45 },
  { key: "professions_directions", min: 45 },
  { key: "career_change_transferable", min: 35 },
  { key: "reskilling_learning", min: 35 },
  { key: "salary_conditions", min: 35 },
  { key: "working_in_eu_countries", min: 45 },
  { key: "international_regional_mobility", min: 25 },
  { key: "employers_finding_workers", min: 45 },
  { key: "companies_teams_projects", min: 25 },
  { key: "students_graduates_institutions", min: 25 },
  { key: "agencies_partners", min: 15 },
  { key: "labour_market_data_trends", min: 20 },
  { key: "ai_automation_future", min: 20 },
  { key: "platform_usage_security_privacy", min: 40 },
] as const;
export type AnswerCategoryKey = (typeof ANSWER_CATEGORIES)[number]["key"];

export const ANSWER_CATEGORY_KEYS = ANSWER_CATEGORIES.map((c) => c.key) as readonly AnswerCategoryKey[];
export const CATEGORY_MIN: Readonly<Record<AnswerCategoryKey, number>> = Object.fromEntries(
  ANSWER_CATEGORIES.map((c) => [c.key, c.min]),
) as Record<AnswerCategoryKey, number>;

/** The canonical minimum number of distinct questions (per spec: >= 500). */
export const CANONICAL_QUESTION_MINIMUM = 500;

/** A source reference — real only. Never a fabricated citation. */
export interface SourceReference {
  /** eu_framework | official_authority | product_capability | internal_taxonomy | none */
  readonly type: string;
  readonly id: string;
  readonly url?: string;
}

export type LocaleStatusMap<T extends string> = Readonly<Record<ActiveLocale, T>>;

/** The canonical answer-engine question. */
export interface CanonicalQuestion {
  readonly canonicalQuestionId: string;
  readonly canonicalQuestion: string;
  readonly category: AnswerCategoryKey;
  readonly subcategory: string;
  readonly audiences: readonly AnswerAudience[];
  readonly searchIntent: SearchIntent;
  readonly funnelStage: FunnelStage;
  readonly applicableCountries: readonly string[]; // ISO-3166-1 alpha-2 lowercase; [] = all/none
  readonly applicableProfessions: readonly string[]; // canonical profession slugs (snake_case)
  readonly applicableSkills: readonly string[]; // canonical skill slugs (kebab-case)
  readonly applicableEducationLevels: readonly string[];
  readonly riskLevel: RiskLevel;
  readonly highRiskTopics: readonly HighRiskTopic[];
  readonly freshnessClass: FreshnessClass;
  readonly evidenceStatus: EvidenceStatus;
  readonly sourceReferences: readonly SourceReference[];
  readonly relatedQuestionIds: readonly string[];
  readonly relatedProductCapability: string;
  readonly translationStatusByLocale: LocaleStatusMap<TranslationStatus>;
  readonly indexingStatusByLocale: LocaleStatusMap<IndexingStatus>;
  readonly lastReviewedAt: string | null;
  readonly reviewOwner: string;
  readonly canonicalSlug: string;
  readonly localizedSlugs: Readonly<Record<string, string>>;
  readonly duplicateClusterId: string | null;
  readonly contentStatus: ContentState;
}

export const EDUCATION_LEVELS = [
  "any",
  "none",
  "secondary",
  "vocational",
  "higher",
  "postgraduate",
] as const;
