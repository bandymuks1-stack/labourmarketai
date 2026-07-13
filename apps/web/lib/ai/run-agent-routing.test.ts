/**
 * Runner ↔ task routing integration (mock mode — no env, key, or network):
 *   (a) an explain_match agent run carries a routing decision on tier standard;
 *   (b) a blocked decision yields an honest non-suggestion outcome;
 *   (c) the routed per-request model override reaches the provider;
 *   (d) the daily run budget is enforced when a caller supplies a real count.
 */
import { describe, it, expect } from "vitest";
import { resolveAiRuntimeConfig } from "./runtime/config-core";
import { runAiAgentCore } from "./run-agent";
import { matchingExplanationEntry } from "./registry/agents/matching-explanation";
import { AI_MODEL_CANDIDATES } from "./types";

const MOCK = resolveAiRuntimeConfig({
  mode: "mock", provider: undefined, apiKey: undefined, model: undefined,
  timeoutMs: undefined, maxRetries: undefined, maxOutputTokens: undefined,
  dailyRunBudget: 10,
});

const input = {
  workerSkills: ["tiling", "bathroom finishing"],
  companyNeed: "Two tilers for a six-week bathroom renovation in Vilnius.",
};

const validMock = {
  suggestion: true,
  agent: "matching_explanation",
  confidence: "medium",
  evidence_refs: [{ source: "worker_skills", ref: "routing-test" }],
  missing_information: [],
  needs_human_review: true,
  blocked_claims: [],
  data: {
    fit_summary: "Skills align with the need.",
    strong_matches: ["tiling trade"],
    gaps: [],
    blockers: [],
    suggested_next_action: "Review documents.",
    explanation_company: "Good fit on paper.",
    explanation_worker: "You match this need.",
  },
};

describe("(a) explain_match run carries a standard-tier routing decision", () => {
  it("suggestion outcome exposes the audit record with tier standard / alias sonnet", async () => {
    const out = await runAiAgentCore(matchingExplanationEntry, input, MOCK, {
      locale: "en", mock: validMock,
    });
    expect(out.status).toBe("suggestion");
    expect(out.routing).toBeDefined();
    expect(out.routing?.taskType).toBe("explain_match");
    expect(out.routing?.selectedTier).toBe("standard");
    expect(out.routing?.modelAlias).toBe("sonnet");
    expect(out.routing?.providerAdapter).toBe("mock");
    expect(out.routing?.schemaValidation).toBe("passed");
    expect(out.routing?.confidence).toBe("medium");
    expect(out.routing?.escalation).toBe(false);
    expect(out.routing?.fallback).toBe(false);
    expect(out.routing?.blocked).toBeNull();
    // Honest nulls — no fabricated cost.
    expect(out.routing?.actualCostUsd).toBeNull();
    // Audit carries field NAMES only, never input content.
    expect(out.routing?.dataCategoriesSent).toEqual(["workerSkills", "companyNeed"]);
    const auditJson = JSON.stringify(out.routing);
    expect(auditJson).not.toContain("bathroom renovation");
  });
});

describe("(b) a blocked decision yields an honest non-suggestion outcome", () => {
  it("cost ceiling → needs_review budget_exceeded, provider never runs", async () => {
    const out = await runAiAgentCore(matchingExplanationEntry, input, MOCK, {
      locale: "en", mock: validMock,
      route: { attempt: 1, estimatedCostUsd: 100 },
    });
    expect(out.status).toBe("needs_review");
    if (out.status === "needs_review") {
      expect(out.reason).toBe("budget_exceeded");
      expect(out.detail).toMatch(/ceiling/);
    }
    expect(out.routing?.blocked).toBe("cost_ceiling");
    expect(out.routing?.providerAdapter).toBe("none");
    expect(out.routing?.schemaValidation).toBe("skipped");
  });
});

describe("(c) the routed model override reaches the provider", () => {
  it("mock provider echoes the routed sonnet model id, not the config default", async () => {
    const out = await runAiAgentCore(matchingExplanationEntry, input, MOCK, {
      locale: "en", mock: validMock,
    });
    expect(out.status).toBe("suggestion");
    if (out.status === "suggestion") {
      expect(out.model).toBe(AI_MODEL_CANDIDATES.anthropic.sonnet);
      expect(out.model).not.toBe(MOCK.model); // default is opus — override applied
    }
  });
});

describe("(d) daily run budget is enforced when a real count is supplied", () => {
  it("runsToday at the clamped budget → needs_review budget_exceeded", async () => {
    const out = await runAiAgentCore(matchingExplanationEntry, input, MOCK, {
      locale: "en", mock: validMock, runsToday: 10,
    });
    expect(out.status).toBe("needs_review");
    if (out.status === "needs_review") expect(out.reason).toBe("budget_exceeded");
  });

  it("runsToday under the budget still runs", async () => {
    const out = await runAiAgentCore(matchingExplanationEntry, input, MOCK, {
      locale: "en", mock: validMock, runsToday: 3,
    });
    expect(out.status).toBe("suggestion");
  });
});

describe("(e) provider failure produces a VISIBLE fallback, never a silent one (P4)", () => {
  it("re-route after a provider failure applies the fallback tier and says so", async () => {
    const { resolveTaskRoute } = await import("./runtime/task-routing");
    const decision = resolveTaskRoute("explain_match", {
      attempt: 2,
      previousProviderFailure: true,
    });
    expect(decision.fallbackApplied).toBe(true);
    expect(decision.tier).toBe("low_cost");
    expect(decision.modelAlias).toBe("haiku");
    expect(decision.reason.toLowerCase()).toContain("fell back");

    const out = await runAiAgentCore(matchingExplanationEntry, input, MOCK, {
      locale: "en",
      mock: validMock,
      route: { attempt: 2, previousProviderFailure: true },
    });
    // The downgrade is carried on the audit record — visible, not silent.
    expect(out.routing?.fallback).toBe(true);
    expect(out.routing?.selectedTier).toBe("low_cost");
    expect(out.routing?.modelAlias).toBe("haiku");
    expect(out.routing?.reason.toLowerCase()).toContain("fell back");
  });
});
