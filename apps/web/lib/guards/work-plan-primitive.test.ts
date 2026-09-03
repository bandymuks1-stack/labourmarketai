import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  PLANNING_SOURCE_TYPES,
  hrefForSource,
  statusKeyForSource,
} from "@/lib/planning/planning-model";

/**
 * Guard: the work-plan primitive (FINAL COMPLETION Train F1, 2026-09-02).
 *
 * CALENDAR = PLAN, JOURNAL = FACT. The plan primitive is a SOURCE object of
 * the calendar projection — one more real record the calendar renders and
 * links back to — never a calendar copy and never a journal fact. Pins:
 *   1. the migration is additive, RLS-guarded, write-through-RPC only,
 *      cancel = status (no delete), and ships its rollback;
 *   2. the read layer degrades honestly (unapplied → "unavailable");
 *   3. the calendar knows the source type end to end (union, href, status
 *      key, copy in the five routed locales);
 *   4. the form has a pending signal + status surface (form-submit contract)
 *      and the writes go through the two RPCs only.
 */
const root = resolve(__dirname, "..", "..");
const repo = resolve(root, "..", "..");
const read = (rel: string) => readFileSync(resolve(root, rel), "utf8");
const readRepo = (rel: string) => readFileSync(resolve(repo, rel), "utf8");

describe("Guard: work_plan_entries migration", () => {
  // Executable SQL only — the ROLLBACK block is a comment that names the
  // reversal (drop table …) and must not read as a destructive statement.
  const sql = readRepo("supabase/migrations/20260902200000_work_plan_entries_v1.sql")
    .split(/\r?\n/)
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n");

  it("is additive, RLS-guarded and write-through-RPC only", () => {
    expect(sql).toMatch(/create table if not exists public\.work_plan_entries/);
    expect(sql).toMatch(/enable row level security/);
    expect(sql).toMatch(/manages_organization\(organization_id\)/);
    expect(sql).toMatch(/revoke insert, update, delete on public\.work_plan_entries from authenticated/);
    expect(sql).toMatch(/create or replace function public\.create_work_plan_entry_v1/);
    expect(sql).toMatch(/create or replace function public\.cancel_work_plan_entry_v1/);
    expect(sql).not.toMatch(/drop table|drop column|truncate/i);
  });

  it("cancel is a status change, never a delete; windows are ordered and bounded", () => {
    expect(sql).toMatch(/status in \('planned', 'cancelled'\)/);
    expect(sql).toMatch(/set status = 'cancelled'/);
    expect(sql).not.toMatch(/delete from public\.work_plan_entries/);
    expect(sql).toMatch(/end_date >= start_date/);
    expect(sql).toMatch(/end_date - start_date <= 366/);
  });

  it("ships a rollback that refuses while planned windows exist", () => {
    const down = readRepo("supabase/rollbacks/20260902200000_work_plan_entries_v1.down.sql");
    expect(down).toMatch(/rollback refused/);
    expect(down).toMatch(/drop table if exists public\.work_plan_entries/);
  });
});

describe("Guard: the calendar knows the plan source end to end", () => {
  it("plan is a source type with an href and a status key", () => {
    expect(PLANNING_SOURCE_TYPES).toContain("plan");
    expect(hrefForSource("plan", "abc")).toContain("/dashboard/company/planning");
    expect(statusKeyForSource("plan", "planned")).toBe("planning.planStatus.planned");
  });

  it("getPlanning reads the plan source and reports its state", () => {
    const planning = read("lib/planning/planning.ts");
    expect(planning).toMatch(/readWorkPlanItems\(/);
    expect(planning).toMatch(/plan: plan\.state/);
    expect(planning).toMatch(/\.\.\.plan\.items/);
  });

  it("the read layer degrades honestly while the table is unapplied", () => {
    const readLayer = read("lib/planning/work-plan.ts");
    expect(readLayer).toMatch(/applied: false/);
    expect(readLayer).toMatch(/MISSING_RELATION/);
    expect(readLayer).not.toMatch(/\.(insert|update|delete|upsert)\(/);
  });

  it("copy exists in the five routed locales", () => {
    for (const locale of ["lt", "en", "ru", "nl", "de"]) {
      const cat = JSON.parse(read(`messages/${locale}.json`));
      expect(cat.planning?.source?.plan, `${locale} planning.source.plan`).toBeTruthy();
      expect(cat.planning?.fallback?.plan, `${locale} planning.fallback.plan`).toBeTruthy();
      expect(cat.planning?.planStatus?.planned, `${locale} planStatus`).toBeTruthy();
      for (const k of ["title", "intro", "worker", "startDate", "submit", "pending", "cancel", "empty", "noWorkers", "unavailable"]) {
        expect(cat.workPlan?.[k], `${locale} workPlan.${k}`).toBeTruthy();
      }
      for (const k of ["planned", "cancelled", "invalid", "not_allowed", "worker_not_in_scope", "unavailable", "error"]) {
        expect(cat.workPlan?.outcome?.[k], `${locale} workPlan.outcome.${k}`).toBeTruthy();
      }
    }
  });
});

describe("Guard: the writes", () => {
  const actions = read("lib/planning/work-plan-actions.ts");
  const form = read("components/app/work-plan-form.tsx");

  it("go through the two RPCs only, after pure validation", () => {
    expect(actions).toMatch(/^"use server";/m);
    expect(actions).toMatch(/validateWorkPlanInput\(/);
    expect(actions).toMatch(/rpc\("create_work_plan_entry_v1"/);
    expect(actions).toMatch(/rpc\("cancel_work_plan_entry_v1"/);
    expect(actions).not.toMatch(/\.from\("work_plan_entries"\)/);
  });

  it("outcomes are a bounded vocabulary, never raw error text", () => {
    const model = read("lib/planning/work-plan-model.ts");
    expect(model).toMatch(/export const WORK_PLAN_OUTCOMES/);
    expect(actions).toMatch(/type WorkPlanOutcome/);
    // A "use server" module may export only async functions; the pure
    // validator lives in the model and the section imports it from there.
    expect(actions).not.toMatch(/^export function /m);
    const logs = actions.match(/console\.error\([\s\S]*?\);/g) ?? [];
    for (const l of logs) expect(l).not.toMatch(/message|stack/);
  });

  it("the form carries a pending signal and a status surface", () => {
    expect(form).toMatch(/useFormStatus/);
    expect(form).toMatch(/disabled=\{pending\}/);
    expect(form).toMatch(/role="status"/);
  });
});
