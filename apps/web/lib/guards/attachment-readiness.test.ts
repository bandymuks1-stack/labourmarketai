import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Source-level guards for the Level 2 extraction-readiness FOUNDATION
 * (PR C). The whole point is that NOTHING is actually extracted — these
 * guards fail loudly if a future edit starts reading bytes, parsing,
 * calling AI/OCR, or claiming extraction already happened.
 */

const APP_ROOT = join(__dirname, "..", "..");
function read(rel: string): string {
  return readFileSync(join(APP_ROOT, rel), "utf8");
}

describe("Guard: attachment-readiness helper is a pure foundation", () => {
  const src = read("lib/buyer/attachment-readiness.ts");

  it("is NOT server-only and has no IO / clock / randomness", () => {
    expect(src).not.toMatch(/import\s+["']server-only["']/);
    expect(src).not.toMatch(/Date\.now|new Date\(|Math\.random|fetch\(/);
  });

  it("does NOT read file bytes, parse PDF, run OCR, or call AI", () => {
    const codeOnly = src
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/[^\n]*/g, "")
      .toLowerCase();
    for (const banned of [
      "arraybuffer",
      "readfile",
      "pdf-parse",
      "pdfjs",
      "tesseract",
      "ocr(",
      "openai",
      "anthropic",
      ".download(",
      "createsignedurl",
    ]) {
      expect(codeOnly.includes(banned), `must not use ${banned}`).toBe(false);
    }
  });

  it("exposes only the not_enabled current state (no completed/extracted)", () => {
    const codeOnly = src.replace(/\/\*[\s\S]*?\*\//g, "");
    expect(codeOnly).toContain('"not_enabled"');
    expect(codeOnly).not.toMatch(/"completed"|"extracted"|"done"/);
  });

  it("maps exactly the four future-reader states", () => {
    for (const s of [
      "future_readable_text_file",
      "future_pdf_reader_needed",
      "future_ocr_needed",
      "manual_review_only",
    ]) {
      expect(src).toContain(`"${s}"`);
    }
  });
});

describe("Guard: the uploader surfaces readiness without faking extraction", () => {
  const src = read("components/app/buyer-request-attachment-uploader.tsx");
  it("imports + uses computeExtractionReadiness per file", () => {
    expect(src).toMatch(/from\s+["']@\/lib\/buyer\/attachment-readiness["']/);
    expect(src).toMatch(/computeExtractionReadiness\(/);
    expect(src).toMatch(/data-testid="buyer-request-attachment-readiness"/);
  });
  it("still does not store extracted text or flip analysis to completed", () => {
    const codeOnly = src
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/[^\n]*/g, "");
    expect(codeOnly).not.toMatch(/extracted_text/);
    expect(codeOnly).not.toMatch(/analysis_status\s*[:=]\s*["']completed["']/);
  });
});

describe("Guard: extraction-readiness copy is future/honest, never 'already read' (LT + EN)", () => {
  // Words that would imply extraction ALREADY ran. Our copy must speak in
  // future / not-enabled terms only.
  const IMPLIES_ACTIVE = [
    "nuskaityta", // LT: has been read (done)
    "perskaityt", // LT: read-through (done)
    "ištraukt", // LT: extracted
    "extracted",
    "extraction complete",
    "ocr complete",
    "automatically read",
  ];

  for (const locale of ["lt", "en"] as const) {
    it(`${locale}.json extractionReadiness present + no already-active wording`, () => {
      const json = JSON.parse(read(`messages/${locale}.json`)) as Record<
        string,
        unknown
      >;
      const er = (
        (
          (
            (json.roleDashboards as Record<string, unknown>).buyer as Record<
              string,
              unknown
            >
          ).requests as Record<string, unknown>
        ).understanding as Record<string, unknown>
      ).extractionReadiness as Record<string, string>;
      expect(er, `${locale} extractionReadiness missing`).toBeTruthy();
      for (const s of [
        "future_readable_text_file",
        "future_pdf_reader_needed",
        "future_ocr_needed",
        "manual_review_only",
      ]) {
        expect(er[s], `${locale} extractionReadiness.${s}`).toBeTruthy();
      }
      const flat = JSON.stringify(er).toLowerCase();
      for (const phrase of IMPLIES_ACTIVE) {
        expect(
          flat.includes(phrase),
          `${locale} extractionReadiness must not imply active extraction: "${phrase}"`,
        ).toBe(false);
      }
    });
  }
});
