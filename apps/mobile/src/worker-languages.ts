/**
 * The languages and levels a worker can state — the SAME closed sets as the
 * web (`apps/web/lib/worker/worker-languages-model.ts`), which mirror the
 * CHECKs on `worker_languages`. A value outside them is refused by the server,
 * so the phone only offers these. Pinned to the web list by
 * `apps/web/lib/guards/mobile-worker-languages.test.ts`.
 *
 * Names are in each language's own language (the standard picker convention,
 * as on the web), so no per-locale key set is needed.
 */
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
  "uk",
] as const;

export type WorkerLanguageCode = (typeof WORKER_LANGUAGES)[number];

export const WORKER_LANGUAGE_LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2", "native"] as const;

export type WorkerLanguageLevel = (typeof WORKER_LANGUAGE_LEVELS)[number];

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
  uk: "Українська",
};

/** A stored code shown by its own name; an unknown code is shown as stored. */
export function languageName(code: string): string {
  return (WORKER_LANGUAGE_NATIVE_NAMES as Record<string, string>)[code] ?? code;
}
