import {
  ALL_ISO_COUNTRIES,
  countryDisplayName,
  countryNameKey,
  resolveCountryCode,
} from "@/lib/location/country-model";
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

/**
 * Does this country option answer what the person typed? (Owner direction
 * 2026-09-27, onboarding step 2.)
 *
 * WHY THIS LIVES HERE. The list is correctly 249 long — a market list orders
 * it, it never shortens it — and a 249-row scroll is how a person in Germany
 * failed to find Vokietija on production onboarding. A searchable control
 * needs a match rule, and the rule is country knowledge, so it belongs beside
 * the options rather than inside a generic listbox.
 *
 * NO SECOND COUNTRY SYSTEM. The two things a match may consult already exist:
 *   · `countryNameKey` — the canonical fold (diacritics, case, punctuation)
 *     used by the resolver's own name index, so "Vok" reaches "Vokietija" and
 *     "kot" reaches "Côte d'Ivoire";
 *   · `resolveCountryCode` — the ONE resolver, for a COMPLETE name in any of
 *     the 21 product languages, a documented alias or the bare ISO code, so a
 *     person typing "Germany" or "Deutschland" while the screen is Lithuanian
 *     still lands on Vokietija.
 *
 * A prefix, never a bare substring: the label's start, or the start of any
 * word in it ("states" → United States), so a two-letter query cannot pull in
 * every country that merely contains those letters. The resolver's own
 * exact-only contract is untouched — this filters a visible list, it never
 * decides what a typed country IS.
 */
export function countryOptionMatches(
  option: CountryOption,
  query: string,
): boolean {
  const q = countryNameKey(query);
  if (q === "") return true;
  const folded = countryNameKey(option.label);
  if (folded.startsWith(q)) return true;
  if (folded.split(" ").some((word) => word.startsWith(q))) return true;
  return resolveCountryCode(query) === option.value;
}
