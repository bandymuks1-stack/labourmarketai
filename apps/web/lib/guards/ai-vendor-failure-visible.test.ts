import { describe, expect, it } from "vitest";

import { buildRoutingAuditRecord, resolveTaskRoute } from "@/lib/ai/runtime/task-routing";
import type { AiRoutingRunOutcome } from "@/lib/ai/runtime/task-routing";
import { buildAiRunRow } from "@/lib/ai/runtime/audit-store";

/**
 * A VENDOR CALL THAT FAILED MUST NOT LOOK LIKE ONE THAT SUCCEEDED.
 *
 * This guard exists because of a production incident on 2026-08-28, and the
 * incident is the whole argument. The first live vendor integration in the
 * product's history failed on its first real call, and the `ai_runs` row it
 * wrote reported a healthy route:
 *
 *   provider = gemini · model_id = gemini-2.5-flash-lite · latency_ms = 110
 *   blocked_reason = null · route_reason = "preferred tier low_cost (attempt 1)"
 *
 * The adapter had built the exact diagnosis — `gemini http <status>` — and
 * every layer above it discarded the string. The user saw "the explanation
 * service is currently unavailable"; the telemetry said nothing was wrong; and
 * the operator had no way to tell a vendor outage from a routing bug from a
 * misconfigured key.
 *
 * `ai_runs` exists to measure exactly this. A row that cannot distinguish
 * "reached the vendor and it refused" from "resolved cleanly" is not
 * measurement, it is decoration.
 */

const BASE: Omit<AiRoutingRunOutcome, "providerAdapter" | "providerFailure"> = {
  schemaValidation: "skipped",
  confidence: null,
  actualCostUsd: null,
  latencyMs: 110,
  usage: null,
  humanReviewState: "not_required",
  dataCategoriesSent: ["openPostings"],
  estimatedCostUsd: 0.000877,
  modelId: "gemini-2.5-flash-lite",
  outputExcerpt: null,
  fallbackReason: null,
};

/** The exact route the production incident took. */
const decision = resolveTaskRoute("explain_market_demand", {
  attempt: 1,
  provider: "gemini",
});

describe("a failed vendor call is visible in ai_runs", () => {
  it("records WHY the vendor call failed, not just that a route existed", () => {
    const record = buildRoutingAuditRecord(decision, {
      ...BASE,
      providerAdapter: "gemini",
      providerFailure: "provider_error: gemini http 404",
    });

    expect(record.reason).toContain("vendor call failed");
    expect(record.reason).toContain("gemini http 404");
  });

  it("NEGATIVE CONTROL: a clean route says nothing about a failure", () => {
    const record = buildRoutingAuditRecord(decision, {
      ...BASE,
      providerAdapter: "gemini",
      providerFailure: null,
    });

    expect(record.reason).not.toContain("vendor call failed");
    // And the route's own reasoning is preserved untouched.
    expect(record.reason).toBe(decision.reason);
  });

  it("the failure survives into the persisted row, within the column's limit", () => {
    const record = buildRoutingAuditRecord(decision, {
      ...BASE,
      providerAdapter: "gemini",
      providerFailure: "provider_error: gemini http 403",
    });
    const row = buildAiRunRow(record, { requestContext: "market_explanation" });

    expect(row.route_reason).toContain("gemini http 403");
    // `ai_runs_route_reason_check` — the column is CHECKed at 600 chars, and a
    // row that violates it is dropped SILENTLY (persistence is best-effort), so
    // an over-long diagnosis would erase the very row it was added to explain.
    expect((row.route_reason ?? "").length).toBeLessThanOrEqual(600);
  });

  it("a pathological provider message can never overflow the column", () => {
    const record = buildRoutingAuditRecord(decision, {
      ...BASE,
      providerAdapter: "gemini",
      providerFailure: "x".repeat(5000),
    });
    const row = buildAiRunRow(record, {});
    expect((row.route_reason ?? "").length).toBeLessThanOrEqual(600);
  });

  it("carries a disabled adapter's reason too — 'off' and 'broken' are different", () => {
    const record = buildRoutingAuditRecord(decision, {
      ...BASE,
      providerAdapter: "none",
      providerFailure: "provider disabled: missing_api_key",
    });
    expect(record.reason).toContain("missing_api_key");
  });
});
