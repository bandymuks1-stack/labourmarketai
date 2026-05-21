/**
 * CV import data shapes — OUTLINE for M2 (not used in M1).
 *
 * ⚠️ PLATFORM_DOCTRINE §2.3 / §3: when CV import is actually implemented, the
 * extracted text is USER-AUTHORED content. It must be stored as
 * `original_text` + `original_language` (never pre-translated columns),
 * append-only (no UPDATE/DELETE via API; soft-hide only), with server-side
 * timestamps. Imported skills map to existing curated skill slugs where
 * possible; anything unmatched is M2 custom-skill territory, not a new taxonomy
 * row. This file only declares the contracts; M1 ships no extraction/storage.
 */

export type CvImportSource = "pdf" | "docx" | "linkedin" | "manual";

/** Raw, unverified data lifted from an uploaded document (Level 0). */
export interface CvImportData {
  source: CvImportSource;
  originalLanguage: string; // ISO 639-1
  fullName?: string;
  contact?: { email?: string; phone?: string };
  rawText: string; // the legal record; stored as original_text in M2
  detectedRoles?: string[];
  detectedSkills?: string[]; // free-form strings, not yet slugs
}

/** CV data after mapping to internal taxonomy (still Level 0 until verified). */
export interface NormalizedCv {
  professionSlug: string | null;
  skillSlugs: string[]; // matched curated slugs
  unmatchedSkills: string[]; // candidates for M2 custom skills
  displayName: string | null;
}
