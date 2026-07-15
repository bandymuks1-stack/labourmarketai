import { describe, it, expect } from "vitest";

import { parseEurostatJsonStat } from "./eurostat-jsonstat";
import { getEurostatDataset } from "./eurostat-source-v1";
import { intelligenceObservationSchema } from "./observation-contract";
import { computeObservationContentHash } from "./observation-hash";

const UNE = getEurostatDataset("une_rt_m")!;

/** Minimal une_rt_m-shaped JSON-stat 2.0 body: pinned dims are single-code,
 *  geo has EU27_2020 + LT, time has two months. Row-major value indexing. */
function uneBody(overrides: Partial<Record<string, unknown>> = {}): unknown {
  return {
    version: "2.0",
    class: "dataset",
    label: "Unemployment by sex and age - monthly data",
    source: "ESTAT",
    updated: "2026-07-02T23:00:00+0200",
    id: ["freq", "s_adj", "age", "unit", "sex", "geo", "time"],
    size: [1, 1, 1, 1, 1, 2, 2],
    dimension: {
      freq: { category: { index: { M: 0 }, label: { M: "Monthly" } } },
      s_adj: { category: { index: { SA: 0 }, label: { SA: "Seasonally adjusted" } } },
      age: { category: { index: { TOTAL: 0 }, label: { TOTAL: "Total" } } },
      unit: { category: { index: { PC_ACT: 0 }, label: { PC_ACT: "Pct labour force" } } },
      sex: { category: { index: { T: 0 }, label: { T: "Total" } } },
      geo: {
        category: {
          index: { EU27_2020: 0, LT: 1 },
          label: { EU27_2020: "European Union - 27", LT: "Lithuania" },
        },
      },
      time: { category: { index: { "2026-04": 0, "2026-05": 1 }, label: { "2026-04": "2026-04", "2026-05": "2026-05" } } },
    },
    // geo-major: [EU27 apr, EU27 may, LT apr, LT may]
    value: { 0: 5.9, 1: 5.9, 2: 7.1, 3: 6.9 },
    ...overrides,
  };
}

describe("parseEurostatJsonStat — happy path", () => {
  it("parses a well-formed body into schema-valid candidates with correct identity", () => {
    const res = parseEurostatJsonStat({
      body: uneBody(),
      dataset: UNE,
      requestUrl: "https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/une_rt_m?geo=EU27_2020",
      responseSha256: "abc123",
      nowMs: Date.parse("2026-07-10T00:00:00Z"),
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.updatedIso).toBe("2026-07-02T21:00:00.000Z");
    const candidates = res.cells.filter((c) => c.outcome.kind === "candidate");
    expect(candidates.length).toBe(4);

    for (const c of candidates) {
      if (c.outcome.kind !== "candidate") continue;
      const o = c.outcome.observation;
      // schema-valid
      expect(intelligenceObservationSchema.safeParse(o).success).toBe(true);
      expect(o.metricKey).toBe("labour.unemployment_rate");
      expect(o.unit).toBe("pc_act");
      expect(o.sourceKey).toBe("eurostat");
      expect(o.sourceKind).toBe("public_official");
      expect(o.privacyClass).toBe("public_aggregate");
      // capturedAt is the official publication time (idempotency anchor)
      expect(o.capturedAt).toBe("2026-07-02T21:00:00.000Z");
      // content hash matches recomputation (never trusted from the wire)
      expect(o.contentHash).toBe(
        computeObservationContentHash({
          subjectKind: o.subjectKind,
          subjectId: o.subjectId,
          metricKey: o.metricKey,
          geo: o.geo,
          window: o.window,
          valueNumeric: o.valueNumeric,
          unit: o.unit,
          statMethod: o.statMethod,
          sourceKind: o.sourceKind,
          sourceKey: o.sourceKey,
          capturedAt: o.capturedAt,
          transformVersion: o.transformVersion,
        }),
      );
    }
    // aggregate carries null country; member carries its code
    const eu = candidates.find(
      (c) => c.outcome.kind === "candidate" && c.outcome.observation.subjectId === "EU27_2020",
    );
    const lt = candidates.find(
      (c) => c.outcome.kind === "candidate" && c.outcome.observation.subjectId === "LT",
    );
    expect(eu && eu.outcome.kind === "candidate" && eu.outcome.observation.geo.country).toBeNull();
    expect(lt && lt.outcome.kind === "candidate" && lt.outcome.observation.geo.country).toBe("LT");
  });
});

describe("parseEurostatJsonStat — fail-closed", () => {
  it("rejects a non-dataset body", () => {
    const res = parseEurostatJsonStat({
      body: { class: "collection" },
      dataset: UNE,
      requestUrl: "u",
      responseSha256: "h",
      nowMs: 0,
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("not_jsonstat_dataset");
  });

  it("rejects when the mandatory 'updated' publication timestamp is missing", () => {
    const res = parseEurostatJsonStat({
      body: uneBody({ updated: undefined }),
      dataset: UNE,
      requestUrl: "u",
      responseSha256: "h",
      nowMs: 0,
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("source_update_timestamp_missing");
  });

  it("rejects the whole response when a pinned dimension drifted", () => {
    // s_adj arrives as NSA (unadjusted) instead of the pinned SA
    const res = parseEurostatJsonStat({
      body: uneBody({
        dimension: {
          ...(uneBody() as { dimension: Record<string, unknown> }).dimension,
          s_adj: { category: { index: { NSA: 0 }, label: { NSA: "Unadjusted" } } },
        },
      }),
      dataset: UNE,
      requestUrl: "u",
      responseSha256: "h",
      nowMs: 0,
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("dimension_drift");
  });

  it("REJECTS a missing value — never converts it to zero", () => {
    const res = parseEurostatJsonStat({
      body: uneBody({ value: { 0: 5.9, 1: 5.9, 2: 7.1 } }), // index 3 (LT may) missing
      dataset: UNE,
      requestUrl: "u",
      responseSha256: "h",
      nowMs: 0,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const missing = res.cells.filter(
      (c) => c.outcome.kind === "rejected" && c.outcome.reason === "value_missing",
    );
    expect(missing.length).toBe(1);
    // and no candidate carries a fabricated 0
    for (const c of res.cells) {
      if (c.outcome.kind === "candidate") {
        expect(c.outcome.observation.valueNumeric).not.toBe(0);
      }
    }
  });

  it("rejects a confidential-flagged cell, keeps a provisional flag in provenance", () => {
    const res = parseEurostatJsonStat({
      body: uneBody({ status: { 0: "c", 1: "p" } }),
      dataset: UNE,
      requestUrl: "u",
      responseSha256: "h",
      nowMs: 0,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const suppressed = res.cells.filter(
      (c) => c.outcome.kind === "rejected" && c.outcome.reason === "value_suppressed",
    );
    expect(suppressed.length).toBe(1);
    // the provisional cell survives WITH a disclosed status flag
    const provisional = res.cells.find(
      (c) =>
        c.outcome.kind === "candidate" &&
        c.outcome.observation.provenance.some((p) => p.step === "status_flag"),
    );
    expect(provisional).toBeTruthy();
    if (provisional && provisional.outcome.kind === "candidate") {
      const flagStep = provisional.outcome.observation.provenance.find(
        (p) => p.step === "status_flag",
      );
      expect(flagStep?.ref).toContain("provisional");
    }
  });
});
