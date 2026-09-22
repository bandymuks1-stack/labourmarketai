import { ALL_ISO_COUNTRIES, countryDisplayName } from "@/lib/location/country-model";
import { ACTIVE_MARKETS } from "@/lib/taxonomy/work-categories";

/**
 * Country <select> options for a locale: the active markets FIRST (commercial
 * priority = ordering), then every other ISO country alphabetically in the
 * person's language. MARKET PRIORITY ≠ ACCESS PERMISSION (owner rule,
 * 2026-09-22): a market list may order the list; it may never shorten it.
 * Labels come from `countryDisplayName` (CLDR), so no per-code translation key
 * is needed for the 232 countries that are not active markets.
 */
export interface CountryOption {
  readonly value: string;
  readonly label: string;
}

export function countryOptionsForLocale(
  locale: string,
  opts: { readonly priority?: readonly string[] } = {},
): CountryOption[] {
  const priority = opts.priority ?? ACTIVE_MARKETS;
  const label = (code: string): string => countryDisplayName(code, locale);
  const collator = new Intl.Collator(locale);
  const first = priority
    .filter((c) => ALL_ISO_COUNTRIES.includes(c))
    .map((code) => ({ value: code, label: label(code) }))
    .sort((a, b) => collator.compare(a.label, b.label));
  const seen = new Set(first.map((o) => o.value));
  const rest = ALL_ISO_COUNTRIES.filter((c) => !seen.has(c))
    .map((code) => ({ value: code, label: label(code) }))
    .sort((a, b) => collator.compare(a.label, b.label));
  return [...first, ...rest];
}
