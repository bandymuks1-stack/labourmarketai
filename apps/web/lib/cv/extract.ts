import "server-only";
import type { CvImportData, CvImportSource } from "./types";

/**
 * OUTLINE (M2). Extract structured data from an uploaded CV.
 *
 * M2 plan: rule-based text extraction first (PDF/DOCX → text), name/contact via
 * regex, roles/skills via dictionary match against the curated taxonomy. AI
 * assist is suggest-only and human-reviewed (PLATFORM_DOCTRINE §7). The raw
 * text is the legal record and is stored as original_text (§2.3/§3). Image/OCR
 * is a later enhancement, not M2 baseline.
 *
 * Not implemented in M1 — the upload UI is a scaffold that stores nothing.
 */
export async function extractCv(
  file: ArrayBuffer,
  source: CvImportSource,
): Promise<CvImportData> {
  void file;
  void source;
  throw new Error("CV extraction is not implemented until M2");
}
