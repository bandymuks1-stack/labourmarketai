/**
 * Client helper for the CV file → text extraction route (`/api/cv/extract`).
 *
 * Keeps the upload primitive (`CvImportUpload`) thin: it owns the file input
 * and UI state; this owns the network contract. Returns a tagged result so the
 * component can show a clear, specific error (wrong format / too large / empty
 * / failed) — never a fake success and never a silent drop.
 */

export const CV_ACCEPTED_EXTENSIONS = [".pdf", ".docx", ".txt"] as const;
export const CV_MAX_BYTES = 5 * 1024 * 1024; // 5 MB — mirrors the server cap.

export type CvExtractClientResult =
  | { ok: true; text: string; format: "pdf" | "docx" | "txt" }
  | {
      ok: false;
      code: "unsupported" | "too-large" | "empty" | "failed" | "unauthorized" | "network";
    };

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

  const data = body as {
    ok?: boolean;
    text?: string;
    format?: "pdf" | "docx" | "txt";
    code?: CvExtractClientResult extends { ok: false; code: infer C } ? C : never;
  };

  if (res.ok && data.ok && typeof data.text === "string") {
    return { ok: true, text: data.text, format: data.format ?? "txt" };
  }
  const code = data.code ?? "failed";
  return { ok: false, code };
}
