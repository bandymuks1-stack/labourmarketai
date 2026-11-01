import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Guard: CAL-8 shifts / rotas (2026-10-23).
 *
 * A shift pattern is ONE nullable property of the existing work plan window
 * (`work_plan_entries.recurrence`), never a second plan store and never one
 * row per shift. Shift days are PROJECTED from the rule (TIME is a
 * projection, not a store) and an overlap with leave or other work is a
 * WARNING through the one reservation rule, never a refusal (SEP-2).
 */
const root = resolve(__dirname, "..", "..");
const repo = resolve(root, "..", "..");
const read = (rel: string) => readFileSync(resolve(root, rel), "utf8");
const readRepo = (rel: string) => readFileSync(resolve(repo, rel), "utf8");
const MIGRATION = "supabase/migrations/20261023160000_work_plan_shift_patterns_v1.sql";
const ROLLBACK = "supabase/rollbacks/20261023160000_work_plan_shift_patterns_v1.down.sql";
const code = (sql: string) =>
  sql
    .split(/\r?\n/)
    .filter((l) => !l.trimStart().startsWith("--"))
    .join("\n");

function fnBody(sql: string, name: string): string {
  const s = sql.replace(/\r\n/g, "\n");
  const i = s.indexOf(`create or replace function public.${name}(`);
  if (i < 0) return "";
  const a = s.indexOf("$$", i) + 2;
  return s.slice(a, s.indexOf("$$", a));
}

describe("the migration extends the applied plan table; it adds no store", () => {
  const sql = code(readRepo(MIGRATION));

  it("one nullable column with a shape CHECK, no new table, no per-shift rows", () => {
    expect(sql).toMatch(/alter table public\.work_plan_entries\s+add column if not exists recurrence jsonb;/);
    expect(sql).toMatch(/check \(public\.work_plan_recurrence_valid_v1\(recurrence\)\)/);
    expect(sql).not.toMatch(/create table/i);
    expect(sql).not.toMatch(/not null default|recurrence jsonb not null/i);
    expect(sql).not.toMatch(/drop table|drop column|truncate|delete from|update public\./i);
  });

  it("v1 is untouched; v2 carries v1's authority verbatim plus shape-only checks", () => {
    expect(sql).not.toMatch(/create or replace function public\.create_work_plan_entry_v1\(/);
    const v2 = fnBody(readRepo(MIGRATION), "create_work_plan_entry_v2");
    expect(v2).toMatch(/manages_organization\(p_organization_id\)/);
    expect(v2).toMatch(/work_plan_worker_in_scope_v1\(p_organization_id, p_worker_id\)/);
    expect(v2).toMatch(/invalid_recurrence/);
    expect(v2).toMatch(/recurrence_without_shift/);
    // SEP-2: the command never looks at another commitment, so it cannot
    // refuse a plan because it overlaps one.
    expect(v2).not.toMatch(/worker_absences|booking_requests|business_trips|project_worker_assignments/);
    expect(sql).toMatch(/grant execute on function public\.create_work_plan_entry_v2\([^)]*\) to authenticated;/);
    expect(sql).not.toMatch(/grant[^;]*\bto\b[^;]*\b(anon|public)\b/i);
  });

  it("the override validator changes ONLY its plan branch; the rest is verbatim", () => {
    const before = fnBody(
      readRepo("supabase/migrations/20261003150950_commitment_override_collision_validation_v1.sql"),
      "commitment_override_validate_collisions_v1",
    );
    const after = fnBody(readRepo(MIGRATION), "commitment_override_validate_collisions_v1");
    const head = (b: string) => b.slice(0, b.indexOf("elsif v_kind = 'plan' then"));
    const tail = (b: string) => b.slice(b.indexOf("    if not coalesce(v_ok, false) then"));
    expect(head(after)).toBe(head(before));
    expect(tail(after)).toBe(tail(before));
    // The one-off arm keeps the previous predicate, character for character.
    expect(after).toMatch(/e\.recurrence is null\s+and greatest\(\$3, e\.start_date\) = \$5/);
    expect(after).toMatch(/work_plan_is_shift_day_v1\(e\.start_date, g::date, e\.recurrence\)/);
  });

  it("ships a rollback that refuses while a pattern exists and restores the validator", () => {
    const down = readRepo(ROLLBACK);
    expect(down).toMatch(/rollback refused/);
    expect(down).toMatch(/drop column if exists recurrence/);
    const restored = fnBody(down, "commitment_override_validate_collisions_v1");
    const original = fnBody(
      readRepo("supabase/migrations/20261003150950_commitment_override_collision_validation_v1.sql"),
      "commitment_override_validate_collisions_v1",
    );
    expect(restored).toBe(original);
    // The restore runs before the helper it no longer calls is dropped.
    expect(down.indexOf("commitment_override_validate_collisions_v1(")).toBeLessThan(
      down.indexOf("drop function if exists public.work_plan_is_shift_day_v1"),
    );
  });

  it("is the only migration that knows about shift patterns", () => {
    const dir = resolve(repo, "supabase/migrations");
    const hits = readdirSync(dir).filter((f) =>
      /work_plan_recurrence_valid_v1|create_work_plan_entry_v2/.test(readFileSync(resolve(dir, f), "utf8")),
    );
    expect(hits).toEqual(["20261023160000_work_plan_shift_patterns_v1.sql"]);
  });
});

