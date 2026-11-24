import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * J-13 security check (2026-11-02): the buyer setup form is the door by which
 * a person who is not a customer becomes one, so `save_customer_setup` must
 * grant the CALLER the `customer` role and nothing else — never another role,
 * never another person's row, never a switch of the active workspace.
 *
 * Pinned on the ONE definition (0026). A later migration that redefines the
 * function fails here and must be re-checked against the same rule.
 */
const ROOT = resolve(__dirname, "..", "..", "..", "..");
const DIR = resolve(ROOT, "supabase/migrations");
const sqlOnly = (s: string) => s.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");

function body(): string {
  const sql = sqlOnly(readFileSync(resolve(DIR, "0026_customer_entity.sql"), "utf8"));
  const start = sql.indexOf("create or replace function public.save_customer_setup(");
  expect(start, "0026 defines save_customer_setup").toBeGreaterThanOrEqual(0);
  return sql.slice(start, sql.indexOf("end $$;", start));
}

describe("save_customer_setup grants only the customer role, only to the caller", () => {
  it("is defined once, in 0026", () => {
    const definers = readdirSync(DIR)
      .filter((f) => f.endsWith(".sql"))
      .filter((f) => /function\s+(public\.)?save_customer_setup\s*\(/i.test(sqlOnly(readFileSync(resolve(DIR, f), "utf8"))));
    expect(definers).toEqual(["0026_customer_entity.sql"]);
  });

  it("writes exactly one role row: 'customer', for auth.uid()", () => {
    const fn = body();
    expect(fn).toMatch(/uid\s+uuid := auth\.uid\(\);/);
    expect(fn).toMatch(/raise exception 'Not authenticated'/);
    const roleInserts = fn.match(/insert into public\.profile_roles[\s\S]*?;/g) ?? [];
    expect(roleInserts).toHaveLength(1);
    expect(roleInserts[0]).toMatch(/values \(uid, 'customer', true, '\{\}'::jsonb\)/);
    // No parameter reaches the role, the profile id or the active workspace.
    expect(fn).not.toMatch(/p_role|active_role|update public\.profiles/);
    expect(fn).not.toMatch(/profile_id\s*=\s*p_/);
  });

  it("is executable by signed-in users only", () => {
    const sql = sqlOnly(readFileSync(resolve(DIR, "0026_customer_entity.sql"), "utf8"));
    expect(sql).toMatch(/revoke all on function public\.save_customer_setup\(text, text, text, text, text, text, text\) from public;/);
    expect(sql).toMatch(/grant execute on function public\.save_customer_setup\(text, text, text, text, text, text, text\) to authenticated;/);
    expect(sql).not.toMatch(/save_customer_setup\([^)]*\) to anon/);
  });
});
