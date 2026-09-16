import { inflateRawSync } from "node:zlib";

/**
 * NAMESPACE-PREFIXED OOXML — the minimal reader exceljs cannot be.
 *
 * The owner's prepared workbooks (`work_history_2025_part*.xlsx`, produced by
 * a .NET OpenXML writer) serialise every element with the `x:` prefix —
 * `<x:workbook><x:sheets><x:sheet …/>` — which is valid SpreadsheetML that
 * exceljs 4 does not read (`Cannot read properties of undefined (reading
 * 'sheets')`). The engine answered `file-unreadable` to a real file the
 * human had prepared exactly as asked (owner walk 2026-09-16).
 *
 * This is the fallback for THAT case only: a local-name-based reader over the
 * zip container, returning the same string grid `readTimesheetXlsx` returns.
 * It handles shared strings, inline strings, plain values and cached formula
 * results; it does not evaluate formulas, styles or dates (a date-formatted
 * number arrives as its Excel serial, which the parsers read deterministically
 * — see `readDate` / `toIsoDate`). Bounded by the same limits as the primary
 * reader. Nothing here is a second import pipeline: it produces the same
 * `XlsxSheetGrid[]` and stops there.
 */

const MAX_ENTRIES = 512;
const MAX_UNCOMPRESSED = 40 * 1024 * 1024;

interface ZipEntry {
  readonly name: string;
  readonly method: number;
  readonly compressedSize: number;
  readonly uncompressedSize: number;
  readonly localHeaderOffset: number;
}

/** The central directory, read from the end of the file (the only reliable
 *  table of contents — local headers may carry zeroed sizes). */
