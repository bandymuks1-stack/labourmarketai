import { describe, expect, it } from "vitest";

import { evaluateCheck, normalize, LEDGER_SQL, checkSql, repoMigrations } from "../../../../.github/scripts/migration-ledger-parity.mjs";

/**
 * The ledger parity tool is READ-ONLY by construction and compares by CONTENT
 * (owner 2026-10-13): pin both properties.
 */
describe("migration-ledger-parity — read-only, content-based", () => {
  it("both queries are a single SELECT over the ledger, with no write keyword", () => {
    for (const sql of [LEDGER_SQL, checkSql(repoMigrations().slice(0, 3))]) {
      const s = String(sql).toLowerCase();
      expect(s).toContain("from supabase_migrations.schema_migrations");
      expect(s).not.toMatch(/\b(insert|update|delete|truncate|alter|drop|create|grant|revoke)\b\s/);
    }
  });

  it("normalizes comments, whitespace, case and the transaction wrapper away — nothing else", () => {
    expect(normalize("-- header\nbegin;\nCREATE TABLE x (id int);\ncommit;\n")).toBe("createtablex(idint);");
    expect(normalize("select 1; -- note")).toBe("select1;");
  });

  it("classifies: content match, same name different content, ambiguous, not applied, ledger only", () => {
    const rows = [
      { file: "a.sql", stem: "20260101000000_a", suffix: "a", fp: "f".repeat(32), body: "" },
      { file: "b.sql", stem: "20260101000001_b", suffix: "b", fp: "e".repeat(32), body: "" },
      { file: "c.sql", stem: "20260101000002_c", suffix: "c", fp: "d".repeat(32), body: "" },
      { file: "d.sql", stem: "20260101000003_d", suffix: "d", fp: "c".repeat(32), body: "" },
    ];
    const answer = {
      check: {
        repo_unmatched: [1, 2, 3],
        ledger_unmatched: [
          { v: "1", n: "b", f: "x" },
          { v: "2", n: "c", f: "y" },
          { v: "3", n: "c", f: "z" },
          { v: "4", n: "orphan", f: "w" },
        ],
      },
    };
    const r = evaluateCheck(answer, rows);
    expect(r.MATCH.map((x: { file: string }) => x.file)).toEqual(["a.sql"]);
    expect(r.DIFFERS.map((x: { file: string }) => x.file)).toEqual(["b.sql"]);
    expect(r.UNKNOWN.map((x: { file: string }) => x.file)).toEqual(["c.sql"]);
    expect(r.NOT_APPLIED.map((x: { file: string }) => x.file)).toEqual(["d.sql"]);
    expect(r.LEDGER_ONLY.map((x: { version: string }) => x.version)).toEqual(["4"]);
  });
});
