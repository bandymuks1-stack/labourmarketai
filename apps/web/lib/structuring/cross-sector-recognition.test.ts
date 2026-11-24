import { describe, it, expect } from "vitest";
import { recognizeUniversal, DOMAIN_SECTOR } from "./universal-recognition";

/**
 * Cross-sector Work Journal recognition (whole labour market, NOT construction-
 * only). Proves the required non-construction activities are detected — including
 * for a construction worker — and that a pure non-construction entry never yields
 * a construction suggestion (no construction-only filtering / no construction
 * default).
 */
const sectorsOf = (text: string) => recognizeUniversal(text).suggestions.map((s) => s.sector);
const domainsOf = (text: string) => recognizeUniversal(text).suggestions.map((s) => s.domain);

describe("each required activity is detected with the right sector", () => {
  const cases: ReadonlyArray<[string, string, string]> = [
    ["cooking", "Gaminau maistą virtuvėje", "hospitality_food"],
    ["gardening", "Pjoviau žolę ir genėjau krūmus", "agriculture"],
    ["driving/logistics", "Vairavau sunkvežimį, vežiau krovinį maršrutu", "transport_logistics"],
    ["warehouse", "Komplektavau prekes ir kroviau paletes", "transport_logistics"],
    ["cleaning", "Valiau patalpas ir ploviau langus", "cleaning_facility"],
    ["customer service", "Aptarnavau klientus prie kasos", "retail_sales"],
    ["IT", "Programavau ir testavau aplikaciją", "it_software"],
    ["language/translation", "Verčiau tekstą ir dariau korektūrą", "education"],
    ["equipment operation", "Operavau krautuvą ir ekskavatorių", "manufacturing"],
    ["care", "Slaugiau pacientus", "care_health"],
  ];
  for (const [name, text, sector] of cases) {
    it(`${name} → ${sector}`, () => {
      expect(sectorsOf(text)).toContain(sector);
    });
  }
});

describe("English + Russian entries are recognised too", () => {
  it("EN cooking", () => expect(sectorsOf("Cooked meals in the kitchen")).toContain("hospitality_food"));
  it("RU cooking", () => expect(sectorsOf("Готовил еду на кухне")).toContain("hospitality_food"));
  it("EN driving", () => expect(sectorsOf("Drove the delivery route with cargo")).toContain("transport_logistics"));
});

describe("a construction worker who logs other work gets ALL of it", () => {
  const text = "Tinkavau sieną, paskui gaminau maistą ir vairavau sunkvežimį su kroviniu";
  it("detects construction AND cooking AND transport (not construction-only)", () => {
    const sectors = new Set(sectorsOf(text));
    expect(sectors.has("construction")).toBe(true);
    expect(sectors.has("hospitality_food")).toBe(true);
    expect(sectors.has("transport_logistics")).toBe(true);
    expect(sectors.size).toBeGreaterThan(1);
  });
});

describe("no construction default / no construction-only filter", () => {
  it("a pure cooking entry yields NO construction suggestion", () => {
    expect(domainsOf("Gaminau maistą virtuvėje")).not.toContain("construction");
    expect(sectorsOf("Gaminau maistą virtuvėje")).toEqual(["hospitality_food"]);
  });
  it("a pure driving entry yields NO construction suggestion", () => {
    expect(domainsOf("Vairavau sunkvežimį su kroviniu")).not.toContain("construction");
  });
});

describe("honesty: recognition output is evidence, never verified", () => {
  it("every cross-sector suggestion is work_journal evidence, suggested, not confirmed", () => {
    for (const text of ["Gaminau maistą", "Aptarnavau klientus prie kasos", "Slaugiau pacientus"]) {
      for (const s of recognizeUniversal(text).suggestions) {
        expect(s.evidenceSource).toBe("work_journal");
        expect(s.status).toBe("suggested");
        expect(s.confirmed).toBe(false);
      }
    }
  });
});

describe("DOMAIN_SECTOR covers the whole labour market", () => {
  it("maps the required non-construction sectors", () => {
    const sectors = new Set(Object.values(DOMAIN_SECTOR));
    for (const s of [
      "hospitality_food", "agriculture", "transport_logistics", "retail_sales",
      "it_software", "education", "manufacturing", "care_health",
      "cleaning_facility", "office_admin",
    ]) {
      expect(sectors.has(s as never)).toBe(true);
    }
  });
});