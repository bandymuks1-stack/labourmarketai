/**
 * Cost-aware AI task routing — PURE policy core (Labour Market OS, P8–P9).
 *
 * Every internal agent run is routed by TASK, not by hard-coded model id.
 * A task policy declares what the task may see (data minimisation), what it
 * must produce (strict schema), how much it may cost, and which model TIER it
 * runs on. Tiers map to model ALIASES (./model-candidates.ts) —
 * product code never carries a raw model id (guard: ai-task-routing).
 *
 * Binding routing rules (docs/product/cost-aware-ai-task-routing-contract-v1.md):
 *   - Deterministic-first: capacity/skill gap detection is computed by the
 *     pure workforce models, never an LLM (tier "deterministic", no model).
 *   - Always start at the policy's preferredTier. The max model is NEVER a
 *     default (no policy may prefer "advanced"/"high_risk_verified" unless it
 *     is riskLevel "high" — and a high-risk policy must also require human
 *     review; enforced by task-routing.test.ts).
 *   - Escalate ONE tier only, and only on a condition the policy lists.
 *   - Cost ceiling → blocked "cost_ceiling", evaluated on the tier that will
 *     ACTUALLY run (after escalation/fallback) and priced by this layer from
 *     the token SIZE the caller supplies — call sites never know the model.
 *     A run over budget NEVER silently proceeds. A model with no
 *     owner-reviewed price makes the ceiling uncheckable → blocked
 *     "cost_unpriced" rather than unbounded spend.
 *   - Provider-failure fallback may go DOWN a tier only with
 *     fallbackApplied=true and an honest reason — no silent quality drop.
 *   - The "high_risk_verified" tier requires a pre-run human confirmation
 *     flow that does NOT exist yet → any route resolving there is blocked
 *     "needs_human_confirmation" (honest inert seam, no fake approval).
 *
 * Audit-record persistence: {@link buildRoutingAuditRecord} stays the PURE
 * builder; the server boundary (run-agent-server.ts → runtime/audit-store.ts)
 * persists the record best-effort into the `ai_runs` table. That table IS
 * APPLIED in production (verified 2026-08-19: 27 columns, matching the
 * audit-store writer); the earlier note here calling it an unapplied gated
 * draft was stale and misled readers into thinking telemetry had nowhere to
 * land. Persistence still fails soft, so a logging outage never breaks a run.
 *
 * Pure. No server-only, no env, no IO, no fetch.
 */
import { AI_MODEL_CANDIDATES } from "./model-candidates";
import { estimateCostUsd } from "./model-pricing";
import type { AiRuntimeConfig } from "./config-core";
import type { AiAgentKey } from "../registry/types";

// ── Task + tier vocabulary ──────────────────────────────────────────────────

export const AI_TASK_TYPES = [
  "structure_future_work",
  "derive_workforce_requirements",
  "normalize_work_scope",
  "detect_capacity_gap",
  "detect_skill_gap",
  "normalize_external_profile",
  "extract_cv",
  "explain_match",
  "translate_message",
  "draft_follow_up",
] as const;
export type AiTaskType = (typeof AI_TASK_TYPES)[number];

export const AI_MODEL_TIERS = [
  "deterministic",
  "low_cost",
  "standard",
  "advanced",
  "high_risk_verified",
] as const;
export type AiModelTier = (typeof AI_MODEL_TIERS)[number];

export type EscalationReason =
  | "low_confidence"
  | "schema_invalid"
  | "contradicts_sources"
  | "quality_below_threshold"
  | "human_requested_depth";

export type AiTaskRiskLevel = "low" | "medium" | "high";

/** Model alias per tier — an ALIAS, never a raw model id in product code. */
export type AiModelAlias = "haiku" | "sonnet" | "opus";

export const TIER_MODEL_ALIAS: Record<AiModelTier, AiModelAlias | null> = {
  deterministic: null, // pure workforce models — no LLM call at all
  low_cost: "haiku",
  standard: "sonnet",
  advanced: "opus",
  high_risk_verified: "opus", // opus + second-model review + human confirmation
};

/** Providers with a per-alias candidate table (AI_MODEL_CANDIDATES keys). */
export type AiModelProvider = "anthropic" | "openai" | "gemini" | "xai";

/** Alias → concrete model id. The ONLY alias→id mapping outside config-core.
 *  Defaults to anthropic; a live non-anthropic primary provider resolves its
 *  own candidate for the SAME tier alias (cheapest-sufficient is preserved). */
