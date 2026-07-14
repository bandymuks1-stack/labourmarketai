import { describe, it, expect } from "vitest";

import {
  runManualImportSandbox,
  SANDBOX_MAX_PREVIEWS,
  type SandboxRunInputV1,
} from "./manual-import-sandbox";

const NOW = Date.parse("2026-07-14T12:00:00Z");

/** A structurally valid INTERNAL row (the only kind that can fully pass
 *  today) as an NDJSON line. Synthetic sandbox test data — never imported. */
function internalRow(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    subject_kind: "profession",
    subject_id: "electrician",
    metric_key: "salary.month.gross",
    geo_country: "LT",
    window_start: "2026-06-01",
    window_end: "2026-06-30",
    value_numeric: 2100,
    unit: "eur_month_gross",
    stat_method: "median",
    source_kind: "internal_aggregated",
    source_key: "internal_platform_aggregates",
    derivation_ids: "agg-run-1",
    captured_at: "2026-07-10T08:00:00Z",
    sample_size: 42,
    transform_version: "v1",
    privacy_class: "public_aggregate",
    freshness_status: "fresh",
    source_language: "lt",
    ...overrides,
  });
}

/** The same figure as a (correctly still-blocked) external CVbankas row. */
function externalRow(overrides: Record<string, unknown> = {}): string {
  return internalRow({
    source_kind: "approved_public_web",
    source_key: "cvbankas_salary",
    source_url: "test://owner-supplied-file",
    derivation_ids: null,
    ...overrides,
  });
}

function run(
  content: string,
  overrides: Partial<SandboxRunInputV1> = {},
) {
  return runManualImportSandbox({
    fileName: "sandbox-test.ndjson",
    format: "ndjson",
    content,
    mode: "preview",
    nowMs: NOW,
    ...overrides,
  });
}

