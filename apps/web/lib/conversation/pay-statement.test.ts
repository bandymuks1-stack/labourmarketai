import { describe, expect, it } from "vitest";

import { classifyIntent } from "@/lib/conversation/intent-router";
import { payPrefill, readPayStatement } from "@/lib/conversation/pay-statement";

/**
 * A stated pay expectation (2026-09-29): measured `unknown` on production and
 * answered with a criteria READ. It now routes to `pay-statement`, which opens
 * the ONE work-card form prefilled — the sentence itself writes nothing.
 */
describe("readPayStatement", () => {
  it("reads a from–to range in the served locales", () => {
    expect(readPayStatement("Mano atlyginimo lūkestis nuo 2500 iki 3500 eurų.")).toEqual({ kind: "range", min: 2500, max: 3500 });
    expect(readPayStatement("mano atlyginimo lukestis nuo 2 500 iki 3 500 euru")).toEqual({ kind: "range", min: 2500, max: 3500 });
    expect(readPayStatement("My salary expectation is 2500–3500 EUR")).toEqual({ kind: "range", min: 2500, max: 3500 });
    expect(readPayStatement("Зарплата от 2000 до 3000 евро")).toEqual({ kind: "range", min: 2000, max: 3000 });
  });

  it("reads a floor and a ceiling", () => {
    expect(readPayStatement("Mažiausiai 3000 eurų.")).toEqual({ kind: "min", min: 3000 });
    expect(readPayStatement("at least €3,000")).toEqual({ kind: "min", min: 3000 });
    expect(readPayStatement("atlyginimas iki 4000 €")).toEqual({ kind: "max", max: 4000 });
    expect(readPayStatement("Mano atlyginimo lūkestis 2800 eurų")).toEqual({ kind: "min", min: 2800 });
  });

  it("NEGATIVE: an hourly or daily rate is never stored as a monthly figure", () => {
    expect(readPayStatement("atlyginimas 15 €/val.")).toEqual({ kind: "none" });
    expect(readPayStatement("mano atlyginimas 120 eur per dieną")).toEqual({ kind: "not-monthly" });
    expect(readPayStatement("salary 150 eur per day")).toEqual({ kind: "not-monthly" });
  });

  it("NEGATIVE: a reversed range or no figure asks instead of guessing", () => {
    expect(readPayStatement("atlyginimas nuo 3500 iki 2500")).toEqual({ kind: "none" });
    expect(readPayStatement("noriu didesnio atlyginimo")).toEqual({ kind: "none" });
    expect(payPrefill({ kind: "none" })).toEqual({});
    expect(payPrefill({ kind: "range", min: 1, max: 2 })).toEqual({ salaryMin: "1", salaryMax: "2" });
  });
});

describe("pay statements route to the work card, seeking keeps find-work", () => {
  it.each([
    "Mano atlyginimo lūkestis nuo 2500 iki 3500 eurų.",
    "Mažiausiai 3000 eurų.",
    "My salary expectation is 2500-3500 EUR",
    "Моя зарплата от 2000 до 3000 евро",
    "Mein Gehalt sollte 3000 Euro sein",
  ])("%s → pay-statement", (s) => {
    expect(classifyIntent(s).intent).toBe("pay-statement");
  });

  it("NEGATIVE: a sentence that also seeks work stays a search", () => {
    expect(classifyIntent("Ieškau darbo, atlyginimas nuo 3000 eurų").intent).not.toBe("pay-statement");
  });
});
