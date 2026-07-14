/**
 * Pure model for self-declared education entries (DRAFT migration
 * 20260714160000_worker_education_achievements_v1 — human-gated, NOT applied
 * yet). No DB, no React — validation + error classification are guard-testable
 * in isolation, same convention as worker-languages-model.ts.
 *
 * Honesty invariants:
 *   * education entries are stated by the worker — nothing here may ever be
 *     rendered as checked/confirmed by the platform;
 *   * education TYPE identity is a registry slug (education_types seed set —
 *     §10 Lego); labels live in per-locale JSON under `cvSections.educationTypes`;
 *   * until the owner applies the draft migration the table answers 42P01 —
 *     mapped to "needs_migration" so the UI explains itself.
 */

/** Mirrors the education_types registry SEED set (the DB registry is the
 *  source of truth once applied; this mirror validates client input before a
 *  round-trip and drives the picker order). */
export const EDUCATION_TYPE_SLUGS = [
  "primary",
  "secondary",
  "vocational",
  "college",
  "university_bachelor",
  "university_master",
  "doctorate",
  "course_certificate",
  "other",
] as const;

export type EducationTypeSlug = (typeof EDUCATION_TYPE_SLUGS)[number];

export const EDUCATION_YEAR_MIN = 1900;
export const EDUCATION_YEAR_MAX = 2100;
/** App-side list cap (the table has no row cap — bounded here). */
export const EDUCATION_MAX_ROWS = 50;

export function isEducationTypeSlug(value: string): value is EducationTypeSlug {
  return (EDUCATION_TYPE_SLUGS as readonly string[]).includes(value);
}

export function parseEducationTypeSlug(
  raw: string | null | undefined,
): EducationTypeSlug | null {
  const s = (raw ?? "").trim();
  return s !== "" && isEducationTypeSlug(s) ? s : null;
}

export function parseEducationYear(
  raw: string | number | null | undefined,
): number | null {
  if (raw === null || raw === undefined) return null;
  const s = String(raw).trim();
  if (s === "") return null;
  const n = Number.parseInt(s, 10);
  if (!Number.isFinite(n)) return null;
  return n >= EDUCATION_YEAR_MIN && n <= EDUCATION_YEAR_MAX ? n : null;
}

export interface WorkerEducationEntry {
  id: string;
  institutionName: string;
  programOrField: string | null;
  educationTypeSlug: string;
  startYear: number | null;
  endYear: number | null;
  isCurrent: boolean;
  note: string | null;
}

export interface WorkerEducationInput {
  institutionName: string;
  programOrField: string | null;
  educationTypeSlug: EducationTypeSlug;
  startYear: number | null;
  endYear: number | null;
  isCurrent: boolean;
  note: string | null;
}

/** Validate + normalise a raw education input. Returns null when invalid —
 *  callers surface the "invalid" code, never coerce. */
export function validateEducationInput(raw: {
  institutionName?: string | null;
  programOrField?: string | null;
  educationTypeSlug?: string | null;
  startYear?: string | number | null;
  endYear?: string | number | null;
  isCurrent?: boolean;
  note?: string | null;
}): WorkerEducationInput | null {
  const institutionName = (raw.institutionName ?? "").trim();
  if (institutionName.length < 2 || institutionName.length > 200) return null;

  const typeSlug = parseEducationTypeSlug(raw.educationTypeSlug);
  if (!typeSlug) return null;

  const startYear = parseEducationYear(raw.startYear);
  const endYear = parseEducationYear(raw.endYear);
  // Reject a stated-but-unparseable year (never silently drop user input).
  if (raw.startYear != null && String(raw.startYear).trim() !== "" && startYear === null) return null;
  if (raw.endYear != null && String(raw.endYear).trim() !== "" && endYear === null) return null;
  if (startYear !== null && endYear !== null && endYear < startYear) return null;

  const isCurrent = raw.isCurrent === true;
  if (isCurrent && endYear !== null) return null; // mirrors the table CHECK

  const programOrField = (raw.programOrField ?? "").trim().slice(0, 200) || null;
  const note = (raw.note ?? "").trim().slice(0, 1000) || null;

  return {
    institutionName,
    programOrField,
    educationTypeSlug: typeSlug,
    startYear,
    endYear,
    isCurrent,
    note,
  };
}

/** Postgres/PostgREST error code → result code (same convention as
 *  classifyLanguagesError). 42501 covers both "not authenticated" RPC signals
 *  and grant-level permission denials. */
export function classifyEducationError(
  code: string | undefined,
): "needs_migration" | "unauthenticated" | "error" {
  if (code && ["42P01", "42703", "PGRST205", "42883", "PGRST202"].includes(code)) {
    return "needs_migration";
  }
  if (code === "42501") return "unauthenticated";
  return "error";
}
