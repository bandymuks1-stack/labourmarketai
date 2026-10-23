import { describe, expect, it } from "vitest";

import { classifyAiRun, summarizeAiRuns } from "./ai-run-outcome";

/** Real route_reason shapes recorded in production ai_runs (2026-10-01..15). */
const EGRESS =
  'preferred tier "low_cost" for propose_conversation_intent (attempt 1) — vendor call failed: unsupported: every provider for task "propose_conversation_intent" is unusable — gemini: data egress gate: "gemini" is external and holds no egress grant, so it may receive PUBLIC data only — this task carries SENSITIVE_FREE_TEXT';
const QUOTA =
  'preferred tier "low_cost" for translate_message (attempt 1) — vendor call failed: provider_error: gemini http 429 — RESOURCE_EXHAUSTED: You exceeded your current quota, please check your plan and billing details.';
const TIMEOUT =
  'provider failure — retrying on fallback tier "low_cost" — vendor call failed: timeout: policy latency ceiling 8000ms exceeded';
const UNPRICED =
  'preferred tier "standard" for extract_cv (attempt 1); provider "gemini" model "sonnet" carries no owner-reviewed price, so the 0.2 USD ceiling for extract_cv cannot be evaluated — run blocked';

describe("classifyAiRun", () => {
  it("names every production failure shape separately", () => {
    expect(classifyAiRun({ schema_validation: "passed", route_reason: "preferred tier" })).toBe("served");
    expect(classifyAiRun({ schema_validation: "skipped", route_reason: EGRESS })).toBe("privacy_blocked");
    expect(classifyAiRun({ schema_validation: "skipped", route_reason: QUOTA })).toBe("quota");
    expect(classifyAiRun({ schema_validation: "skipped", route_reason: TIMEOUT })).toBe("timeout");
    expect(classifyAiRun({ schema_validation: "skipped", blocked_reason: "cost_unpriced", route_reason: UNPRICED })).toBe("price_missing");
    expect(classifyAiRun({ schema_validation: "failed" })).toBe("invalid_output");
    expect(classifyAiRun({ schema_validation: "skipped", route_reason: "vendor call failed: unavailable: gemini http 503" })).toBe("provider_unavailable");
    expect(classifyAiRun({ schema_validation: "skipped", blocked_reason: "daily_budget_exceeded" })).toBe("budget_blocked");
    expect(classifyAiRun({ schema_validation: "skipped", route_reason: "something else" })).toBe("other_failure");
  });

  it("an egress refusal is privacy only when EVERY provider was refused (unsupported)", () => {
    expect(classifyAiRun({ schema_validation: "skipped", route_reason: "vendor call failed: provider_error: data egress gate mentioned but http 500" })).toBe("provider_unavailable");
  });
});

describe("summarizeAiRuns", () => {
  it("the failure rate excludes intentional privacy refusals", () => {
    const s = summarizeAiRuns([
      { schema_validation: "passed" },
      { schema_validation: "passed" },
      { schema_validation: "skipped", route_reason: QUOTA },
      { schema_validation: "skipped", route_reason: EGRESS },
      { schema_validation: "skipped", route_reason: EGRESS },
    ]);
    expect(s.runs).toBe(5);
    expect(s.byOutcome.privacy_blocked).toBe(2);
    expect(s.attempted).toBe(3);
    expect(s.technicalFailures).toBe(1);
    expect(s.technicalFailureRate).toBeCloseTo(1 / 3);
  });

  it("nothing attempted → no rate (never a fake 0%)", () => {
    expect(summarizeAiRuns([{ schema_validation: "skipped", route_reason: EGRESS }]).technicalFailureRate).toBeNull();
  });
});
