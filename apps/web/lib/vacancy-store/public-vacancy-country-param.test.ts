import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { readCountryParam } from "./public-vacancy-country-param";

describe("readCountryParam", () => {
  it("no parameter, or an empty one, is no request", () => {
    for (const raw of [undefined, null, "", "  ", 42]) {
      expect(readCountryParam(raw)).toEqual({ requested: false });
    }
  });

  it("a two-letter code is named, whatever its case", () => {
    expect(readCountryParam("NO")).toEqual({ requested: true, code: "NO" });
    expect(readCountryParam("se")).toEqual({ requested: true, code: "SE" });
    expect(readCountryParam(["no", "se"])).toEqual({ requested: true, code: "NO" });
  });

  it("anything else is still a request, so the note still shows, but names no country", () => {
    expect(readCountryParam("Norway")).toEqual({ requested: true, code: null });
    expect(readCountryParam("<b>")).toEqual({ requested: true, code: null });
  });
});

/**
 * The board must never look filtered by a country it did not filter by
 * (owner 2026-11-09). Until the RED country filter is applied, the page reads
 * the parameter only to say so, and never hands it to the search.
 */
describe("/jobs never silently ignores ?country=", () => {
  const page = readFileSync(
    join(__dirname, "..", "..", "app", "[locale]", "(marketing)", "jobs", "page.tsx"),
    "utf8",
  );

  it("reads the parameter and shows the note", () => {
    expect(page).toContain("readCountryParam(sp.country)");
    expect(page).toContain('data-testid="public-jobs-country-not-filtered"');
  });

  it("does not pass a country to the search or carry it into page links", () => {
    expect(page).not.toMatch(/countryCode\s*:/);
    expect(page).not.toMatch(/qs\.set\(\s*"country"/);
  });
});
