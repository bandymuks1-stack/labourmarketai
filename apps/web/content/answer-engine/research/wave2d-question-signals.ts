/**
 * Answer Engine — PUBLIC QUESTION RESEARCH signals, Wave 2D (editorial-only).
 *
 * Same doctrine as public-question-signals.ts: anonymised discovery signals
 * only, never rendered, used solely to prioritise the existing 550-question
 * canonical registry. This wave uses the richer Wave 2D discovery contract
 * (adds canonicalQuestionId + a selectionStatus enum). NO personal data: no
 * usernames, profile URLs, emails, phones, or long verbatim forum text — only a
 * normalised, generalised question form and coarse signal metadata.
 *
 * Discovery sources (forums, search, FAQ topics) reveal WHAT to answer; the
 * factual authority for an answer is always an official evidence source set on
 * the answer itself (see wave2d-answers.ts). A forum is never an evidence source.
 */

export type DiscoverySourceType =
  | "search_related"
  | "people_also_ask"
  | "official_faq"
  | "forum_thread"
  | "qa_site"
  | "community";

export type SelectionStatus =
  | "SELECTED"
  | "MAPPED_EXISTING"
  | "DUPLICATE"
  | "DEFERRED_RISK"
  | "REJECTED_PRIVACY"
  | "REJECTED_LOW_SIGNAL"
  | "REJECTED_OUT_OF_SCOPE";

export interface Wave2DQuestionSignal {
  /** Canonical id this signal maps to (existing registry id), or null when unmapped. */
  readonly canonicalQuestionId: string | null;
  /** Anonymised generalised question form (NOT verbatim user text). <=200 chars. */
  readonly normalizedQuestion: string;
  /** Kind of public source the signal was observed in. */
  readonly sourceType: DiscoverySourceType;
  /** Public source URL — editorial traceability only, never rendered publicly. */
  readonly sourceUrl: string;
  /** Language of the public source. */
  readonly sourceLanguage: string;
  /** Country/region context ("EU" | ISO code | "unknown"). */
  readonly sourceCountryContext: string;
  /** ISO date the signal was observed. */
  readonly observedAt: string;
  /** Qualitative recurrence/activity signal (never a fabricated exact count). */
  readonly engagementSignal:
    | "recurring-across-sources"
    | "high-thread-activity"
    | "official-identified-problem"
    | "single-source-weak";
  /** Cluster id grouping duplicate/near-duplicate intents. */
  readonly duplicateClusterId: string;
  /** What happened to this signal. */
  readonly selectionStatus: SelectionStatus;
  /** Human-readable reason for the selection status. */
  readonly selectionReason: string;
}

const OBSERVED = "2026-07-18";

