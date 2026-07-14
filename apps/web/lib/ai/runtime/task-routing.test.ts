/**
 * Task routing — policy completeness, deterministic-first, escalation ladder,
 * cost ceiling, honest fallback, max-model-never-default, audit completeness,
 * and total agent→task mapping. Pure — no env, no network.
 */
import { describe, it, expect } from "vitest";
import {
  AI_TASK_TYPES,
  AGENT_TASK_TYPES,
  TASK_POLICIES,
  TIER_MODEL_ALIAS,
  assessRunBudget,
  buildRoutingAuditRecord,
  modelIdForAlias,
  resolveRouteForPolicy,
  resolveTaskRoute,
  taskTypeForAgent,
  type AiTaskPolicy,
  type AiTaskType,
} from "./task-routing";
import { AI_MODEL_CANDIDATES } from "../types";
import { resolveAiRuntimeConfig } from "./config-core";
import { ALL_AGENT_KEYS } from "../registry/registry";

const GAP_TASKS: AiTaskType[] = ["detect_capacity_gap", "detect_skill_gap"];

describe("TASK_POLICIES completeness", () => {
  it("covers all 10 program task types", () => {
    expect(AI_TASK_TYPES).toHaveLength(10);
    for (const t of AI_TASK_TYPES) {
      expect(TASK_POLICIES[t], t).toBeDefined();
      expect(TASK_POLICIES[t].taskType).toBe(t);
    }
    expect(Object.keys(TASK_POLICIES).sort()).toEqual([...AI_TASK_TYPES].sort());
  });

  it("every policy has every field set with sane bounds", () => {
    for (const p of Object.values(TASK_POLICIES)) {
      expect(["low", "medium", "high"]).toContain(p.riskLevel);
      expect(p.allowedFields.length, p.taskType).toBeGreaterThan(0);
      expect(p.prohibitedFields.length, p.taskType).toBeGreaterThan(0);
      expect(p.expectedSchema.length, p.taskType).toBeGreaterThan(0);
      expect(p.minQuality).toBeGreaterThan(0);
      expect(p.minQuality).toBeLessThanOrEqual(1);
      expect(p.maxEstimatedCostUsd).toBeGreaterThanOrEqual(0);
      expect(p.maxLatencyMs).toBeGreaterThan(0);
      expect(typeof p.secondModelReview).toBe("boolean");
      expect(typeof p.humanReview).toBe("boolean");
      // No field may be both allowed and prohibited.
      for (const f of p.allowedFields) {
        expect(p.prohibitedFields, `${p.taskType}: ${f}`).not.toContain(f);
      }
    }
  });

  it("data minimisation: coordinates/documents/ids are prohibited everywhere; full_cv everywhere except CV extraction", () => {
    for (const p of Object.values(TASK_POLICIES)) {
      for (const f of ["exact_coordinates", "documents", "government_id", "address", "phone"]) {
        expect(p.prohibitedFields, `${p.taskType} must prohibit ${f}`).toContain(f);
      }
      if (p.taskType !== "extract_cv") {
        expect(p.prohibitedFields, `${p.taskType} must prohibit full_cv`).toContain("full_cv");
      }
    }
  });
});

describe("deterministic-first for gap detection", () => {
  it.each(GAP_TASKS)("%s prefers the deterministic tier and never escalates to an LLM", (t) => {
    const p = TASK_POLICIES[t];
    expect(p.preferredTier).toBe("deterministic");
    expect(p.fallbackTier).toBe("deterministic");
    expect(p.escalationConditions).toEqual([]);
    expect(p.maxEstimatedCostUsd).toBe(0);
    const d = resolveTaskRoute(t, { attempt: 1 });
    expect(d.tier).toBe("deterministic");
    expect(d.modelAlias).toBeNull();
    // Even a quality complaint cannot push a computed task onto an LLM.
    const d2 = resolveTaskRoute(t, { attempt: 2, previousFailure: "low_confidence" });
    expect(d2.tier).toBe("deterministic");
    expect(d2.modelAlias).toBeNull();
  });
});

