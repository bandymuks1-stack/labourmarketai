/**
 * Client helper for the CV file → text extraction route (`/api/cv/extract`).
 *
 * Keeps the upload primitive (`CvImportUpload`) thin: it owns the file input
 * and UI state; this owns the network contract. Returns a tagged result so the
 * component can show a clear, specific error (wrong format / too large / empty
 * / failed) — never a fake success and never a silent drop.
 */

export const CV_ACCEPTED_EXTENSIONS = [".pdf", ".docx", ".txt"] as const;
/** Mirrors the server cap (lib/cv/extract.ts MAX_CV_BYTES). Owner audit §10:
 *  the ceiling exists to bound abuse, NOT to make the person manage bytes —
 *  no real CV reaches it, and the UI never states it as a requirement. */
export const CV_MAX_BYTES = 25 * 1024 * 1024;

export type CvExtractClientResult =
  | { ok: true; text: string; format: "pdf" | "docx" | "txt" }
  | {
      ok: false;
      code: CvExtractFailureCode;
    };

/** The CLOSED failure set the UI and the funnel event read. Whatever the
 *  server (or a proxy) answers is normalized into it — an unknown or
 *  non-string `code` is "failed", never a raw value. */
export const CV_EXTRACT_FAILURE_CODES = [
  "unsupported",
  "too-large",
  "empty",
  "failed",
  "unauthorized",
  "network",
  "rate-limited",
] as const;
export type CvExtractFailureCode = (typeof CV_EXTRACT_FAILURE_CODES)[number];

export function normalizeCvExtractCode(raw: unknown): CvExtractFailureCode {
  return typeof raw === "string" && (CV_EXTRACT_FAILURE_CODES as readonly string[]).includes(raw)
    ? (raw as CvExtractFailureCode)
    : "failed";
}

export async function extractCvFile(file: File): Promise<CvExtractClientResult> {
  // Local fast-fail so the user gets an instant, specific message without a
  // round-trip (the server re-checks both).
  if (file.size > CV_MAX_BYTES) return { ok: false, code: "too-large" };

  const form = new FormData();
  form.append("file", file);

  let res: Response;
  try {
    res = await fetch("/api/cv/extract", { method: "POST", body: form });
  } catch {
    return { ok: false, code: "network" };
  }

  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    return { ok: false, code: "failed" };
  }

  const data = (body !== null && typeof body === "object" ? body : {}) as {
    ok?: boolean;
    text?: string;
    format?: "pdf" | "docx" | "txt";
    code?: unknown;
  };

  if (res.ok && data.ok && typeof data.text === "string") {
    return { ok: true, text: data.text, format: data.format ?? "txt" };
  }
  return { ok: false, code: normalizeCvExtractCode(data.code) };
}
