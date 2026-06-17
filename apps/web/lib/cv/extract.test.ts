import { describe, expect, it } from "vitest";
import { extractCvText, MAX_CV_BYTES } from "./extract";
import { makeDocx, makePdf } from "./__fixtures__/cv-fixtures";

/**
 * Real CV extraction tests — exercise the actual unpdf (PDF) and mammoth (DOCX)
 * parsers against synthesized-in-memory fixtures (no committed binaries). This
 * is the "PDF/DOCX must not be fake-supported" guarantee: a format only passes
 * if its real parser returns the embedded text.
 */

const SAMPLE = "Plyteliu klojimas ir suvirinimas. MIG suvirinimas. Vilnius.";

/** Narrow a Uint8Array's backing store to a concrete ArrayBuffer. */
const toAB = (u: Uint8Array): ArrayBuffer =>
  u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength) as ArrayBuffer;

describe("PDF extraction (unpdf)", () => {
  it("extracts text from a real PDF byte stream", async () => {
    const bytes = makePdf(SAMPLE);
    const res = await extractCvText(toAB(bytes), "cv.pdf", "application/pdf");
    expect(res.kind).toBe("ok");
    if (res.kind === "ok") {
      expect(res.format).toBe("pdf");
      expect(res.text.toLowerCase()).toContain("suvirinimas");
    }
  });
});

describe("DOCX extraction (mammoth)", () => {
  it("extracts text from a real DOCX byte stream", async () => {
    const bytes = makeDocx(SAMPLE);
    const res = await extractCvText(
      toAB(bytes),
      "cv.docx",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    );
    expect(res.kind).toBe("ok");
    if (res.kind === "ok") {
      expect(res.format).toBe("docx");
      expect(res.text.toLowerCase()).toContain("plyteliu klojimas");
    }
  });
});

describe("plain text + honest failures", () => {
  it("reads a .txt file directly", async () => {
    const bytes = new TextEncoder().encode(SAMPLE);
    const res = await extractCvText(toAB(bytes), "cv.txt", "text/plain");
    expect(res.kind).toBe("ok");
    if (res.kind === "ok") expect(res.text).toContain("Vilnius");
  });

  it("rejects an unsupported format (no fake support)", async () => {
    const bytes = new TextEncoder().encode("not a cv");
    const res = await extractCvText(toAB(bytes), "photo.png", "image/png");
    expect(res.kind).toBe("unsupported");
  });

  it("reports empty when a supported file yields no text", async () => {
    const bytes = new TextEncoder().encode("   \n  ");
    const res = await extractCvText(toAB(bytes), "blank.txt", "text/plain");
    expect(res.kind).toBe("empty");
  });

  it("rejects an oversized file", async () => {
    const big = new Uint8Array(MAX_CV_BYTES + 1);
    const res = await extractCvText(toAB(big), "huge.txt", "text/plain");
    expect(res.kind).toBe("too-large");
  });

  it("fails gracefully on a corrupt PDF rather than throwing", async () => {
    const junk = new TextEncoder().encode("%PDF-1.4 broken not really a pdf");
    const res = await extractCvText(toAB(junk), "bad.pdf", "application/pdf");
    // Either a clean failure or empty — never a throw, never fabricated text.
    expect(["failed", "empty"]).toContain(res.kind);
  });
});
