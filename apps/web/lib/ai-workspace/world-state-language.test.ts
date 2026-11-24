import { describe, expect, it } from "vitest";

import { EMPTY_DISCOVERY_FILTERS } from "@/lib/opportunities/discovery-filters";
import {
  UNSUPPORTED_DIMENSIONS,
  WORLD_STATE_DIMENSIONS,
  readWorldState,
  termStem,
  type VocabularyTerm,
} from "./world-state-language";

/**
 * Language → World State (W4).
 *
 * The behaviour that matters: a person's own words move the world, inflected
 * languages still land, a value their board does not contain is UNDERSTOOD but
 * never applied, and a dimension the product cannot filter on is named out loud
 * instead of silently dropped.
 */

const vocab: VocabularyTerm[] = [
  { dimension: "country", value: "DE", terms: ["Vokietija", "Germany", "Германия"], available: true },
  { dimension: "country", value: "NL", terms: ["Nyderlandai", "Netherlands"], available: true },
  { dimension: "country", value: "NO", terms: ["Norvegija", "Norway"], available: false },
  { dimension: "profession", value: "mason", terms: ["Mūrininkas", "Bricklayer"], available: true },
  { dimension: "accommodation", value: "provided_free", terms: ["Suteikiamas, nemokamai"], available: true },
];

describe("reading World State out of a sentence", () => {
  it("sets the country from an INFLECTED form", () => {
    // The catalogue says "Vokietija"; a real person says "Vokietijoje".
    const r = readWorldState("Ieškau darbo Vokietijoje", vocab);
    expect(r.filters.country).toBe("DE");
    expect(r.matches).toEqual([
      { dimension: "country", value: "DE", matchedText: "Vokietijoje", available: true },
    ]);
  });

  it("works in every language the person might use", () => {
    expect(readWorldState("I want work in Germany", vocab).filters.country).toBe("DE");
    expect(readWorldState("хочу работать в Германии", vocab).filters.country).toBe("DE");
  });

  it("always reports WHY — the exact words it understood", () => {
    const r = readWorldState("noriu dirbti Nyderlanduose mūrininku", vocab);
    const byDimension = Object.fromEntries(r.matches.map((m) => [m.dimension, m.matchedText]));
    expect(byDimension.country).toBe("Nyderlanduose");
    expect(byDimension.profession).toBe("mūrininku");
  });

  it("sets several dimensions from one sentence", () => {
    const r = readWorldState("darbas Vokietijoje mūrininkas", vocab);
    expect(r.filters.country).toBe("DE");
    expect(r.filters.profession).toBe("mason");
  });

  it("UNDERSTANDS a value the board does not contain, but never applies it", () => {
    // Filtering to a value with no rows behind it produces an empty list and no
    // explanation. The caller needs the match so it can say what IS available.
    const r = readWorldState("gal yra darbo Norvegijoje?", vocab);
    expect(r.filters.country).toBeNull();
    expect(r.matches).toEqual([
      { dimension: "country", value: "NO", matchedText: "Norvegijoje", available: false },
    ]);
  });

  it("prefers the longest match when two terms overlap", () => {
    const overlapping: VocabularyTerm[] = [
      { dimension: "country", value: "IE", terms: ["Airija"], available: true },
      { dimension: "country", value: "GB", terms: ["Šiaurės Airija"], available: true },
    ];
    const r = readWorldState("darbas Šiaurės Airija", overlapping);
    expect(r.filters.country).toBe("GB");
  });

  it("says nothing when nothing was named", () => {
    const r = readWorldState("labas", vocab);
    expect(r.filters).toEqual(EMPTY_DISCOVERY_FILTERS);
    expect(r.matches).toEqual([]);
  });

  it("does not fire mid-word", () => {
    // "Germ" must not match inside an unrelated token.
    const r = readWorldState("ungermane nonsense", vocab);
    expect(r.matches).toEqual([]);
  });
});

describe("dimensions the product cannot filter on yet", () => {
  it("names them instead of dropping the words", () => {
    expect(readWorldState("noriu bent 20 € per valandą", vocab).unsupported).toContain("salary");
    expect(readWorldState("tik pilnas etatas", vocab).unsupported).toContain("employment");
    expect(readWorldState("ne toliau kaip 20 km", vocab).unsupported).toContain("radius");
    expect(readWorldState("only in English language", vocab).unsupported).toContain("language");
  });

  it("never claims to have filtered on them", () => {
    const r = readWorldState("darbas Vokietijoje, bent 25 € per valandą", vocab);
    expect(r.filters.country).toBe("DE");
    // The pay was heard and reported, and no filter pretends to honour it.
    expect(r.unsupported).toEqual(["salary"]);
    expect(Object.values(r.filters).filter(Boolean)).toEqual(["DE"]);
  });

  it("supported and unsupported dimensions never overlap", () => {
    for (const d of UNSUPPORTED_DIMENSIONS) {
      expect(Object.keys(WORLD_STATE_DIMENSIONS)).not.toContain(d);
    }
  });
});

describe("term stems", () => {
  it("keeps short names whole and trims long ones", () => {
    // Never below five characters, so a short name stays whole…
    expect(termStem("Malta")).toBe("malta");
    expect(termStem("Norway")).toBe("norwa");
    // …and a long one loses only its ending, which is what inflection changes.
    expect(termStem("Vokietija")).toBe("vokieti");
    expect(termStem("Šiaurės Airija")).toBe("šiaurės airija"); // multi-word: full
  });
});