export function modelIdForAlias(
  alias: AiModelAlias,
  provider: AiModelProvider = "anthropic",
): string {
  return AI_MODEL_CANDIDATES[provider][alias];
}

// ── Task policies ───────────────────────────────────────────────────────────

export interface AiTaskPolicy {
  readonly taskType: AiTaskType;
  readonly riskLevel: AiTaskRiskLevel;
  /** Field NAMES the task may receive — data minimisation contract. */
  readonly allowedFields: readonly string[];
  /** Field NAMES the task must NEVER receive. */
  readonly prohibitedFields: readonly string[];
  /** Name of the strict zod schema the output must satisfy (audit label). */
  readonly expectedSchema: string;
  /** Confidence threshold 0..1 below which the output needs review. */
  readonly minQuality: number;
  /** Hard per-run cost ceiling (USD). Over ceiling → blocked, never run. */
  readonly maxEstimatedCostUsd: number;
  /**
   * Output tokens this task is expected to produce. Half of the pre-run cost
   * estimate (the other half is the caller's input size), so the ceiling can
   * be evaluated BEFORE a provider is called rather than discovered after.
   * A budget without an expected output size is not checkable.
   */
  readonly expectedOutputTokens: number;
  readonly maxLatencyMs: number;
  readonly preferredTier: AiModelTier;
  /** Tier used on provider failure (surfaced via fallbackApplied). */
  readonly fallbackTier: AiModelTier;
  /** The ONLY conditions that may escalate this task one tier. */
  readonly escalationConditions: readonly EscalationReason[];
  readonly secondModelReview: boolean;
  /** Output requires explicit human review before it can be used/persisted. */
  readonly humanReview: boolean;
  /**
   * LANGUAGE as a routing dimension: a task-specific preferred provider
   * (e.g. DeepL for translation). The dispatcher tries it first WHEN
   * CONFIGURED and falls back to the LLM tier honestly — the preference here
   * is policy only; env gating lives in the provider adapter.
   */
  readonly languageRouting?: {
    readonly preferredProvider: "deepl";
  };
}

/** Fields no task in this program ever needs — always prohibited. */
const NEVER_NEEDED = [
  "address",
  "phone",
  "email",
  "exact_coordinates",
  "documents",
  "government_id",
  "payment_details",
] as const;

