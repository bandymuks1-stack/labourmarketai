import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * AN HOUR RECORD CHANGES ONLY BY A ONE-STEP CORRECTION (audit 2026-10-20,
 * owner-approved programme 2026-10-21). A worker could rewrite a manager's
 * hour row in place, and a correction was three writes whose failed supersede
 * left both rows counting.
 */
const repo = resolve(__dirname, "..", "..", "..", "..");
const sql = readFileSync(resolve(repo, "supabase/migrations/20261021090000_work_hours_corrections_atomic_v1.sql"), "utf8");
const action = readFileSync(resolve(__dirname, "..", "work-hours", "allocations-actions.ts"), "utf8");

describe("hour records change only by an attributable correction", () => {
  it("the correction function checks who may correct, a live original and a same-organization active site", () => {
    expect(sql).toMatch(/public\.manages_organization\(o\.organization_id\)\s*or \(o\.entered_by = uid and o\.status = 'recorded' and public\.owns_worker\(o\.worker_id\)\)/);
    expect(sql).toMatch(/if o\.superseded_by is not null then\s*raise exception 'already_corrected'/);
    expect(sql).toMatch(/w\.organization_id = o\.organization_id and w\.status = 'active'/);
    expect(sql).toMatch(/update public\.work_hour_allocations set superseded_by = v_new where id = o\.id;/);
    expect(sql).toMatch(/revoke all on function public\.correct_work_hour_allocation_v1\(uuid, numeric, date, uuid, text\) from public, anon;/);
  });
  it("the guard refuses every in-place end-user edit (only updated_at may move)", () => {
    expect(sql).toMatch(/\(to_jsonb\(new\) - 'updated_at'\) is distinct from \(to_jsonb\(old\) - 'updated_at'\)/);
  });
  it("the app corrects through the function, and keeps the old path only while the function is absent", () => {
    const fn = action.slice(action.indexOf("export async function recordCorrectionAction"));
    expect(fn).toMatch(/\.rpc\("correct_work_hour_allocation_v1"/);
    expect(fn).toMatch(/\["42883", "PGRST202"\]\.includes\(error\.code \?\? ""\)\) \{\s*return recordCorrectionTwoStep/);
  });
});
