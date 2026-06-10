import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * ESCO taxonomy foundation guard (S2).
 *
 * Pins the iron rules of the recognition layer:
 *  - the three S2 migrations stay DRAFT-headed, additive-only, reversible;
 *  - candidate_skills carries §2.3 original_text/original_language NOT NULL,
 *    is default-closed, and has NO auto-approve path;
 *  - recognition NEVER touches verification: the autocomplete layer never
 *    writes worker_skills / verified / manager-confirm surfaces;
 *  - the feature flag ships OFF until migrations + import land;
 *  - the EU attribution string exists in config, script, and design doc.
 */

const APP = resolve(__dirname, "..", "..");
const REPO = resolve(APP, "..", "..");
const read = (rel: string): string => readFileSync(resolve(APP, rel), "utf8");
const readRepo = (rel: string): string =>
  readFileSync(resolve(REPO, rel), "utf8");
const stripSqlComments = (s: string): string =>
  s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, " ");

const MIGRATIONS = [
  "supabase/migrations/20260610130000_esco_taxonomy_core.sql",
  "supabase/migrations/20260610130100_esco_uri_refs.sql",
  "supabase/migrations/20260610130200_candidate_skills.sql",
];

describe("S2 draft migrations — draft-headed, additive, reversible", () => {
  for (const rel of MIGRATIONS) {
    const raw = readRepo(rel);
    const code = stripSqlComments(raw).toLowerCase();
    it(`${rel} is explicitly a needs-human-gate DRAFT`, () => {
      expect(raw).toMatch(/DRAFT — needs-human-gate — DO NOT APPLY/);
      expect(raw).toMatch(/apply_migration/);
    });
    it(`${rel} is additive only (no executable drop/alter-destructive)`, () => {
      expect(code).not.toMatch(/\bdrop\s+(table|column|function|policy\s+(?!if\s+exists))/);
      // drop policy if exists immediately before create policy is the
      // idempotent re-create idiom — assert every drop policy is paired.
      const drops = code.match(/drop\s+policy\s+if\s+exists\s+(\w+)/g) ?? [];
      const creates = code.match(/create\s+policy\s+(\w+)/g) ?? [];
      expect(creates.length).toBeGreaterThanOrEqual(drops.length);
    });
    it(`${rel} carries a ROLLBACK block`, () => {
      expect(raw).toMatch(/-- ROLLBACK/);
    });
    it(`${rel} never loosens RLS (no using(true), no anon)`, () => {
      expect(code).not.toMatch(/using\s*\(\s*true\s*\)/);
      expect(code).not.toMatch(/\bto\s+anon\b/);
      expect(code).not.toMatch(/\bgrant\b[\s\S]{0,120}?\bto\s+(anon|public)\b/);
    });
  }

  it("candidate_skills enforces §2.3 + default-closed + no auto-approve", () => {
    const sql = readRepo(MIGRATIONS[2]);
    const code = stripSqlComments(sql).toLowerCase();
    expect(code).toMatch(/original_text\s+text\s+not null/);
    expect(code).toMatch(/original_language\s+char\(2\)\s+not null/);
    expect(code).toMatch(/default 'candidate'/);
    // Author may insert only their own row; only admin updates status.
    expect(code).toMatch(/with check \(profile_id = auth\.uid\(\)\)/);
    expect(code).toMatch(/for update to authenticated\s+using \(public\.is_admin\(\)\)/);
    // No DELETE policy — rejection is a status, the row stays.
    expect(code).not.toMatch(/for delete/);
  });
});

describe("recognition never touches verification", () => {
  const FILES = [
    "lib/taxonomy/esco-autocomplete.ts",
    "lib/taxonomy/esco-autocomplete-actions.ts",
    "components/app/esco-typeahead.tsx",
  ];
  for (const rel of FILES) {
    it(`${rel} never writes skills/verification surfaces`, () => {
      const code = read(rel)
        .replace(/\/\*[\s\S]*?\*\//g, " ")
        .replace(/\/\/[^\n]*/g, " ");
      expect(code).not.toMatch(/worker_skills/);
      expect(code).not.toMatch(/verified\s*[:=]\s*true/);
      expect(code).not.toMatch(/manager_confirmed/);
      expect(code).not.toMatch(/\.upsert\(|\.insert\(|\.update\(|\.delete\(/);
    });
  }

  it("the import script touches ONLY esco_* tables", () => {
    const code = readRepo("scripts/esco/import-esco.mjs")
      .replace(/\/\*[\s\S]*?\*\//g, " ")
      .replace(/\/\/[^\n]*/g, " ");
    const tables = [...code.matchAll(/\.from\("([a-z_]+)"\)/g)].map((m) => m[1]);
    expect(tables.length).toBeGreaterThan(0);
    for (const t of tables) {
      expect(t.startsWith("esco_"), `non-esco table write: ${t}`).toBe(true);
    }
  });
});

describe("flag + attribution", () => {
  it("ESCO autocomplete ships OFF", () => {
    expect(read("lib/config/esco.ts")).toMatch(
      /export const ESCO_AUTOCOMPLETE_ENABLED = false/,
    );
  });
  it("lib + component honor the flag (empty list / render nothing)", () => {
    expect(read("lib/taxonomy/esco-autocomplete.ts")).toMatch(
      /if \(!ESCO_AUTOCOMPLETE_ENABLED\) return \[\];/,
    );
    expect(read("components/app/esco-typeahead.tsx")).toMatch(
      /if \(!ESCO_AUTOCOMPLETE_ENABLED\) return null;/,
    );
  });
  it("EU attribution present in config, import script and design doc", () => {
    const phrase = "ESCO classification of the European Commission";
    expect(read("lib/config/esco.ts")).toContain(phrase);
    expect(readRepo("scripts/esco/import-esco.mjs")).toContain(phrase);
    expect(readRepo("docs/product/esco-taxonomy-design.md")).toContain("ESCO classification");
  });
  it("design doc flags the §2 label-storage decision for the owner", () => {
    const doc = readRepo("docs/product/esco-taxonomy-design.md");
    expect(doc).toMatch(/owner/i);
    expect(doc).toMatch(/§2/);
    expect(doc).toMatch(/esco_labels/);
  });
});
