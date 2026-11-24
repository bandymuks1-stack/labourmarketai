import { afterEach, describe, expect, it, vi } from "vitest";

import {
  observationToDbRow,
  writeEurostatObservations,
  type ObservationInsertClient,
} from "./eurostat-observation-writer";
import type { IntelligenceObservationV1 } from "@/lib/intelligence/observation-contract";

function eurostatObs(
  overrides: Partial<IntelligenceObservationV1> = {},
): IntelligenceObservationV1 {
  return {
    subjectKind: "geo_market",
    subjectId: "EU27_2020",
    metricKey: "labour.employment_rate",
    geo: { country: null, region: null, city: null },
    window: { start: "2025-04-01", end: "2025-06-30" },
    valueNumeric: 76.1,
    unit: "pc_pop",
    statMethod: "ratio",
    sourceKind: "public_official",
    sourceKey: "eurostat",
    sourceUrl: "https://ec.europa.eu/eurostat/api/x",
    derivationIds: [],
    capturedAt: "2026-06-11T21:00:00.000Z",
    validFrom: "2026-06-11T21:00:00.000Z",
    validTo: null,
    sampleSize: null,
    confidence: null,
    transformVersion: "eurostat_v1",
    privacyClass: "public_aggregate",
    freshnessStatus: "fresh",
    provenance: [{ step: "dataset", ref: "lfsi_emp_q" }],
    contentHash: "hash_emp_eu",
    ...overrides,
  };
}

afterEach(() => {
  vi.unstubAllEnvs();
});

function enable() {
  vi.stubEnv("EUROSTAT_SOURCE_ENABLED", "on");
  vi.stubEnv("EUROSTAT_KILL_SWITCH", "");
}

describe("observationToDbRow", () => {
  it("maps every field to the snake_case DB shape", () => {
    const row = observationToDbRow(eurostatObs());
    expect(row.metric_key).toBe("labour.employment_rate");
    expect(row.geo_country).toBeNull();
    expect(row.window_start).toBe("2025-04-01");
    expect(row.source_key).toBe("eurostat");
    expect(row.content_hash).toBe("hash_emp_eu");
    expect(row.transform_version).toBe("eurostat_v1");
    expect(row.privacy_class).toBe("public_aggregate");
  });
});

describe("writeEurostatObservations — last-gate refusals", () => {
  it("WRITES when eurostat is activated (boundary passes) — idempotent insert", async () => {
    // eurostat is now confirmed+on → the import boundary allows the write.
    enable();
    const insert = vi.fn().mockResolvedValue({ error: null });
    const client: ObservationInsertClient = { from: () => ({ insert }) };
    const res = await writeEurostatObservations(client, [eurostatObs()], "snap-1");
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.attempted).toBe(1);
      expect(res.inserted).toBe(1);
      expect(res.duplicates).toBe(0);
    }
    expect(insert).toHaveBeenCalledTimes(1);
  });

  it("treats a unique-violation on content_hash as an idempotent duplicate, not an error", async () => {
    enable();
    const insert = vi
      .fn()
      .mockResolvedValue({ error: { code: "23505", message: "duplicate key" } });
    const client: ObservationInsertClient = { from: () => ({ insert }) };
    const res = await writeEurostatObservations(client, [eurostatObs()], "snap-1");
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.inserted).toBe(0);
      expect(res.duplicates).toBe(1);
    }
  });

  it("REFUSES entirely when the kill switch is engaged (no client call)", async () => {
    vi.stubEnv("EUROSTAT_SOURCE_ENABLED", "on");
    vi.stubEnv("EUROSTAT_KILL_SWITCH", "on");
    const insert = vi.fn().mockResolvedValue({ error: null });
    const client: ObservationInsertClient = { from: () => ({ insert }) };
    const res = await writeEurostatObservations(client, [eurostatObs()], "snap-1");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reasonCode).toBe("not_operational");
    expect(insert).not.toHaveBeenCalled();
  });

  it("REFUSES a non-eurostat row", async () => {
    enable();
    const client: ObservationInsertClient = {
      from: () => ({ insert: vi.fn().mockResolvedValue({ error: null }) }),
    };
    const res = await writeEurostatObservations(
      client,
      [eurostatObs({ sourceKey: "cvbankas_salary" })],
      "snap-1",
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reasonCode).toBe("not_eurostat_row");
  });
});
