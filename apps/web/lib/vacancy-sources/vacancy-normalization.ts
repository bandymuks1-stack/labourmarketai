/**
 * VACANCY NORMALIZATION — provider-shaped fields → canonical field values.
 *
 * Every function here is total and honest: it either produces a canonical
 * value or `null` / `"unknown"`. It never guesses, never defaults a missing
 * headcount to 1, never invents coordinates, and never converts a currency.
 * The one thing it is allowed to do is *shorten* — publisher text is clamped
 * to the shared bounds, at a word boundary where possible.
 *
 * Provider payload SHAPE parsing lives with the provider (./providers/*).
 * This module is the country-agnostic half: it is what every future country
 * reuses unchanged.
 *
 * Pure module: no IO, no env, no fetch, no Date.now.
 */
import {
  VACANCY_IMPORT_BOUNDS,
  type VacancyEmploymentForm,
  type VacancyWorkingTime,
} from "./vacancy-contract";

/** Collapse whitespace and trim. Empty input yields "". */
export function normalizeText(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim();
}

/** Trim to null — the canonical "publisher did not say". */
export function normalizeOptionalText(value: unknown): string | null {
  const t = normalizeText(value);
  return t.length > 0 ? t : null;
}

/**
 * Clamp to `max` characters, preferring the last word boundary in the final
 * 15% so a clamp never splits a word mid-way when it can avoid it. An ellipsis
 * is NOT appended: the record is explicitly a bounded excerpt, and adding
 * characters the publisher never wrote is the wrong kind of helpful.
 */
export function clampText(value: string, max: number): string {
  if (max <= 0) return "";
  if (value.length <= max) return value;
  const hard = value.slice(0, max);
  const lastSpace = hard.lastIndexOf(" ");
  if (lastSpace > Math.floor(max * 0.85)) return hard.slice(0, lastSpace);
  return hard;
}

export function normalizeTitle(value: unknown): string {
  return clampText(normalizeText(value), VACANCY_IMPORT_BOUNDS.maxTitleChars);
}

/**
 * Description normalization keeps paragraph structure (publishers write
 * multi-paragraph ads and collapsing them to one line destroys readability),
 * collapses runs of blank lines, and clamps to the shared bound.
 */
export function normalizeDescription(value: unknown): string {
  if (typeof value !== "string") return "";
  const cleaned = value
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    .trim();
  return clampText(cleaned, VACANCY_IMPORT_BOUNDS.maxDescriptionChars);
}

/** ISO-3166 alpha-2, uppercased. Anything else is null — never a guess. */
export function normalizeCountryIso(value: unknown): string | null {
  const t = normalizeText(value).toUpperCase();
  return /^[A-Z]{2}$/.test(t) ? t : null;
}

/**
 * Strict numeric coercion. `Number()` alone is NOT safe here: `Number(null)`,
 * `Number("")` and `Number([])` are all 0, which would turn an ABSENT salary
 * into a published salary of zero. Only a real number, or a numeric string,
 * counts as a number.
 */
function toNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const t = value.trim();
  if (t.length === 0) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/**
 * A finite coordinate inside the real earth range, or null. A publisher that
 * sends 0/0, a string, or an out-of-range number gets null rather than a pin
 * in the Gulf of Guinea.
 */
export function normalizeCoordinate(
  value: unknown,
  kind: "lat" | "lng",
): number | null {
  const n = toNumber(value);
  if (n === null) return null;
  const limit = kind === "lat" ? 90 : 180;
  if (Math.abs(n) > limit) return null;
  // Exactly 0/0 is the classic "null island" placeholder, not a work site.
  if (n === 0) return null;
  return n;
}

/** A positive integer headcount, or null. Zero and fractions are rejected. */
export function normalizePositions(value: unknown): number | null {
  const n = toNumber(value);
  if (n === null) return null;
  if (!Number.isInteger(n) || n < 1) return null;
  return n;
}

/** An ISO-8601 instant the Date constructor accepts, re-emitted in UTC. */
export function normalizeIsoTimestamp(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const t = value.trim();
  if (t.length === 0) return null;
  const ms = Date.parse(t);
  if (!Number.isFinite(ms)) return null;
  return new Date(ms).toISOString();
}

/** A calendar date (YYYY-MM-DD), or null. Time-of-day is dropped, not kept. */
export function normalizeIsoDate(value: unknown): string | null {
  const iso = normalizeIsoTimestamp(value);
  return iso === null ? null : iso.slice(0, 10);
}

/** ISO-4217-shaped currency code, uppercased, or null. */
export function normalizeCurrency(value: unknown): string | null {
  const t = normalizeText(value).toUpperCase();
  return /^[A-Z]{3}$/.test(t) ? t : null;
}

/** A finite non-negative amount, or null. Never rounded, never converted, and
 *  never coerced out of an absent value — see `toNumber`. */
export function normalizeAmount(value: unknown): number | null {
  const n = toNumber(value);
  if (n === null || n < 0) return null;
  return n;
}

/**
 * A bare hostname from anything the publisher supplied — including a full
 * URL. Returns null rather than an unusable fragment. Kept host-only because
 * the pure layer never holds a fetchable address for an employer site.
 */
