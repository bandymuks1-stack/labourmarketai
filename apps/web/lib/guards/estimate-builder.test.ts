/**
 * Estimate Builder MVP integration + honesty guard.
 *
 * Source-level assertions that the deterministic estimate is wired into the
 * demand flow correctly and stays honest: optional, result displayed, saved in
 * customer_requests.payload, read back, tolerant of older rows, fully localized,
 * and never claiming a binding quote / fake AI / guaranteed price.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const webRoot = resolve(__dirname, "..", "..");
const read = (rel: string) => readFileSync(resolve(webRoot, rel), "utf-8");
/** Strip comments so honesty checks scan real code/strings, not the
 *  explanatory docstrings that legitimately say "not a binding quote". */
const code = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");

const builder = read("components/app/estimate-builder.tsx");
const summary = read("components/app/estimate-summary.tsx");
const form = read("components/app/demand-request-button.tsx");
const helper = read("lib/demand/demand-request.ts");
const readback = read("components/app/demand-requests-readback.tsx");
const engine = read("lib/estimate/estimate.ts");

describe("Estimate Builder is wired into the demand Criteria step", () => {
  it("the form renders the builder and threads its inputs to submit", () => {
    expect(form).toMatch(/<EstimateBuilder\b/);
    expect(form).toMatch(/estimate: estimateEngaged \? estimate : undefined/);
  });
  it("the builder separates entered numbers from the calculated result", () => {
    expect(builder).toContain("sectionEntered");
    expect(summary).toContain("sectionResult");
    expect(builder).toMatch(/<EstimateSummary\b/);
  });
  it("the result (total) is displayed", () => {
    expect(summary).toContain('data-testid="estimate-total"');
  });
});

describe("invalid input is blocked", () => {
  it("the builder shows validation errors and the form gates on validity", () => {
    expect(builder).toMatch(/validateEstimateInputs/);
    expect(builder).toContain('data-testid="estimate-errors"');
    expect(form).toMatch(/step === 2 && !estimateOk/);
    expect(form).toMatch(/!descOk \|\| !estimateOk/);
  });
  it("number inputs forbid negatives (min=0)", () => {
    expect(builder).toMatch(/min=\{0\}/);
  });
  it("the server blocks an engaged-but-invalid estimate and never stores it", () => {
    expect(helper).toMatch(/invalid_estimate/);
    expect(helper).toMatch(/validateEstimateInputs\(fields\.estimate, true\)/);
    expect(helper).toMatch(/payload\.estimate = stored/);
  });
});

describe("estimate is saved in customer_requests.payload + read back", () => {
  it("the helper attaches the recomputed estimate to the request payload", () => {
    expect(helper).toMatch(/buildEstimatePayload\(fields\.estimate\)/);
  });
  it("the read-back renders the stored estimate, tolerant of older rows", () => {
    expect(readback).toMatch(/parseStoredEstimate\(r\.payload\)/);
    expect(readback).toMatch(/estimate &&/); // only when present
    expect(readback).toContain('data-testid="demand-readback-estimate"');
  });
});

describe("honesty — no fake AI / guaranteed price / binding quote", () => {
  for (const [name, src] of [
    ["builder", builder],
    ["summary", summary],
    ["engine", engine],
  ] as const) {
    it(`${name} carries no AI / matching / guarantee / binding claim`, () => {
      const c = code(src);
      expect(c).not.toMatch(/\bmatched\b|\bverified\b/i);
      expect(c).not.toMatch(/guaranteed|binding quote/i);
      // No LLM/AI client usage in the estimate path.
      expect(c).not.toMatch(/openai|anthropic|\bllm\b/i);
    });
  }
  it("the estimate disclaimer copy is present in all active locales", () => {
    for (const locale of ["en", "lt", "ru"] as const) {
      const j = JSON.parse(read(`messages/${locale}.json`));
      const est = j.auth.dashboard.wow.demand.estimate;
      expect(typeof est.disclaimer, `${locale} disclaimer`).toBe("string");
      // Disclaimer must explicitly say it is not binding / not final.
      const d = est.disclaimer.toLowerCase();
      expect(
        /not a binding|not a final|nėra galutinis|не обязывающ|не окончательное/.test(d),
        `${locale} disclaimer must disclaim a binding/final quote`,
      ).toBe(true);
    }
  });
});

describe("estimate copy is localized for active locales (lt/en/ru)", () => {
  for (const locale of ["en", "lt", "ru"] as const) {
    it(`${locale}: estimate field + result + assumption keys exist`, () => {
      const j = JSON.parse(read(`messages/${locale}.json`));
      const est = j.auth.dashboard.wow.demand.estimate;
      for (const k of ["toggle", "sectionEntered", "sectionResult", "preliminaryTitle"]) {
        expect(typeof est[k], `${locale} estimate.${k}`).toBe("string");
      }
      for (const f of ["rate", "materials", "overhead", "margin", "contingency", "workerCount"]) {
        expect(typeof est.f[f], `${locale} estimate.f.${f}`).toBe("string");
      }
      for (const r of ["labourSubtotal", "overhead", "margin", "contingency", "estimatedTotal"]) {
        expect(typeof est.r[r], `${locale} estimate.r.${r}`).toBe("string");
      }
      for (const e of ["negative_rate", "percent_out_of_range", "empty_labour"]) {
        expect(typeof est.errors[e], `${locale} estimate.errors.${e}`).toBe("string");
      }
    });
  }
});
