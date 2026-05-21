import "server-only";
import type { CvImportData, NormalizedCv } from "./types";

/**
 * OUTLINE (M2). Map extracted CV data onto the internal taxonomy: match
 * detected skill strings to curated skill slugs (the rest become M2
 * custom-skill candidates, never new taxonomy rows — PLATFORM_DOCTRINE §1/§2),
 * and pick a best-guess profession slug. Pure + deterministic so it is
 * unit-testable. Not implemented in M1.
 */
export function normalizeCv(data: CvImportData): NormalizedCv {
  void data;
  throw new Error("CV normalization is not implemented until M2");
}
