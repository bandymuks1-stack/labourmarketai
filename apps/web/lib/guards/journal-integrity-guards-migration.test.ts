/**
 * Guard for the journal_integrity_guards migration (salvaged from retired
 * PR #10b 0014). Pins the two real additive guards AND prevents a second
 * parallel language list from drifting in.
 *
 *   1. The original_language CHECK set EXACTLY equals the canonical locale set
 *      in apps/web/lib/i18n/config.ts (`locales`) — the ONE source of truth
 *      (PLATFORM_DOCTRINE §2.4). If anyone edits one without the other, this
 *      fails. No second hardcoded list is allowed to exist.
 *   2. The migration narrows the direct INSERT policy to own-worker AND
 *      closed-only (§4 default-closed), and is additive/reversible (no
 *      destructive DROP, has a ROLLBACK block).
 */

import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const APP = join(__dirname, "..", "..");
const MIG_DIR = join(APP, "..", "..", "supabase", "migrations");

function read(rel: string): string {
  return readFileSync(join(APP, rel), "utf8");
}

function codesFrom(text: string): string[] {
  const m = text.match(/[a-z]{2}/g) ?? [];
  return [...new Set(m)].sort();
}

// The migration is named by timestamp; resolve it by content, not a hard path.
function migrationSource(): { name: string; sql: string } {
  const file = readdirSync(MIG_DIR).find((f) => f.endsWith("_journal_integrity_guards.sql"));
  if (!file) throw new Error("journal_integrity_guards migration not found");
  return { name: file, sql: readFileSync(join(MIG_DIR, file), "utf8") };
}

describe("Guard: journal_integrity_guards migration", () => {
  const { name, sql } = migrationSource();

  it("filename matches the §16 timestamp convention", () => {
    expect(name).toMatch(/^\d{14}_journal_integrity_guards\.sql$/);
  });

  it("original_language CHECK set == canonical i18n config `locales` (one source of truth)", () => {
    // canonical set from apps/web/lib/i18n/config.ts
    const cfg = read("lib/i18n/config.ts");
    const localesBlock = cfg.match(/export const locales\s*=\s*\[([\s\S]*?)\]\s*as const/);
    expect(localesBlock, "could not find `locales` array in config.ts").toBeTruthy();
    const canonical = codesFrom(localesBlock![1]);
    expect(canonical.length).toBe(10); // EN + 9 launch markets (§2.4)

    // set inside the migration's CHECK (original_language in ( ... ))
    const checkBlock = sql.match(/original_language\s+in\s*\(([^)]*)\)/i);
    expect(checkBlock, "could not find original_language IN (...) in the migration").toBeTruthy();
    const migrationSet = codesFrom(checkBlock![1]);

    expect(
      migrationSet,
      "journal_integrity_guards CHECK set must equal apps/web/lib/i18n/config.ts `locales` — update both or neither (no second list)",
    ).toEqual(canonical);
  });

  it("narrows the direct INSERT policy to own-worker AND closed-only (no loosening)", () => {
    expect(sql).toMatch(/create policy journal_entries_insert[\s\S]*owns_worker\(worker_id\)[\s\S]*visibility_scope\s*=\s*'closed'/i);
    expect(sql).not.toMatch(/using\s*\(\s*true\s*\)/i);
    expect(sql).not.toMatch(/\bto\s+anon\b/i);
  });

  it("is additive + reversible (no destructive drop; has a ROLLBACK block)", () => {
    // Strip comments first — the prose comment legitimately mentions "DROP
    // TABLE/COLUMN/FUNCTION" while explaining what it does NOT do. Only
    // executable SQL counts.
    const code = sql.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, " ");
    expect(code).not.toMatch(/drop\s+table\b/i);
    expect(code).not.toMatch(/drop\s+column\b/i);
    expect(code).not.toMatch(/drop\s+function\b/i);
    expect(sql).toMatch(/--[^\n]*\brollback\b/i); // rollback IS a comment block
  });
});
