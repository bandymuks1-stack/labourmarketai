import { describe, expect, it } from "vitest";

import {
  SELF_DECLARED_PROFESSION_MAX_LENGTH,
  SELF_DECLARED_PROFESSION_MAX_PER_SUBMIT,
  normalizeSelfDeclaredProfession,
  parseSelfDeclaredProfessions,
  professionDisplayName,
  recordableInputLanguage,
  selfDeclaredProfessionKey,
  serializeSelfDeclaredProfessions,
} from "@/lib/worker/self-declared-profession";

/**
 * The owner's acceptance case is "LLM programuotojas" — a real profession the
 * 49-row registry does not carry, typed by a real test user whose dashboard
 * then said "Profesija dar nenurodyta". Every rule below is written against
 * that case rather than a synthetic one.
 */
const OWNER_CASE = "LLM programuotojas";

describe("the person's words are stored as they typed them", () => {
  it("keeps the words exactly, removing only the whitespace around them", () => {
    expect(normalizeSelfDeclaredProfession(`  ${OWNER_CASE}  `)).toBe(OWNER_CASE);
    // Capitalisation, inner spacing, punctuation and spelling are theirs.
    expect(normalizeSelfDeclaredProfession("llm  PROGRAMUOTOJAS")).toBe(
      "llm  PROGRAMUOTOJAS",
    );
    expect(normalizeSelfDeclaredProfession("Pastolininkas, aukštalipis")).toBe(
      "Pastolininkas, aukštalipis",
    );
  });

  it("refuses what cannot be stored, rather than trimming it into shape", () => {
    expect(normalizeSelfDeclaredProfession("")).toBeNull();
    expect(normalizeSelfDeclaredProfession("   ")).toBeNull();
    expect(normalizeSelfDeclaredProfession("x")).toBeNull();
    expect(
      normalizeSelfDeclaredProfession("x".repeat(SELF_DECLARED_PROFESSION_MAX_LENGTH + 1)),
      "a too-long value is refused, never silently cut",
    ).toBeNull();
    expect(
      normalizeSelfDeclaredProfession("x".repeat(SELF_DECLARED_PROFESSION_MAX_LENGTH)),
    ).toHaveLength(SELF_DECLARED_PROFESSION_MAX_LENGTH);
    expect(normalizeSelfDeclaredProfession(null)).toBeNull();
    expect(normalizeSelfDeclaredProfession(undefined)).toBeNull();
  });

  it("the dedupe key matches the database's generated column", () => {
    // `normalized_label` is `lower(btrim(label))` in Postgres.
    expect(selfDeclaredProfessionKey(OWNER_CASE)).toBe("llm programuotojas");
    expect(selfDeclaredProfessionKey("llm PROGRAMUOTOJAS")).toBe(
      selfDeclaredProfessionKey(OWNER_CASE),
    );
  });
});

describe("the language is the session's, never the text's", () => {
  it("records a locale the product actually serves", () => {
    expect(recordableInputLanguage("lt")).toBe("lt");
    expect(recordableInputLanguage("RU")).toBe("ru");
    expect(recordableInputLanguage(" de ")).toBe("de");
  });

  it("records NOTHING rather than guessing", () => {
    // An unknown language stays unknown — the column is nullable for this.
    expect(recordableInputLanguage(null)).toBeNull();
    expect(recordableInputLanguage(undefined)).toBeNull();
    expect(recordableInputLanguage("")).toBeNull();
    expect(recordableInputLanguage("xx")).toBeNull();
    expect(recordableInputLanguage("lt-LT")).toBeNull();
    // Lithuanian words submitted from an English session record `en`: the
    // language of the SESSION, which is what was actually observed. Nothing
    // here reads the words.
    expect(recordableInputLanguage("en")).toBe("en");
  });
});

describe("what a surface shows", () => {
  const tProf = (slug: string) => (slug === "welder" ? "Suvirintojas" : null);

  it("a registry profession shows its localized name", () => {
    expect(professionDisplayName({ slug: "welder", label: null }, tProf)).toBe(
      "Suvirintojas",
    );
  });

  it("own words show as typed", () => {
    expect(professionDisplayName({ slug: null, label: OWNER_CASE }, tProf)).toBe(
      OWNER_CASE,
    );
  });

  it("a slug the catalogue cannot name never renders as a raw slug", () => {
    expect(
      professionDisplayName({ slug: "heavy_equipment_operator", label: null }, tProf),
    ).toBeNull();
  });

  it("an empty entry shows nothing", () => {
    expect(professionDisplayName({ slug: null, label: null }, tProf)).toBeNull();
    expect(professionDisplayName({ slug: null, label: "   " }, tProf)).toBeNull();
  });
});

describe("the form field carries the list intact", () => {
  it("survives a round trip, order kept", () => {
    const list = [OWNER_CASE, "Pastolininkas", "Sandėlio darbuotojas"];
    expect(parseSelfDeclaredProfessions(serializeSelfDeclaredProfessions(list))).toEqual(
      list,
    );
  });

  it("a comma inside the words is not a separator", () => {
    // The reason this field is JSON and not a delimited string.
    const list = ["Pastolininkas, aukštalipis"];
    expect(parseSelfDeclaredProfessions(serializeSelfDeclaredProfessions(list))).toEqual(
      list,
    );
  });

  it("dedupes by the database's key, keeping the first spelling", () => {
    expect(
      parseSelfDeclaredProfessions(
        serializeSelfDeclaredProfessions([OWNER_CASE, "llm PROGRAMUOTOJAS"]),
      ),
      "the person's first spelling is the one kept",
    ).toEqual([OWNER_CASE]);
  });

  it("drops what cannot be stored instead of failing the signup", () => {
    expect(
      parseSelfDeclaredProfessions(JSON.stringify([OWNER_CASE, "x", "", 7, null])),
    ).toEqual([OWNER_CASE]);
  });

  it("never throws on a malformed field", () => {
    expect(parseSelfDeclaredProfessions("not json")).toEqual([]);
    expect(parseSelfDeclaredProfessions('{"not":"an array"}')).toEqual([]);
    expect(parseSelfDeclaredProfessions("")).toEqual([]);
    expect(parseSelfDeclaredProfessions(null)).toEqual([]);
  });

  it("bounds one submission without capping what a person may hold", () => {
    const many = Array.from({ length: 50 }, (_, i) => `Profesija ${i}`);
    expect(parseSelfDeclaredProfessions(serializeSelfDeclaredProfessions(many))).toHaveLength(
      SELF_DECLARED_PROFESSION_MAX_PER_SUBMIT,
    );
  });
});