function readCentralDirectory(buf: Buffer): ZipEntry[] {
  const EOCD = 0x06054b50;
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 66_000); i--) {
    if (buf.readUInt32LE(i) === EOCD) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return [];
  const count = buf.readUInt16LE(eocd + 10);
  const cdOffset = buf.readUInt32LE(eocd + 16);
  const entries: ZipEntry[] = [];
  let p = cdOffset;
  for (let i = 0; i < Math.min(count, MAX_ENTRIES); i++) {
    if (p + 46 > buf.length || buf.readUInt32LE(p) !== 0x02014b50) break;
    const method = buf.readUInt16LE(p + 10);
    const compressedSize = buf.readUInt32LE(p + 20);
    const uncompressedSize = buf.readUInt32LE(p + 24);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localHeaderOffset = buf.readUInt32LE(p + 42);
    const name = buf.subarray(p + 46, p + 46 + nameLen).toString("utf8");
    entries.push({ name, method, compressedSize, uncompressedSize, localHeaderOffset });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

function readEntry(buf: Buffer, e: ZipEntry): string | null {
  const p = e.localHeaderOffset;
  if (p + 30 > buf.length || buf.readUInt32LE(p) !== 0x04034b50) return null;
  const nameLen = buf.readUInt16LE(p + 26);
  const extraLen = buf.readUInt16LE(p + 28);
  const start = p + 30 + nameLen + extraLen;
  const raw = buf.subarray(start, start + e.compressedSize);
  if (e.uncompressedSize > MAX_UNCOMPRESSED) return null;
  let out: Buffer;
  if (e.method === 0) out = raw;
  else if (e.method === 8) out = inflateRawSync(raw);
  else return null;
  // Strip a UTF-8 BOM: the .NET writer emits one on every part.
  return out.toString("utf8").replace(/^﻿/, "");
}

/** `<x:t>`, `<t>`, `<main:t>` — the local name is what matters. */
const tag = (name: string) => `(?:[A-Za-z_][\\w.-]*:)?${name}`;

function decodeXml(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&amp;/g, "&");
}

function textOf(fragment: string): string {
  // Concatenate every <t> in the fragment (rich text is several runs).
  const re = new RegExp(`<${tag("t")}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag("t")}>`, "g");
  let out = "";
  let m: RegExpExecArray | null;
  while ((m = re.exec(fragment)) !== null) out += decodeXml(m[1]);
  return out;
}

function columnIndex(ref: string): number {
  let n = 0;
  for (const ch of ref) {
    if (ch < "A" || ch > "Z") break;
    n = n * 26 + (ch.charCodeAt(0) - 64);
  }
  return n - 1;
}

export interface FallbackSheet {
  readonly name: string;
  readonly rows: readonly (readonly string[])[];
}

/**
 * Read a workbook exceljs refused. Returns `null` when the container is not
 * a workbook this reader understands — the caller then keeps its own honest
 * `failed` answer.
 */
export function readPrefixedOoxml(
  buf: Buffer,
  limits: { maxSheets: number; maxRows: number; maxCols: number; maxCells: number },
): FallbackSheet[] | null {
  const entries = readCentralDirectory(buf);
  const byName = new Map(entries.map((e) => [e.name, e] as const));
  const part = (name: string) => {
    const e = byName.get(name);
    return e ? readEntry(buf, e) : null;
  };

  const workbook = part("xl/workbook.xml");
  if (!workbook) return null;
  const rels = part("xl/_rels/workbook.xml.rels") ?? "";
  const relTarget = new Map<string, string>();
  const relRe = new RegExp(`<${tag("Relationship")}\\s([^>]*)/?>`, "g");
  let rm: RegExpExecArray | null;
  while ((rm = relRe.exec(rels)) !== null) {
    const attrs = rm[1];
    const id = /\bId="([^"]+)"/.exec(attrs)?.[1];
    const target = /\bTarget="([^"]+)"/.exec(attrs)?.[1];
    if (id && target) relTarget.set(id, target.replace(/^\/?(xl\/)?/, ""));
  }

  const shared: string[] = [];
  const sst = part("xl/sharedStrings.xml");
  if (sst) {
    const siRe = new RegExp(`<${tag("si")}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag("si")}>`, "g");
    let sm: RegExpExecArray | null;
    while ((sm = siRe.exec(sst)) !== null) shared.push(textOf(sm[1]));
  }

  const sheets: FallbackSheet[] = [];
  const sheetRe = new RegExp(`<${tag("sheet")}\\s([^>]*)/?>`, "g");
  let sm2: RegExpExecArray | null;
  let totalCells = 0;
  let ordinal = 0;
  while ((sm2 = sheetRe.exec(workbook)) !== null && sheets.length < limits.maxSheets) {
    ordinal += 1;
    const attrs = sm2[1];
    const name = decodeXml(/\bname="([^"]*)"/.exec(attrs)?.[1] ?? `Sheet${ordinal}`);
    const rid = /\b(?:r:)?id="([^"]+)"/.exec(attrs)?.[1];
    const target =
      (rid && relTarget.get(rid)) || `worksheets/sheet${ordinal}.xml`;
    const xml = part(`xl/${target}`);
    if (!xml) continue;

    const grid: string[][] = [];
    let maxCol = 0;
    const rowRe = new RegExp(`<${tag("row")}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag("row")}>`, "g");
    const cellRe = new RegExp(
      `<${tag("c")}\\s([^>]*?)(?:/>|>([\\s\\S]*?)</${tag("c")}>)`,
      "g",
    );
    let rw: RegExpExecArray | null;
    while ((rw = rowRe.exec(xml)) !== null && grid.length < limits.maxRows) {
      const cells: string[] = [];
      let cm: RegExpExecArray | null;
      while ((cm = cellRe.exec(rw[1])) !== null) {
        const attrs2 = cm[1];
        const inner = cm[2] ?? "";
        const ref = /\br="([A-Z]+)\d+"/.exec(attrs2)?.[1];
        const col = ref ? columnIndex(ref) : cells.length;
        if (col < 0 || col >= limits.maxCols) continue;
        const type = /\bt="(\w+)"/.exec(attrs2)?.[1] ?? "";
        let value = "";
        if (type === "inlineStr") value = textOf(inner);
        else {
          const v = new RegExp(`<${tag("v")}>([\\s\\S]*?)</${tag("v")}>`).exec(inner)?.[1];
          if (v !== undefined) {
            const raw = decodeXml(v).trim();
            value = type === "s" ? (shared[Number(raw)] ?? "") : raw;
          }
        }
        while (cells.length < col) cells.push("");
        cells[col] = value.trim();
      }
      if (cells.length > maxCol) maxCol = cells.length;
      grid.push(cells);
    }
    if (grid.length === 0) continue;
    // Rectangular, like the primary reader's output.
    const rows = grid.map((r) => {
      const padded = r.slice();
      while (padded.length < maxCol) padded.push("");
      return padded;
    });
    totalCells += rows.length * maxCol;
    if (totalCells > limits.maxCells) return null;
    if (rows.some((r) => r.some((c) => c !== ""))) sheets.push({ name, rows });
  }
  return sheets.length > 0 ? sheets : null;
}
