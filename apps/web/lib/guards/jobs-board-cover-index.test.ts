import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * THE PUBLIC BOARD'S PROFESSION FILTER MUST NOT READ THE TABLE (2026-10-01).
 *
 * /lt/jobs?profession=baker answered "the board did not answer in time".
 * `search_public_vacancy_previews_v1(null,'baker',20,0)` took 6,721 ms under the
 * anon role (statement_timeout 3 s); an unmatched free-text needle took 10 s.
 * The function is `language sql`, planned GENERIC, so its
 * `(p_slug is null or profession_slug = p_slug)` filter is opaque to every
 * profession index and the planner read 12,660 heap pages of a 118 MB table.
 *
 * The fix is ONE additive covering index that carries every column the function
 * reads, ordered like its ORDER BY, so the same generic plan runs as an
 * Index Only Scan. This guard pins the index to the function's real column list:
 * if a column is added to the anon projection and not to the index, the plan
 * silently falls back to heap reads and the timeout returns.
 */

const ROOT = join(__dirname, "..", "..", "..", "..");
const NAME = "20261001090000_public_vacancy_search_indexes_v1";
const FWD = join(ROOT, `supabase/migrations/${NAME}.sql`);
const DOWN = join(ROOT, `supabase/rollbacks/${NAME}.down.sql`);

const sqlOnly = (sql: string) =>
  sql
    .split("\n")
    .filter((l) => !l.trim().startsWith("--"))
    .join("\n");

const forward = sqlOnly(readFileSync(FWD, "utf8"));
const flat = forward.replace(/\s+/g, " ").toLowerCase();

/** Every column the live function body reads from public_vacancies. */
const COLUMNS_READ_BY_FUNCTION = [
  "id",
  "published_at",
  "expires_at",
  "profession_slug",
  "occupation_raw",
  "employment_form",
  "working_time",
  "positions",
  "compensation_currency",
  "compensation_min",
  "compensation_max",
  "source_language",
];

describe("public board covering index", () => {
  it("is ordered exactly like the function's ORDER BY and is partial on is_active", () => {
    expect(flat).toContain(
      "(published_at desc nulls last, id) include (",
    );
    expect(flat).toMatch(/\) where is_active;/);
  });

  it("carries every column the anonymous function reads", () => {
    for (const col of COLUMNS_READ_BY_FUNCTION) {
      expect(flat, `index is missing ${col}`).toMatch(
        new RegExp(`\\b${col}\\b`),
      );
    }
  });

  it("never carries a member-only column into the index", () => {
    for (const col of [
      "employer_name",
      "application_url",
      "description_raw",
      "title_raw",
      "city",
      "region",
    ]) {
      expect(flat, `index leaks ${col}`).not.toMatch(
        new RegExp(`\\b${col}\\b`),
      );
    }
  });

  it("is additive: no function, grant, policy, row or column change", () => {
    expect(forward).not.toMatch(
      /\b(grant|revoke|create\s+(or\s+replace\s+)?function|security\s+definer|alter\s+table|drop\s+|insert\s+into|update\s+public\.|delete\s+from|create\s+policy)\b/i,
    );
    expect(forward).toMatch(/create\s+index\s+if\s+not\s+exists/i);
  });

  it("ships a paired rollback that drops only this index", () => {
    expect(existsSync(DOWN)).toBe(true);
    const down = sqlOnly(readFileSync(DOWN, "utf8"));
    expect(down).toMatch(
      /drop\s+index\s+if\s+exists\s+public\.public_vacancies_active_board_cover_idx/i,
    );
    expect(down).not.toMatch(/drop\s+(table|function|column)/i);
  });
});