export const TASK_POLICIES: Record<AiTaskType, AiTaskPolicy> = {
  structure_future_work: {
    taskType: "structure_future_work",
    riskLevel: "medium",
    allowedFields: [
      "work_description",
      "role_hints",
      "timeframe",
      "headcount_hint",
      "region_hint",
      "locale",
    ],
    prohibitedFields: ["full_cv", ...NEVER_NEEDED],
    expectedSchema: "companyNeedOutputSchema",
    minQuality: 0.6,
    maxEstimatedCostUsd: 0.15,
    expectedOutputTokens: 900,
    maxLatencyMs: 30_000,
    preferredTier: "standard",
    fallbackTier: "low_cost",
    escalationConditions: ["low_confidence", "schema_invalid", "human_requested_depth"],
    secondModelReview: false,
    humanReview: true,
  },
  derive_workforce_requirements: {
    taskType: "derive_workforce_requirements",
    riskLevel: "medium",
    allowedFields: [
      "structured_work_scope",
      "role_requirements",
      "country_code",
      "timeframe",
      "locale",
    ],
    prohibitedFields: ["full_cv", ...NEVER_NEEDED],
    expectedSchema: "countryReadinessOutputSchema | documentAssistantOutputSchema",
    minQuality: 0.6,
    maxEstimatedCostUsd: 0.15,
    expectedOutputTokens: 900,
    maxLatencyMs: 30_000,
    preferredTier: "standard",
    fallbackTier: "low_cost",
    escalationConditions: ["low_confidence", "schema_invalid", "contradicts_sources"],
    secondModelReview: false,
    humanReview: false,
  },
  normalize_work_scope: {
    taskType: "normalize_work_scope",
    riskLevel: "low",
    allowedFields: ["scope_text", "journal_entry_text", "work_categories", "locale"],
    prohibitedFields: ["full_cv", ...NEVER_NEEDED],
    expectedSchema: "workJournalOutputSchema",
    minQuality: 0.55,
    maxEstimatedCostUsd: 0.05,
    expectedOutputTokens: 400,
    maxLatencyMs: 20_000,
    preferredTier: "low_cost",
    fallbackTier: "low_cost",
    escalationConditions: ["schema_invalid", "quality_below_threshold"],
    secondModelReview: false,
    humanReview: false,
  },
  detect_capacity_gap: {
    taskType: "detect_capacity_gap",
    riskLevel: "low",
    allowedFields: [
      "role_requirements",
      "headcount_plan",
      "capacity_records",
      "assignment_records",
    ],
    prohibitedFields: ["full_cv", ...NEVER_NEEDED],
    expectedSchema: "deterministic capacity-gap model output (pure workforce model)",
    minQuality: 1,
    maxEstimatedCostUsd: 0,
    expectedOutputTokens: 0,
    maxLatencyMs: 5_000,
    preferredTier: "deterministic",
    fallbackTier: "deterministic",
    escalationConditions: [], // never escalates to an LLM — computed, not guessed
    secondModelReview: false,
    humanReview: false,
  },
  detect_skill_gap: {
    taskType: "detect_skill_gap",
    riskLevel: "low",
    allowedFields: ["required_skills", "available_skills", "skill_matrix"],
    prohibitedFields: ["full_cv", ...NEVER_NEEDED],
    expectedSchema: "deterministic skill-gap model output (pure workforce model)",
    minQuality: 1,
    maxEstimatedCostUsd: 0,
    expectedOutputTokens: 0,
    maxLatencyMs: 5_000,
    preferredTier: "deterministic",
    fallbackTier: "deterministic",
    escalationConditions: [], // never escalates to an LLM — computed, not guessed
    secondModelReview: false,
    humanReview: false,
  },
  normalize_external_profile: {
    taskType: "normalize_external_profile",
    riskLevel: "medium",
    allowedFields: ["external_profile_text", "declared_skills", "locale"],
    prohibitedFields: ["full_cv", ...NEVER_NEEDED],
    expectedSchema: "workerProfileOutputSchema",
    minQuality: 0.6,
    maxEstimatedCostUsd: 0.12,
    expectedOutputTokens: 600,
    maxLatencyMs: 30_000,
    preferredTier: "standard",
    fallbackTier: "low_cost",
    escalationConditions: ["low_confidence", "schema_invalid"],
    secondModelReview: false,
    humanReview: true,
  },
  extract_cv: {
    taskType: "extract_cv",
    riskLevel: "medium",
    // The ONE task whose job is reading CV text — so cv_text/bio is allowed,
    // but contact/location/document fields must still never be sent.
    allowedFields: ["cv_text", "bio", "locale"],
    prohibitedFields: [...NEVER_NEEDED],
    expectedSchema: "workerProfileOutputSchema",
    minQuality: 0.6,
    maxEstimatedCostUsd: 0.2,
    expectedOutputTokens: 1200,
    maxLatencyMs: 45_000,
    preferredTier: "standard",
    fallbackTier: "low_cost",
    escalationConditions: ["low_confidence", "schema_invalid", "human_requested_depth"],
    secondModelReview: false,
    humanReview: true,
  },
  explain_match: {
    taskType: "explain_match",
    riskLevel: "medium",
    allowedFields: [
      "worker_skills",
      "work_evidence_summaries",
      "availability",
      "country_readiness_summaries",
      "documents_summary",
      "company_need",
      "booking_dates",
      "accommodation",
      "transport",
      "language",
      "locale",
    ],
    prohibitedFields: ["full_cv", ...NEVER_NEEDED],
    expectedSchema: "matchingExplanationOutputSchema",
    minQuality: 0.6,
    maxEstimatedCostUsd: 0.15,
    expectedOutputTokens: 700,
    maxLatencyMs: 30_000,
    preferredTier: "standard",
    fallbackTier: "low_cost",
    escalationConditions: ["low_confidence", "contradicts_sources", "human_requested_depth"],
    secondModelReview: false,
    humanReview: false,
  },
  translate_message: {
    taskType: "translate_message",
    riskLevel: "low",
    allowedFields: ["source_text", "source_locale", "target_locale"],
    prohibitedFields: ["full_cv", ...NEVER_NEEDED],
    expectedSchema: "translationCopyOutputSchema",
    minQuality: 0.55,
    maxEstimatedCostUsd: 0.03,
    expectedOutputTokens: 600,
    maxLatencyMs: 15_000,
    preferredTier: "low_cost",
    fallbackTier: "low_cost",
    escalationConditions: ["quality_below_threshold"],
    secondModelReview: false,
    humanReview: false,
    // Language routing: prefer the dedicated translation provider when the
    // owner has configured it (DEEPL_API_KEY + AI_DEEPL_ENABLED) — otherwise
    // the low_cost LLM tier serves the task exactly as before.
    languageRouting: { preferredProvider: "deepl" },
  },
  draft_follow_up: {
    taskType: "draft_follow_up",
    riskLevel: "medium",
    allowedFields: ["conversation_summary", "recipient_role", "goal", "locale"],
    prohibitedFields: ["full_cv", ...NEVER_NEEDED],
    expectedSchema: "supportOnboardingOutputSchema",
    minQuality: 0.6,
    maxEstimatedCostUsd: 0.05,
    expectedOutputTokens: 500,
    maxLatencyMs: 20_000,
    preferredTier: "low_cost",
    fallbackTier: "low_cost",
    escalationConditions: ["quality_below_threshold", "human_requested_depth"],
    secondModelReview: false,
    // Outbound-shaped content: a draft is NEVER sent without a human
    // (live sending itself stays an owner-only gate outside this layer).
    humanReview: true,
  },
};

