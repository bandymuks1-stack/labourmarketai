import { describe, it, expect } from "vitest";

import { buildExplanation } from "./explainability";

const valid = {
  meaningCode: "intelligence.salary.comparedToBenchmark",
  dataBasisCodes: ["intelligence.sources.key.admin_market_rate_averages"],
  window: { start: "2026-04-01", end: "2026-06-30" },
  geoLabel: "LT",
  sampleSize: 12,
  originKind: "internal" as const,
  nextActionCode: null,
  uncertaintyCodes: ["intelligence.uncertainty.smallSample"],
};

describe("buildExplanation", () => {
  it("returns a complete explanation for valid input", () => {
    const e = buildExplanation(valid);
    expect(e.meaningCode).toBe(valid.meaningCode);
    expect(e.dataBasisCodes).toEqual(valid.dataBasisCodes);
    expect(e.window).toEqual(valid.window);
    expect(e.sampleSize).toBe(12);
    expect(e.originKind).toBe("internal");
  });

  it("defaults optional fields honestly (null window, no uncertainty)", () => {
    const e = buildExplanation({
      meaningCode: "m",
      dataBasisCodes: ["b"],
      originKind: "internal",
    });
    expect(e.window).toEqual({ start: null, end: null });
    expect(e.geoLabel).toBeNull();
    expect(e.sampleSize).toBeNull();
    expect(e.nextActionCode).toBeNull();
    expect(e.uncertaintyCodes).toEqual([]);
  });

  it("rejects an empty meaningCode", () => {
    expect(() => buildExplanation({ ...valid, meaningCode: "" })).toThrow();
    expect(() => buildExplanation({ ...valid, meaningCode: "   " })).toThrow();
  });

  it("rejects empty dataBasisCodes (missing list or empty member)", () => {
    expect(() => buildExplanation({ ...valid, dataBasisCodes: [] })).toThrow();
    expect(() =>
      buildExplanation({ ...valid, dataBasisCodes: ["ok", ""] }),
    ).toThrow();
  });

  it("rejects an empty uncertainty code and an empty nextActionCode", () => {
    expect(() =>
      buildExplanation({ ...valid, uncertaintyCodes: [""] }),
    ).toThrow();
    expect(() =>
      buildExplanation({ ...valid, nextActionCode: "" }),
    ).toThrow();
  });

  it("rejects an invalid originKind and a negative sampleSize", () => {
    expect(() =>
      buildExplanation({
        ...valid,
        // @ts-expect-error — deliberately invalid
        originKind: "guessed",
      }),
    ).toThrow();
    expect(() => buildExplanation({ ...valid, sampleSize: -1 })).toThrow();
  });
});
