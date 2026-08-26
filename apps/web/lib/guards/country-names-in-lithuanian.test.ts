import { describe, expect, it } from "vitest";

import { structureValueStatement } from "@/lib/structuring/value-statement";
import { COUNTRY_RULES } from "@/lib/structuring/structure-need";

/**
 * THE DEFAULT LOCALE MUST BE ABLE TO NAME ITS OWN MARKETS.
 *
 * `structureValueStatement` extracts the country from a stated need, and
 * `missing` lists "location" when it cannot — which is what makes the intake
 * ask for a place the person has already given. Lithuanian is the default
 * locale, so a Lithuanian employer naming a country is the ORDINARY case.
 *
 * Two markets failed it, both for the same shape of reason:
 *
 *   "Nyderlanduose" — the needle was `niderland` (i), Lithuanian spells it
 *                     with a y. The Netherlands is the most common
 *                     destination for Lithuanian workers abroad.
 *   "Estijoje"      — the needle was `eston`, Lithuanian is "Estija".
 *
 * Both were invisible because English and Russian forms were present and
 * tested-looking, so the rule LOOKED complete. This walks every rule in the
 * table in the locative case a person actually types, which is the only way
 * the next such gap gets noticed.
 */

/** Lithuanian locative ("in X") for every market in COUNTRY_RULES. */
const LOCATIVE: Record<string, string> = {
  LT: "Lietuvoje",
  LV: "Latvijoje",
  EE: "Estijoje",
  PL: "Lenkijoje",
  DE: "Vokietijoje",
  NL: "Nyderlanduose",
  DK: "Danijoje",
  NO: "Norvegijoje",
  SE: "Švedijoje",
  FI: "Suomijoje",
  GE: "Gruzijoje",
  BE: "Belgijoje",
  FR: "Prancūzijoje",
  ES: "Ispanijoje",
  AT: "Austrijoje",
  CH: "Šveicarijoje",
  US: "Amerikoje",
};

describe("every supported market is recognisable in Lithuanian", () => {
  it("the table and this list cover the same markets", () => {
    // If a market is added to COUNTRY_RULES without a Lithuanian form here,
    // this fails rather than silently skipping it — the way the two misses
    // above stayed hidden.
    const codes = COUNTRY_RULES.map((r) => r.code).sort();
    expect(Object.keys(LOCATIVE).sort()).toEqual(codes);
  });

  it.each(Object.entries(LOCATIVE))("%s — %s", (code, locative) => {
    const v = structureValueStatement(`Reikia dviejų suvirintojų ${locative}`);
    expect(v.country, `"${locative}" did not resolve to ${code}`).toBe(code);
  });

  it("recognising the country removes 'location' from what is missing", () => {
    // This is the whole point: `missing` drives the questions the intake asks,
    // so an unrecognised country means asking for a place already given.
    const v = structureValueStatement(
      "Reikia dviejų suvirintojų Nyderlanduose kitą savaitę",
    );
    expect(v.country).toBe("NL");
    expect(v.missing).not.toContain("location");
  });

  it("also works without diacritics, as most people type", () => {
    expect(
      structureValueStatement("Reikia suvirintoju Sveicarijoje").country,
    ).toBe("CH");
    expect(
      structureValueStatement("Reikia suvirintoju Prancuzijoje").country,
    ).toBe("FR");
  });
});
