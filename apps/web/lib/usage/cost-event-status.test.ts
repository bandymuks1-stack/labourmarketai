import { describe, expect, it } from "vitest";

import { buildUsageCostEventRow } from "./usage-cost-store";
import type { AiRoutingAuditRecord } from "@/lib/ai/runtime/task-routing";

/**
 * THE MONEY LEDGER MUST NOT CALL A FAILED CALL A SUCCESS.
 *
 * Found by the production proof on 2026-08-28, not by review. The first live
 * Gemini call failed with a 404 (a retired model id) and landed in
 * `usage_cost_events` as:
 *
 *   status: "success" · measures: {} · cost.estimatedCents: 0.075422
 *
 * `status` was derived from `record.blocked` alone, and a vendor refusal is not
 * a block — so a call that produced nothing was recorded as a successful usage
 * event carrying a pre-run estimate. At month end that is **spend that never
 * happened attached to a delivery that never happened**, and it is exactly the
 * "confident wrong number" the audit store's own docblock warns about.
 *
 * There are THREE outcomes and the ledger has to keep them apart:
 *   blocked          the ROUTER refused to dispatch  → "rejected"
 *   providerFailure  it dispatched, the vendor refused → "error"
 *   neither          the vendor answered              → "success"
 */

const BASE: AiRoutingAuditRecord = {
  taskType: "explain_market_demand",
  selectedTier: "low_cost",
  providerAdapter: "gemini",
  modelAlias: "haiku",
  reason: "preferred tier \"low_cost\" for explain_market_demand (attempt 1)",
  fallback: false,
  escalation: false,
  blocked: null,
  providerFailure: null,
  secondModelReview: false,
  estimatedCostUsd: 0.00523,
  actualCostUsd: 0.001768,
  latencyMs: 1908,
  usage: { inputTokens: 1059, outputTokens: 580 },
  schemaValidation: "passed",
  confidence: "high",
  humanReviewState: "not_required",
  dataCategoriesSent: ["openPostings"],
  modelId: "gemini-3.5-flash-lite",
  promptVersion: "v1",
  inputSource: "public_market_facts",
  outputExcerpt: null,
  fallbackReason: null,
  languageConsidered: "lt",
};

describe("usage_cost_events status distinguishes all three outcomes", () => {
  it("a vendor that ANSWERED is a success — the real production row", () => {
    const row = buildUsageCostEventRow(BASE, { requestContext: "market_explanation" });
    expect(row.status).toBe("success");
    expect(row.resource).toBe("gemini-3.5-flash-lite");
    expect(row.measures).toMatchObject({ inputTokens: 1059, outputTokens: 580 });
  });

  it("a vendor that REFUSED is an error, not a success", () => {
    // The exact shape of the 2026-08-28 404: dispatched, no usage, no actual
    // cost, only a pre-run estimate.
    const row = buildUsageCostEventRow(
      {
        ...BASE,
        providerFailure: "provider_error: gemini http 404 — NOT_FOUND: …",
        actualCostUsd: null,
        usage: null,
        schemaValidation: "skipped",
        confidence: null,
        modelId: "gemini-2.5-flash-lite",
      },
      { requestContext: "market_explanation" },
    );
    expect(row.status).toBe("error");
  });

  it("a ROUTER block stays 'rejected' — it is a different event", () => {
    const row = buildUsageCostEventRow(
      { ...BASE, blocked: "cost_unpriced", actualCostUsd: null, usage: null },
      {},
    );
    expect(row.status).toBe("rejected");
  });

  it("a block WINS over a provider failure — nothing was dispatched", () => {
    // Both set is not a real state today, but the precedence must be defined:
    // if the router refused, no vendor was reached, whatever else is recorded.
    const row = buildUsageCostEventRow(
      { ...BASE, blocked: "cost_ceiling", providerFailure: "should not win" },
      {},
    );
    expect(row.status).toBe("rejected");
  });

  it("NEGATIVE CONTROL: a successful row never carries a failure marker", () => {
    const row = buildUsageCostEventRow(BASE, {});
    expect(row.status).toBe("success");
    expect(JSON.stringify(row)).not.toContain("http 404");
  });
});