export const WAVE2D_QUESTION_SIGNALS: readonly Wave2DQuestionSignal[] = [
  {
    canonicalQuestionId: "AE-0008",
    normalizedQuestion: "How do I get noticed by employers / make my profile visible?",
    sourceType: "forum_thread",
    sourceUrl: "https://www.reddit.com/r/jobs/",
    sourceLanguage: "en",
    sourceCountryContext: "unknown",
    observedAt: OBSERVED,
    engagementSignal: "high-thread-activity",
    duplicateClusterId: "cluster-visibility",
    selectionStatus: "MAPPED_EXISTING",
    selectionReason: "recurring 'how to get noticed' demand maps to profile-visibility question",
  },
  {
    canonicalQuestionId: "AE-0011",
    normalizedQuestion: "Why am I not hearing back / how do I know if an employer is interested?",
    sourceType: "search_related",
    sourceUrl: "https://www.flexjobs.com/blog/post/not-hearing-from-employers-applications-heres",
    sourceLanguage: "en",
    sourceCountryContext: "unknown",
    observedAt: OBSERVED,
    engagementSignal: "recurring-across-sources",
    duplicateClusterId: "cluster-no-response",
    selectionStatus: "MAPPED_EXISTING",
    selectionReason: "very common 'no response to applications' pain maps to employer-interest signalling",
  },
  {
    canonicalQuestionId: "AE-0058",
    normalizedQuestion: "How do I build a work profile from scratch?",
    sourceType: "search_related",
    sourceUrl: "https://europass.europa.eu/en/create-europass-cv",
    sourceLanguage: "en",
    sourceCountryContext: "EU",
    observedAt: OBSERVED,
    engagementSignal: "recurring-across-sources",
    duplicateClusterId: "cluster-build-profile",
    selectionStatus: "MAPPED_EXISTING",
    selectionReason: "profile/CV creation is a persistent how-to search",
  },
  {
    canonicalQuestionId: "AE-0063",
    normalizedQuestion: "How do I turn my past work experience into a profile?",
    sourceType: "qa_site",
    sourceUrl: "https://www.quora.com/",
    sourceLanguage: "en",
    sourceCountryContext: "unknown",
    observedAt: OBSERVED,
    engagementSignal: "recurring-across-sources",
    duplicateClusterId: "cluster-experience-to-profile",
    selectionStatus: "MAPPED_EXISTING",
    selectionReason: "translating experience into a profile is a recurring practical question",
  },
  {
    canonicalQuestionId: "AE-0104",
    normalizedQuestion: "How do I prove my skills to an employer?",
    sourceType: "forum_thread",
    sourceUrl: "https://www.reddit.com/r/careerguidance/",
    sourceLanguage: "en",
    sourceCountryContext: "unknown",
    observedAt: OBSERVED,
    engagementSignal: "recurring-across-sources",
    duplicateClusterId: "cluster-prove-skills",
    selectionStatus: "MAPPED_EXISTING",
    selectionReason: "'how to prove skills' maps to manager confirmation of skills",
  },
  {
    canonicalQuestionId: "AE-0106",
    normalizedQuestion: "Can I keep my profile / skills private from employers?",
    sourceType: "search_related",
    sourceUrl: "https://www.reddit.com/r/jobs/",
    sourceLanguage: "en",
    sourceCountryContext: "unknown",
    observedAt: OBSERVED,
    engagementSignal: "recurring-across-sources",
    duplicateClusterId: "cluster-privacy",
    selectionStatus: "MAPPED_EXISTING",
    selectionReason: "privacy-from-current-employer concern is common; maps to default-private skills",
  },
  {
    canonicalQuestionId: "AE-0189",
    normalizedQuestion: "How do I use my current skills to move into a new profession?",
    sourceType: "forum_thread",
    sourceUrl: "https://www.reddit.com/r/careerguidance/",
    sourceLanguage: "en",
    sourceCountryContext: "unknown",
    observedAt: OBSERVED,
    engagementSignal: "recurring-across-sources",
    duplicateClusterId: "cluster-use-skills-new-field",
    selectionStatus: "MAPPED_EXISTING",
    selectionReason: "career-change-with-existing-skills is a high-volume theme",
  },
  {
    canonicalQuestionId: "AE-0196",
    normalizedQuestion: "How do I move from a manual/physical role into an office role?",
    sourceType: "forum_thread",
    sourceUrl: "https://www.reddit.com/r/careerguidance/",
    sourceLanguage: "en",
    sourceCountryContext: "unknown",
    observedAt: OBSERVED,
    engagementSignal: "recurring-across-sources",
    duplicateClusterId: "cluster-manual-to-office",
    selectionStatus: "MAPPED_EXISTING",
    selectionReason: "manual-to-desk transition is a distinct, recurring career-change intent",
  },
  {
    canonicalQuestionId: "AE-0239",
    normalizedQuestion: "How do I plan reskilling if I also want to change countries / compare my qualification level?",
    sourceType: "search_related",
    sourceUrl: "https://europass.europa.eu/en/compare-qualifications",
    sourceLanguage: "en",
    sourceCountryContext: "EU",
    observedAt: OBSERVED,
    engagementSignal: "official-identified-problem",
    duplicateClusterId: "cluster-reskill-cross-border",
    selectionStatus: "MAPPED_EXISTING",
    selectionReason: "EQF / compare-qualifications is an official-identified cross-border need",
  },
  {
    canonicalQuestionId: "AE-0224",
    normalizedQuestion: "Which skills should I learn next to stay employable?",
    sourceType: "search_related",
    sourceUrl: "https://www.cedefop.europa.eu/en/tools/skills-intelligence",
    sourceLanguage: "en",
    sourceCountryContext: "EU",
    observedAt: OBSERVED,
    engagementSignal: "official-identified-problem",
    duplicateClusterId: "cluster-what-to-learn",
    selectionStatus: "MAPPED_EXISTING",
    selectionReason: "'which skills to learn' is a top reskilling query with official demand data",
  },
  {
    canonicalQuestionId: "AE-0363",
    normalizedQuestion: "How do I describe the role or type of work I need as an employer?",
    sourceType: "community",
    sourceUrl: "https://eures.europa.eu/employers_en",
    sourceLanguage: "en",
    sourceCountryContext: "EU",
    observedAt: OBSERVED,
    engagementSignal: "recurring-across-sources",
    duplicateClusterId: "cluster-describe-need",
    selectionStatus: "MAPPED_EXISTING",
    selectionReason: "small employers repeatedly ask how to phrase what they need",
  },
  {
    canonicalQuestionId: "AE-0370",
    normalizedQuestion: "What happens after I submit a work need / job posting?",
    sourceType: "search_related",
    sourceUrl: "https://eures.europa.eu/employers_en",
    sourceLanguage: "en",
    sourceCountryContext: "EU",
    observedAt: OBSERVED,
    engagementSignal: "recurring-across-sources",
    duplicateClusterId: "cluster-after-posting",
    selectionStatus: "MAPPED_EXISTING",
    selectionReason: "employers want to know the post-submission flow before committing",
  },
  {
    canonicalQuestionId: "AE-0434",
    normalizedQuestion: "How do I find my first job as a student/graduate with no experience?",
    sourceType: "forum_thread",
    sourceUrl: "https://www.reddit.com/r/GetEmployed/",
    sourceLanguage: "en",
    sourceCountryContext: "unknown",
    observedAt: OBSERVED,
    engagementSignal: "high-thread-activity",
    duplicateClusterId: "cluster-first-job",
    selectionStatus: "MAPPED_EXISTING",
    selectionReason: "first-job-no-experience is one of the highest-volume graduate topics",
  },
  {
    canonicalQuestionId: "AE-0413",
    normalizedQuestion: "How do I represent a real work team or crew as a company?",
    sourceType: "community",
    sourceUrl: "https://eures.europa.eu/employers_en",
    sourceLanguage: "en",
    sourceCountryContext: "EU",
    observedAt: OBSERVED,
    engagementSignal: "recurring-across-sources",
    duplicateClusterId: "cluster-represent-team",
    selectionStatus: "MAPPED_EXISTING",
    selectionReason: "small firms ask how to present an existing crew, not just individuals",
  },
  {
    canonicalQuestionId: "AE-0499",
    normalizedQuestion: "Will automation / AI affect my profession, and how?",
    sourceType: "people_also_ask",
    sourceUrl: "https://www.cedefop.europa.eu/en/tools/skills-intelligence",
    sourceLanguage: "en",
    sourceCountryContext: "EU",
    observedAt: OBSERVED,
    engagementSignal: "official-identified-problem",
    duplicateClusterId: "cluster-automation-impact",
    selectionStatus: "MAPPED_EXISTING",
    selectionReason: "'will AI replace my job' is a top future-of-work query; official skills data applies",
  },
  // ── Not selected (audit trail) ─────────────────────────────────────────────
  {
    canonicalQuestionId: null,
    normalizedQuestion: "What is the exact salary for [role] in [country]?",
    sourceType: "forum_thread",
    sourceUrl: "https://www.reddit.com/r/eupersonalfinance/",
    sourceLanguage: "en",
    sourceCountryContext: "unknown",
    observedAt: OBSERVED,
    engagementSignal: "high-thread-activity",
    duplicateClusterId: "cluster-exact-salary",
    selectionStatus: "DEFERRED_RISK",
    selectionReason: "exact-salary figure needs verified per-country primary data; forbidden this wave",
  },
  {
    canonicalQuestionId: null,
    normalizedQuestion: "Which residence permit / visa do I need for [country]?",
    sourceType: "search_related",
    sourceUrl: "https://europa.eu/youreurope/citizens/residence/index_en.htm",
    sourceLanguage: "en",
    sourceCountryContext: "EU",
    observedAt: OBSERVED,
    engagementSignal: "recurring-across-sources",
    duplicateClusterId: "cluster-residence-visa",
    selectionStatus: "DEFERRED_RISK",
    selectionReason: "individual residence/visa decisions are HIGH-risk; require per-country official scope + owner review",
  },
  {
    canonicalQuestionId: null,
    normalizedQuestion: "How much income tax will I pay in [country]?",
    sourceType: "forum_thread",
    sourceUrl: "https://www.reddit.com/r/eupersonalfinance/",
    sourceLanguage: "en",
    sourceCountryContext: "unknown",
    observedAt: OBSERVED,
    engagementSignal: "high-thread-activity",
    duplicateClusterId: "cluster-income-tax",
    selectionStatus: "DEFERRED_RISK",
    selectionReason: "tax rates are volatile national figures; forbidden this wave without verified national sources",
  },
  {
    canonicalQuestionId: null,
    normalizedQuestion: "How does the platform help me find work?",
    sourceType: "search_related",
    sourceUrl: "https://eures.europa.eu/index_en",
    sourceLanguage: "en",
    sourceCountryContext: "EU",
    observedAt: OBSERVED,
    engagementSignal: "recurring-across-sources",
    duplicateClusterId: "cluster-how-it-helps",
    selectionStatus: "DUPLICATE",
    selectionReason: "already published as AE-0002 (Wave 2B); no new canonical needed",
  },
];
