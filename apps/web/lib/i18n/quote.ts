/**
 * Quote a person's own words in the reader's typographic convention.
 *
 * Components used to hard-code the Lithuanian pair „…“ around quoted text, so
 * an English reader saw „rawPhrase“ (UX review 2026-10-24, item 12). Each
 * language opens and closes its own way:
 *   lt, de  „…“      pl, nl  „…”      ru  «…»      en and the rest  “…”
 *
 * Pure; safe in client and server bundles.
 */
const PAIRS: Readonly<Record<string, readonly [string, string]>> = {
  lt: ["„", "“"],
  de: ["„", "“"],
  pl: ["„", "”"],
  nl: ["„", "”"],
  ru: ["«", "»"],
};
const DEFAULT_PAIR: readonly [string, string] = ["“", "”"];

export function quotePair(locale: string | null | undefined): readonly [string, string] {
  const base = (locale ?? "").toLowerCase().split(/[-_]/)[0] ?? "";
  return PAIRS[base] ?? DEFAULT_PAIR;
}

export function quoteText(locale: string | null | undefined, text: string): string {
  const [open, close] = quotePair(locale);
  return `${open}${text}${close}`;
}
