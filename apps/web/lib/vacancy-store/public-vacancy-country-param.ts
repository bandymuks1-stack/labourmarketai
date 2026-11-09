/**
 * `?country=` ON THE PUBLIC BOARD, UNTIL THERE IS A COUNTRY FILTER.
 *
 * The board's search function has no country argument (the filter is the RED
 * draft that redoes #2209), so `/jobs?country=NO` used to render every
 * country's ads under a URL that says Norway, which reads as "these are the
 * Norwegian jobs". Owner 2026-11-09: the parameter must never be silently
 * ignored. Until the filter exists the page says so, visibly, and shows all
 * countries; it never pretends the parameter was applied.
 *
 * Pure: reads the raw parameter, returns what the page must tell the reader.
 */

export type CountryParamState =
  | { readonly requested: false }
  /** `code` is an ISO 3166 alpha-2 code when the value looks like one, else null. */
  | { readonly requested: true; readonly code: string | null };

export function readCountryParam(raw: unknown): CountryParamState {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== "string" || value.trim() === "") return { requested: false };
  const code = value.trim().toUpperCase();
  return { requested: true, code: /^[A-Z]{2}$/.test(code) ? code : null };
}
