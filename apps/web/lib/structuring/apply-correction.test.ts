import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { applyCorrection } from "./apply-correction";
import { structureValueStatement } from "./value-statement";

/**
 * User corrections (V10 §36): explicit "ne X, o Y" replaces exactly the
 * corrected fact of the LAST interpretation; everything else returns null
 * and re-runs full structuring — no false merges, nothing ever dispatched.
 */

const TODAY = "2026-08-13";

const CUCUMBERS = structureValueStatement(
  "Turiu 30 kg savo darže užaugintų agurkų ir noriu parduoti",
  TODAY,
);

describe("quantity corrections", () => {
  it("'Ne 30, o 300 kg' replaces the amount and says what was replaced", () => {
    const r = applyCorrection(CUCUMBERS, "Ne 30, o 300 kg", TODAY);
    expect(r).not.toBeNull();
    expect(r!.statement.quantity).toEqual({ value: 300, unit: "kg", raw: "300 kg" });
    expect(r!.changes).toEqual([
      { field: "quantity", previous: "30 kg", next: "300 kg" },
    ]);
    // The rest of the statement is untouched.
    expect(r!.statement.subject).toBe("goods");
    expect(r!.statement.subjectLabel).toBe(CUCUMBERS.subjectLabel);
  });

  it("a bare corrected number inherits the previous unit — never invents one", () => {
    const r = applyCorrection(CUCUMBERS, "ne 30, o 300", TODAY);
    expect(r!.statement.quantity).toEqual({ value: 300, unit: "kg", raw: "300 kg" });
  });

  it("RU: 'не 30, а 300 кг' works the same", () => {
    const r = applyCorrection(CUCUMBERS, "не 30, а 300 кг", TODAY);
    expect(r).not.toBeNull();
    expect(r!.statement.quantity?.value).toBe(300);
  });
});

describe("location, window, profession and intent corrections", () => {
  it("'ne Lietuvoje, o Vokietijoje' moves the country (country granularity)", () => {
    const prev = structureValueStatement("Parduodu grąžtą Lietuvoje", TODAY);
    const r = applyCorrection(prev, "ne Lietuvoje, o Vokietijoje", TODAY);
    expect(r!.statement.country).toBe("DE");
    expect(r!.changes).toContainEqual({
      field: "country",
      previous: "LT",
      next: "DE",
    });
  });

  it("'ne šią savaitę, o kitą' shifts the window family (ellipsis)", () => {
    const prev = structureValueStatement("Šią savaitę turiu dvi laisvas dienas", TODAY);
    const r = applyCorrection(prev, "ne šią savaitę, o kitą", TODAY);
    expect(r!.statement.window).toMatchObject({
      kind: "next_week",
      startIso: "2026-08-17",
    });
  });

  it("'ne suvirintojų, o elektrikų' recasts the profession", () => {
    const prev = structureValueStatement(
      "Mūsų įmonei kitą mėnesį trūks keturių suvirintojų",
      TODAY,
    );
    const r = applyCorrection(prev, "ne suvirintojų, o elektrikų", TODAY);
    expect(r!.statement.workType).toBe("electrician");
    expect(r!.statement.headcount).toBe(4); // untouched
  });

  it("'ne parduoti, o išnuomoti' flips the offer shape to rental", () => {
    const r = applyCorrection(CUCUMBERS, "ne parduoti, o išnuomoti", TODAY);
    expect(r!.statement.offerMode).toBe("rental");
  });

  it("a satisfied missing field leaves the missing list", () => {
    expect(CUCUMBERS.missing).toContain("location");
    const r = applyCorrection(CUCUMBERS, "ne Lenkijoje, o Lietuvoje", TODAY);
    expect(r!.statement.missing).not.toContain("location");
  });
});

describe("what is NOT a correction", () => {
  it("a bare restatement with a new number is NOT merged", () => {
    expect(applyCorrection(CUCUMBERS, "Turiu 300 kg obuolių", TODAY)).toBeNull();
  });

  it("small talk and unrelated negations return null", () => {
    expect(applyCorrection(CUCUMBERS, "labas", TODAY)).toBeNull();
    expect(applyCorrection(CUCUMBERS, "ne, ačiū", TODAY)).toBeNull();
  });

  it("a marker with nothing extractable returns null", () => {
    expect(applyCorrection(CUCUMBERS, "ne taip, o kitaip", TODAY)).toBeNull();
  });
});

describe("corrections are state-only — nothing can dispatch", () => {
  it("the module imports no action/dispatch/persistence path", () => {
    // Comments stripped: the docstring HONESTLY names the forbidden verbs.
    const src = readFileSync(resolve(__dirname, "apply-correction.ts"), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, " ")
      .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
    expect(src).not.toMatch(/dispatch|actions|supabase|server-only|\.rpc\(|fetch\(/);
  });
});
