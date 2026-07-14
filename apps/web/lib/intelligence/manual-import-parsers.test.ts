import { describe, it, expect } from "vitest";

import {
  MANUAL_IMPORT_MAX_BYTES,
  MANUAL_IMPORT_MAX_ROWS,
  parseManualImportFile,
} from "./manual-import-parsers";

describe("CSV adapter", () => {
  it("parses header + rows, trims cells, nulls empties", () => {
    const result = parseManualImportFile(
      'subject_id,value_numeric,note\nelectrician, 2100 ,\n"plumber, senior",1900,"say ""hi"""\n',
      "csv",
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.rows).toEqual([
      { subject_id: "electrician", value_numeric: "2100", note: null },
      { subject_id: "plumber, senior", value_numeric: "1900", note: 'say "hi"' },
    ]);
  });

  it("refuses column-count mismatches with the 1-based row number", () => {
    expect(
      parseManualImportFile("a,b\n1,2\n1,2,3\n", "csv"),
    ).toEqual({ ok: false, reasonCode: "csv_row_column_mismatch", rowNumber: 3 });
  });

  it("refuses unterminated quotes and empty headers", () => {
    expect(parseManualImportFile('a,b\n"broken,2\n', "csv")).toEqual({
      ok: false,
      reasonCode: "csv_unterminated_quote",
      rowNumber: 2,
    });
    expect(parseManualImportFile(" , \nx,y\n", "csv")).toEqual({
      ok: false,
      reasonCode: "csv_missing_header",
    });
  });
});

describe("JSON adapter", () => {
  it("parses an array of objects", () => {
    const result = parseManualImportFile('[{"a":1},{"a":2}]', "json");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.rows).toHaveLength(2);
  });

  it("refuses invalid JSON / non-arrays / non-object rows — reason codes only", () => {
    expect(parseManualImportFile("{oops", "json")).toEqual({
      ok: false,
      reasonCode: "invalid_json",
    });
    expect(parseManualImportFile('{"a":1}', "json")).toEqual({
      ok: false,
      reasonCode: "json_not_an_array",
    });
    expect(parseManualImportFile("[1,2]", "json")).toEqual({
      ok: false,
      reasonCode: "json_row_not_object",
      rowNumber: 1,
    });
  });
});

describe("NDJSON adapter", () => {
  it("parses one object per line, skipping blank lines", () => {
    const result = parseManualImportFile('{"a":1}\n\n{"a":2}\n', "ndjson");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.rows).toEqual([{ a: 1 }, { a: 2 }]);
  });

  it("refuses a broken line with its 1-based line number", () => {
    expect(parseManualImportFile('{"a":1}\nnot json\n', "ndjson")).toEqual({
      ok: false,
      reasonCode: "ndjson_line_invalid",
      rowNumber: 2,
    });
  });
});

describe("hard bounds — refused, never silently truncated", () => {
  it("over-size content is refused", () => {
    const big = "a".repeat(MANUAL_IMPORT_MAX_BYTES + 1);
    expect(parseManualImportFile(big, "csv")).toEqual({
      ok: false,
      reasonCode: "file_too_large",
    });
  });

  it("too many rows is refused for every format", () => {
    const rows = Array.from({ length: MANUAL_IMPORT_MAX_ROWS + 1 }, () => '{"a":1}');
    expect(parseManualImportFile(rows.join("\n"), "ndjson")).toEqual({
      ok: false,
      reasonCode: "too_many_rows",
    });
    expect(
      parseManualImportFile(`[${rows.join(",")}]`, "json"),
    ).toEqual({ ok: false, reasonCode: "too_many_rows" });
    expect(
      parseManualImportFile(`a\n${Array.from({ length: MANUAL_IMPORT_MAX_ROWS + 1 }, () => "1").join("\n")}`, "csv"),
    ).toEqual({ ok: false, reasonCode: "too_many_rows" });
  });

  it("empty content is refused for every format", () => {
    for (const format of ["csv", "json", "ndjson"] as const) {
      expect(parseManualImportFile("  \n ", format)).toEqual({
        ok: false,
        reasonCode: "empty_file",
      });
    }
  });
});
