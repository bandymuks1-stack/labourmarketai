/**
 * Per-organization AI run cap � pure helpers + core enforcement (mock mode).
 */

import { describe, it, expect } from "vitest";
import {
  DEFAULT_ORG_DAILY_RUN_CAP,
  assessOrgRunBudget,
  countOrgAiRunsTodayBestEffort,
  resolveOrgDailyRunCap,
  type OrgRunCountDb,
} from "./org-run-cap";
import { resolveAiRuntimeConfig } from "./config-core";
import { runAiAgentCore } from "../run-agent";
import { matchingExplanationEntry } from "../registry/agents/matching-explanation";
import { AI_MODEL_CANDIDATES } from "./model-candidates";

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


describe("per-organization daily AI cap (org-run-cap)", () => {
  it("default is 100, env parsed and clamped, garbage falls back", () => {
    expect(resolveOrgDailyRunCap(undefined)).toBe(DEFAULT_ORG_DAILY_RUN_CAP);
    expect(DEFAULT_ORG_DAILY_RUN_CAP).toBe(100);
    expect(resolveOrgDailyRunCap("25")).toBe(25);
    expect(resolveOrgDailyRunCap("abc")).toBe(100);
    expect(resolveOrgDailyRunCap("-5")).toBe(0);
    expect(resolveOrgDailyRunCap("9999999")).toBe(100_000);
  });
  it("assess flips exactly at the cap", () => {
    expect(assessOrgRunBudget(99, 100)).toBe("ok");
    expect(assessOrgRunBudget(100, 100)).toBe("budget_exceeded");
  });
  it("core blocks with budget_exceeded and an honest reason when the org is at its cap", async () => {
    const out = await runAiAgentCore(matchingExplanationEntry, input, MOCK, {
      locale: "en", mock: validMock, orgRunsToday: 100, orgDailyRunCap: 100,
    });
    expect(out.status).toBe("needs_review");
    if (out.status === "needs_review") {
      expect(out.reason).toBe("budget_exceeded");
      expect(out.detail).toContain("organization daily AI allowance");
    }
  });
  it("core runs when under the cap or when no org info is supplied", async () => {
    const under = await runAiAgentCore(matchingExplanationEntry, input, MOCK, {
      locale: "en", mock: validMock, orgRunsToday: 5, orgDailyRunCap: 100,
    });
    expect(under.status).toBe("suggestion");
    const none = await runAiAgentCore(matchingExplanationEntry, input, MOCK, {
      locale: "en", mock: validMock,
    });
    expect(none.status).toBe("suggestion");
  });
  it("count helper reads usage_cost_events for the org and fails open (null) on error", async () => {
    const calls: Array<[string, string]> = [];
    const mk = (res: { count: number | null; error: { message?: string } | null }): OrgRunCountDb => {
      const q: any = {
        eq: (c: string, v: string) => { calls.push([c, v]); return q; },
        gte: async () => res,
      };
      return { from: () => ({ select: () => q }) } as unknown as OrgRunCountDb;
    };
    expect(await countOrgAiRunsTodayBestEffort("org-1", mk({ count: 7, error: null }))).toBe(7);
    expect(calls).toContainEqual(["organization_id", "org-1"]);
    expect(calls).toContainEqual(["event_type", "usage"]);
    expect(await countOrgAiRunsTodayBestEffort("org-1", mk({ count: null, error: { message: "relation missing" } }))).toBeNull();
  });
});