// ── Agent → task mapping (all 11 registered agents) ────────────────────────

/**
 * Which program task each existing registry agent performs. Two deterministic
 * tasks (detect_capacity_gap / detect_skill_gap) have NO agent on purpose —
 * they are computed by the pure workforce models, not by an LLM.
 *
 * Rationale per row lives in
 * docs/product/cost-aware-ai-task-routing-contract-v1.md.
 */
export const AGENT_TASK_TYPES: Record<AiAgentKey, AiTaskType> = {
  worker_profile: "extract_cv", // free-text bio/CV → structured profile draft
  work_journal: "normalize_work_scope", // journal free-text → structured work scope
  skill_evidence: "normalize_external_profile", // evidence text → normalized capability claims
  company_need: "structure_future_work", // company's future work → structured need
  country_readiness: "derive_workforce_requirements", // what working there requires
  document_assistant: "derive_workforce_requirements", // documents needed = requirement derivation
  matching_explanation: "explain_match",
  booking_risk: "explain_match", // risk narrative = explanation over canonical signals
  admin_risk: "explain_match", // same explanation-class task, admin audience
  support_onboarding: "draft_follow_up", // guidance / next-step message drafts
  translation_copy: "translate_message",
};

export function taskTypeForAgent(agent: AiAgentKey): AiTaskType {
  return AGENT_TASK_TYPES[agent];
}

// ── Route resolution ────────────────────────────────────────────────────────

export interface AiTaskRouteContext {
  /** 1-based attempt number (1 = first try). */
  readonly attempt: number;
  /** Quality-type failure from the PREVIOUS attempt (escalation trigger). */
  readonly previousFailure?: EscalationReason;
  /** The previous attempt failed at the PROVIDER (outage/timeout) — fallback. */
  readonly previousProviderFailure?: boolean;
  /**
   * Explicit pre-run cost estimate. Overrides the derived one — kept for
   * callers (and tests) that compute cost themselves.
   */
  readonly estimatedCostUsd?: number;
  /**
   * Expected INPUT tokens for this run. The call site knows the size of what
   * it is sending; it must never know the model, so it supplies tokens and the
   * routing layer prices them against the tier it actually resolved.
   */
  readonly expectedInputTokens?: number;
  /** Language of the run (routing dimension — recorded on the decision;
   *  activates a policy's languageRouting preference when present). */
  readonly language?: string;
}

export type RouteBlockReason =
  | "cost_ceiling"
  | "cost_unpriced"
  | "needs_human_confirmation";

export interface TaskRouteDecision {
  readonly taskType: AiTaskType;
  readonly tier: AiModelTier;
  /** Model ALIAS for the tier (null for deterministic — no LLM call). */
  readonly modelAlias: AiModelAlias | null;
  /** Honest, human-readable reason for this exact route. */
  readonly reason: string;
  readonly escalated: boolean;
  readonly fallbackApplied: boolean;
  readonly secondModelReview: boolean;
  /** Language considered while routing (honest null when none supplied). */
  readonly languageConsidered: string | null;
  /** Task-policy preferred provider (e.g. "deepl") — tried first when
   *  configured; the LLM tier stays the fallback. Null = no preference. */
  readonly preferredProvider: "deepl" | null;
  /** Set → the run must NOT proceed (cost ceiling / missing human gate). */
  readonly blocked?: RouteBlockReason;
}

