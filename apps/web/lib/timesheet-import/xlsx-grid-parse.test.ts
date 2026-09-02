import { describe, expect, it } from "vitest";

import {
  detectTimesheetMonth,
  parseHourCell,
  parseTimesheetSheet,
} from "@/lib/timesheet-import/xlsx-grid-parse";

/**
 * The pure timesheet parser against the real-world template family: a
 * monthly worker × day grid with object rows, split-hour cells, totals rows
 * and an unstated month — plus the long-format fallback and the refusals.
 *
 * The invariant that motivated the feature is asserted verbatim: a split day
 * (8 h Object 01 + 2 h Object 05) becomes TWO proposals summing 10, and an
 * ambiguous split NEVER gets an object guessed for it.
 */

const DAYS = Array.from({ length: 31 }, (_, i) => String(i + 1));

/** A realistic monthly sheet: title row, header, worker rows with an object
 *  column, a continuation row (same worker, second object), a totals row. */
function monthlySheet(): string[][] {
  const empty = (): string[] => Array.from({ length: 31 }, () => "");
  const day = (values: Record<number, string>): string[] => {
    const cells = empty();
    for (const [d, v] of Object.entries(values)) cells[Number(d) - 1] = v;
    return cells;
  };
  return [
    ["UAB Statyba", "2026 m. gegužės mėn. darbo laiko apskaita", ""],
    ["Eil. Nr.", "Darbuotojas", "Objektas", ...DAYS],
    ["1", "Vitalii Ivanov", "Peleniškės", ...day({ 4: "8", 5: "8" })],
    ["", "", "Object 05", ...day({ 5: "2" })],
    ["2", "Jonas Kazlauskas", "Peleniškės", ...day({ 4: "7,5" })],
    ["", "Iš viso", "", ...day({ 4: "15.5", 5: "10" })],
  ];
}

describe("monthly grid happy path", () => {
  const result = parseTimesheetSheet(monthlySheet(), "Gegužė");

  it("recognizes the grid and the sheet's own month", () => {
    expect(result.kind).toBe("parsed");
    if (result.kind !== "parsed") return;
    expect(result.layout).toBe("monthly-grid");
    expect(result.month).toEqual({ year: 2026, month: 5 });
  });

  it("emits one proposal per worker × day × object with ISO dates", () => {
    if (result.kind !== "parsed") return;
    expect(result.proposals).toHaveLength(4);
    const vitalii4 = result.proposals.find(
      (p) => p.workerLabel === "Vitalii Ivanov" && p.workDate === "2026-05-04",
    );
    expect(vitalii4).toMatchObject({
      objectLabel: "Peleniškės",
      hours: 8,
      dayOfMonth: 4,
      confidence: "high",
    });
  });

  it("keeps the split day as TWO rows summing the real daily total", () => {
    if (result.kind !== "parsed") return;
    const day5 = result.proposals.filter(
      (p) => p.workerLabel === "Vitalii Ivanov" && p.workDate === "2026-05-05",
    );
    expect(day5).toHaveLength(2);
    expect(day5.map((p) => p.objectLabel).sort()).toEqual(["Object 05", "Peleniškės"]);
    expect(day5.reduce((acc, p) => acc + p.hours, 0)).toBe(10);
  });

  it("reads a comma decimal and never turns the totals row into a worker", () => {
    if (result.kind !== "parsed") return;
    expect(
      result.proposals.find((p) => p.workerLabel === "Jonas Kazlauskas")?.hours,
    ).toBe(7.5);
    expect(result.proposals.some((p) => /viso/i.test(p.workerLabel))).toBe(false);
  });

  it("carries a source cell for every number", () => {
    if (result.kind !== "parsed") return;
    for (const p of result.proposals) {
      expect(p.sourceCell).toMatch(/^Gegužė!R\d+C\d+$/);
    }
  });
});

describe("split-hour cells", () => {
  it("explicit per-part objects split with high confidence", () => {
    const parsed = parseHourCell("8 (01) + 2 (05)");
    expect(parsed).toEqual({
      kind: "parts",
      ambiguous: false,
      parts: [
        { hours: 8, objectLabel: "01" },
        { hours: 2, objectLabel: "05" },
      ],
    });
  });

  it("a split WITHOUT named objects is ambiguous and names none", () => {
    const parsed = parseHourCell("8+2");
    expect(parsed.kind).toBe("parts");
    if (parsed.kind !== "parts") return;
    expect(parsed.ambiguous).toBe(true);
    expect(parsed.parts.every((p) => p.objectLabel === null)).toBe(true);
  });

  it("an ambiguous split in an object row does NOT inherit the row's object", () => {
    const rows = [
      ["Nr", "Darbuotojas", "Objektas", ...DAYS],
      ["1", "Vitalii", "Object 01", "8/2", ...Array.from({ length: 30 }, () => "")],
    ];
    const result = parseTimesheetSheet(rows);
    expect(result.kind).toBe("parsed");
    if (result.kind !== "parsed") return;
    expect(result.proposals).toHaveLength(2);
    for (const p of result.proposals) {
      expect(p.objectLabel).toBeNull();
      expect(p.confidence).toBe("low");
    }
  });

  it("a time-like cell is refused, never misread as hours at an object", () => {
    expect(parseHourCell("8:30")).toEqual({ kind: "unparsable" });
  });
});

