import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { extractCvText, MAX_CV_BYTES } from "@/lib/cv/extract";

/**
 * CV upload parser hardening — security audit findings L-03 and L-04.
 *
 * L-04: `resolveFormat` decides from the FILENAME EXTENSION first, so a file
 * named `x.pdf` containing arbitrary bytes was handed to pdf.js, and `x.docx` to
 * mammoth's zip reader. Neither is a safe destination for content that only
 * claims to be its format. A magic-byte check now rejects the mismatch before a
 * parser sees the bytes.
 *
 * L-03: the 5 MB INPUT cap does not bound the WORK. A DOCX is a zip that mammoth
 * decompresses in memory, so a high-ratio archive expands far beyond the cap;
 * the output is now bounded and the parse is time-boxed.
 *
 * These tests use synthetic byte buffers only — no fixture documents, no real
 * user data, no network.
 */

const WEB_ROOT = join(__dirname, "..", "..");

function buf(bytes: number[]): ArrayBuffer {
  return new Uint8Array(bytes).buffer;
}
function ascii(s: string): ArrayBuffer {
  return new TextEncoder().encode(s).buffer as ArrayBuffer;
}

const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46]; // %PDF
const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04]; // PK\x03\x04

describe("CV parser rejects format/content mismatch (audit L-04)", () => {
  it("rejects a .pdf whose bytes are not a PDF", async () => {
    const r = await extractCvText(ascii("this is definitely not a pdf at all"), "cv.pdf");
    expect(
      r.kind,
      "a file claiming .pdf with non-PDF bytes must never reach pdf.js",
    ).toBe("unsupported");
  });

  it("rejects a .docx whose bytes are not a zip", async () => {
    const r = await extractCvText(ascii("not a zip container, just text"), "cv.docx");
    expect(
      r.kind,
      "a file claiming .docx with non-zip bytes must never reach mammoth's zip reader",
    ).toBe("unsupported");
  });

  it("rejects a PDF-declared file whose MIME lies too", async () => {
    const r = await extractCvText(ascii("nope"), "cv.bin", "application/pdf");
    expect(r.kind).toBe("unsupported");
  });

  it("rejects a file too short to carry any signature", async () => {
    const r = await extractCvText(buf([0x25, 0x50]), "cv.pdf");
    expect(r.kind).toBe("unsupported");
  });

  /**
   * A correct magic header must get PAST the signature gate. Without this the
   * whole check could be a blanket reject and every test above would still pass.
   */
  it("lets a correctly-signed PDF past the signature gate", async () => {
    const r = await extractCvText(buf([...PDF_MAGIC, 0x2d, 0x31, 0x2e, 0x34]), "cv.pdf");
    // Truncated PDF, so pdf.js legitimately fails or finds nothing — but it must
    // NOT be rejected as `unsupported`, which would mean the gate blocked it.
    expect(["failed", "empty", "ok"]).toContain(r.kind);
  });

  it("lets a correctly-signed zip past the signature gate", async () => {
    const r = await extractCvText(buf([...ZIP_MAGIC, 0x14, 0x00, 0x00, 0x00]), "cv.docx");
    expect(["failed", "empty", "ok"]).toContain(r.kind);
  });

  it("still accepts plain text, which has no signature", async () => {
    const r = await extractCvText(ascii("Jonas Jonaitis\nTiler, 6 years"), "cv.txt");
    expect(r.kind).toBe("ok");
  });

  it("still rejects a genuinely unsupported extension", async () => {
    const r = await extractCvText(ascii("MZ..."), "cv.exe");
    expect(r.kind).toBe("unsupported");
  });

  it("still enforces the input size cap", async () => {
    const r = await extractCvText(new ArrayBuffer(MAX_CV_BYTES + 1), "cv.pdf");
    expect(r.kind).toBe("too-large");
  });
});

describe("CV parser bounds its own work (audit L-03)", () => {
  const src = readFileSync(join(WEB_ROOT, "lib/cv/extract.ts"), "utf8");

  it("caps the extracted output, not only the input", () => {
    expect(
      src,
      "the 5 MB input cap does not bound a zip bomb's expansion — the OUTPUT must be capped",
    ).toContain("MAX_EXTRACTED_CHARS");
    const cap = Number(/MAX_EXTRACTED_CHARS\s*=\s*([\d_]+)/.exec(src)?.[1]?.replace(/_/g, ""));
    expect(cap).toBeGreaterThan(0);
    expect(cap).toBeLessThanOrEqual(5_000_000);
  });

  it("time-boxes both binary parsers", () => {
    expect(src).toContain("PARSE_TIMEOUT_MS");
    expect(src, "the PDF parse must be time-boxed").toMatch(/withTimeout\(\s*extractPdf/);
    expect(src, "the DOCX parse must be time-boxed").toMatch(/withTimeout\(\s*extractDocx/);
  });

  it("keeps the magic-byte gate ahead of both parsers", () => {
    expect(src.indexOf("magicBytesMatch(")).toBeLessThan(src.indexOf("withTimeout(extractPdf"));
  });

  it("still never surfaces the raw parser error", () => {
    // A parser message can echo document bytes; the route returns coarse codes.
    expect(src).toMatch(/catch\s*\{[\s\S]*?kind:\s*"failed"/);
  });
});
