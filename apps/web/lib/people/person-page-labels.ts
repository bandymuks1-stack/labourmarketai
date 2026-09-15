/**
 * How a person's stored facts are SPOKEN on the page an employer reads.
 *
 * Owner readiness window, 2026-09-09 (§5B "the visitor should understand …
 * WHERE CAN THEY WORK? WHEN ARE THEY AVAILABLE?", and §24 "no raw/internal
 * identifiers"). Read back from production the same day, the cross-person
 * page rendered a real worker's location as `LT`, their mobility as
 * `NL, DK, NO, SE` and their availability as `2026-07-31`. Every one of those
 * is a storage format, not a sentence, and the page's whole job is to be
 * understood in seconds.
 *
 * PURE — no React, no IO, no database — so the rules can be tested directly
 * instead of only through a rendered page. Both helpers share one principle:
 *
 *   DEGRADE TO THE TRUTH, NEVER TO A LIE OR TO NOTHING.
 *
 * A country outside the catalogue keeps its code; a date that will not parse
 * keeps its stored string. Dropping either would turn a fact the person DID
 * state into an absence the reader would fairly read as "not given" — SEP-7,
 * UNKNOWN ≠ EMPTY, on the surface where it costs someone an opportunity.
 */

/** The subset of next-intl's formatter this module needs. Structural, so the
 *  caller passes `getFormatter()`'s result and the tests pass a stub. */
export type DateFormatter = {
  readonly dateTime: (value: Date, options?: never) => string;
};

/** A country label in the reader's language, falling back to the code.
 *
 *  @param lookup a translator-backed reader — `has`/`get` over
 *         `labourMarket.countryNames`, the catalogue every other surface
 *         already uses. Injected rather than imported so this stays pure.
 */
export function countryLabel(
  code: string,
  lookup: { readonly has: (key: string) => boolean; readonly get: (key: string) => string },
): string {
  const trimmed = code.trim();
  if (!trimmed) return "";
  const key = `countryNames.${trimmed}`;
  return lookup.has(key) ? lookup.get(key) : trimmed;
}

/** The stored `preferred_countries` array as readable names, blanks dropped
 *  and order preserved (the person's own ordering is a preference). */
export function mobilityLabels(
  raw: readonly unknown[] | null | undefined,
  lookup: { readonly has: (key: string) => boolean; readonly get: (key: string) => string },
): string[] {
  return (raw ?? [])
    .filter((c): c is string => typeof c === "string" && c.trim().length > 0)
    .map((c) => countryLabel(c, lookup));
}

/**
 * A stored `date` column ("2026-07-31") as the reader's locale writes dates.
 *
 * Parsed at UTC midnight and formatted at UTC: a bare calendar date has no
 * time zone, and letting the server's zone decide would move "31 July" to
 * "30 July" for any viewer west of it.
 */
export function availabilityDateLabel(raw: string, format: DateFormatter): string {
  const parsed = new Date(`${raw}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return raw;
  return format.dateTime(parsed, {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  } as never);
}