describe("bounds and refusals", () => {
  it("hours beyond a real day are skipped, not written smaller", () => {
    const rows = [
      ["Nr", "Darbuotojas", ...DAYS],
      ["1", "Vitalii", "25", ...Array.from({ length: 30 }, () => "")],
    ];
    const result = parseTimesheetSheet(rows);
    expect(result.kind).toBe("parsed");
    if (result.kind !== "parsed") return;
    expect(result.proposals).toHaveLength(0);
    expect(result.skipped).toEqual([
      { sourceCell: expect.stringMatching(/R2C3$/), reason: "hours-out-of-bounds" },
    ]);
  });

  it("a day the stated month does not have is skipped as invalid-date", () => {
    const rows = [
      ["2026-04", "", ...DAYS.map(() => "")],
      ["Nr", "Darbuotojas", ...DAYS],
      ["1", "Vitalii", ...Array.from({ length: 30 }, () => ""), "8"],
    ];
    const result = parseTimesheetSheet(rows);
    expect(result.kind).toBe("parsed");
    if (result.kind !== "parsed") return;
    expect(result.proposals).toHaveLength(0);
    expect(result.skipped[0]?.reason).toBe("invalid-date");
  });

  it("a sheet with no month leaves workDate null but keeps the day", () => {
    const rows = [
      ["Nr", "Darbuotojas", ...DAYS],
      ["1", "Vitalii", "8", ...Array.from({ length: 30 }, () => "")],
    ];
    const result = parseTimesheetSheet(rows);
    expect(result.kind).toBe("parsed");
    if (result.kind !== "parsed") return;
    expect(result.month).toBeNull();
    expect(result.proposals[0]).toMatchObject({ workDate: null, dayOfMonth: 1 });
  });

  it("a malformed sheet is honestly unrecognized", () => {
    expect(
      parseTimesheetSheet([
        ["random", "content"],
        ["without", "any structure"],
      ]).kind,
    ).toBe("unrecognized");
  });
});

describe("long-format fallback", () => {
  it("parses worker | date | object | hours rows", () => {
    const rows = [
      ["Darbuotojas", "Data", "Objektas", "Valandos", "Pastabos"],
      ["Vitalii Ivanov", "2026-05-04", "Peleniškės", "8", ""],
      ["Vitalii Ivanov", "05.05.2026", "Object 05", "2", "papildomai"],
      ["", "", "", "", ""],
    ];
    const result = parseTimesheetSheet(rows);
    expect(result.kind).toBe("parsed");
    if (result.kind !== "parsed") return;
    expect(result.layout).toBe("long-format");
    expect(result.proposals).toHaveLength(2);
    expect(result.proposals[1]).toMatchObject({
      workDate: "2026-05-05",
      objectLabel: "Object 05",
      hours: 2,
      note: "papildomai",
      confidence: "high",
    });
  });

  it("reports rows it cannot read instead of dropping them", () => {
    const rows = [
      ["Worker", "Date", "Hours"],
      ["Vitalii", "not-a-date", "8"],
      ["Vitalii", "2026-05-04", "lots"],
    ];
    const result = parseTimesheetSheet(rows);
    expect(result.kind).toBe("parsed");
    if (result.kind !== "parsed") return;
    expect(result.proposals).toHaveLength(0);
    expect(result.skipped.map((s) => s.reason).sort()).toEqual([
      "invalid-date",
      "unparsable",
    ]);
  });
});

describe("month detection", () => {
  it("reads numeric year-month statements in either order", () => {
    expect(detectTimesheetMonth([["2026-05"]])).toEqual({ year: 2026, month: 5 });
    expect(detectTimesheetMonth([["05/2026"]])).toEqual({ year: 2026, month: 5 });
    expect(detectTimesheetMonth([["", "2026.11 mėn."]])).toEqual({
      year: 2026,
      month: 11,
    });
  });

  it("reads month names beside a year, in the pilot's languages", () => {
    expect(detectTimesheetMonth([["2026 m. gegužės mėn."]])).toEqual({
      year: 2026,
      month: 5,
    });
    expect(detectTimesheetMonth([["August 2026"]])).toEqual({ year: 2026, month: 8 });
  });

  it("NEVER guesses: no statement means null", () => {
    expect(detectTimesheetMonth([["darbo laiko apskaita"]])).toBeNull();
  });
});
