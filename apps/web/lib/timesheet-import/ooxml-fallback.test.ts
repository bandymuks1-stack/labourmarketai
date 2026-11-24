import { describe, expect, it } from "vitest";

import { readPrefixedOoxml } from "./ooxml-fallback";
import { readTimesheetXlsx } from "./xlsx-read";
import { detectTimesheetMonth, parseTimesheetSheet } from "./xlsx-grid-parse";
import { detectHeaderLanguage, readDate, rowsFromGrid } from "@/lib/organization-evidence/parse-tabular";
import { readEvidenceSourceFile } from "@/lib/organization-evidence/read-source-file";

/**
 * THE OWNER'S REAL FILES, REPRODUCED SYNTHETICALLY (walk 2026-09-16).
 *
 * `work_history_2025_part*.xlsx` — long format, `x:`-prefixed SpreadsheetML,
 * dates as Excel serials, headers "Object / recognized objects", "Work
 * performed", "Source week" — came back `file-unreadable`. The state
 * timesheet template (Conturus) parsed with the row number as the person,
 * the person as the object and the approval decree's year as the month.
 * These fixtures carry the SAME shapes with invented names; the owner's
 * files themselves are never committed.
 */

// ── a minimal STORED zip writer (no compression) — enough for a fixture ────
function crc32(buf: Buffer): number {
  let c = ~0;
  for (const b of buf) {
    c ^= b;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}
function storedZip(files: Record<string, string>): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const [name, text] of Object.entries(files)) {
    const data = Buffer.from(text, "utf8");
    const nameBuf = Buffer.from(name, "utf8");
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 8); // stored
    local.writeUInt32LE(crc32(data), 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(0, 10);
    central.writeUInt32LE(crc32(data), 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(offset, 42);
    locals.push(local, nameBuf, data);
    centrals.push(central, nameBuf);
    offset += local.length + nameBuf.length + data.length;
  }
  const cd = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(Object.keys(files).length, 8);
  eocd.writeUInt16LE(Object.keys(files).length, 10);
  eocd.writeUInt32LE(cd.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, eocd]);
}

const NS = 'xmlns:x="http://schemas.openxmlformats.org/spreadsheetml/2006/main"';
const cell = (ref: string, v: string, t = "str") => `<x:c r="${ref}" t="${t}"><x:v>${v}</x:v></x:c>`;
const num = (ref: string, v: string) => `<x:c r="${ref}"><x:v>${v}</x:v></x:c>`;

/** The owner's long-format export: prefixed elements, serial dates, the real
 *  header words, one week/date contradiction, one impossible day. */
function prefixedWorkbook(): Buffer {
  const header = ["Person", "Date", "Hours", "Object / recognized objects", "Work performed", "Source week"]
    .map((h, i) => cell(`${"ABCDEF"[i]}1`, h))
    .join("");
  const rows = [
    `<x:row r="1">${header}</x:row>`,
    // 45666 = 2025-01-09 (Thursday), ISO week 2 — consistent.
    `<x:row r="2">${cell("A2", "Jonas")}${num("B2", "45666")}${num("C2", "9")}${cell("D2", "Amsterdam Zuid")}${cell("E2", "formwork installation")}${num("F2", "2")}</x:row>`,
    // 46006 = 2025-12-15 (Monday), ISO week 51 — source says 50.
    `<x:row r="3">${cell("A3", "Petras")}${num("B3", "46006")}${num("C3", "8")}${cell("D3", "Hoofdgracht 3")}${cell("E3", "roof tiles")}${num("F3", "50")}</x:row>`,
    // 800 hours on one day — a period total typed as a day.
    `<x:row r="4">${cell("A4", "Donatas")}${num("B4", "45978")}${num("C4", "800")}${cell("D4", "Administraciniai darbai")}${cell("E4", "coordination")}${num("F4", "47")}</x:row>`,
  ].join("");
  return storedZip({
    "xl/workbook.xml": `﻿<?xml version="1.0" encoding="utf-8"?><x:workbook ${NS}><x:sheets><x:sheet name="Work history" sheetId="1" r:id="R1" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" /></x:sheets></x:workbook>`,
    "xl/_rels/workbook.xml.rels": `<?xml version="1.0" encoding="utf-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="R1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="/xl/worksheets/sheet1.xml" /></Relationships>`,
    "xl/sharedStrings.xml": `<?xml version="1.0" encoding="utf-8"?><x:sst ${NS} />`,
    "xl/worksheets/sheet1.xml": `<?xml version="1.0" encoding="utf-8"?><x:worksheet ${NS}><x:sheetData>${rows}</x:sheetData></x:worksheet>`,
  });
}

