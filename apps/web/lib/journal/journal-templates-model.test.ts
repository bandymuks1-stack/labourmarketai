import { describe, expect, it } from "vitest";
import {
  parseJournalTemplateRow,
  templateScaffoldText,
} from "./journal-templates-model";

const goodRow = {
  slug: "construction_daily",
  field_schema: {
    default_unit_slug: "square_meters",
    scaffold: {
      lt: ["Objektas: ", "Darbai: "],
      en: ["Site: ", "Work: "],
    },
  },
};

describe("journal template field_schema parsing (§10 registry, no UI enums)", () => {
  it("parses a valid row for the active locale", () => {
    const t = parseJournalTemplateRow(goodRow, "lt");
    expect(t).toEqual({
      slug: "construction_daily",
      scaffoldLines: ["Objektas: ", "Darbai: "],
      defaultUnitSlug: "square_meters",
    });
    expect(templateScaffoldText(t!)).toBe("Objektas: \nDarbai: ");
  });

  it("falls back lt → en → first available locale", () => {
    expect(parseJournalTemplateRow(goodRow, "de")?.scaffoldLines).toEqual([
      "Objektas: ",
      "Darbai: ",
    ]);
    const enOnly = {
      slug: "transport_daily",
      field_schema: { scaffold: { en: ["Route: "] } },
    };
    expect(parseJournalTemplateRow(enOnly, "ru")?.scaffoldLines).toEqual([
      "Route: ",
    ]);
  });

  it("degrades malformed rows to null (template simply not offered)", () => {
    expect(parseJournalTemplateRow({ slug: "BAD SLUG!" }, "lt")).toBeNull();
    expect(
      parseJournalTemplateRow({ slug: "ok_slug", field_schema: null }, "lt"),
    ).toBeNull();
    expect(
      parseJournalTemplateRow(
        { slug: "ok_slug", field_schema: { scaffold: { lt: [1, 2] } } },
        "lt",
      ),
    ).toBeNull();
    expect(
      parseJournalTemplateRow(
        { slug: "ok_slug", field_schema: { scaffold: { lt: [] } } },
        "lt",
      ),
    ).toBeNull();
  });

  it("drops an invalid default unit slug instead of guessing", () => {
    const t = parseJournalTemplateRow(
      {
        slug: "ok_slug",
        field_schema: {
          default_unit_slug: "NOT A SLUG",
          scaffold: { lt: ["A: "] },
        },
      },
      "lt",
    );
    expect(t?.defaultUnitSlug).toBeNull();
  });

  it("bounds scaffold size so a runaway row cannot flood the textarea", () => {
    const t = parseJournalTemplateRow(
      {
        slug: "ok_slug",
        field_schema: {
          scaffold: { lt: Array.from({ length: 40 }, (_, i) => `L${i}: `) },
        },
      },
      "lt",
    );
    expect(t?.scaffoldLines.length).toBe(12);
  });
});
