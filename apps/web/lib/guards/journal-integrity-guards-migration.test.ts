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

  it("original_language CHECK set == canonical i18n config `communicationLocales` (one source of truth)", () => {
    // canonical set from apps/web/lib/i18n/config.ts.
    //
    // Owner RED-1 (2026-09-17): the original_language CHECK preserves what a
    // message may be AUTHORED in — the COMMUNICATION set, which is the UI
    // `locales` PLUS communication-only languages (uk/ka). UI_LANGUAGE !=
    // COMMUNICATION_LANGUAGE, so the CHECK tracks `communicationLocales`, not
    // `locales`. `locales` stays the 11-code UI set (sanity below); the two
    // sets are kept in the `locales ⊆ communicationLocales` relation by
    // lib/guards/message-language-set.test.ts.
    const cfg = read("lib/i18n/config.ts");
    const uiBlock = cfg.match(/export const locales\s*=\s*\[([\s\S]*?)\]\s*as const/);
    expect(uiBlock, "could not find `locales` array in config.ts").toBeTruthy();
    expect(codesFrom(uiBlock![1]).length).toBe(11); // EN + 9 launch markets + RU

    const commBlock = cfg.match(/export const communicationLocales\s*=\s*\[([\s\S]*?)\]\s*as const/);
    expect(commBlock, "could not find `communicationLocales` in config.ts").toBeTruthy();
    // `[...locales, "uk", "ka"]` — codesFrom also reads the two-letter codes in
    // the surrounding words, so pull the added codes explicitly and union.
    const added = [...commBlock![1].matchAll(/"([a-z]{2})"/g)].map((m) => m[1]);
    const canonical = [...new Set([...codesFrom(uiBlock![1]), ...added])].sort();
    expect(canonical).toContain("uk");
    expect(canonical).toContain("ka");

    // The CHECK is widened forward-only (§16.1: applied migrations are
    // frozen) — the AUTHORITATIVE set lives in the LATEST migration that
    // declares an `original_language in (...)` CHECK. Frozen older
    // migrations legitimately carry the historical (narrower) set.
    const withCheck = readdirSync(MIG_DIR)
      .filter((f) => f.endsWith(".sql"))
      .filter((f) => /original_language\s+in\s*\(/i.test(readFileSync(join(MIG_DIR, f), "utf8")))
      .sort();
    expect(withCheck.length, "no migration declares an original_language CHECK").toBeGreaterThan(0);
    const latest = withCheck[withCheck.length - 1];
    const latestSql = readFileSync(join(MIG_DIR, latest), "utf8");
    // Strip comments (the ROLLBACK block legitimately carries the OLD set).
    const latestCode = latestSql.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, " ");

    // EVERY executable CHECK in the latest migration must equal the canonical set.
    const checks = [...latestCode.matchAll(/original_language\s+in\s*\(([^)]*)\)/gi)];
    expect(checks.length, `no original_language IN (...) in ${latest}`).toBeGreaterThan(0);
    for (const c of checks) {
      expect(
        codesFrom(c[1]),
        `${latest} CHECK set must equal apps/web/lib/i18n/config.ts \`communicationLocales\` — update both or neither (no second list)`,
      ).toEqual(canonical);
    }

    // And the frozen journal_integrity_guards migration keeps its original
    // 10-code set untouched (§16.1 — never edit an applied migration).
    const frozen = sql.match(/original_language\s+in\s*\(([^)]*)\)/i);
    expect(frozen).toBeTruthy();
    expect(codesFrom(frozen![1]).length).toBe(10);
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