export function normalizeHostname(value: unknown): string | null {
  const t = normalizeText(value).toLowerCase();
  if (t.length === 0) return null;
  const withoutScheme = t.replace(/^[a-z][a-z0-9+.-]*:\/\//, "");
  const host = withoutScheme.split("/")[0]?.split("?")[0]?.replace(/^www\./, "");
  if (!host || !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(host)) return null;
  return host;
}

/**
 * The publisher's own ad address, kept verbatim when it is an absolute http(s)
 * address. Anything else (a relative path, a javascript: address, a mailto)
 * is refused — attribution must link to a real page or to nothing at all.
 */
export function normalizeApplicationUrl(value: unknown): string | null {
  const t = normalizeText(value);
  if (t.length === 0 || t.length > 2_000) return null;
  const scheme = t.slice(0, t.indexOf(":")).toLowerCase();
  if (scheme !== "http" && scheme !== "https") return null;
  try {
    const parsed = new URL(t);
    return parsed.protocol === "http:" || parsed.protocol === "https:"
      ? parsed.toString()
      : null;
  } catch {
    return null;
  }
}

/**
 * LANGUAGE MAPPING — publisher language labels → the platform's own codes.
 *
 * Publishers name languages in their own tongue ("Svenska", "Engelska") and
 * sometimes in ISO. This map is deliberately small and explicit: it covers
 * the platform's active locales plus the Nordic/Baltic languages a Swedish ad
 * realistically asks for. An unrecognized label maps to null and is DROPPED
 * rather than passed through as a fake language requirement — a matching
 * criterion built on a mis-parsed label is worse than a missing one.
 */
const LANGUAGE_LABEL_TO_CODE: ReadonlyMap<string, string> = new Map([
  // ISO codes pass through.
  ["sv", "sv"], ["en", "en"], ["lt", "lt"], ["lv", "lv"], ["et", "et"],
  ["pl", "pl"], ["ru", "ru"], ["de", "de"], ["nl", "nl"], ["da", "da"],
  ["no", "no"], ["nb", "no"], ["nn", "no"], ["fi", "fi"], ["uk", "uk"],
  // Swedish labels (the source language of the first provider).
  ["svenska", "sv"], ["engelska", "en"], ["litauiska", "lt"],
  ["lettiska", "lv"], ["estniska", "et"], ["polska", "pl"],
  ["ryska", "ru"], ["tyska", "de"], ["nederländska", "nl"],
  ["danska", "da"], ["norska", "no"], ["finska", "fi"],
  ["ukrainska", "uk"],
  // English labels.
  ["swedish", "sv"], ["english", "en"], ["lithuanian", "lt"],
  ["latvian", "lv"], ["estonian", "et"], ["polish", "pl"],
  ["russian", "ru"], ["german", "de"], ["dutch", "nl"],
  ["danish", "da"], ["norwegian", "no"], ["finnish", "fi"],
  ["ukrainian", "uk"],
]);

/** One label → one platform language code, or null when unrecognized. */
export function normalizeLanguageCode(value: unknown): string | null {
  const t = normalizeText(value).toLowerCase();
  if (t.length === 0) return null;
  // Strip a trailing proficiency qualifier the publisher may append, e.g.
  // "svenska (flytande)" — the level is not modelled on the need side.
  const base = t.replace(/\s*\([^)]*\)\s*$/, "").trim();
  return LANGUAGE_LABEL_TO_CODE.get(base) ?? null;
}

/** A publisher language list → deduped, bounded platform codes. */
export function normalizeLanguageList(
  values: readonly unknown[] | null | undefined,
): readonly string[] {
  if (!Array.isArray(values)) return [];
  const out: string[] = [];
  for (const raw of values) {
    const code = normalizeLanguageCode(raw);
    if (code !== null && !out.includes(code)) out.push(code);
    if (out.length >= VACANCY_IMPORT_BOUNDS.maxRequiredLanguages) break;
  }
  return out;
}

/**
 * EMPLOYMENT FORM MAPPING. Publisher vocabularies differ per country, so the
 * matcher is on normalized substrings of the publisher's own label. Anything
 * unrecognized is `"unknown"` — an honest gap the matching engine treats as
 * "not stated", never as a mismatch.
 */
export function normalizeEmploymentForm(
  value: unknown,
): VacancyEmploymentForm {
  const t = normalizeText(value).toLowerCase();
  if (t.length === 0) return "unknown";
  if (/tillsvidare|fast anställning|permanent|indefinite/.test(t)) {
    return "permanent";
  }
  if (/sommar|säsong|seasonal|season/.test(t)) return "seasonal";
  if (/vikariat|behovsanställning|tidsbegräns|temporary|fixed.?term|interim/.test(t)) {
    return "temporary";
  }
  if (/uppdrag|assignment|contract|konsult|freelance/.test(t)) {
    return "assignment";
  }
  return "unknown";
}

/** WORKING TIME MAPPING. Same rules: recognized or `"unknown"`. */
export function normalizeWorkingTime(value: unknown): VacancyWorkingTime {
  const t = normalizeText(value).toLowerCase();
  if (t.length === 0) return "unknown";
  if (/heltid|full.?time|100\s*%/.test(t)) return "full_time";
  if (/deltid|part.?time/.test(t)) return "part_time";
  return "unknown";
}
