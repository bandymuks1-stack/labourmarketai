/**
 * THE GEOGRAPHY SELECTION — what "the user picked a place" means, as one type.
 *
 * Goal 3 continues the proven market result: the person clicks a real anchor on
 * the canonical `MarketMap` and that click has to become something a loader can
 * be trusted with. This module is that contract, and nothing else: no data
 * access, no `server-only`, no React. It is therefore safe on both sides of the
 * boundary and is unit-testable on its own, which is the only way the precision
 * rules below can be pinned.
 *
 * THE ONE RULE THAT MATTERS: A SELECTION MAY NEVER CLAIM MORE PRECISION THAN
 * THE DATA HAS.
 *
 * `market-result.ts` already refuses to let a country centroid wear a city
 * label. The same refusal has to survive the trip through the URL, because the
 * URL is where a hand-typed value can invent one: `?geo=NL:city:` or
 * `?geo=NL:country:Rotterdam` are both a fabricated place, and `parseGeography`
 * rejects them outright rather than repairing them into something plausible.
 * An invalid token yields `null`, and the caller falls back to the market — a
 * wrong place is worse than no place.
 *
 * `region` EXISTS IN THE CONTRACT AND IS NOT SUPPORTED BY THE DATA. `projects`
 * carries `country` and `city` and no subdivision column, so no anchor on the
 * map can produce a region selection today. Rather than drop the field (and
 * silently narrow the contract) or pretend a region matches something (and
 * fabricate), a region selection parses successfully and the loader answers
 * with an explicit `unsupported_precision` state. The gap is visible instead of
 * guessed.
 */
import { foldText } from "@/lib/structuring/normalize";
import { isIsoCountry } from "@/lib/location/country-model";

/** How precisely the person named a place. Mirrors `AnchorPrecision` plus the
 *  contract's `region`, which the data does not yet support — see the header. */
export type GeographyPrecision = "city" | "region" | "country";

export interface GeographySelection {
  /** ISO-3166-1 alpha-2, always upper case. */
  readonly countryCode: string;
  /** Present iff `precision === "city"`. The RAW city text of the anchor. */
  readonly city?: string;
  /** Present iff `precision === "region"`. */
  readonly region?: string;
  readonly precision: GeographyPrecision;
}

/** The `?geo=` token separator. City/region segments are percent-encoded, so a
 *  place name containing a colon can never split the token. */
const SEP = ":";

/**
 * Serialize for the URL. The precision is written EXPLICITLY rather than
 * inferred from which fields are present: inference is how a country selection
 * quietly becomes a city one after a refactor.
 */
export function serializeGeography(g: GeographySelection): string {
  const country = g.countryCode.toUpperCase();
  switch (g.precision) {
    case "city":
      return [country, "city", encodeURIComponent(g.city ?? "")].join(SEP);
    case "region":
      return [country, "region", encodeURIComponent(g.region ?? "")].join(SEP);
    case "country":
      return [country, "country"].join(SEP);
  }
}

/**
 * Parse a `?geo=` token. Returns `null` for ANYTHING that is not a complete,
 * self-consistent selection — this is the boundary where a hand-typed URL is
 * stopped, so it validates rather than repairs.
 */
export function parseGeography(token: string | null | undefined): GeographySelection | null {
  if (typeof token !== "string" || token.trim() === "") return null;
  const parts = token.split(SEP);
  if (parts.length < 2 || parts.length > 3) return null;

  const countryCode = (parts[0] ?? "").trim().toUpperCase();
  // A country code that is not a real country is not a place.
  if (!/^[A-Z]{2}$/.test(countryCode) || !isIsoCountry(countryCode)) return null;

  const precision = parts[1];
  if (precision === "country") {
    // A country selection carrying a city is the exact fabrication this
    // module exists to prevent. Reject; do not silently drop the extra.
    if (parts.length !== 2) return null;
    return { countryCode, precision: "country" };
  }
  if (precision === "city" || precision === "region") {
    if (parts.length !== 3) return null;
    let value: string;
    try {
      value = decodeURIComponent(parts[2] ?? "");
    } catch {
      // A malformed percent-escape is a malformed place.
      return null;
    }
    value = value.trim();
    // `city` precision with no city name claims precision it does not have.
    if (value === "") return null;
    return precision === "city"
      ? { countryCode, city: value, precision: "city" }
      : { countryCode, region: value, precision: "region" };
  }
  return null;
}

/**
 * The place, as the person should read it back. Deliberately NOT localized
 * prose — it is the country code plus the raw place name the row actually
 * carries, so what is displayed is what was matched.
 */
export function geographyLabel(g: GeographySelection): string {
  if (g.precision === "city" && g.city) return `${g.city}, ${g.countryCode}`;
  if (g.precision === "region" && g.region) return `${g.region}, ${g.countryCode}`;
  return g.countryCode;
}

/**
 * Build a selection from a clicked map anchor.
 *
 * The anchor already carries the honest precision (`market-result.ts` sets
 * `country` for the aggregate whose city could not be resolved and labels it
 * with the country code only), so this is a translation, never an upgrade: a
 * `country` anchor can only ever become a `country` selection.
 */
export function geographyFromAnchor(anchor: {
  country: string;
  label: string;
  precision?: "city" | "country";
}): GeographySelection {
  const countryCode = anchor.country.toUpperCase();
  if (anchor.precision === "country") return { countryCode, precision: "country" };
  return { countryCode, city: anchor.label, precision: "city" };
}

/**
 * Does a project row's geography belong to this selection?
 *
 * THIS FUNCTION IS THE JOIN BETWEEN WHAT THE MAP DREW AND WHAT THE LIST SHOWS,
 * so it has to mirror `market-result.ts`'s aggregation exactly or the count
 * under the marker would not be the count in the list:
 *
 *  - `city`    — same country, and the project's RAW city text folds to the
 *                same value as the selection's. The anchor was keyed by that
 *                raw text, so folded equality is precisely what it aggregated.
 *  - `country` — same country AND the project's city could NOT be resolved to a
 *                coordinate. The dashed marker represents the UNRESOLVED
 *                aggregate and nothing else; matching every project in the
 *                country would show more rows than the marker counted.
 *  - `region`  — never matches; the data has no subdivision. Callers surface
 *                `unsupported_precision` rather than an empty list, so "no
 *                projects here" is never confused with "we cannot answer this".
 *
 * `cityResolves` is injected so this module stays free of the coordinate table
 * and remains trivially testable.
 */
export function projectMatchesGeography(
  project: { country: string | null; city: string | null },
  selection: GeographySelection,
  cityResolves: (country: string, city: string) => boolean,
): boolean {
  const country = project.country?.toUpperCase() ?? "";
  if (country === "" || country !== selection.countryCode) return false;

  if (selection.precision === "region") return false;

  if (selection.precision === "country") {
    const city = project.city ?? "";
    return city.trim() === "" || !cityResolves(country, city);
  }

  const city = project.city ?? "";
  if (city.trim() === "") return false;
  return foldText(city) === foldText(selection.city ?? "");
}
