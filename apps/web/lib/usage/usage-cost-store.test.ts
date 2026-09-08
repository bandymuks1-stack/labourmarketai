import { describe, expect, it } from "vitest";

import {
  buildUsageCostEventRow,
  usdToEurCents,
  EUR_PER_USD,
  USAGE_COST_PRICING_VERSION,
  USAGE_COST_BILLING_SOURCE,
} from "@/lib/usage/usage-cost-store";
import type { AiRoutingAuditRecord } from "@/lib/ai/runtime/task-routing";

/**
 * Pure-mapping tests for the usage_cost_events writer (W14 Pilot Analytics
 * slice v1). Every assertion mirrors a CHECK constraint of the APPLIED
 * production migration 20260728114353_usage_cost_events_v1_clean_start.sql —
 * the mapping must be unable to produce a row the table would reject, and
 * unable to fabricate a cost the run never had.
 */

function liveRecord(over: Partial<AiRoutingAuditRecord> = {}): AiRoutingAuditRecord {
  return {
    taskType: "journal_suggestions",
    selectedTier: "low_cost",
    providerAdapter: "anthropic",
    modelAlias: "fast",
    modelId: "claude-haiku-4-5",
    promptVersion: "v3",
    reason: "tier matched",
    languageConsidered: "lt",
    inputSource: "journal_entry",
    dataCategoriesSent: ["entry_text"],
    outputExcerpt: null,
    schemaValidation: "valid",
    confidence: "high",
    estimatedCostUsd: 0.01,
    actualCostUsd: 0.0035,
    usage: { inputTokens: 1000, outputTokens: 500 },
    latencyMs: 820,
    fallback: false,
    fallbackReason: null,
    escalation: false,
    blocked: null,
    humanReviewState: null,
    preferredProvider: null,
    ...over,
  } as unknown as AiRoutingAuditRecord;
}

describe("usdToEurCents — conversion is explicit and never invents a number", () => {
  it("converts with the pinned owner-reviewable rate", () => {
    expect(usdToEurCents(1)).toBe(EUR_PER_USD * 100);
    expect(usdToEurCents(0.0035)).toBeCloseTo(0.0035 * EUR_PER_USD * 100, 6);
  });

  it("unknown stays unknown — null/undefined/NaN/negative all map to null", () => {
    expect(usdToEurCents(null)).toBeNull();
    expect(usdToEurCents(undefined)).toBeNull();
    expect(usdToEurCents(Number.NaN)).toBeNull();
    expect(usdToEurCents(-0.01)).toBeNull();
  });

  it("keeps sub-cent truth — a tiny real cost never rounds to a fabricated 0", () => {
    const cents = usdToEurCents(0.00001);
    expect(cents).not.toBeNull();
    expect(cents!).toBeGreaterThan(0);
  });
});

