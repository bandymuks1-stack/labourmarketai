import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";

import { readEvidenceSourceFile } from "./read-source-file";

/**
 * The composition that was missing, against REAL workbook bytes — the same
 * byte-level round trip `xlsx-read.test.ts` uses, not a mock.
 *
 * Before this module the evidence importer called `file.text()` on whatever
 * arrived. An .xlsx is a zip, so that produced mojibake and the import died
 * as `nothing_parsed` — while the source-kind picker offered `xlsx`. The
 * negative control for the whole slice is at the bottom: the old text path,
 * run over these same bytes, finds nothing.
 */

async function workbookBuffer(
  build: (ws: ExcelJS.Worksheet) => void,
  sheetName = "Gegužė",
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  build(wb.addWorksheet(sheetName));
  return Buffer.from(await wb.xlsx.writeBuffer());
}

const DAYS = Array.from({ length: 31 }, (_, i) => i + 1);

/** A real monthly grid: a month in a heading, day columns, one worker line. */
function monthlyGrid(ws: ExcelJS.Worksheet): void {
  ws.addRow(["UAB Statyba", "2026 m. gegužės mėn."]);
  ws.addRow(["Eil. Nr.", "Darbuotojas", "Objektas", ...DAYS]);
  const row = ws.addRow([1, "Vitalii Ivanov", "Peleniškės"]);
  row.getCell(4 + 3).value = 8; // day 4
  row.getCell(6 + 3).value = 6; // day 6
}

describe("readEvidenceSourceFile — a real .xlsx becomes stageable rows", () => {
  it("reads a monthly grid the delimited path could never read", async () => {
    const read = await readEvidenceSourceFile("2026-05.xlsx", await workbookBuffer(monthlyGrid));
    expect(read.kind).toBe("ok");
    if (read.kind !== "ok") return;
    expect(read.via).toBe("xlsx-grid");
    expect(read.rows.length).toBeGreaterThanOrEqual(2);
    const dates = read.rows.map((r) => r.workDate).sort();
    expect(dates).toEqual(["2026-05-04", "2026-05-06"]);
    for (const r of read.rows) {
      expect(r.personLabel).toBe("Vitalii Ivanov");
      expect(r.hours).toBeGreaterThan(0);
    }
  });

  it("keeps the date a FACT when the sheet itself states the month", async () => {
    const read = await readEvidenceSourceFile("t.xlsx", await workbookBuffer(monthlyGrid));
    expect(read.kind).toBe("ok");
    if (read.kind !== "ok") return;
    // SEP-1: what the source said vs. what we inferred must stay separable.
    expect(read.rows[0].factFields).toContain("workDate");
    expect(read.rows[0].factFields).toContain("hours");
    expect(read.rows[0].derived?.workDate).toBeUndefined();
    // A grid carries no description, so the work text is always derived and
    // says so, at low confidence.
    expect(read.rows[0].derived?.workText?.method).toBe("no_description_in_grid");
  });

  it("REFUSES a grid whose month is nowhere on the sheet instead of inventing one", async () => {
    const read = await readEvidenceSourceFile(
      "no-month.xlsx",
      await workbookBuffer((ws) => {
        ws.addRow(["UAB Statyba"]); // no month anywhere
        ws.addRow(["Eil. Nr.", "Darbuotojas", "Objektas", ...DAYS]);
        ws.addRow([1, "Vitalii Ivanov", "Peleniškės"]).getCell(4 + 3).value = 8;
      }),
    );
    // Dating a person's real work to a month nobody stated is a fabricated
    // fact, so this is a NAMED refusal, not an empty success.
    expect(read.kind).toBe("month-not-stated");
  });

  it("REPORTS the undated sheets of a mixed workbook instead of losing them", async () => {
    // A year in one file is the real shape of this source, and its sheets are
    // not uniform. January states its month, February does not: February's
    // hours may not be invented, but they may not vanish unannounced either.
    const wb = new ExcelJS.Workbook();
    monthlyGrid(wb.addWorksheet("Sausis"));
    const feb = wb.addWorksheet("Vasaris");
    feb.addRow(["UAB Statyba"]); // month missing on purpose
    feb.addRow(["Eil. Nr.", "Darbuotojas", "Objektas", ...DAYS]);
    feb.addRow([1, "Vitalii Ivanov", "Peleniškės"]).getCell(4 + 3).value = 8;

    const read = await readEvidenceSourceFile(
      "2026.xlsx",
      Buffer.from(await wb.xlsx.writeBuffer()),
    );
    expect(read.kind).toBe("ok");
    if (read.kind !== "ok") return;
    // January's rows are there…
    expect(read.rows.every((r) => r.workDate?.startsWith("2026-05"))).toBe(true);
    // …and February is named as skipped, not silently absent.
    const undated = read.skipped.filter((s) => s.reason.includes("month_not_stated"));
    expect(undated).toHaveLength(1);
    expect(undated[0].reason).toContain("Vasaris");
  });

  it("names an unrecognised workbook rather than reporting an empty import", async () => {
    const read = await readEvidenceSourceFile(
      "notes.xlsx",
      await workbookBuffer((ws) => {
        ws.addRow(["just some prose"]);
        ws.addRow(["and another line"]);
      }),
    );
    expect(read.kind).toBe("nothing-parsed");
    if (read.kind !== "nothing-parsed") return;
    expect(read.detail).toBe("no_header");
  });

  it("refuses bytes that are not a workbook without handing them to the parser", async () => {
    const read = await readEvidenceSourceFile("fake.xlsx", Buffer.from("worker,date,hours\n"));
    expect(read.kind).toBe("file-unreadable");
  });

  it("enforces the byte ceiling before reading anything", async () => {
    const read = await readEvidenceSourceFile("big.xlsx", Buffer.alloc(6 * 1024 * 1024));
    expect(read.kind).toBe("file-too-large");
  });

  it("treats an empty upload as nothing parsed, not as a broken file", async () => {
    expect((await readEvidenceSourceFile("x.xlsx", Buffer.alloc(0))).kind).toBe("nothing-parsed");
  });
});

