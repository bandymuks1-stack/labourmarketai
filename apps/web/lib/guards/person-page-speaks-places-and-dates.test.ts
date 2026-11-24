import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  availabilityDateLabel,
  countryLabel,
  mobilityLabels,
} from "@/lib/people/person-page-labels";
import { MARKET_COUNTRIES } from "@/lib/taxonomy/work-categories";
import { activeLocales } from "@/lib/i18n/config";

/**
 * THE PERSON PAGE SPEAKS PLACES AND DATES (owner readiness window §5B, §24).
 *
 * Slice 4 of the person-presentation work — LOCATION / COUNTRIES and
 * AVAILABILITY. Measured against production data on 2026-09-09: a real worker
 * row carries `current_location_country = 'LT'`, `preferred_countries =
 * ['NL','DK','NO','SE']` and `available_from = '2026-07-31'`, and the page
 * printed all three verbatim. On the ONE cross-person page an employer uses
 * to judge somebody, "LT" and "NL, DK, NO, SE" are storage, and §24 bans raw
 * internal identifiers outright.
 *
 * Nothing here widens what is READ. The same columns, the same RLS, the same
 * `can_view_worker` gate — only how the values are said.
 */

const WEB = join(__dirname, "..", "..");
const read = (...p: string[]) =>
  readFileSync(join(WEB, ...p), "utf8");
const page = read("app", "[locale]", "dashboard", "people", "[workerId]", "page.tsx");

/** A catalogue-shaped lookup over the real `labourMarket.countryNames`. */
function catalogue(locale: string) {
  const json = JSON.parse(
    read("messages", locale, "labour-market.json"),
  ) as Record<string, Record<string, string>>;
  const names = json.countryNames ?? {};
  return {
    has: (key: string) => key.startsWith("countryNames.") &&
      key.slice("countryNames.".length) in names,
    get: (key: string) => names[key.slice("countryNames.".length)] ?? key,
  };
}

describe("1. a country is named, never printed as its code", () => {
  it("the page renders both country fields through the shared catalogue", () => {
    expect(page).toContain("countryLabel(worker.current_location_country");
    expect(page).toContain("mobilityLabels(");
    // The raw interpolations that were there before must not come back.
    // `mobility.join(", ")` is still how the chip is written — but `mobility`
    // now holds LABELS, so what matters is that the stored array never
    // reaches the markup by any other route.
    expect(page).not.toMatch(/\{worker\.current_location_country as string\}/);
    expect(page).not.toMatch(/preferred_countries[\s\S]{0,80}\.join/);
    const jsx = page.slice(page.indexOf("return ("));
    expect(jsx).not.toContain("preferred_countries");
  });

  it("every market the product operates in has a name in every active locale", () => {
    for (const loc of activeLocales) {
      const c = catalogue(loc);
      for (const code of MARKET_COUNTRIES) {
        const label = countryLabel(code, c);
        expect(label, `${loc}/${code}`).not.toBe(code);
        expect(label.length, `${loc}/${code}`).toBeGreaterThan(1);
      }
    }
  });

  it("the person's own ordering of where they will work is preserved", () => {
    const c = catalogue("en");
    expect(mobilityLabels(["NL", "DK", "NO", "SE"], c)).toEqual([
      "Netherlands",
      "Denmark",
      "Norway",
      "Sweden",
    ]);
  });

  /** NEGATIVE CONTROL — the fallback must be the CODE, not a blank (SEP-7).
   *  The location model spans all of ISO and the column is free text, so a
   *  country outside the market set is expected, not a bug. Dropping it would
   *  turn a stated fact into "no location given". */
  it("a country outside the catalogue keeps its code and is never dropped", () => {
    const c = catalogue("en");
    expect(countryLabel("ZZ", c)).toBe("ZZ");
    expect(mobilityLabels(["NL", "ZZ"], c)).toEqual(["Netherlands", "ZZ"]);
    // Blanks and non-strings are the only things that disappear.
    expect(mobilityLabels(["NL", "  ", null, 7, "DK"] as unknown[], c)).toEqual([
      "Netherlands",
      "Denmark",
    ]);
    expect(mobilityLabels(null, c)).toEqual([]);
  });
});

describe("2. an availability date is written, not stamped", () => {
  const format = {
    dateTime: (d: Date) =>
      new Intl.DateTimeFormat("en-GB", {
        year: "numeric",
        month: "long",
        day: "numeric",
        timeZone: "UTC",
      }).format(d),
  };

  it("the stored date column is formatted for the reader", () => {
    expect(page).toContain("availabilityDateLabel(");
    expect(availabilityDateLabel("2026-07-31", format)).toBe("31 July 2026");
  });

  it("the calendar date does not slip a day across time zones", () => {
    // Parsed and formatted at UTC. A local-midnight parse would render
    // "30 July 2026" for any viewer west of the server.
    expect(availabilityDateLabel("2026-07-31", format)).not.toContain("30");
    expect(availabilityDateLabel("2026-01-01", format)).toBe("1 January 2026");
  });

  /** NEGATIVE CONTROL — an unparseable value degrades to the stored string,
   *  never to "Invalid Date" and never to nothing. The person DID state an
   *  availability; losing it reads as "none given". */
  it("a value the formatter cannot read keeps the stored text", () => {
    expect(availabilityDateLabel("not-a-date", format)).toBe("not-a-date");
    expect(availabilityDateLabel("", format)).toBe("");
    expect(availabilityDateLabel("not-a-date", format)).not.toContain("Invalid");
  });
});