describe("buildUsageCostEventRow — the full mapping", () => {
  it("maps provider/service/resource/feature and the token measures", () => {
    const row = buildUsageCostEventRow(liveRecord(), {
      profileId: "11111111-1111-1111-1111-111111111111",
      organizationId: null,
      requestContext: "journal_suggestions",
    });
    expect(row.event_type).toBe("usage");
    expect(row.status).toBe("success");
    expect(row.provider).toBe("anthropic");
    expect(row.service).toBe("llm_completion");
    expect(row.resource).toBe("claude-haiku-4-5"); // per-model
    expect(row.feature_code).toBe("journal_suggestions"); // per-feature
    expect(row.profile_id).toBe("11111111-1111-1111-1111-111111111111");
    expect(row.organization_id).toBeNull();
    expect(row.payer).toBe("platform");
    expect(row.measures).toEqual({ inputTokens: 1000, outputTokens: 500 });
    expect(row.schema_version).toBe(1);
    // A UUID event id and an ISO timestamp are always present.
    expect(row.event_id).toMatch(/^[0-9a-f-]{36}$/);
    expect(Number.isFinite(Date.parse(row.occurred_at))).toBe(true);
  });

  it("cost carries EUR + pricingVersion, and actual carries a billingSource (table CHECKs)", () => {
    const row = buildUsageCostEventRow(liveRecord());
    expect(row.cost.currency).toBe("EUR");
    expect(row.cost.pricingVersion).toBe(USAGE_COST_PRICING_VERSION);
    expect(row.cost.actualCents).toBeCloseTo(0.0035 * EUR_PER_USD * 100, 6);
    expect(row.cost.estimatedCents).toBeCloseTo(0.01 * EUR_PER_USD * 100, 6);
    expect(row.cost.billingSource).toBe(USAGE_COST_BILLING_SOURCE);
  });

  it("unknown cost = EMPTY cost object — no zero, no currency, no version", () => {
    const row = buildUsageCostEventRow(
      liveRecord({ actualCostUsd: null, estimatedCostUsd: null, usage: null }),
    );
    expect(row.cost).toEqual({});
    expect(row.measures).toEqual({});
  });

  it("an estimate of exactly 0 with no actual is OMITTED (no-fabricated-zero CHECK)", () => {
    const row = buildUsageCostEventRow(
      liveRecord({ actualCostUsd: null, estimatedCostUsd: 0 }),
    );
    expect(row.cost).toEqual({});
  });

  it("estimate-only cost still carries pricingVersion but never a billingSource", () => {
    const row = buildUsageCostEventRow(
      liveRecord({ actualCostUsd: null, estimatedCostUsd: 0.01, usage: null }),
    );
    expect(row.cost.estimatedCents).toBeCloseTo(0.01 * EUR_PER_USD * 100, 6);
    expect(row.cost.pricingVersion).toBe(USAGE_COST_PRICING_VERSION);
    expect(row.cost.currency).toBe("EUR");
    expect("actualCents" in row.cost).toBe(false);
    expect("billingSource" in row.cost).toBe(false);
  });

  it("a blocked run is recorded as rejected, never as billable success", () => {
    const row = buildUsageCostEventRow(
      liveRecord({
        blocked: "budget_exceeded" as AiRoutingAuditRecord["blocked"],
        actualCostUsd: null,
        estimatedCostUsd: null,
        usage: null,
      }),
    );
    expect(row.status).toBe("rejected");
    expect(row.metadata.blocked_reason).toBe("budget_exceeded");
    expect(row.cost).toEqual({});
  });

  it("falls back to the model alias as resource when no concrete id exists", () => {
    const row = buildUsageCostEventRow(liveRecord({ modelId: null }));
    expect(row.resource).toBe("fast");
  });

  it("bounds every free-text field to the migration's CHECK limits", () => {
    const row = buildUsageCostEventRow(
      liveRecord({
        providerAdapter: "p".repeat(200),
        taskType: "t".repeat(200) as AiRoutingAuditRecord["taskType"],
        modelId: "m".repeat(200),
      }),
      { requestContext: "r".repeat(200) },
    );
    expect(row.provider.length).toBeLessThanOrEqual(64);
    expect(row.feature_code!.length).toBeLessThanOrEqual(64);
    expect(row.resource!.length).toBeLessThanOrEqual(128);
    expect(row.metadata.request_context.length).toBeLessThanOrEqual(120);
  });

  it("never carries prompts, outputs or free text — usage facts only", () => {
    const row = buildUsageCostEventRow(liveRecord({ outputExcerpt: "SECRET OUTPUT" }));
    const serialized = JSON.stringify(row);
    expect(serialized).not.toContain("SECRET OUTPUT");
    expect(serialized.length).toBeLessThan(2048); // well inside the jsonb caps
  });

  it("extras.eventId is the deterministic idempotency key for the row's PK", () => {
    const row = buildUsageCostEventRow(liveRecord(), {
      eventId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeef",
    });
    expect(row.event_id).toBe("aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeef");
  });

  it("accepts injected event id + timestamp for deterministic callers", () => {
    const row = buildUsageCostEventRow(liveRecord(), {}, {
      eventId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeef",
      occurredAtIso: "2026-08-05T00:00:00.000Z",
    });
    expect(row.event_id).toBe("aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeef");
    expect(row.occurred_at).toBe("2026-08-05T00:00:00.000Z");
  });
});
