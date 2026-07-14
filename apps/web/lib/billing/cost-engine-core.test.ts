/**
 * Cost engine rollup guard (Sprint v2 §11) — math + honesty: real AI costs
 * sum; unknown costs are counted, never valued; uninstrumented categories
 * never fabricate numbers.
 */
import { describe, it, expect } from "vitest";

import {
  INSTRUMENTED_CATEGORIES,
  rollupAiRuns,
  buildCustomerCostReport,
} from "./cost-engine-core";

describe("AI rollup (read-time from ai_runs — the documented decision)", () => {
  it("sums only KNOWN actual costs; estimated never substitutes", () => {
    const c = rollupAiRuns([
      { actualCostUsd: 0.0021, estimatedCostUsd: 0.01 },
      { actualCostUsd: 0.0009, estimatedCostUsd: null },
      { actualCostUsd: null, estimatedCostUsd: 0.5 }, // unknown — counted, not valued
    ]);
    expect(c.state).toBe("measured");
    expect(c.knownCostUsd).toBe(0.003);
    expect(c.eventCount).toBe(3);
    expect(c.unknownCostEventCount).toBe(1);
  });

  it("zero rows → honest no_data with null cost (not a fake 0)", () => {
    const c = rollupAiRuns([]);
    expect(c.state).toBe("no_data");
    expect(c.knownCostUsd).toBeNull();
    expect(c.eventCount).toBe(0);
  });
});

describe("full customer report", () => {
  it("only ai is instrumented today", () => {
    expect([...INSTRUMENTED_CATEGORIES]).toEqual(["ai"]);
  });

  it("covers all 9 categories with honest states", () => {
    const report = buildCustomerCostReport({
      aiRuns: [{ actualCostUsd: 0.01, estimatedCostUsd: null }],
      usageEvents: [
        { category: "emails", costUsd: 0.002 },
        { category: "emails", costUsd: null },
      ],
    });
    expect(report.categories).toHaveLength(9);

    const byCat = Object.fromEntries(
      report.categories.map((c) => [c.category, c]),
    );
    expect(byCat.ai.state).toBe("measured");
    expect(byCat.ai.knownCostUsd).toBe(0.01);

    // real usage_events rows → measured, unknown-cost rows counted
    expect(byCat.emails.state).toBe("measured");
    expect(byCat.emails.knownCostUsd).toBe(0.002);
    expect(byCat.emails.unknownCostEventCount).toBe(1);

    // no collector → not_instrumented, cost null (never fabricated)
    for (const cat of [
      "storage",
      "bandwidth",
      "database",
      "payments",
      "media",
      "voice",
      "video",
    ] as const) {
      expect(byCat[cat].state, cat).toBe("not_instrumented");
      expect(byCat[cat].knownCostUsd, cat).toBeNull();
      expect(byCat[cat].eventCount, cat).toBe(0);
    }

    expect(report.totalKnownCostUsd).toBe(0.012);
    expect(report.totalUnknownCostEventCount).toBe(1);
  });

  it("floating-point sums stay clean (rounded to 6 decimals)", () => {
    const report = buildCustomerCostReport({
      aiRuns: [
        { actualCostUsd: 0.1, estimatedCostUsd: null },
        { actualCostUsd: 0.2, estimatedCostUsd: null },
      ],
      usageEvents: [],
    });
    const ai = report.categories.find((c) => c.category === "ai")!;
    expect(ai.knownCostUsd).toBe(0.3);
  });
});
