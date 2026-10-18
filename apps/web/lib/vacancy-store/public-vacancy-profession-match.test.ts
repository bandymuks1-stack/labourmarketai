import { describe, expect, it } from "vitest";
import { matchProfessionAcrossLocales, matchProfessionByLabel } from "./public-vacancy-profession-match";

const LT = [
  { slug: "baker", label: "Kepėjas" },
  { slug: "cleaner", label: "Valytojas" },
  { slug: "cook", label: "Virėjas" },
  { slug: "kitchen_helper", label: "Virtuvės pagalbininkas" },
  { slug: "warehouse_worker", label: "Sandėlio darbuotojas" },
  { slug: "driver", label: "Vairuotojas" },
  { slug: "welder", label: "Suvirintojas" },
];

describe("a typed catalogue profession becomes its filter", () => {
  it("maps the exact label, any case, with or without diacritics", () => {
    expect(matchProfessionByLabel("valytojas", LT)).toBe("cleaner");
    expect(matchProfessionByLabel("Kepėjas", LT)).toBe("baker");
    expect(matchProfessionByLabel("kepejas", LT)).toBe("baker");
    expect(matchProfessionByLabel("  VIRĖJAS ", LT)).toBe("cook");
    expect(matchProfessionByLabel("sandelio darbuotojas", LT)).toBe("warehouse_worker");
  });

  it("maps a typed beginning and an inflected form when unambiguous", () => {
    expect(matchProfessionByLabel("valyt", LT)).toBe("cleaner");
    expect(matchProfessionByLabel("valytoja", LT)).toBe("cleaner");
    expect(matchProfessionByLabel("kepeju", LT)).toBe("baker");
  });

  it("never guesses: unknown, too short and ambiguous input stay plain text", () => {
    expect(matchProfessionByLabel("lagerarbetare", LT)).toBeNull();
    expect(matchProfessionByLabel("va", LT)).toBeNull();
    // "vair" and "valy" are unique, but "v" + 3 letters shared by several is not.
    expect(matchProfessionByLabel("virt", LT)).toBe("kitchen_helper");
    expect(
      matchProfessionByLabel("vir", [
        { slug: "a", label: "Virėjas" },
        { slug: "b", label: "Virtuvės pagalbininkas" },
      ]),
    ).toBeNull();
  });
});

describe("the same word in another active language", () => {
  const EN = [
    { slug: "cleaner", label: "Cleaner" },
    { slug: "welder", label: "Welder" },
  ];
  const RU = [
    { slug: "cleaner", label: "Уборщик" },
    { slug: "welder", label: "Сварщик" },
  ];

  it("resolves an English word on the Lithuanian board and vice versa", () => {
    expect(matchProfessionAcrossLocales("welder", LT, [EN, RU])).toBe("welder");
    expect(matchProfessionAcrossLocales("valytojas", EN, [LT, RU])).toBe("cleaner");
  });

  it("the reader's own catalogue wins", () => {
    expect(matchProfessionAcrossLocales("valytojas", LT, [EN])).toBe("cleaner");
  });

  it("never guesses when two catalogues disagree", () => {
    const X = [{ slug: "baker", label: "Welder" }];
    expect(matchProfessionAcrossLocales("welder", LT, [EN, X])).toBeNull();
    expect(matchProfessionAcrossLocales("lagerarbetare", LT, [EN, RU])).toBeNull();
  });
});