/** LLM tier ladder for one-step escalation (deterministic is not on it). */
const LLM_LADDER: readonly AiModelTier[] = [
  "low_cost",
  "standard",
  "advanced",
  "high_risk_verified",
];

function oneTierUp(tier: AiModelTier): AiModelTier {
  const i = LLM_LADDER.indexOf(tier);
  if (i < 0) return tier; // deterministic never climbs onto the LLM ladder
  return LLM_LADDER[Math.min(i + 1, LLM_LADDER.length - 1)];
}

function tierRank(tier: AiModelTier): number {
  return LLM_LADDER.indexOf(tier);
}

/**
 * Resolve a route for an explicit policy. Exported so the (currently unused)
 * high-risk block path is testable with a synthetic high-risk policy —
 * no fake high-risk task is added to TASK_POLICIES just to exercise it.
 */
export function resolveRouteForPolicy(
  policy: AiTaskPolicy,
  ctx: AiTaskRouteContext,
): TaskRouteDecision {
  const languageConsidered = ctx.language ?? null;
  const preferredProvider = policy.languageRouting?.preferredProvider ?? null;

  // Deterministic-first: computed by the pure workforce models, never an LLM.
  if (policy.preferredTier === "deterministic") {
    return {
      taskType: policy.taskType,
      tier: "deterministic",
      modelAlias: null,
      reason:
        "deterministic-model task — computed by the pure workforce models, no LLM call",
      escalated: false,
      fallbackApplied: false,
      secondModelReview: false,
      languageConsidered,
      preferredProvider: null, // no provider at all — computed, not served
    };
  }

  let tier: AiModelTier = policy.preferredTier;
  let escalated = false;
  let fallbackApplied = false;
  let reason = `preferred tier "${tier}" for ${policy.taskType} (attempt ${ctx.attempt})`;

  if (ctx.previousProviderFailure) {
    // Provider failure → fallback tier. Never silent: fallbackApplied + reason.
    const from = tier;
    tier = policy.fallbackTier;
    fallbackApplied = true;
    reason =
      tierRank(tier) < tierRank(from)
        ? `provider failure — fell back from "${from}" to lower tier "${tier}" (quality downgrade surfaced, not silent)`
        : `provider failure — retrying on fallback tier "${tier}"`;
  } else if (
    ctx.previousFailure !== undefined &&
    policy.escalationConditions.includes(ctx.previousFailure)
  ) {
    // Escalate exactly ONE tier, only on a condition the policy lists.
    const from = tier;
    tier = oneTierUp(tier);
    escalated = tier !== from;
    reason = escalated
      ? `escalated one tier "${from}" → "${tier}" after "${ctx.previousFailure}" (attempt ${ctx.attempt})`
      : `already at the top LLM tier "${tier}" — cannot escalate further`;
  } else if (ctx.previousFailure !== undefined) {
    reason = `previous failure "${ctx.previousFailure}" is not an escalation condition for ${policy.taskType} — staying on "${tier}"`;
  }

  const secondModelReview =
    policy.secondModelReview || tier === "high_risk_verified";

  /* ── Cost ceiling — evaluated on the tier that will ACTUALLY run ──────────
   *
   * This check used to sit above, against `policy.preferredTier`, and only
   * fired when a caller had passed `estimatedCostUsd` by hand. Two defects
   * followed, and both are closed here:
   *
   *   1. NOTHING EVER PASSED IT. No production call site supplied an estimate
   *      and the pricing module had no pre-run estimator at all, so every
   *      `maxEstimatedCostUsd` in TASK_POLICIES was decorative — the ceiling
   *      could not fire for any provider, Anthropic included.
   *   2. IT PRICED THE WRONG TIER. Escalation happens BELOW the old position,
   *      so a run could be cleared at the preferred tier and then execute one
   *      tier up — past the budget it had just been checked against.
   *
   * The estimate is derived here rather than at the call site because pricing
   * needs the MODEL and call sites must never know the model (guard:
   * ai-task-routing). The caller supplies token SIZE; the router prices it.
   */
  const modelAliasForTier = TIER_MODEL_ALIAS[tier];
  // `modelAliasForTier` is non-null for every LLM tier; the deterministic tier
  // returned above, before any model was involved.
  const derivedEstimate =
    ctx.expectedInputTokens !== undefined && modelAliasForTier !== null
      ? estimateCostUsd(
          modelAliasForTier,
          ctx.expectedInputTokens,
          policy.expectedOutputTokens,
        )
      : undefined;
  const estimate = ctx.estimatedCostUsd ?? derivedEstimate;

  // An unpriced model makes the ceiling UNCHECKABLE. A budget that cannot be
  // evaluated is not a budget, so this blocks rather than proceeding into
  // unbounded spend — the same honesty as the human-confirmation seam below.
  // Fix by adding an owner-reviewed price to model-pricing.ts, never by
  // dropping the ceiling.
  if (
    ctx.estimatedCostUsd === undefined &&
    ctx.expectedInputTokens !== undefined &&
    derivedEstimate === null
  ) {
    return {
      taskType: policy.taskType,
      tier,
      modelAlias: modelAliasForTier,
      reason: `${reason}; model "${modelAliasForTier}" carries no owner-reviewed price, so the ${policy.maxEstimatedCostUsd.toFixed(4)} USD ceiling for ${policy.taskType} cannot be evaluated — run blocked`,
      escalated,
      fallbackApplied,
      secondModelReview,
      languageConsidered,
      preferredProvider: null, // blocked — no provider may run
      blocked: "cost_unpriced",
    };
  }

  // Over budget NEVER silently proceeds.
  if (
    estimate !== undefined &&
    estimate !== null &&
    estimate > policy.maxEstimatedCostUsd
  ) {
    return {
      taskType: policy.taskType,
      tier,
      modelAlias: modelAliasForTier,
      reason: `estimated cost ${estimate.toFixed(4)} USD on tier "${tier}" exceeds the ${policy.maxEstimatedCostUsd.toFixed(4)} USD ceiling for ${policy.taskType} — run blocked`,
      escalated,
      fallbackApplied,
      secondModelReview,
      languageConsidered,
      preferredProvider: null, // blocked — no provider may run
      blocked: "cost_ceiling",
    };
  }

  // The high_risk_verified tier needs a pre-run human confirmation flow that
  // does not exist yet → honest block, never a fake approval.
  if (tier === "high_risk_verified") {
    return {
      taskType: policy.taskType,
      tier,
      modelAlias: TIER_MODEL_ALIAS[tier],
      reason: `${reason}; tier "high_risk_verified" requires a human confirmation flow that is not implemented — run blocked`,
      escalated,
      fallbackApplied,
      secondModelReview,
      languageConsidered,
      preferredProvider: null, // blocked — no provider may run
      blocked: "needs_human_confirmation",
    };
  }

  if (preferredProvider) {
    reason += `; language ${languageConsidered ? `"${languageConsidered}" ` : ""}routing prefers provider "${preferredProvider}" when configured (LLM tier stays the fallback)`;
  }

  return {
    taskType: policy.taskType,
    tier,
    modelAlias: TIER_MODEL_ALIAS[tier],
    reason,
    escalated,
    fallbackApplied,
    secondModelReview,
    languageConsidered,
    preferredProvider,
  };
}

