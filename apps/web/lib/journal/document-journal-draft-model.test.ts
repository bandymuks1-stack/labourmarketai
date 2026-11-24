/**
 * Document → journal provenance — pure-model tests (value train 2, C1).
 *
 * Pins the import-provenance contract: every imported entry names its source
 * file and its extractor, the extractor identity spells "deterministic"
 * (never a vendor-AI claim, §7.1), and image types are refused because no
 * OCR exists (§18 — no pretended capability).
 */
import { describe, expect, it } from "vitest";
import {
  DOCUMENT_EXTRACTOR_NAME,
  EXTRACTOR_VERSION_METRIC_SLUG,
  SOURCE_DOCUMENT_METRIC_SLUG,
  documentProvenanceMetrics,
  isExtractableDocumentMime,
} from "./document-journal-draft-model";

describe("documentProvenanceMetrics", () => {
  const rows = documentProvenanceMetrics("11111111-2222-3333-4444-555555555555");

  it("carries the source file id and the extractor identity", () => {
    expect(rows.map((r) => r.metric_slug)).toEqual([
      SOURCE_DOCUMENT_METRIC_SLUG,
      EXTRACTOR_VERSION_METRIC_SLUG,
    ]);
    expect(rows[0].value_text).toBe("11111111-2222-3333-4444-555555555555");
  });

  it("the extractor row spells the deterministic pack, never a vendor", () => {
    expect(rows[1].value_text).toContain(DOCUMENT_EXTRACTOR_NAME);
    expect(rows[1].value_text).toMatch(/^deterministic-/);
  });

  it("provenance rows carry the machine-origin source value", () => {
    for (const r of rows) expect(r.source).toBe("ai_extracted");
  });
});

describe("isExtractableDocumentMime", () => {
  it("serves pdf and docx", () => {
    expect(isExtractableDocumentMime("application/pdf")).toBe(true);
    expect(
      isExtractableDocumentMime(
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ),
    ).toBe(true);
  });

  it("refuses images — no OCR exists, and we do not pretend", () => {
    for (const m of ["image/jpeg", "image/png", "image/webp"]) {
      expect(isExtractableDocumentMime(m)).toBe(false);
    }
  });
});