describe("dry-run guarantees", () => {
  it("persisted is LITERALLY false and the no-import notice always rides along", () => {
    const result = run(internalRow());
    expect(result.persisted).toBe(false);
    expect(result.noticeCode).toBe("intelligence.sandbox.noDataImported");
    // Also on parse failures.
    const failed = run("not json");
    expect(failed.persisted).toBe(false);
    expect(failed.noticeCode).toBe("intelligence.sandbox.noDataImported");
  });

  it("the engine module performs no persistence of any kind", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const src = readFileSync(
      join(__dirname, "manual-import-sandbox.ts"),
      "utf8",
    )
      .replace(/\/\*[\s\S]*?\*\//g, " ")
      .replace(/\/\/[^\n]*/g, " ");
    expect(src).not.toMatch(/\.(insert|upsert|update|delete)\s*\(/);
    expect(src).not.toMatch(/supabase|server-only|process\.env|\bfetch\s*\(/);
  });
});

describe("validation preview (§3)", () => {
  it("counts valid / invalid / duplicates and tallies issue classes", () => {
    const content = [
      internalRow(), // valid
      internalRow(), // exact duplicate → duplicate hash
      internalRow({ geo_country: "xx" }), // schema-invalid country format
      internalRow({ geo_country: "PL", subject_id: "plumber" }), // country not allowed
      internalRow({ subject_id: "welder", source_language: "de" }), // language
      internalRow({ subject_id: "mason", unit: "usd_year" }), // salary format (+hash changes)
      internalRow({ subject_id: "roofer", metric_key: null }), // missing field
    ].join("\n");
    const result = run(content);
    expect(result.rowsDetected).toBe(7);
    expect(result.validRows).toBe(1);
    expect(result.invalidRows).toBe(6);
    expect(result.tallies.duplicateHashes).toBe(1);
    expect(result.tallies.unknownCountries).toBe(1); // PL ("xx" fails schema)
    expect(result.tallies.unknownLanguages).toBe(1);
    expect(result.tallies.salaryFormat).toBe(1);
    expect(result.tallies.missingFields).toBe(1);
    expect(result.tallies.unsupportedSchema).toBeGreaterThanOrEqual(1); // "xx" geo
  });

  it("a rejected row does NOT poison the duplicate set for its corrected twin", () => {
    // Same observation identity: first with a rejected language, then the
    // corrected row. A real import stores only accepted rows — the
    // correction must validate, not fail as 'duplicate'.
    const content = [
      internalRow({ source_language: "de" }), // rejected: language
      internalRow(), // corrected twin (same content hash) → must be VALID
    ].join("\n");
    const result = run(content);
    expect(result.validRows).toBe(1);
    expect(result.tallies.duplicateHashes).toBe(0);
    expect(result.previews[1].valid).toBe(true);
  });

  it("parse refusal reports the reason code and zero rows", () => {
    const result = run("{broken", { format: "json" });
    expect(result.parse).toEqual({
      ok: false,
      reasonCode: "invalid_json",
      rowNumber: null,
    });
    expect(result.rowsDetected).toBe(0);
    expect(result.sessionPreview).toBeNull();
    expect(result.reportPreview).toBeNull();
  });
});

describe("readiness is NOT bypassed (fail-closed) — but honestly explained", () => {
  it("external rows fail source_approved today; validAfterActivation counts them", () => {
    const result = run([externalRow(), externalRow({ subject_id: "plumber" })].join("\n"));
    expect(result.validRows).toBe(0);
    expect(result.tallies.sourceNotActive).toBe(2);
    // Both rows are otherwise perfect → they'd validate after activation.
    expect(result.validAfterActivation).toBe(2);
    // A row with OTHER problems too is NOT counted as activation-ready.
    const mixed = run(externalRow({ unit: "usd_year" }));
    expect(mixed.validAfterActivation).toBe(0);
  });

  it("unknown sources are NOT counted as activation-ready — nothing exists to switch on", () => {
    const result = run(
      externalRow({ source_key: "cvbankas_salaray" /* typo → unknown */ }),
    );
    expect(result.validRows).toBe(0);
    expect(result.validAfterActivation).toBe(0);
    expect(result.tallies.sourceNotActive).toBe(1);
  });
});

describe("observation preview (§4)", () => {
  it("renders hash/source/timestamp/country/language/salary basis/confidence/validation/provenance", () => {
    const result = run(internalRow());
    expect(result.previews).toHaveLength(1);
    const p = result.previews[0];
    expect(p.contentHash).toMatch(/^[0-9a-f]{64}$/);
    expect(p.sourceKey).toBe("internal_platform_aggregates");
    expect(p.capturedAtIso).toBe("2026-07-10T08:00:00Z");
    expect(p.country).toBe("LT");
    expect(p.language).toBe("lt");
    expect(p.salaryBasis).toBe("gross");
    // fresh + confirmed internal + sample 42 + provenance 1 → high
    expect(p.confidence).toBe("high");
    expect(p.valid).toBe(true);
    expect(p.failureCodes).toEqual([]);
    expect(p.provenanceRef).toBe("sandbox-test.ndjson#row-1");
  });

  it("failure codes are deterministic check:reason pairs — no stack traces", () => {
    const result = run(externalRow());
    const p = result.previews[0];
    expect(p.valid).toBe(false);
    expect(p.failureCodes).toEqual(["source_approved:source_not_active"]);
    for (const code of p.failureCodes) {
      expect(code).toMatch(/^[a-z_]+:[a-z0-9_.:]+$/i);
      expect(code).not.toMatch(/\bat\s.+\d+:\d+/); // no stack frames
    }
  });

  it("validate_only mode produces counts but NO previews", () => {
    const result = run(internalRow(), { mode: "validate_only" });
    expect(result.previews).toEqual([]);
    expect(result.rowsDetected).toBe(1);
    expect(result.validRows).toBe(1);
  });

  it("previews are bounded", () => {
    const rows = Array.from({ length: SANDBOX_MAX_PREVIEWS + 10 }, (_, i) =>
      internalRow({ subject_id: `worker-${i}` }),
    ).join("\n");
    expect(run(rows).previews).toHaveLength(SANDBOX_MAX_PREVIEWS);
  });
});

describe("import session + report preview (§6)", () => {
  it("produces the exact contracts with a SIMULATED rollback reference", () => {
    const result = run(
      [internalRow(), internalRow(), internalRow({ unit: "usd_year", subject_id: "x" })].join("\n"),
    );
    const session = result.sessionPreview!;
    expect(session.itemsScanned).toBe(3);
    expect(session.itemsAccepted).toBe(1);
    expect(session.itemsDuplicated).toBe(1);
    expect(session.itemsRejected).toBe(1);
    expect(session.rollbackRef).toBe("sandbox-simulated:sandbox-test.ndjson");
    const report = result.reportPreview!;
    expect(report.finalStatus).toBe("partial");
    expect(report.warningCodes).toContain("sandbox_simulated_run");
    expect(report.skipped.length).toBeGreaterThan(0);
  });

  it("an all-valid internal file previews a success report", () => {
    const result = run(
      [internalRow(), internalRow({ subject_id: "plumber" })].join("\n"),
    );
    expect(result.reportPreview!.finalStatus).toBe("success");
  });
});