export function resolveTaskRoute(
  taskType: AiTaskType,
  ctx: AiTaskRouteContext,
): TaskRouteDecision {
  return resolveRouteForPolicy(TASK_POLICIES[taskType], ctx);
}

// ── Daily run budget (previously declared but unenforced) ──────────────────

export type RunBudgetAssessment = "ok" | "budget_exceeded";

/**
 * Pure daily-run-budget check against the clamped cfg.dailyRunBudget.
 * The persisted counter comes from the ai_runs table (runtime/audit-store.ts
 * countAiRunsTodayBestEffort — used by run-agent-server for live runs). When
 * the count is unavailable (table not applied / query failed) the budget is
 * enforced only for caller-supplied counts; nothing fakes a counter.
 */
export function assessRunBudget(
  countToday: number,
  cfg: AiRuntimeConfig,
): RunBudgetAssessment {
  return countToday >= cfg.dailyRunBudget ? "budget_exceeded" : "ok";
}

// ── Audit record (pure builder — persistence is an owner-gated follow-up) ──

export type SchemaValidationState = "passed" | "failed" | "skipped";
export type HumanReviewState = "not_required" | "pending" | "approved" | "rejected";

export interface AiRoutingRunOutcome {
  /** Which adapter actually served the run ("mock"/"anthropic"/"disabled"/"none"). */
  readonly providerAdapter: string;
  readonly schemaValidation: SchemaValidationState;
  /** Envelope coarse confidence ("low"/"medium"/"high") or honest null. */
  readonly confidence: string | null;
  /** Honest null — no pricing table is wired; never a fabricated figure. */
  readonly actualCostUsd: number | null;
  readonly latencyMs: number | null;
  readonly usage: {
    readonly inputTokens: number | null;
    readonly outputTokens: number | null;
  } | null;
  readonly humanReviewState: HumanReviewState;
  /** Field NAMES / categories sent — NEVER field values (no PII in audit). */
  readonly dataCategoriesSent: readonly string[];
  readonly estimatedCostUsd?: number | null;
  // ── AI Router v1 additions (all optional → honest nulls on the record) ────
  /** Concrete model id the run was dispatched with (null when no LLM ran). */
  readonly modelId?: string | null;
  /** Prompt-registry version of the agent entry (audit). */
  readonly promptVersion?: string | null;
  /** Caller-supplied input-source LABEL (e.g. "cv_upload") — never content. */
  readonly inputSource?: string | null;
  /** Bounded excerpt of the schema-VALIDATED output (accepted subset). */
  readonly outputExcerpt?: string | null;
  /** Honest reason when a mid-run fallback was applied (e.g. latency_timeout). */
  readonly fallbackReason?: string | null;
}

