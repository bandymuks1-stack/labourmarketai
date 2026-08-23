/**
 * ai_runs audit store — pure row mapping bounds + the NEVER-THROWS contract
 * (persist + daily count fail soft with no env / no DB). Node env — the
 * supabase admin client cannot be constructed here, which is exactly the
 * failure mode the store must swallow.
 */
import { describe, it, expect } from "vitest";
import {
  buildAiRunRow,
  countAiRunsTodayBestEffort,
  persistAiRunAudit,
} from "./audit-store";
import {
  AI_RUN_OUTPUT_EXCERPT_MAX,
  buildRoutingAuditRecord,
  resolveTaskRoute,
  type AiRoutingAuditRecord,
} from "./task-routing";

function sampleRecord(
  overrides: Partial<AiRoutingAuditRecord> = {},
): AiRoutingAuditRecord {
  const decision = resolveTaskRoute("translate_message", {
    attempt: 1,
    language: "de",
  });
  return {
    ...buildRoutingAuditRecord(decision, {
      providerAdapter: "anthropic",
      schemaValidation: "passed",
      confidence: "medium",
      actualCostUsd: 0.0035,
      latencyMs: 812,
      usage: { inputTokens: 1000, outputTokens: 500 },
      humanReviewState: "not_required",
      dataCategoriesSent: ["canonicalMessage", "locale"],
      estimatedCostUsd: 0.01,
      modelId: "claude-haiku-4-5",
      promptVersion: "1.0.0",
      inputSource: "conversation_message",
      outputExcerpt: JSON.stringify({ localized_copy: "Hallo" }),
      fallbackReason: null,
    }),
    ...overrides,
  };
}

describe("buildAiRunRow (pure mapping)", () => {
  it("maps every audit field onto the ai_runs columns", () => {
    const row = buildAiRunRow(sampleRecord(), {
      profileId: "9e0e11f4-0000-0000-0000-000000000000",
      requestContext: "translation_copy",
    });
    expect(row.task_type).toBe("translate_message");
    expect(row.provider).toBe("anthropic");
    expect(row.model_alias).toBe("haiku");
    expect(row.model_id).toBe("claude-haiku-4-5");
    expect(row.prompt_version).toBe("1.0.0");
    expect(row.tier).toBe("low_cost");
    expect(row.locale).toBe("de");
    expect(row.input_source).toBe("conversation_message");
    expect(row.data_categories_sent).toEqual(["canonicalMessage", "locale"]);
    expect(row.schema_validation).toBe("passed");
    expect(row.confidence).toBe("medium");
    expect(row.estimated_cost_usd).toBe(0.01);
    expect(row.actual_cost_usd).toBe(0.0035);
    expect(row.input_tokens).toBe(1000);
    expect(row.output_tokens).toBe(500);
    expect(row.latency_ms).toBe(812);
    expect(row.fallback_applied).toBe(false);
    expect(row.fallback_reason).toBeNull();
    expect(row.escalation_applied).toBe(false);
    expect(row.blocked_reason).toBeNull();
    expect(row.human_review_state).toBe("not_required");
    expect(row.profile_id).toBe("9e0e11f4-0000-0000-0000-000000000000");
    expect(row.request_context).toBe("translation_copy");
  });

  it("bounds the output excerpt to the migration CHECK limit", () => {
    const row = buildAiRunRow(
      sampleRecord({ outputExcerpt: "x".repeat(AI_RUN_OUTPUT_EXCERPT_MAX + 500) }),
    );
    expect(row.output_excerpt?.length).toBe(AI_RUN_OUTPUT_EXCERPT_MAX);
  });

  it("honest nulls survive the mapping (no fabricated values)", () => {
    const row = buildAiRunRow(
      sampleRecord({
        modelId: null,
        actualCostUsd: null,
        usage: null,
        outputExcerpt: null,
        confidence: null,
      }),
    );
    expect(row.model_id).toBeNull();
    expect(row.actual_cost_usd).toBeNull();
    expect(row.input_tokens).toBeNull();
    expect(row.output_tokens).toBeNull();
    expect(row.output_excerpt).toBeNull();
    expect(row.confidence).toBeNull();
    expect(row.profile_id).toBeNull();
  });
});

describe("never-throws contract (no env / no DB in this test process)", () => {
  it("persistAiRunAudit resolves false instead of throwing", async () => {
    await expect(persistAiRunAudit(sampleRecord())).resolves.toBe(false);
  });

  it("countAiRunsTodayBestEffort resolves null instead of throwing", async () => {
    await expect(countAiRunsTodayBestEffort()).resolves.toBeNull();
  });
});
