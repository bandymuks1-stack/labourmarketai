import { describe, expect, it } from "vitest";
import { extractCvText, MAX_CV_BYTES } from "./extract";
import { makeDocx, makePdf } from "./__fixtures__/cv-fixtures";
import { parseCvSections } from "./structured-parse";

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

/**
 * Line structure survives extraction — regression for a real Living CV defect.
 *
 * `parseCvSections` splits on newlines. unpdf's `mergePages: true` does not
 * merely join pages: it collapses ALL whitespace, newlines included. With that
 * flag every PDF CV reached the section parser as ONE line, so no work-history
 * row could be proposed from any PDF — the most common CV format there is.
 *
 * The assertion is behavioural (does a job come out?), and it carries its own
 * NEGATIVE CONTROL: the same text with newlines collapsed must produce zero
 * jobs. Without that control a parser that found jobs regardless of line
 * structure would make this test pass while proving nothing.
 */
describe("extraction preserves the line structure the section parser needs", () => {
  const CV_LINES = [
    "Jonas Petraitis",
    "2019-2023 UAB Statybos meistrai, stogdengys",
    "Vilniaus technologiju mokykla, statybos programa 2015-2019",
    "Anglu kalba B2",
  ];
  const CV = CV_LINES.join("\n");

  it("PDF: lines survive, and the collapsed form provably does not", async () => {
    const res = await extractCvText(toAB(makePdf(CV)), "cv.pdf", "application/pdf");
    expect(res.kind).toBe("ok");
    if (res.kind !== "ok") return;

    expect(res.text.split("\n").length, "a 4-line CV must not arrive as 1 line").toBe(
      CV_LINES.length,
    );

    const parsed = parseCvSections(res.text);
    expect(parsed.workHistory.map((w) => w.title)).toContain(
      "UAB Statybos meistrai, stogdengys",
    );
    expect(parsed.education.map((e) => e.institution)).toContain(
      "Vilniaus technologiju mokykla",
    );

    // NEGATIVE CONTROL — the shape `mergePages: true` produced. If this also
    // found the job, the assertion above would be measuring nothing.
    const collapsed = parseCvSections(res.text.replace(/\s+/g, " "));
    expect(
      collapsed.workHistory,
      "collapsing newlines must destroy the work history — otherwise this test is vacuous",
    ).toHaveLength(0);
  });

  it("DOCX: each paragraph is its own line", async () => {
    const res = await extractCvText(
      toAB(makeDocx(CV)),
      "cv.docx",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    );
    expect(res.kind).toBe("ok");
    if (res.kind !== "ok") return;
    const parsed = parseCvSections(res.text);
    expect(parsed.workHistory.map((w) => w.title)).toContain(
      "UAB Statybos meistrai, stogdengys",
    );
    expect(parsed.languages.map((l) => l.lang)).toContain("en");
  });
});
