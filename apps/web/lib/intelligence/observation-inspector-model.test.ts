import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  INSPECTOR_MAX_ROWS,
  isInspectorEnabled,
  toInspectorRow,
  toInspectorRows,
} from "./observation-inspector-model";

/** A row exactly as the gated migration's snake_case columns define it. */
const RAW_ROW: Record<string, unknown> = {
  id: "3f6b2a1e-0000-0000-0000-000000000001",
  subject_kind: "profession",
  subject_id: "electrician",
  metric_key: "salary.month.gross",
  geo_country: "LT",
  value_numeric: 2100,
  unit: "eur_month_gross",
  stat_method: "median",
  source_kind: "internal_aggregated",
  source_key: "internal_platform_aggregates",
  captured_at: "2026-07-10T08:00:00Z",
  sample_size: 42,
  confidence: 0.8,
  transform_version: "v1",
  privacy_class: "public_aggregate",
  freshness_status: "fresh",
  provenance: [{ step: "aggregate", ref: "workers" }],
  content_hash: "abc123def456",
};

describe("isInspectorEnabled — fail-closed feature gate", () => {
  it('only "1" or "true" enable it', () => {
    expect(isInspectorEnabled("1")).toBe(true);
    expect(isInspectorEnabled("true")).toBe(true);
  });

  it("absent / empty / anything else stays OFF", () => {
    expect(isInspectorEnabled(undefined)).toBe(false);
    expect(isInspectorEnabled(null)).toBe(false);
    expect(isInspectorEnabled("")).toBe(false);
    expect(isInspectorEnabled("yes")).toBe(false);
    expect(isInspectorEnabled("TRUE")).toBe(false);
    expect(isInspectorEnabled("0")).toBe(false);
  });
});

describe("toInspectorRow — read-only projection with honest nulls", () => {
  it("projects the display fields verbatim", () => {
    const row = toInspectorRow(RAW_ROW);
    expect(row.id).toBe("3f6b2a1e-0000-0000-0000-000000000001");
    expect(row.contentHash).toBe("abc123def456");
    expect(row.sourceKey).toBe("internal_platform_aggregates");
    expect(row.capturedAtIso).toBe("2026-07-10T08:00:00Z");
    expect(row.privacyClass).toBe("public_aggregate");
    expect(row.freshnessStatus).toBe("fresh");
    expect(row.confidenceRaw).toBe(0.8);
    expect(row.sampleSize).toBe(42);
  });

  it("derives the confidence level from structured facts (never the raw score)", () => {
    // fresh + confirmed internal source + sample 42 ≥ 30 + provenance → high
    expect(toInspectorRow(RAW_ROW).confidence).toBe("high");
    // Unknown source → legal status unknown → confidence unknown.
    expect(
      toInspectorRow({ ...RAW_ROW, source_key: "mystery_source" }).confidence,
    ).toBe("unknown");
    // Missing sample size → unknown, even though the raw score says 0.8.
    expect(
      toInspectorRow({ ...RAW_ROW, sample_size: null }).confidence,
    ).toBe("unknown");
  });

  it("malformed fields become honest nulls, never inventions", () => {
    const row = toInspectorRow({
      id: 42,
      content_hash: "",
      sample_size: "not-a-number",
      confidence: {},
    });
    expect(row.id).toBe(null);
    expect(row.contentHash).toBe(null);
    expect(row.sampleSize).toBe(null);
    expect(row.confidenceRaw).toBe(null);
    expect(row.confidence).toBe("unknown");
  });

  it("never throws on arbitrary input", () => {
    expect(() => toInspectorRow({})).not.toThrow();
  });
});

describe("toInspectorRows — bounded output", () => {
  it(`caps at ${INSPECTOR_MAX_ROWS} rows`, () => {
    const rows = toInspectorRows(
      Array.from({ length: INSPECTOR_MAX_ROWS + 25 }, () => RAW_ROW),
    );
    expect(rows).toHaveLength(INSPECTOR_MAX_ROWS);
  });
});

describe("read-only by construction", () => {
  it("the module source contains no insert/update/delete/upsert call", () => {
    const src = readFileSync(
      join(__dirname, "observation-inspector-model.ts"),
      "utf8",
    )
      .replace(/\/\*[\s\S]*?\*\//g, " ")
      .replace(/\/\/[^\n]*/g, " ");
    expect(src).not.toMatch(/\.(insert|update|delete|upsert)\s*\(/);
  });
});
