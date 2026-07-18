/**
 * Answer Engine — PUBLIC QUESTION RESEARCH signals (editorial-only).
 *
 * This is NOT a second canonical registry and it is NEVER rendered on a public
 * page. It records ANONYMISED signals about which questions real people ask in
 * PUBLIC sources, used only to prioritise + refine the existing 550-question
 * canonical registry. Every entry maps (or is rejected) against an existing
 * canonical id — new canonical ids are created only when no existing question
 * fits.
 *
 * PRIVACY (hard rule): store only a normalised, generalised question form and
 * coarse signal metadata. NEVER store a username, profile URL, email, phone,
 * an identifying workplace, a personal story, special-category data, or a long
 * verbatim copy of any user's post. `discoverySourceUrl` is kept for editorial
 * traceability only and is NOT the factual authority for any answer — factual
 * claims are backed by official `evidenceSources` on the answer itself.
 *
 * Discovery sources (here) and answer-evidence sources (on the answers) are two
 * separate layers by design: a forum thread may reveal that a question matters,
 * but only an official/primary source may back the answer's factual claims.
 */

export type DiscoverySourceType =
  | "search_related" // Google/Bing related searches / autocomplete question forms
  | "people_also_ask" // "People also ask"-style question boxes
  | "official_faq" // official institution help-centre / FAQ topics
  | "forum_thread" // public forum discussion (e.g. Reddit) — discovery only
  | "qa_site" // public Q&A site (e.g. Quora / Stack Exchange)
  | "community"; // other public professional community discussion

export interface PublicQuestionSignal {
  /** Anonymised, generalised question form (NOT a user's verbatim text). <=200 chars. */
  readonly normalizedQuestion: string;
  /** Existing canonical category key this signal belongs to. */
  readonly category: string;
  /** Coarse audience label. */
  readonly audience: "worker" | "job_seeker" | "student" | "career_changer" | "employer" | "any";
  /** Kind of public source the signal was observed in. */
  readonly discoverySourceType: DiscoverySourceType;
  /** Public source URL — editorial traceability only, never rendered publicly. */
  readonly discoverySourceUrl: string;
  /** Public source page/topic title (no personal data). */
  readonly discoverySourceTitle: string;
  /** ISO date the signal was observed. */
  readonly discoveredAt: string;
  /** Language the public source used. */
  readonly sourceLanguage: string;
  /** Country/region context of the discussion ("EU" or ISO code or "unknown"). */
  readonly sourceCountryContext: string;
  /** Qualitative engagement/recurrence signal (never a fabricated exact number). */
  readonly engagementSignal:
    | "recurring-across-sources"
    | "high-thread-activity"
    | "official-identified-problem"
    | "single-source-weak";
  /** Cluster id grouping duplicate/near-duplicate intents. */
  readonly duplicateClusterId: string;
  /** Canonical id selected for publication, or null when not (yet) selected. */
  readonly selectedCanonicalId: string | null;
  /** Reason a signal was NOT selected (null when selected). */
  readonly rejectionReason: string | null;
}

const OBSERVED = "2026-07-18";

