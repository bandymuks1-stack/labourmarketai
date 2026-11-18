import { describe, expect, it } from "vitest";
import { projectTitleFromSentence } from "./project-title-from-sentence";

describe("projectTitleFromSentence", () => {
  it("reads the name after a colon, up to the first comma (the walked NL sentence)", () => {
    expect(
      projectTitleFromSentence(
        "Maak een nieuw project: Renovatie magazijn Waalhaven in Rotterdam, start 2 november, 6 weken",
      ),
    ).toBe("Renovatie magazijn Waalhaven in Rotterdam");
  });

  it("reads a quoted name in any quote style", () => {
    expect(projectTitleFromSentence("sukurk projektą „Statybos aikštelė Kaune“")).toBe("Statybos aikštelė Kaune");
    expect(projectTitleFromSentence('create project "Harbor Warehouse" in Rotterdam')).toBe("Harbor Warehouse");
    expect(projectTitleFromSentence("создай проект «Склад Каунас»")).toBe("Склад Каунас");
  });

  it("reads a name after a naming word", () => {
    expect(projectTitleFromSentence("create a project called Harbor Warehouse, from Monday")).toBe("Harbor Warehouse");
    expect(projectTitleFromSentence("utwórz projekt o nazwie Hala Gdańsk")).toBe("Hala Gdańsk");
    expect(projectTitleFromSentence("создай проект под названием Склад Вильнюс")).toBe("Склад Вильнюс");
  });

  it("never guesses a name from unmarked prose", () => {
    expect(projectTitleFromSentence("sukurk projektą Roterdame")).toBeNull();
    expect(projectTitleFromSentence("create a new project")).toBeNull();
  });
});
