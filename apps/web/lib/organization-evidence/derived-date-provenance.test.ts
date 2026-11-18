import { describe, expect, it } from "vitest";

import {
  DATE_RECONSTRUCTED_METHOD,
  dateIsDeclaredReconstructed,
  dateProvenanceColumnIndex,
  rowsFromGrid,
} from "./parse-tabular";

const HEADER = ["Person", "Date", "Hours", "Object / recognized objects", "Work performed", "Source week", "Date provenance"];

describe("a date the source declares reconstructed is never a stated fact", () => {
  it("finds the provenance column by its header words", () => {
    expect(dateProvenanceColumnIndex(HEADER)).toBe(6);
    expect(dateProvenanceColumnIndex(["Person", "Date", "Hours"])).toBeUndefined();
  });

  it("reads the cell: only an explicit statement keeps the date a fact", () => {
    expect(dateIsDeclaredReconstructed("Derived from ISO year 2025 + source week + source weekday; source did not contain calendar date")).toBe(true);
    expect(dateIsDeclaredReconstructed("reconstructed from week")).toBe(true);
    expect(dateIsDeclaredReconstructed("Explicit date in the source")).toBe(false);
    expect(dateIsDeclaredReconstructed("")).toBe(false);
  });

  it("a reconstructed date stays on the row as DERIVED, with its method, and the week comparison is not circular", () => {
    const parsed = rowsFromGrid([
      HEADER,
      ["Person A", "45954", "9", "Site 3", "roof tiles", "43", "Derived from ISO year 2025 + source week + source weekday; source did not contain calendar date"],
    ]);
    const row = parsed.rows[0];
    expect(row.workDate).toBe("2025-10-24");
    expect(row.factFields).not.toContain("workDate");
    expect(row.factFields).toEqual(expect.arrayContaining(["personLabel", "hours", "projectLabel", "workText"]));
    expect(row.derived?.workDate).toMatchObject({ value: "2025-10-24", method: DATE_RECONSTRUCTED_METHOD });
    expect(row.derived?.calendarWeek).toMatchObject({ value: 43, method: "source_week" });
  });

  it("a file WITHOUT a provenance column is unchanged: an explicit date is a fact", () => {
    const parsed = rowsFromGrid([
      ["Person", "Date", "Hours", "Work performed"],
      ["Person A", "2025-10-24", "8", "roofing"],
    ]);
    expect(parsed.rows[0].factFields).toContain("workDate");
    expect(parsed.rows[0].derived?.workDate).toBeUndefined();
  });
});