describe("max model is NEVER a default", () => {
  it("no policy prefers advanced/high_risk_verified unless riskLevel is high (and high risk requires human review)", () => {
    for (const p of Object.values(TASK_POLICIES)) {
      if (p.preferredTier === "advanced" || p.preferredTier === "high_risk_verified") {
        expect(p.riskLevel, `${p.taskType} prefers ${p.preferredTier}`).toBe("high");
      }
      if (p.riskLevel === "high") {
        expect(p.preferredTier).toBe("high_risk_verified");
        expect(p.humanReview).toBe(true);
      }
    }
  });

  it("tier→alias mapping: deterministic has no model, opus is reached only via advanced/high-risk tiers", () => {
    expect(TIER_MODEL_ALIAS.deterministic).toBeNull();
    expect(TIER_MODEL_ALIAS.low_cost).toBe("haiku");
    expect(TIER_MODEL_ALIAS.standard).toBe("sonnet");
    expect(TIER_MODEL_ALIAS.advanced).toBe("opus");
    expect(TIER_MODEL_ALIAS.high_risk_verified).toBe("opus");
    expect(modelIdForAlias("haiku")).toBe(AI_MODEL_CANDIDATES.anthropic.haiku);
    expect(modelIdForAlias("sonnet")).toBe(AI_MODEL_CANDIDATES.anthropic.sonnet);
    expect(modelIdForAlias("opus")).toBe(AI_MODEL_CANDIDATES.anthropic.opus);
  });
});

describe("escalation ladder — one step, listed conditions only", () => {
  it("escalates exactly one tier on a listed condition", () => {
    const d = resolveTaskRoute("explain_match", {
      attempt: 2,
      previousFailure: "low_confidence",
    });
    expect(d.escalated).toBe(true);
    expect(d.tier).toBe("advanced"); // standard + 1, never straight to the top
    expect(d.modelAlias).toBe("opus");
    expect(d.blocked).toBeUndefined();
    expect(d.reason).toMatch(/escalated one tier/);
  });

  it("does NOT escalate on an unlisted condition", () => {
    // quality_below_threshold is not an explain_match escalation condition.
    const d = resolveTaskRoute("explain_match", {
      attempt: 2,
      previousFailure: "quality_below_threshold",
    });
    expect(d.escalated).toBe(false);
    expect(d.tier).toBe("standard");
    expect(d.reason).toMatch(/not an escalation condition/);
  });

  it("low_cost tasks escalate one step to standard only", () => {
    const d = resolveTaskRoute("translate_message", {
      attempt: 2,
      previousFailure: "quality_below_threshold",
    });
    expect(d.escalated).toBe(true);
    expect(d.tier).toBe("standard");
    expect(d.modelAlias).toBe("sonnet");
  });
});

describe("cost ceiling blocks — never silently proceeds", () => {
  it("an estimate over the ceiling returns blocked: cost_ceiling", () => {
    const d = resolveTaskRoute("structure_future_work", {
      attempt: 1,
      estimatedCostUsd: 5,
    });
    expect(d.blocked).toBe("cost_ceiling");
    expect(d.reason).toMatch(/exceeds .* ceiling/);
  });

  it("an estimate under the ceiling proceeds on the preferred tier", () => {
    const d = resolveTaskRoute("structure_future_work", {
      attempt: 1,
      estimatedCostUsd: 0.01,
    });
    expect(d.blocked).toBeUndefined();
    expect(d.tier).toBe("standard");
  });
});

describe("fallback — surfaced, never a silent downgrade", () => {
  it("provider failure applies the fallback tier with fallbackApplied=true and an honest reason", () => {
    const d = resolveTaskRoute("explain_match", {
      attempt: 2,
      previousProviderFailure: true,
    });
    expect(d.fallbackApplied).toBe(true);
    expect(d.tier).toBe("low_cost"); // DOWN one tier from standard — surfaced
    expect(d.modelAlias).toBe("haiku");
    expect(d.reason).toMatch(/fell back .* lower tier .* surfaced, not silent/);
  });

  it("same-tier fallback is still marked and explained", () => {
    const d = resolveTaskRoute("translate_message", {
      attempt: 2,
      previousProviderFailure: true,
    });
    expect(d.fallbackApplied).toBe(true);
    expect(d.tier).toBe("low_cost");
    expect(d.reason.length).toBeGreaterThan(0);
  });
});

describe("high_risk_verified tier is honestly blocked (no human-confirmation flow exists)", () => {
  const highRiskPolicy: AiTaskPolicy = {
    ...TASK_POLICIES.extract_cv,
    riskLevel: "high",
    preferredTier: "high_risk_verified",
    humanReview: true,
  };

  it("a high-risk policy resolves to blocked: needs_human_confirmation with second-model review", () => {
    const d = resolveRouteForPolicy(highRiskPolicy, { attempt: 1 });
    expect(d.tier).toBe("high_risk_verified");
    expect(d.modelAlias).toBe("opus");
    expect(d.secondModelReview).toBe(true);
    expect(d.blocked).toBe("needs_human_confirmation");
  });
});

