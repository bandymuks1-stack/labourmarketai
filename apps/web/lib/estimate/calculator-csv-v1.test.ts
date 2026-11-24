import { describe, expect, it } from "vitest";
import { buildCalculatorCsv, csvSafeCell } from "./calculator-csv-v1";
import { EMPTY_ESTIMATE_INPUTS, computeEstimate, estimateMissingInfoKeys } from "./estimate";
import { computeVatDisplay } from "./vat-display-v1";

const inputs = {
  ...EMPTY_ESTIMATE_INPUTS,
  workerCount: 2,
  hoursPerWorker: 40,
  rate: 25,
  materials: 500,
  contingencyPercent: 10,
};

function build(over: Partial<Parameters<typeof buildCalculatorCsv>[0]> = {}) {
  const result = computeEstimate(inputs);
  return buildCalculatorCsv({
    inputs,
    result,
    vat: computeVatDisplay(result.estimatedTotal, 21),
    pack: null,
    generatedAtIso: "2026-07-17T00:00:00.000Z",
    missingInfo: estimateMissingInfoKeys(inputs),
    labels: { estimatedTotal: "Estimated total" },
    disclaimer: "Preliminary estimate — not a final offer.",
    ...over,
  });
}

describe("calculator CSV — stable columns + provenance", () => {
  it("carries the header, versions, currency and generated-at rows", () => {
    const csv = build();
    expect(csv.startsWith("section,key,label,value,unit\r\n")).toBe(true);
    expect(csv).toContain("meta,csv_version,csv_version,1,");
    expect(csv).toContain("meta,engine_version,engine_version,1,");
    expect(csv).toContain("meta,vat_display_version,vat_display_version,1,");
    expect(csv).toContain("meta,generated_at,generated_at,2026-07-17T00:00:00.000Z,");
    expect(csv).toContain("meta,currency,currency,EUR,");
  });
  it("is deterministic for identical input", () => {
    expect(build()).toBe(build());
  });
  it("uses localized labels when given, stable ids otherwise", () => {
    const csv = build();
    expect(csv).toContain("result,estimatedTotal,Estimated total,2750.00,EUR");
    expect(csv).toContain("inputs,rate,rate,25.00,EUR/h");
  });
  it("emits VAT rows only when VAT was entered", () => {
    const withVat = build();
    expect(withVat).toContain("result,vatAmount");
    expect(withVat).toContain("result,grossTotalInclVat");
    const noVat = build({ vat: null });
    expect(noVat).not.toContain("vatAmount");
    expect(noVat).not.toContain("vat_display_version");
  });
  it("lists honest missing-info rows instead of pretending completeness", () => {
    const csv = build({ missingInfo: ["rate", "hours"] });
    expect(csv).toContain("missing,rate");
    expect(csv).toContain("missing,hours");
    // A complete estimate emits no missing rows.
    expect(build({ missingInfo: [] })).not.toContain("\r\nmissing,");
  });
});

describe("calculator CSV — formula-injection safety", () => {
  it("csvSafeCell neutralises leading = + - @ and control chars", () => {
    expect(csvSafeCell("=SUM(A1:A9)")).toBe("'=SUM(A1:A9)");
    expect(csvSafeCell("+1")).toBe("'+1");
    expect(csvSafeCell("-cmd")).toBe("'-cmd");
    expect(csvSafeCell("@import")).toBe("'@import");
    expect(csvSafeCell("plain")).toBe("plain");
    // Quoting from csvCell still applies after the guard.
    expect(csvSafeCell('=HYPERLINK("x"),y')).toBe('"\'=HYPERLINK(""x""),y"');
  });
  it("user free text (workType) cannot start a formula in the file", () => {
    const csv = build({
      inputs: { ...inputs, workType: '=HYPERLINK("http://evil","click")' },
    });
    const line = csv
      .split("\r\n")
      .find((l) => l.startsWith("inputs,workType"));
    expect(line).toBeDefined();
    expect(line).toContain("'=HYPERLINK");
    expect(line?.includes(',=HYPERLINK')).toBe(false);
  });
});
