import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * F4 worker→project assignment migration guard
 * (slice f4-worker-project-assignment-v1, migration 20260609120000).
 *
 * Pins the security contract: assignment writes go ONLY through owner-scoped,
 * relationship-gated SECURITY DEFINER RPCs (project + caller-roster), direct
 * table writes are revoked, no RLS policy is loosened, assignments END (never
 * delete), and nothing is granted to PUBLIC/anon.
 */

const repo = join(__dirname, "..", "..", "..", "..");
const sql = readFileSync(
  join(repo, "supabase", "migrations", "20260609120000_project_worker_assignment_gate.sql"),
  "utf8",
);
const code = sql.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, " ");

describe("F4 migration is additive + reversible, no destructive op", () => {
  it("no drop table/column, no delete, no truncate in executable SQL", () => {
    expect(code).not.toMatch(/drop\s+table/i);
    expect(code).not.toMatch(/drop\s+column/i);
    expect(code).not.toMatch(/delete\s+from/i);
    expect(code).not.toMatch(/truncate/i);
  });
  it("ships a documented rollback path", () => {
    expect(sql).toMatch(/ROLLBACK \(reversible\)/);
    expect(sql).toMatch(/drop function if exists public\.assign_worker_to_project/i);
    expect(sql).toMatch(/grant insert, update, delete on public\.project_worker_assignments to authenticated/i);
  });
});

describe("assignment is gated on BOTH project management AND caller roster", () => {
  it("assign_worker_to_project requires can_manage_project AND caller_manages_worker (or admin)", () => {
    expect(code).toMatch(
      /can_manage_project\(pid\)\s+and\s+public\.caller_manages_worker\(w_id\)/i,
    );
    expect(code).toMatch(/Not authorized to assign this worker to this project/i);
  });
  it("caller_manages_worker checks ACTIVE roster under owns_company/owns_agency", () => {
    expect(code).toMatch(/company_workers[\s\S]*status = 'active'[\s\S]*owns_company/i);
    expect(code).toMatch(/agency_workers[\s\S]*status = 'active'[\s\S]*owns_agency/i);
  });
  it("all three functions are SECURITY DEFINER with fixed search_path", () => {
    expect((code.match(/^\s*security definer\s*$/gim) ?? []).length).toBe(3);
    expect((code.match(/^\s*set search_path = public\s*$/gim) ?? []).length).toBe(3);
  });
});

describe("lifecycle ends (never deletes); writes routed only through the RPCs", () => {
  it("end_worker_project_assignment sets status='ended' + ended_at (no delete)", () => {
    expect(code).toMatch(/set status = 'ended', ended_at = now\(\)/i);
    expect(code).not.toMatch(/delete\s+from\s+public\.project_worker_assignments/i);
  });
  it("direct insert/update/delete on PWA is revoked from authenticated (RPC-only writes)", () => {
    expect(code).toMatch(
      /revoke insert, update, delete on public\.project_worker_assignments from authenticated/i,
    );
  });
});

describe("no RLS loosening, no PUBLIC/anon execute", () => {
  it("does not create/alter any project_worker_assignments policy", () => {
    expect(code).not.toMatch(/create policy[\s\S]*project_worker_assignments/i);
    expect(code).not.toMatch(/alter policy[\s\S]*project_worker_assignments/i);
    expect(code).not.toMatch(/using\s*\(\s*true\s*\)/i);
    expect(code).not.toMatch(/\bto\s+anon\b/i);
  });
  it("each RPC is revoked from public + granted only to authenticated", () => {
    for (const fn of [
      "assign_worker_to_project",
      "end_worker_project_assignment",
      "caller_manages_worker",
    ]) {
      expect(code).toMatch(new RegExp(`revoke all on function public\\.${fn}[\\s\\S]*?from public`, "i"));
      expect(code).toMatch(new RegExp(`grant execute on function public\\.${fn}[\\s\\S]*?to authenticated`, "i"));
    }
    expect(code).not.toMatch(/grant[\s\S]{0,120}?to\s+(anon|public)\b/i);
  });
});
