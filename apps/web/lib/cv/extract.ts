import "server-only";

/**
 * CV text extraction — REAL implementation.
 *
 * Turns an uploaded CV file (PDF / DOCX / plain text) into its raw text so the
 * existing deterministic skill-recognition (lib/profile/skill-claim-extractor,
 * lib/structuring/skill-recognition) can suggest skills the user then confirms.
 *
 * Honesty / safety (PLATFORM_DOCTRINE §7):
 *   - No fake support: a format only "works" when its real parser returns text.
 *     PDF → unpdf (pdf.js, pure-JS), DOCX → mammoth (pure-JS). Anything else is
 *     reported `unsupported`, never silently accepted.
 *   - Extraction NEVER fabricates content and NEVER logs the CV text.
 *   - Size is capped by the caller (route handler); we re-check defensively.
 *
 * Returns a tagged result instead of throwing so the caller can map cleanly to
 * an HTTP status / user-facing error without leaking internals.
 */

export type CvFormat = "pdf" | "docx" | "txt";

export type CvExtractResult =
  | { kind: "ok"; text: string; format: CvFormat }
  | { kind: "unsupported"; ext: string }
  | { kind: "empty" }
  | { kind: "too-large" }
  | { kind: "failed" };

/** Hard ceiling — defensive; the route handler enforces the same cap first. */
export const MAX_CV_BYTES = 5 * 1024 * 1024; // 5 MB

/** Collapse runaway whitespace the extractors emit, without touching content. */
function tidy(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/[ \t ]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function extOf(filename: string): string {
  const i = filename.lastIndexOf(".");
  return i >= 0 ? filename.slice(i + 1).toLowerCase() : "";
}

/**
 * Decide the format from extension first, falling back to the declared MIME
 * type. We never trust MIME alone (browsers vary), and never guess a binary
 * format from content.
 */
function resolveFormat(filename: string, mime?: string): CvFormat | null {
  const ext = extOf(filename);
  if (ext === "pdf") return "pdf";
  if (ext === "docx") return "docx";
  if (ext === "txt" || ext === "text" || ext === "md") return "txt";
  // Extension missing/odd — fall back to MIME.
  if (mime) {
    if (mime === "application/pdf") return "pdf";
    if (
      mime ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    ) {
      return "docx";
    }
    if (mime.startsWith("text/")) return "txt";
  }
  return null;
}

async function extractPdf(buffer: ArrayBuffer): Promise<string> {
  // unpdf bundles pdf.js and runs in the Node server runtime with no native
  // binaries. mergePages joins all pages into one text blob.
  const { extractText, getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  const { text } = await extractText(pdf, { mergePages: true });
  return Array.isArray(text) ? text.join("\n") : text;
}

async function extractDocx(buffer: ArrayBuffer): Promise<string> {
  // mammoth reads the DOCX (a zip of XML) and returns the raw text. Pure-JS.
  const mammoth = (await import("mammoth")).default;
  const { value } = await mammoth.extractRawText({
    buffer: Buffer.from(buffer),
  });
  return value;
}

/**
 * Extract the raw text from a CV file. Pure read — no storage, no logging of
 * the text. The caller authenticates and size-caps before invoking this.
 */
export async function extractCvText(
  buffer: ArrayBuffer,
  filename: string,
  mime?: string,
): Promise<CvExtractResult> {
  if (buffer.byteLength > MAX_CV_BYTES) return { kind: "too-large" };

  const format = resolveFormat(filename, mime);
  if (!format) return { kind: "unsupported", ext: extOf(filename) || "?" };

  try {
    let raw: string;
    if (format === "pdf") raw = await extractPdf(buffer);
    else if (format === "docx") raw = await extractDocx(buffer);
    else raw = new TextDecoder("utf-8").decode(buffer);

    const text = tidy(raw);
    if (text.length === 0) return { kind: "empty" };
    return { kind: "ok", text, format };
  } catch {
    // Never surface the underlying parser error (could echo document bytes).
    return { kind: "failed" };
  }
}