describe("the app projects shift days from the rule and warns, never refuses", () => {
  it("the model is pure (no IO, no store)", () => {
    const model = read("lib/planning/shift-pattern.ts");
    expect(model).not.toMatch(/from "@\/lib\/supabase|server-only|fetch\(|\.from\(/);
  });

  it("the calendar, the capacity read and the plan list all expand the pattern", () => {
    expect(read("lib/planning/work-plan.ts")).toMatch(/projectWorkPlanItems\(/);
    expect(read("lib/planning/employer-committed-work.ts")).toMatch(/expandShiftRuns\(pattern, startDate, endDate\)/);
    expect(read("components/app/work-plan-section.tsx")).toMatch(/expandShiftRuns\(e\.recurrence \?\? null/);
  });

  it("reads degrade honestly before the column exists (42703 → retry without it)", () => {
    const readLayer = read("lib/planning/work-plan.ts");
    expect(readLayer).toMatch(/MISSING_COLUMN = "42703"/);
    expect(readLayer).toMatch(/shiftPatterns = false/);
    expect(read("lib/planning/employer-committed-work.ts")).toMatch(/planRes\.error\?\.code === "42703"/);
    // The repeat controls render only when the store can keep a pattern.
    expect(read("components/app/work-plan-section.tsx")).toMatch(/entries\.shiftPatterns\s*\?/);
    expect(read("components/app/work-plan-form.tsx")).toMatch(/repeatLabels && <ShiftRepeatFields/);
  });

  it("the create writes first and narrows the existing verdict to shift days", () => {
    const actions = read("lib/planning/work-plan-actions.ts");
    const rpcAt = actions.indexOf('"create_work_plan_entry_v2"');
    const verdictAt = actions.indexOf("checkWorkerReservation(");
    expect(rpcAt).toBeGreaterThan(0);
    expect(verdictAt).toBeGreaterThan(rpcAt);
    expect(actions).toMatch(/narrowVerdictToShiftRuns\(/);
    expect(actions).toMatch(/"recurrence_unavailable"/);
  });

  it("copy exists in the six active locales", () => {
    for (const locale of ["lt", "en", "ru", "de", "pl", "nl"]) {
      const cat = JSON.parse(read(`messages/${locale}.json`));
      for (const k of ["legend", "none", "weekly", "cycle", "weekdays", "cycleOn", "cycleOff", "cycleOffset", "hint", "summaryWeekly", "summaryCycle"]) {
        expect(cat.workPlan?.repeat?.[k], `${locale} workPlan.repeat.${k}`).toBeTruthy();
      }
      for (const k of ["recurrence_invalid", "recurrence_empty", "recurrence_unavailable"]) {
        expect(cat.workPlan?.outcome?.[k], `${locale} workPlan.outcome.${k}`).toBeTruthy();
      }
      expect(cat.workPlan.repeat.summaryWeekly).toContain("{days}");
      expect(cat.workPlan.repeat.summaryCycle).toMatch(/\{on\}[\s\S]*\{off\}/);
    }
  });
});
