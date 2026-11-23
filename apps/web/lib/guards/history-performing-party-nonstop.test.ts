import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Owner decision 2026-11-23 (RED, NOT applied): the historical work of 8 roster
 * people of 19f47e78 is attributed to 20b2c802 through the canonical party row
 * (`attributeRecordsToPerformingOrganization`'s shape), never by moving or
 * copying a record. These checks keep the file to exactly that.
 */
const REPO = resolve(__dirname, "../../../..");
const NAME = "20261123120000_history_performing_party_nonstop_v1";
const up = readFileSync(resolve(REPO, `supabase/migrations/${NAME}.sql`), "utf8");
const down = readFileSync(resolve(REPO, `supabase/rollbacks/${NAME}.down.sql`), "utf8");

const SOURCE = "19f47e78-7bd1-4120-9937-603dba769f8a";
const TARGET = "20b2c802-c624-43c0-b368-8fa6c1fbeae3";
const PEOPLE = [
  "cf580388-5943-4254-b4b4-e7b6b9e857be",
  "8676823d-8e4f-46d0-b3a7-18a96650c652",
  "dac739fa-7c81-4f02-9e1c-1740341b2ab3",
  "79d10fb3-5477-44e3-8269-1fe1304fa38a",
  "c1edbb07-a1f3-494f-be0b-4ddd53e28ded",
  "6b62a7a2-9dee-4790-a13d-2ae5cb9f008d",
  "4d4a3837-c512-485c-bd50-fe4b747e19ea",
  "b154ab88-2a4f-480f-ba22-55420e1e1114",
];
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g;
/** SQL with comments removed, so prose never satisfies or trips a check. */
const code = (sql: string) => sql.replace(/--[^\n]*/g, "");

describe(`${NAME}: attribution, never a move`, () => {
  it("is RED-annotated and ships its rollback", () => {
    expect(up.startsWith("-- @human-gate-approved")).toBe(true);
    expect(up).toMatch(/^-- ROLLBACK \(down\):/m);
  });

  it("writes only party rows: no update, delete or write on a record, roster row or object", () => {
    const sql = code(up).toLowerCase();
    expect(sql).not.toMatch(/\b(update|delete|truncate|alter|drop)\b/);
    const inserts = [...sql.matchAll(/insert\s+into\s+([a-z_.]+)/g)].map((m) => m[1]);
    expect(inserts).toEqual(["public.organization_evidence_parties"]);
  });

  it("names the target as employer with no label, so the platform name is shown", () => {
    expect(code(up)).toMatch(new RegExp(`'employer',\\s*'${TARGET}',\\s*null`));
  });

  it("the migration and its rollback act on the same 8 people of the same organization, and nothing else", () => {
    const ids = (sql: string) =>
      [...new Set(code(sql).match(UUID) ?? [])].filter((u) => u !== SOURCE && u !== TARGET).sort();
    expect(ids(up)).toEqual([...PEOPLE].sort());
    expect(ids(down)).toEqual([...PEOPLE].sort());
    expect(code(down)).toContain(SOURCE);
    expect(code(down)).toContain(TARGET);
    expect(code(down)).toMatch(/party_label is null/);
  });

  it("aborts unless the measured scope still holds at apply time", () => {
    expect(code(up)).toMatch(/v_scope <> 576/);
    expect(code(up)).toMatch(/v_written <> 576/);
    expect(code(up)).toMatch(/v_people <> 8/);
  });

  it("names no person: uuids only", () => {
    // The repository never carries the people's names (owner rule for this package).
    expect(up).not.toMatch(/display_name\s*=|normalized_name\s*=/);
  });
});
