import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { AI_RUN_OUTCOMES, INTENTIONAL_OUTCOMES, TECHNICAL_FAILURES, classifyAiRun, summarizeAiRuns } from "./ai-run-outcome";

/** route_reason shapes `buildRoutingAuditRecord` writes ("… — vendor call failed: <code>: <detail>"). */
const fail = (tail: string) => `preferred tier "low_cost" for translate_message (attempt 1) — vendor call failed: ${tail}`;
const QUOTA = fail("provider_error: gemini http 429 — RESOURCE_EXHAUSTED: You exceeded your current quota");
const TIMEOUT = fail("timeout: policy latency ceiling 8000ms exceeded");
const DOWN = fail("provider_error: gemini http 503");
const NONE_USABLE = fail('unsupported: every provider for task "translate_message" is unusable — gemini: cooling down');

const run = (r: Record<string, unknown>) => ({ provider: "gemini", schema_validation: "skipped", blocked_reason: null, route_reason: "preferred tier", ...r });

describe("classifyAiRun", () => {
  it("keys the privacy refusal on blocked_reason egress_refused, never on text", () => {
    expect(classifyAiRun(run({ provider: "none", blocked_reason: "egress_refused" }))).toBe("privacy_refused");
    // A vendor message that merely mentions the gate is a vendor failure, not a refusal.
    expect(classifyAiRun(run({ route_reason: fail("provider_error: data egress gate mentioned, http 500") }))).toBe("unavailable");
  });

  it("names every recorded shape with the provider chain's vocabulary", () => {
    expect(classifyAiRun(run({ schema_validation: "passed" }))).toBe("served");
    expect(classifyAiRun(run({ blocked_reason: "needs_human_confirmation" }))).toBe("confirmation_required");
    expect(classifyAiRun(run({ blocked_reason: "cost_ceiling" }))).toBe("budget_blocked");
    expect(classifyAiRun(run({ blocked_reason: "cost_unpriced" }))).toBe("price_missing");
    expect(classifyAiRun(run({ provider: "none" }))).toBe("budget_blocked");
    expect(classifyAiRun(run({ provider: "disabled", route_reason: fail("provider disabled: no key") }))).toBe("vendorless");
    expect(classifyAiRun(run({ route_reason: QUOTA }))).toBe("rate_limit");
    expect(classifyAiRun(run({ route_reason: TIMEOUT }))).toBe("timeout");
    expect(classifyAiRun(run({ route_reason: DOWN }))).toBe("unavailable");
    expect(classifyAiRun(run({ route_reason: NONE_USABLE }))).toBe("unsupported_capability");
    expect(classifyAiRun(run({ route_reason: fail("truncated: output token ceiling") }))).toBe("truncated");
    expect(classifyAiRun(run({ route_reason: fail("no_api_key: anthropic") }))).toBe("configuration");
    expect(classifyAiRun(run({ schema_validation: "failed" }))).toBe("invalid_output");
  });

  it("an unknown shape is a failure that is seen, never a quiet success", () => {
    expect(classifyAiRun(run({ blocked_reason: "some_future_reason" }))).toBe("unclassified");
    expect(classifyAiRun(run({}))).toBe("unclassified");
    expect(TECHNICAL_FAILURES.has("unclassified")).toBe(true);
  });

  it("every outcome is exactly one of served / intentional / vendorless / technical", () => {
    for (const o of AI_RUN_OUTCOMES) {
      const n = [o === "served", o === "vendorless", INTENTIONAL_OUTCOMES.has(o), TECHNICAL_FAILURES.has(o)].filter(Boolean).length;
      expect(n, o).toBe(1);
    }
  });

  it("reads route_reason without a regex of its own (no /s flag; the chain's classifier owns the patterns)", () => {
    const src = readFileSync(join(__dirname, "ai-run-outcome.ts"), "utf8");
    expect(src).not.toMatch(/\.(test|exec|match|matchAll)\(/);
  });
});

describe("summarizeAiRuns", () => {
  it("excludes intentional refusals and provider 'disabled' from the attempted runs", () => {
    const s = summarizeAiRuns([
      run({ schema_validation: "passed" }),
      run({ schema_validation: "passed" }),
      run({ route_reason: QUOTA }),
      run({ provider: "none", blocked_reason: "egress_refused" }),
      run({ provider: "none", blocked_reason: "needs_human_confirmation" }),
      run({ provider: "disabled" }),
    ]);
    expect(s.runs).toBe(6);
    expect(s.byOutcome.privacy_refused).toBe(1);
    expect(s.byOutcome.vendorless).toBe(1);
    expect(s.attempted).toBe(3);
    expect(s.technicalFailures).toBe(1);
    expect(s.technicalFailureRate).toBeCloseTo(1 / 3);
  });

  it("nothing attempted → no rate (never a fake 0 %)", () => {
    expect(summarizeAiRuns([run({ provider: "none", blocked_reason: "egress_refused" })]).technicalFailureRate).toBeNull();
    expect(summarizeAiRuns([]).technicalFailureRate).toBeNull();
  });
});
