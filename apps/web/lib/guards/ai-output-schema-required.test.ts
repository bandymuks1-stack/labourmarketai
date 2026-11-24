/**
 * Guard — AI OUTPUT SCHEMA REQUIRED (Internal LLM Agents v1, PR3).
 *
 * No agent output reaches a caller un-validated. For every registered agent:
 *   - the strict envelope rejects an empty/off-shape output and unknown
 *     top-level fields;
 *   - the run-agent core returns `needs_review` (never `suggestion`) for a
 *     malformed model output — raw model text is never surfaced as a fact;
 *   - the data schema rejects record-like forbidden fields (verified/score/…).
 */
import { describe, it, expect } from "vitest";
import { resolveAiRuntimeConfig } from "../ai/runtime/config-core";
import { runAiAgentCore } from "../ai/run-agent";
import { AI_PROMPT_REGISTRY } from "../ai/registry/registry";
import { workerProfileEntry } from "../ai/registry/agents/worker-profile";
import { FORBIDDEN_DATA_FIELDS } from "../ai/schemas/envelope";
import { workerProfileEvals } from "../ai/evals/fixtures";

const MOCK = resolveAiRuntimeConfig({
  mode: "mock", provider: undefined, apiKey: undefined, model: undefined,
  timeoutMs: undefined, maxRetries: undefined, maxOutputTokens: undefined,
  dailyRunBudget: undefined,
});

describe("AI output schema is required (raw is never surfaced)", () => {
  it("every output schema rejects an empty output and unknown top-level fields", () => {
    for (const e of Object.values(AI_PROMPT_REGISTRY)) {
      if (!e) continue;
      expect(e.outputSchema.safeParse({}).success).toBe(false);
      expect(
        e.outputSchema.safeParse({
          suggestion: true, agent: e.agent, confidence: "high",
          evidence_refs: [], missing_information: [], needs_human_review: false,
          blocked_claims: [], data: {}, sneaky_extra: 1,
        }).success,
      ).toBe(false);
    }
  });

  it("run-agent returns needs_review (never suggestion) for malformed model output", async () => {
    const out = await runAiAgentCore(workerProfileEntry, { bio: "Klojau plyteles." }, MOCK, {
      locale: "lt", mock: {},
    });
    expect(out.status).toBe("needs_review");
  });

  it("the worker-profile data schema rejects every record-like forbidden field", () => {
    // Start from a valid worker-profile envelope (the first eval fixture's mock).
    const valid = workerProfileEvals[0].mock as {
      data: Record<string, unknown>;
    } & Record<string, unknown>;
    for (const field of FORBIDDEN_DATA_FIELDS) {
      const tampered = {
        ...valid,
        data: { ...valid.data, [field]: field === "verified" ? true : 1 },
      };
      expect(
        workerProfileEntry.outputSchema.safeParse(tampered).success,
        `data.${field} must be rejected`,
      ).toBe(false);
    }
  });
});
