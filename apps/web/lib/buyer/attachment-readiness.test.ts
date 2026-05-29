import { describe, expect, it } from "vitest";

import {
  EXTRACTION_STATE,
  computeExtractionReadiness,
} from "./attachment-readiness";

/**
 * Attachment extraction-readiness mapping guard (PR C). Pins the MIME →
 * future-reader classification and the always-off current state.
 */

describe("computeExtractionReadiness", () => {
  it("maps text/plain → future_readable_text_file", () => {
    expect(computeExtractionReadiness("text/plain")).toBe(
      "future_readable_text_file",
    );
  });

  it("maps application/pdf → future_pdf_reader_needed", () => {
    expect(computeExtractionReadiness("application/pdf")).toBe(
      "future_pdf_reader_needed",
    );
  });

  it("maps images → future_ocr_needed", () => {
    for (const m of ["image/jpeg", "image/png", "image/webp"]) {
      expect(computeExtractionReadiness(m)).toBe("future_ocr_needed");
    }
  });

  it("maps unknown / unsupported / empty → manual_review_only", () => {
    for (const m of [
      "application/zip",
      "application/msword",
      "image/gif",
      "",
      null,
      undefined,
    ]) {
      expect(computeExtractionReadiness(m)).toBe("manual_review_only");
    }
  });

  it("is case- and whitespace-insensitive on the MIME type", () => {
    expect(computeExtractionReadiness("  TEXT/PLAIN ")).toBe(
      "future_readable_text_file",
    );
    expect(computeExtractionReadiness("Application/PDF")).toBe(
      "future_pdf_reader_needed",
    );
  });

  it("exposes only the not-enabled current state", () => {
    expect(EXTRACTION_STATE).toBe("not_enabled");
  });
});