export interface AiRoutingAuditRecord {
  readonly taskType: AiTaskType;
  readonly selectedTier: AiModelTier;
  readonly providerAdapter: string;
  readonly modelAlias: AiModelAlias | null;
  readonly reason: string;
  readonly fallback: boolean;
  readonly escalation: boolean;
  readonly blocked: RouteBlockReason | null;
  readonly secondModelReview: boolean;
  readonly estimatedCostUsd: number | null;
  readonly actualCostUsd: number | null;
  readonly latencyMs: number | null;
  readonly usage: {
    readonly inputTokens: number | null;
    readonly outputTokens: number | null;
  } | null;
  readonly schemaValidation: SchemaValidationState;
  readonly confidence: string | null;
  readonly humanReviewState: HumanReviewState;
  readonly dataCategoriesSent: readonly string[];
  // ── AI Router v1 additions ─────────────────────────────────────────────────
  readonly modelId: string | null;
  readonly promptVersion: string | null;
  readonly inputSource: string | null;
  /** Bounded (≤ {@link AI_RUN_OUTPUT_EXCERPT_MAX} chars) validated-output excerpt. */
  readonly outputExcerpt: string | null;
  readonly fallbackReason: string | null;
  readonly languageConsidered: string | null;
  readonly preferredProvider: "deepl" | null;
}

/** Hard bound for the persisted output excerpt (mirrors the ai_runs CHECK). */
export const AI_RUN_OUTPUT_EXCERPT_MAX = 4000;

export function buildRoutingAuditRecord(
  decision: TaskRouteDecision,
  outcome: AiRoutingRunOutcome,
): AiRoutingAuditRecord {
  return {
    taskType: decision.taskType,
    selectedTier: decision.tier,
    providerAdapter: outcome.providerAdapter,
    modelAlias: decision.modelAlias,
    reason: decision.reason,
    fallback: decision.fallbackApplied,
    escalation: decision.escalated,
    blocked: decision.blocked ?? null,
    secondModelReview: decision.secondModelReview,
    estimatedCostUsd: outcome.estimatedCostUsd ?? null,
    actualCostUsd: outcome.actualCostUsd,
    latencyMs: outcome.latencyMs,
    usage: outcome.usage,
    schemaValidation: outcome.schemaValidation,
    confidence: outcome.confidence,
    humanReviewState: outcome.humanReviewState,
    dataCategoriesSent: [...outcome.dataCategoriesSent],
    modelId: outcome.modelId ?? null,
    promptVersion: outcome.promptVersion ?? null,
    inputSource: outcome.inputSource ?? null,
    outputExcerpt:
      typeof outcome.outputExcerpt === "string"
        ? outcome.outputExcerpt.slice(0, AI_RUN_OUTPUT_EXCERPT_MAX)
        : null,
    fallbackReason: outcome.fallbackReason ?? null,
    languageConsidered: decision.languageConsidered,
    preferredProvider: decision.preferredProvider,
  };
}
