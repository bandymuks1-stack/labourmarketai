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
/**
 * Input ceiling for a CV upload (owner audit §10).
 *
 * It used to be 5 MB and the UI made the PERSON carry that number — a
 * technical budget pushed onto someone who just wants to attach their CV.
 * The real cost of this route is not the input size: it is the EXTRACTED
 * TEXT and the parse time, and both are already bounded
 * (MAX_EXTRACTED_CHARS + PARSE_TIMEOUT_MS below). So the input ceiling is
 * now set where no genuine CV can reach it — a scanned, image-heavy CV is a
 * normal document, not an abuse case — and the person is never asked to
 * shrink a file the system can handle.
 */
export const MAX_CV_BYTES = 25 * 1024 * 1024; // 25 MB

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

/**
 * Magic-byte check — security audit L-04.
 *
 * `resolveFormat` trusts the FILENAME EXTENSION first, so `payload.pdf` holding
 * arbitrary bytes is handed straight to pdf.js, and `payload.docx` to mammoth's
 * zip reader. Neither parser is a safe place to send content that only claims to
 * be its format. This rejects the mismatch before a parser ever sees the bytes.
 *
 * `txt` is deliberately unchecked: plain text has no signature, and it is
 * decoded with `TextDecoder`, not parsed.
 */
function magicBytesMatch(buffer: ArrayBuffer, format: CvFormat): boolean {
  if (format === "txt") return true;
  const head = new Uint8Array(buffer.slice(0, 4));
  if (head.length < 4) return false;
  if (format === "pdf") {
    // "%PDF"
    return head[0] === 0x25 && head[1] === 0x50 && head[2] === 0x44 && head[3] === 0x46;
  }
  // DOCX is a ZIP container: "PK\x03\x04" (or the empty/spanned variants).
  return (
    head[0] === 0x50 &&
    head[1] === 0x4b &&
    (head[2] === 0x03 || head[2] === 0x05 || head[2] === 0x07)
  );
}

/**
 * Upper bound on extracted text — security audit L-03.
 *
 * A 5 MB DOCX is a zip: mammoth decompresses it in memory, so a high-ratio
 * archive ("zip bomb") can expand to orders of magnitude more than the input
 * cap. A pathological PDF can do the same through pdf.js. The input cap alone
 * therefore does NOT bound the work. This caps the OUTPUT, which is what
 * actually grows, and it is generous next to any real CV (~10k chars).
 */
const MAX_EXTRACTED_CHARS = 1_000_000;

/**
 * Wall-clock ceiling for a single parse — security audit L-03.
 *
 * Neither parser accepts a budget, so this races them. It does NOT kill the
 * underlying work (JS has no thread cancellation), so a pathological file can
 * still burn CPU in the background; what it prevents is the REQUEST hanging on
 * it. Both parsers are auth-gated and run per-invocation on serverless, which is
 * what keeps the residual bounded. Honest limitation, not a hard guarantee.
 */
const PARSE_TIMEOUT_MS = 10_000;

function withTimeout<T>(work: Promise<T>, label: string): Promise<T> {
  return Promise.race([
    work,
    new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error(`cv-extract: ${label} exceeded ${PARSE_TIMEOUT_MS}ms`)),
        PARSE_TIMEOUT_MS,
      ).unref?.(),
    ),
  ]);
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

  // L-04: the declared format must match the actual bytes. Reported as
  // `unsupported` (not `failed`) — the file genuinely is not what it claims.
  if (!magicBytesMatch(buffer, format)) {
    return { kind: "unsupported", ext: extOf(filename) || "?" };
  }

  try {
    let raw: string;
    if (format === "pdf") raw = await withTimeout(extractPdf(buffer), "pdf");
    else if (format === "docx") raw = await withTimeout(extractDocx(buffer), "docx");
    else raw = new TextDecoder("utf-8").decode(buffer);

    // L-03: bound the OUTPUT. A zip bomb passes the input cap and only reveals
    // itself here, so truncate rather than carrying an unbounded string on.
    if (raw.length > MAX_EXTRACTED_CHARS) raw = raw.slice(0, MAX_EXTRACTED_CHARS);

    const text = tidy(raw);
    if (text.length === 0) return { kind: "empty" };
    return { kind: "ok", text, format };
  } catch {
    // Never surface the underlying parser error (could echo document bytes).
    return { kind: "failed" };
  }
}
