import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";

import {
  MAX_TIMESHEET_XLSX_BYTES,
  readTimesheetXlsx,
} from "@/lib/timesheet-import/xlsx-read";
import { parseTimesheetSheet } from "@/lib/timesheet-import/xlsx-grid-parse";

/**
 * The reader against REAL workbooks (built with the same library it reads
 * with) — a byte-level round trip, not a mock. Plus the refusal paths: bytes
 * that are not a zip never reach the parser, and the caps are enforced.
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

describe("readTimesheetXlsx", () => {
  it("round-trips a real monthly grid into strings the parser accepts", async () => {
    const buffer = await workbookBuffer((ws) => {
      ws.addRow(["UAB Statyba", "2026 m. gegužės mėn."]);
      ws.addRow(["Eil. Nr.", "Darbuotojas", "Objektas", ...DAYS]);
      const row = ws.addRow([1, "Vitalii Ivanov", "Peleniškės"]);
      row.getCell(4 + 3).value = 8; // day 4
      row.getCell(5 + 3).value = "8 (01) + 2 (05)"; // split day 5
    });

    const read = await readTimesheetXlsx(buffer);
    expect(read.kind).toBe("ok");
    if (read.kind !== "ok") return;
    expect(read.sheets).toHaveLength(1);
    // Numbers arrive as strings, positions preserved.
    expect(read.sheets[0].rows[2][3 + 3]).toBe("8");

    const parsed = parseTimesheetSheet(read.sheets[0].rows, read.sheets[0].name);
    expect(parsed.kind).toBe("parsed");
    if (parsed.kind !== "parsed") return;
    expect(parsed.month).toEqual({ year: 2026, month: 5 });
    expect(parsed.proposals).toHaveLength(3);
    const day5 = parsed.proposals.filter((p) => p.workDate === "2026-05-05");
    expect(day5.map((p) => p.hours).sort()).toEqual([2, 8]);
  });

  it("renders date cells as the platform day key", async () => {
    const buffer = await workbookBuffer((ws) => {
      ws.addRow(["Worker", "Date", "Hours"]);
      ws.addRow(["Vitalii", new Date(Date.UTC(2026, 4, 4)), 8]);
    });
    const read = await readTimesheetXlsx(buffer);
    expect(read.kind).toBe("ok");
    if (read.kind !== "ok") return;
    expect(read.sheets[0].rows[1][1]).toBe("2026-05-04");
  });

  it("refuses bytes that are not an XLSX zip, before any parsing", async () => {
    const read = await readTimesheetXlsx(Buffer.from("worker,date,hours\n"));
    expect(read).toEqual({ kind: "not-xlsx" });
  });

  it("refuses an empty buffer and an oversized one", async () => {
    expect(await readTimesheetXlsx(Buffer.alloc(0))).toEqual({ kind: "empty" });
    const oversized = Buffer.alloc(MAX_TIMESHEET_XLSX_BYTES + 1);
    expect(await readTimesheetXlsx(oversized)).toEqual({ kind: "too-large" });
  });

  it("reports a corrupt zip as failed, never as a throw", async () => {
    const corrupt = Buffer.concat([
      Buffer.from([0x50, 0x4b, 0x03, 0x04]),
      Buffer.from("definitely not a zip body"),
    ]);
    expect(await readTimesheetXlsx(corrupt)).toEqual({ kind: "failed" });
  });
});