describe("namespace-prefixed OOXML — the owner's prepared workbooks are readable", () => {
  it("the fallback reader returns the same grid the primary reader would", () => {
    const sheets = readPrefixedOoxml(prefixedWorkbook(), {
      maxSheets: 10,
      maxRows: 2000,
      maxCols: 64,
      maxCells: 200_000,
    });
    expect(sheets).not.toBeNull();
    expect(sheets![0].name).toBe("Work history");
    expect(sheets![0].rows[0]).toEqual([
      "Person",
      "Date",
      "Hours",
      "Object / recognized objects",
      "Work performed",
      "Source week",
    ]);
    expect(sheets![0].rows[1]).toEqual(["Jonas", "45666", "9", "Amsterdam Zuid", "formwork installation", "2"]);
  });

  it("readTimesheetXlsx no longer answers `failed` for it", async () => {
    const r = await readTimesheetXlsx(prefixedWorkbook());
    expect(r.kind).toBe("ok");
  }, 30_000); // exceljs cold-loads before it refuses; the fallback runs after

  it("the evidence reader takes the LONG-FORMAT path: synonyms, serial dates, week check, hours check", async () => {
    const r = await readEvidenceSourceFile("work_history_2025_part3.xlsx", prefixedWorkbook());
    expect(r.kind).toBe("ok");
    if (r.kind !== "ok") return;
    expect(r.rows).toHaveLength(3);
    const [jonas, petras, donatas] = r.rows;
    expect(jonas.workDate).toBe("2025-01-09");
    expect(jonas.projectLabel).toBe("Amsterdam Zuid");
    expect(jonas.workText).toBe("formwork installation");
    expect(jonas.factFields).toEqual(
      expect.arrayContaining(["personLabel", "workDate", "hours", "projectLabel", "workText"]),
    );
    expect(jonas.derived.calendarWeek).toEqual({ value: 2, method: "iso_week_of_explicit_date", confidence: 1 });
    // The owner's acceptance case, found by the engine itself.
    expect(petras.workDate).toBe("2025-12-15");
    expect(petras.raw["Source week"]).toBe("50");
    expect(petras.derived.calendarWeek).toEqual({
      value: 51,
      method: "iso_week_conflicts_with_source_week",
      confidence: 1,
      note: "source_week=50",
    });
    // Kept as stated, marked as impossible for one day.
    expect(donatas.hours).toBe(800);
    expect(donatas.derived.hoursPlausibility).toEqual({ value: 800, method: "hours_exceed_day", confidence: 1 });
  }, 30_000);

  it("an Excel serial is read as its date and nothing else", () => {
    expect(readDate("45666")).toEqual({ iso: "2025-01-09", ambiguous: false });
    expect(readDate("46006")).toEqual({ iso: "2025-12-15", ambiguous: false });
    expect(readDate("12345")).toBeNull(); // 1933 — out of the bounded range
    expect(readDate("800")).toBeNull();
  });
});

