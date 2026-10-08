import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { deriveInvoiceEvidenceRows } from "@/lib/finance/invoice-evidence-parity";
import type { WorkTimeMetricRow } from "@/lib/journal/work-time";

type FixtureMetric = { slug: string; text?: string; value?: number; unit?: string };
type FixtureCase = {
  id: string;
  createdAt: string;
  metrics: FixtureMetric[];
  expected: { day: string; rows: Array<{ key: string; kind: string; unit: string; hours?: number; quantity?: number }> };
};

const fixture = JSON.parse(
  readFileSync(join(__dirname, "fixtures", "work-time-parity.json"), "utf8"),
) as { cases: FixtureCase[] };

/** metric i is created i seconds after the base instant: the same order the SQL proof writes. */
function toMetricRows(metrics: FixtureMetric[]): WorkTimeMetricRow[] {
  return metrics.map((m, i) => ({
    id: `m${String(i).padStart(3, "0")}`,
    created_at: `2026-09-01T00:00:${String(i).padStart(2, "0")}Z`,
    metric_slug: m.slug,
    value_text: m.text ?? null,
    value_numeric: m.value ?? null,
    unit_slug: m.unit ?? null,
  }));
}

describe("work-time parity fixture (shared with the SQL proof script)", () => {
  it("has the cases the contract names", () => {
    expect(fixture.cases.length).toBeGreaterThanOrEqual(13);
    const ids = fixture.cases.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain("days-only-is-never-hours");
    expect(ids).toContain("days-fragment-claims-its-index");
  });

  for (const c of fixture.cases) {
    it(`TypeScript rule == fixture: ${c.id}`, () => {
      const got = deriveInvoiceEvidenceRows({ createdAt: c.createdAt, metrics: toMetricRows(c.metrics) });
      const expectedRows = [...c.expected.rows].sort((a, b) => a.key.localeCompare(b.key));
      expect(got.day).toBe(c.expected.day);
      expect(got.rows).toEqual(expectedRows);
    });
  }

  it("a `days` value is never converted to hours anywhere", () => {
    for (const c of fixture.cases) {
      const got = deriveInvoiceEvidenceRows({ createdAt: c.createdAt, metrics: toMetricRows(c.metrics) });
      for (const r of got.rows) if (r.unit === "days") expect(r.kind).toBe("quantity");
    }
  });
});