export const PUBLIC_QUESTION_SIGNALS: readonly PublicQuestionSignal[] = [
  // ── EU mobility / rights (official-source-backed) ─────────────────────────
  {
    normalizedQuestion: "Do EU citizens need a work permit to work in another EU country?",
    category: "international_regional_mobility",
    audience: "worker",
    discoverySourceType: "official_faq",
    discoverySourceUrl: "https://europa.eu/youreurope/citizens/work/work-abroad/work-permits/index_en.htm",
    discoverySourceTitle: "Work permits — Your Europe",
    discoveredAt: OBSERVED,
    sourceLanguage: "en",
    sourceCountryContext: "EU",
    engagementSignal: "recurring-across-sources",
    duplicateClusterId: "cluster-free-movement",
    selectedCanonicalId: "AE-0336",
    rejectionReason: null,
  },
  {
    normalizedQuestion: "Do I need my professional qualification recognised to work in another EU country?",
    category: "international_regional_mobility",
    audience: "worker",
    discoverySourceType: "official_faq",
    discoverySourceUrl: "https://europa.eu/youreurope/citizens/work/professional-qualifications/index_en.htm",
    discoverySourceTitle: "Professional qualifications — Your Europe",
    discoveredAt: OBSERVED,
    sourceLanguage: "en",
    sourceCountryContext: "EU",
    engagementSignal: "recurring-across-sources",
    duplicateClusterId: "cluster-qualification-recognition",
    selectedCanonicalId: "AE-0349",
    rejectionReason: null,
  },
  {
    normalizedQuestion: "Which countries in Europe most need my profession right now?",
    category: "international_regional_mobility",
    audience: "worker",
    discoverySourceType: "search_related",
    discoverySourceUrl: "https://eures.europa.eu/living-and-working/labour-shortages-and-surpluses-europe_en",
    discoverySourceTitle: "Labour shortages and surpluses in Europe — EURES",
    discoveredAt: OBSERVED,
    sourceLanguage: "en",
    sourceCountryContext: "EU",
    engagementSignal: "official-identified-problem",
    duplicateClusterId: "cluster-country-demand",
    selectedCanonicalId: "AE-0350",
    rejectionReason: null,
  },
  {
    normalizedQuestion: "Which professions are in demand in the country where I want to work?",
    category: "labour_market_data_trends",
    audience: "any",
    discoverySourceType: "search_related",
    discoverySourceUrl: "https://www.cedefop.europa.eu/en/tools/skills-online-vacancies/ela-eures/demand-occupations",
    discoverySourceTitle: "Demand for occupations — EURES / CEDEFOP",
    discoveredAt: OBSERVED,
    sourceLanguage: "en",
    sourceCountryContext: "EU",
    engagementSignal: "official-identified-problem",
    duplicateClusterId: "cluster-country-demand",
    selectedCanonicalId: "AE-0481",
    rejectionReason: null,
  },
  {
    normalizedQuestion: "Why is job demand so different from one European country to another?",
    category: "labour_market_data_trends",
    audience: "any",
    discoverySourceType: "official_faq",
    discoverySourceUrl: "https://www.cedefop.europa.eu/en/news/skill-shortages-europe-which-occupations-are-demand-and-why",
    discoverySourceTitle: "Skill shortages in Europe: which occupations are in demand — CEDEFOP",
    discoveredAt: OBSERVED,
    sourceLanguage: "en",
    sourceCountryContext: "EU",
    engagementSignal: "official-identified-problem",
    duplicateClusterId: "cluster-country-demand-why",
    selectedCanonicalId: "AE-0480",
    rejectionReason: null,
  },
  {
    normalizedQuestion: "Do I need to speak Dutch to work in the Netherlands?",
    category: "working_in_eu_countries",
    audience: "worker",
    discoverySourceType: "search_related",
    discoverySourceUrl: "https://eures.europa.eu/living-and-working/living-and-working-conditions_en",
    discoverySourceTitle: "Living and working conditions — EURES",
    discoveredAt: OBSERVED,
    sourceLanguage: "en",
    sourceCountryContext: "NL",
    engagementSignal: "recurring-across-sources",
    duplicateClusterId: "cluster-language-nl",
    selectedCanonicalId: "AE-0321",
    rejectionReason: null,
  },
  // ── Job-search / CV / skills (real forum demand, editorial answers) ───────
  {
    normalizedQuestion: "How do I find work when I have no formal qualifications?",
    category: "job_search_discovery",
    audience: "job_seeker",
    discoverySourceType: "forum_thread",
    discoverySourceUrl: "https://www.reddit.com/r/jobs/",
    discoverySourceTitle: "Public jobseeker forum — recurring 'no experience / no qualifications' topic",
    discoveredAt: OBSERVED,
    sourceLanguage: "en",
    sourceCountryContext: "unknown",
    engagementSignal: "high-thread-activity",
    duplicateClusterId: "cluster-no-qualifications",
    selectedCanonicalId: "AE-0043",
    rejectionReason: null,
  },
  {
    normalizedQuestion: "How do I explain a gap in my work history honestly?",
    category: "cv_profile_experience",
    audience: "job_seeker",
    discoverySourceType: "forum_thread",
    discoverySourceUrl: "https://www.reddit.com/r/jobs/",
    discoverySourceTitle: "Public jobseeker forum — recurring 'career gap' topic",
    discoveredAt: OBSERVED,
    sourceLanguage: "en",
    sourceCountryContext: "unknown",
    engagementSignal: "recurring-across-sources",
    duplicateClusterId: "cluster-career-gap",
    selectedCanonicalId: "AE-0090",
    rejectionReason: null,
  },
  {
    normalizedQuestion: "Which of my skills can I take into a completely different job?",
    category: "career_change_transferable",
    audience: "career_changer",
    discoverySourceType: "qa_site",
    discoverySourceUrl: "https://www.quora.com/",
    discoverySourceTitle: "Public Q&A — recurring 'transferable skills' topic",
    discoveredAt: OBSERVED,
    sourceLanguage: "en",
    sourceCountryContext: "unknown",
    engagementSignal: "recurring-across-sources",
    duplicateClusterId: "cluster-transferable-skills",
    selectedCanonicalId: "AE-0208",
    rejectionReason: null,
  },
  {
    normalizedQuestion: "Does hands-on experience count as much as a formal qualification?",
    category: "skills_competencies",
    audience: "worker",
    discoverySourceType: "forum_thread",
    discoverySourceUrl: "https://www.reddit.com/r/careerguidance/",
    discoverySourceTitle: "Public career forum — 'experience vs qualifications' topic",
    discoveredAt: OBSERVED,
    sourceLanguage: "en",
    sourceCountryContext: "unknown",
    engagementSignal: "recurring-across-sources",
    duplicateClusterId: "cluster-experience-vs-formal",
    selectedCanonicalId: "AE-0123",
    rejectionReason: null,
  },
  {
    normalizedQuestion: "How should I show a diploma or certificate on my profile?",
    category: "students_graduates_institutions",
    audience: "student",
    discoverySourceType: "search_related",
    discoverySourceUrl: "https://europass.europa.eu/en",
    discoverySourceTitle: "Europass — presenting qualifications (related-search topic)",
    discoveredAt: OBSERVED,
    sourceLanguage: "en",
    sourceCountryContext: "EU",
    engagementSignal: "recurring-across-sources",
    duplicateClusterId: "cluster-present-diploma",
    selectedCanonicalId: "AE-0438",
    rejectionReason: null,
  },
  {
    normalizedQuestion: "How do I avoid spending time learning skills nobody is hiring for?",
    category: "reskilling_learning",
    audience: "career_changer",
    discoverySourceType: "forum_thread",
    discoverySourceUrl: "https://www.reddit.com/r/careerguidance/",
    discoverySourceTitle: "Public career forum — 'learning in-demand skills' topic",
    discoveredAt: OBSERVED,
    sourceLanguage: "en",
    sourceCountryContext: "unknown",
    engagementSignal: "recurring-across-sources",
    duplicateClusterId: "cluster-learn-in-demand",
    selectedCanonicalId: "AE-0242",
    rejectionReason: null,
  },
  // ── Rejected signals (kept for the audit trail) ───────────────────────────
  {
    normalizedQuestion: "How do I say when I am available to start?",
    category: "job_search_discovery",
    audience: "job_seeker",
    discoverySourceType: "search_related",
    discoverySourceUrl: "https://eures.europa.eu/index_en",
    discoverySourceTitle: "Availability / start-date related search",
    discoveredAt: OBSERVED,
    sourceLanguage: "en",
    sourceCountryContext: "EU",
    engagementSignal: "single-source-weak",
    duplicateClusterId: "cluster-availability",
    selectedCanonicalId: null,
    rejectionReason: "duplicate-cluster: covered by published pilot AE-0001 (getting started)",
  },
  {
    normalizedQuestion: "Exactly how much can I earn in [country] doing [job]?",
    category: "salary_conditions",
    audience: "worker",
    discoverySourceType: "forum_thread",
    discoverySourceUrl: "https://www.reddit.com/r/eupersonalfinance/",
    discoverySourceTitle: "Public forum — country/role pay expectation topic",
    discoveredAt: OBSERVED,
    sourceLanguage: "en",
    sourceCountryContext: "unknown",
    engagementSignal: "high-thread-activity",
    duplicateClusterId: "cluster-exact-salary",
    selectedCanonicalId: null,
    rejectionReason: "too-risky: exact-salary claim needs verified per-country primary data not yet sourced (defer to a later evidence-backed wave)",
  },
  {
    normalizedQuestion: "Which visa do I need to work in Europe as a non-EU citizen?",
    category: "working_in_eu_countries",
    audience: "worker",
    discoverySourceType: "search_related",
    discoverySourceUrl: "https://europa.eu/youreurope/citizens/work/work-abroad/work-permits/index_en.htm",
    discoverySourceTitle: "Non-EU work permit / visa related search",
    discoveredAt: OBSERVED,
    sourceLanguage: "en",
    sourceCountryContext: "EU",
    engagementSignal: "recurring-across-sources",
    duplicateClusterId: "cluster-non-eu-visa",
    selectedCanonicalId: null,
    rejectionReason: "too-risky: HIGH-risk immigration/visa advice; needs per-country official scope + owner review before publishing",
  },
];
