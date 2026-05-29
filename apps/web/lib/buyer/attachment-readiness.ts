/**
 * Attachment extraction-readiness — deterministic Level 2 FOUNDATION
 * (long-cycle plan PR C).
 *
 * This does NOT extract anything. It reads NO file bytes, runs NO OCR,
 * parses NO PDF, calls NO AI, stores NO extracted_text, and never flips
 * analysis_status to completed. It only answers, from the MIME type
 * alone, what KIND of future reader a file would eventually need — so
 * the product can honestly explain the difference between a TXT, a PDF
 * and an image while automatic reading stays OFF.
 *
 * Mapping (sprint §PR C):
 *   text/plain                          -> future_readable_text_file
 *   application/pdf                     -> future_pdf_reader_needed
 *   image/jpeg | image/png | image/webp -> future_ocr_needed
 *   anything else / unknown             -> manual_review_only
 *
 * The current extraction state is ALWAYS "not enabled" — this helper
 * deliberately exposes no "completed"/"extracted" state.
 */

export type ExtractionReadiness =
  | "future_readable_text_file"
  | "future_pdf_reader_needed"
  | "future_ocr_needed"
  | "manual_review_only";

/**
 * The current extraction state. There is exactly ONE value on purpose:
 * automatic reading is not enabled. A future PR that wires a real
 * reader would extend this — this foundation never claims more.
 */
export type ExtractionState = "not_enabled";

export const EXTRACTION_STATE: ExtractionState = "not_enabled";

const IMAGE_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

export function computeExtractionReadiness(
  mimeType: string | null | undefined,
): ExtractionReadiness {
  const mime = (mimeType ?? "").trim().toLowerCase();
  if (mime === "text/plain") return "future_readable_text_file";
  if (mime === "application/pdf") return "future_pdf_reader_needed";
  if (IMAGE_MIME_TYPES.has(mime)) return "future_ocr_needed";
  return "manual_review_only";
}