describe("daily run budget (pure — counter store is an owner-gated follow-up)", () => {
  const cfg = resolveAiRuntimeConfig({
    mode: "mock", provider: undefined, apiKey: undefined, model: undefined,
    timeoutMs: undefined, maxRetries: undefined, maxOutputTokens: undefined,
    dailyRunBudget: 10,
  });
  it("under budget → ok; at/over budget → budget_exceeded", () => {
    expect(assessRunBudget(0, cfg)).toBe("ok");
    expect(assessRunBudget(9, cfg)).toBe("ok");
    expect(assessRunBudget(10, cfg)).toBe("budget_exceeded");
    expect(assessRunBudget(9999, cfg)).toBe("budget_exceeded");
  });
});

describe("routing audit record — every program field, honest nulls", () => {
  it("carries all fields; unknown cost/usage stay null (never fabricated)", () => {
    const decision = resolveTaskRoute("explain_match", { attempt: 1 });
    const record = buildRoutingAuditRecord(decision, {
      providerAdapter: "mock",
      schemaValidation: "passed",
      confidence: "medium",
      actualCostUsd: null,
      latencyMs: 12,
      usage: { inputTokens: 0, outputTokens: 0 },
      humanReviewState: "not_required",
      dataCategoriesSent: ["worker_skills", "company_need"],
      estimatedCostUsd: null,
    });
    expect(record).toEqual({
      taskType: "explain_match",
      selectedTier: "standard",
      providerAdapter: "mock",
      modelAlias: "sonnet",
      reason: decision.reason,
      fallback: false,
      escalation: false,
      blocked: null,
      secondModelReview: false,
      estimatedCostUsd: null,
      actualCostUsd: null,
      latencyMs: 12,
      usage: { inputTokens: 0, outputTokens: 0 },
      schemaValidation: "passed",
      confidence: "medium",
      humanReviewState: "not_required",
      dataCategoriesSent: ["worker_skills", "company_need"],
      // AI Router v1 fields — honest nulls when the caller supplies nothing.
      modelId: null,
      promptVersion: null,
      inputSource: null,
      outputExcerpt: null,
      fallbackReason: null,
      languageConsidered: null,
      preferredProvider: null,
    });
    // Field-name-only audit: categories never carry values/PII by contract.
    for (const c of record.dataCategoriesSent) {
      expect(c).toMatch(/^[a-z_]+$/i);
    }
  });
});

describe("language as a routing dimension (AI Router v1)", () => {
  it("translate_message prefers deepl (policy) and records the language considered", () => {
    const d = resolveTaskRoute("translate_message", { attempt: 1, language: "de" });
    expect(d.preferredProvider).toBe("deepl");
    expect(d.languageConsidered).toBe("de");
    expect(d.tier).toBe("low_cost"); // LLM tier stays the fallback route
    expect(d.reason).toMatch(/prefers provider "deepl" when configured/);
  });

  it("no language supplied → honest null, preference still declared by policy", () => {
    const d = resolveTaskRoute("translate_message", { attempt: 1 });
    expect(d.languageConsidered).toBeNull();
    expect(d.preferredProvider).toBe("deepl");
  });

  it("tasks without languageRouting carry no provider preference", () => {
    const d = resolveTaskRoute("explain_match", { attempt: 1, language: "lt" });
    expect(d.preferredProvider).toBeNull();
    expect(d.languageConsidered).toBe("lt");
  });

  it("a blocked route never carries a provider preference", () => {
    const d = resolveTaskRoute("translate_message", {
      attempt: 1,
      estimatedCostUsd: 100,
      language: "de",
    });
    expect(d.blocked).toBe("cost_ceiling");
    expect(d.preferredProvider).toBeNull();
  });

  it("provider-aware alias mapping resolves each provider's own candidate", () => {
    expect(modelIdForAlias("sonnet")).toBe(AI_MODEL_CANDIDATES.anthropic.sonnet);
    expect(modelIdForAlias("sonnet", "openai")).toBe(AI_MODEL_CANDIDATES.openai.sonnet);
    expect(modelIdForAlias("haiku", "gemini")).toBe(AI_MODEL_CANDIDATES.gemini.haiku);
    expect(modelIdForAlias("opus", "xai")).toBe(AI_MODEL_CANDIDATES.xai.opus);
  });
});

describe("agent → task mapping is total over the 11 registered agents", () => {
  it("maps every registered agent to a valid task type", () => {
    expect(ALL_AGENT_KEYS.length).toBe(11);
    for (const agent of ALL_AGENT_KEYS) {
      const t = taskTypeForAgent(agent);
      expect(AI_TASK_TYPES, `${agent} → ${t}`).toContain(t);
      expect(AGENT_TASK_TYPES[agent]).toBe(t);
    }
  });

  it("the two deterministic gap tasks have NO agent (pure workforce models compute them)", () => {
    const mapped = new Set(Object.values(AGENT_TASK_TYPES));
    for (const t of GAP_TASKS) expect(mapped.has(t)).toBe(false);
  });
});
