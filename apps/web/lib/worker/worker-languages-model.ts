/**
 * Pure model for the worker's self-stated languages (DRAFT migration
 * 20260711250000, PR #720 — human-gated, NOT applied yet). No DB, no React —
 * extracted so the honesty rules are guard-testable in isolation.
 *
 * The two vocabularies mirror the draft SQL's CHECK constraints EXACTLY:
 *   * lang — the platform's canonical 11-locale set (same closed vocabulary
 *     the structured demand v2 requirements use);
 *   * level — CEFR A1..C2 plus "native".
 *
 * Honesty invariants:
 *   * languages are stated by the worker themselves — nothing here may ever
 *     be rendered as checked/confirmed by the platform;
 *   * until the owner applies the draft migration, the table answers 42P01
 *     and the RPCs 42883/PGRST202 — all of which map to a "needs_migration"
 *     state so the UI explains itself instead of crashing or faking a list.
 */

/** Mirrors the draft CHECK on worker_languages.lang (PR #720). */
export const WORKER_LANGUAGES = [
  "en",
  "lt",
  "lv",
  "et",
  "nl",
  "de",
  "da",
  "no",
  "sv",
  "pl",
  "ru",
] as const;

export type WorkerLanguageCode = (typeof WORKER_LANGUAGES)[number];

/** Mirrors the draft CHECK on worker_languages.level (PR #720). */
export const WORKER_LANGUAGE_LEVELS = [
  "A1",
  "A2",
  "B1",
  "B2",
  "C1",
  "C2",
  "native",
] as const;

export type WorkerLanguageLevel = (typeof WORKER_LANGUAGE_LEVELS)[number];

/** Language display names in their own language — locale-independent by
 *  design (the standard picker convention, same as the demand form's
 *  LANGUAGE_NATIVE_NAMES), so no 11-locale key set is needed. */
export const WORKER_LANGUAGE_NATIVE_NAMES: Record<WorkerLanguageCode, string> = {
  en: "English",
  lt: "Lietuvių",
  lv: "Latviešu",
  et: "Eesti",
  nl: "Nederlands",
  de: "Deutsch",
  da: "Dansk",
  no: "Norsk",
  sv: "Svenska",
  pl: "Polski",
  ru: "Русский",
};

export function isWorkerLanguage(value: string): value is WorkerLanguageCode {
  return (WORKER_LANGUAGES as readonly string[]).includes(value);
}

export function isWorkerLanguageLevel(
  value: string,
): value is WorkerLanguageLevel {
  return (WORKER_LANGUAGE_LEVELS as readonly string[]).includes(value);
}

/** Raw form value → language code or null. Values outside the draft CHECK's
 *  closed set are rejected to null, never coerced. */
export function parseWorkerLanguage(
  raw: string | null | undefined,
): WorkerLanguageCode | null {
  const s = (raw ?? "").trim();
  if (s === "") return null;
  return isWorkerLanguage(s) ? s : null;
}

/** Raw form value → level or null. Same closed-set rejection rule. */
export function parseWorkerLanguageLevel(
  raw: string | null | undefined,
): WorkerLanguageLevel | null {
  const s = (raw ?? "").trim();
  if (s === "") return null;
  return isWorkerLanguageLevel(s) ? s : null;
}

/** One saved language row as the UI sees it (self-stated facts only). */
export interface WorkerLanguageEntry {
  lang: WorkerLanguageCode;
  level: WorkerLanguageLevel;
}

/**
 * Map a Postgres/PostgREST error code to a result code — the same convention
 * as availability-prefs-model.classifyPrefsError:
 *   42883 = undefined_function, PGRST202 = function not in schema cache,
 *   42P01 = undefined_table, 42703 = undefined_column → draft not applied;
 *   42501 = the RPC's own not-authenticated signal;
 *   P0002 = no worker row for this profile.
 */
export function classifyLanguagesError(
  code: string | undefined,
): "needs_migration" | "unauthenticated" | "no_worker" | "error" {
  if (code && ["42883", "PGRST202", "42P01", "42703"].includes(code)) {
    return "needs_migration";
  }
  if (code === "42501") return "unauthenticated";
  if (code === "P0002") return "no_worker";
  return "error";
}