describe("the state timesheet template (monthly grid) — people, no invented object, the sheet's own month", () => {
  const W = 40;
  const blank = (): string[] => Array.from({ length: W }, () => "");
  const row = (cells: Record<number, string>): string[] => {
    const r = blank();
    for (const [k, v] of Object.entries(cells)) r[Number(k)] = v;
    return r;
  };
  const days = row(Object.fromEntries(Array.from({ length: 12 }, (_, i) => [10 + i, String(i + 1)])));
  const grid = [
    row({ 0: "Eil. Nr.", 2: "Tabelio Nr.", 4: "Vardas, pavardė", 7: "Profesija (pareigos), kvalifikacinė kategorija", 10: "Dienos", 20: "PATVIRTINTA" }),
    row({ 20: "Lietuvos Respublikos Vyriausybės" }),
    row({ 20: "2004 m. sausio 27 d. nutarimu Nr. 78" }),
    row({ 3: "2026", 5: "METŲ", 7: "RUGPJŪČIO", 10: "MĖNESIO DARBO LAIKO APSKAITOS ŽINIARAŠTIS" }),
    days,
    row({ 10: "2026-08-01", 21: "2026-08-12" }),
    row({ 0: "1", 4: "Virginijus Pavardenis", 7: "Betonuotojas", 10: "P", 11: "P", 12: "10", 13: "10", 14: "8" }),
    row({ 10: "P", 11: "P", 12: "K", 13: "K", 14: "K" }),
    row({ 0: "2", 4: "Vitalii Pavardenis", 7: "Betonuotojas", 10: "P", 11: "P", 12: "10", 13: "10", 14: "8" }),
  ];

  it("the month is the sheet's own period, never the approval decree's date", () => {
    expect(detectTimesheetMonth(grid)).toEqual({ year: 2026, month: 8 });
    // Without the ISO range the split heading still wins over the decree.
    const noIso = grid.map((r, i) => (i === 5 ? blank() : r));
    expect(detectTimesheetMonth(noIso)).toEqual({ year: 2026, month: 8 });
    // A decree line alone names no month.
    expect(
      detectTimesheetMonth([row({ 20: "2004 m. sausio 27 d. nutarimu Nr. 78" })]),
    ).toBeNull();
  });

  it("the person comes from the 'Vardas, pavardė' column; the trade is not an object", () => {
    const parsed = parseTimesheetSheet(grid, "PELENIŠKĖS");
    expect(parsed.kind).toBe("parsed");
    if (parsed.kind !== "parsed") return;
    expect(parsed.month).toEqual({ year: 2026, month: 8 });
    const people = new Set(parsed.proposals.map((p) => p.workerLabel));
    expect(people).toEqual(new Set(["Virginijus Pavardenis", "Vitalii Pavardenis"]));
    expect(parsed.proposals.every((p) => p.objectLabel === null)).toBe(true);
    expect(parsed.proposals.map((p) => p.workDate)).toContain("2026-08-03");
    expect(parsed.proposals.some((p) => p.workDate?.startsWith("2004"))).toBe(false);
    // The "K" (trip) row is reported, not silently dropped.
    expect(parsed.skipped.length).toBeGreaterThan(0);
  });

  it("a long-format CSV grid with the same headers is unaffected", () => {
    const { rows } = rowsFromGrid([
      ["Person", "Date", "Hours", "Object / recognized objects", "Work performed"],
      ["Jonas", "2025-12-15", "8", "Amsterdam Zuid", "formwork installation"],
    ]);
    expect(rows[0].projectLabel).toBe("Amsterdam Zuid");
    expect(rows[0].workText).toBe("formwork installation");
  });
});

describe("the source language is read from the header words, or stays unknown", () => {
  it("names a language only on a strict winner", () => {
    expect(detectHeaderLanguage(["Person", "Date", "Hours", "Object / recognized objects", "Work performed", "Source week"])).toBe("en");
    expect(detectHeaderLanguage(["Darbuotojas", "Objektas", "Savaitė", "Data", "Valandos", "Darbai"])).toBe("lt");
    expect(detectHeaderLanguage(["Medewerker", "Datum", "Uren", "Omschrijving"])).toBe("nl");
    // "Datum" alone belongs to two languages — no answer, never a guess.
    expect(detectHeaderLanguage(["Datum"])).toBeNull();
    expect(detectHeaderLanguage([])).toBeNull();
  });
  it("the reader hands the recognised header row to the action", async () => {
    const r = await readEvidenceSourceFile("work_history.xlsx", prefixedWorkbook());
    expect(r.kind).toBe("ok");
    if (r.kind !== "ok") return;
    expect(r.headers).toEqual(["Person", "Date", "Hours", "Object / recognized objects", "Work performed", "Source week"]);
    expect(detectHeaderLanguage(r.headers)).toBe("en");
  }, 30_000);
});