describe("readEvidenceSourceFile — the delimited path is unchanged", () => {
  const csv =
    "Darbuotojas;Data;Valandos;Objektas\nVitalii Ivanov;2026-05-04;8;Peleniškės\n";

  it("still reads a CSV into rows", async () => {
    const read = await readEvidenceSourceFile("t.csv", Buffer.from(csv, "utf8"));
    expect(read.kind).toBe("ok");
    if (read.kind !== "ok") return;
    expect(read.via).toBe("delimited");
    expect(read.rows).toHaveLength(1);
    expect(read.rows[0].personLabel).toBe("Vitalii Ivanov");
    expect(read.rows[0].workDate).toBe("2026-05-04");
  });

  it("keeps the SAME source fingerprint the text path always produced", async () => {
    // A file already imported must keep resolving to its existing session,
    // so this value may not drift.
    const { fingerprintPayload } = await import("./fingerprint");
    const read = await readEvidenceSourceFile("t.csv", Buffer.from(csv, "utf8"));
    expect(read.kind).toBe("ok");
    if (read.kind !== "ok") return;
    expect(read.fingerprint).toBe(fingerprintPayload("web-source", { raw: csv }));
  });

  it("fingerprints a workbook over its BYTES, so two workbooks never collide", async () => {
    const a = await readEvidenceSourceFile("a.xlsx", await workbookBuffer(monthlyGrid));
    const b = await readEvidenceSourceFile(
      "b.xlsx",
      await workbookBuffer((ws) => {
        monthlyGrid(ws);
        ws.getRow(3).getCell(8 + 3).value = 4; // one extra day
      }),
    );
    expect(a.kind).toBe("ok");
    expect(b.kind).toBe("ok");
    if (a.kind !== "ok" || b.kind !== "ok") return;
    expect(a.fingerprint).not.toBe(b.fingerprint);
  });
});

describe("NEGATIVE CONTROL — why the composition was needed", () => {
  it("the old text path finds nothing usable in the very same workbook", async () => {
    const bytes = await workbookBuffer(monthlyGrid);
    const { parseDelimited, rowsFromGrid } = await import("./parse-tabular");
    // This is exactly what `startEvidenceImportAction` used to do.
    const parsed = rowsFromGrid(parseDelimited(bytes.toString("utf8")));
    expect(parsed.rows).toHaveLength(0);

    // …and the composed reader gets real rows out of the identical bytes.
    const read = await readEvidenceSourceFile("t.xlsx", bytes);
    expect(read.kind).toBe("ok");
    if (read.kind !== "ok") return;
    expect(read.rows.length).toBeGreaterThan(0);
  });
});
