import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * F5 project-scoped instruction migration guard
 * (slice f5-project-scoped-instructions-v1, migration 20260609140000).
 *
 * Pins: additive project_id + an OPTIONAL project gate on send_work_instruction
 * (strict ACTIVE-assignment + can_manage_project when a project is chosen; the
 * unchanged roster gate otherwise), owner-scoped SECURITY DEFINER, authenticated-
 * only EXECUTE, reversible, no RLS loosening, original body never overwritten.
 */

const repo = join(__dirname, "..", "..", "..", "..");
const sql = readFileSync(
  join(repo, "supabase", "migrations", "20260609140000_work_instruction_project_scope.sql"),
  "utf8",
);
const code = sql.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, " ");

describe("F5 migration is additive + reversible, no destructive data op", () => {
  it("adds project_id (no drop table/column, no delete, no truncate)", () => {
    expect(code).toMatch(/add column if not exists project_id uuid/i);
    expect(code).not.toMatch(/drop\s+table/i);
    expect(code).not.toMatch(/drop\s+column/i);
    expect(code).not.toMatch(/delete\s+from/i);
    expect(code).not.toMatch(/truncate/i);
  });
  it("replaces the sender by signature change with a documented rollback", () => {
    expect(code).toMatch(/drop function if exists public\.send_work_instruction\(text, text, text\)/i);
    expect(sql).toMatch(/ROLLBACK \(reversible\)/);
    expect(sql).toMatch(/drop column if exists project_id/i);
  });
});

describe("dual scope: strict project gate OR unchanged roster gate", () => {
  it("project scope requires ACTIVE assignment AND can_manage_project", () => {
    expect(code).toMatch(/pwa\.status = 'active'/i);
    expect(code).toMatch(/can_manage_project\(pid\)/i);
    expect(code).toMatch(/Not authorized to instruct this worker on this project/i);
  });
  it("roster scope (null project) keeps owns_company/owns_agency active gate", () => {
    expect(code).toMatch(/owns_company\(/i);
    expect(code).toMatch(/owns_agency\(/i);
    expect(code).toMatch(/Not authorized to instruct this worker'/i);
  });
  it("records project_id on the instruction; original body untouched", () => {
    expect(code).toMatch(/insert into public\.conversation_messages[\s\S]*project_id/i);
    expect(code).not.toMatch(/update public\.conversation_messages\s+set\s+body/i);
  });
});

describe("security: SECURITY DEFINER, authenticated-only, no RLS loosening", () => {
  it("the sender is SECURITY DEFINER with fixed search_path", () => {
    expect(code).toMatch(/security definer/i);
    expect(code).toMatch(/set search_path = public/i);
  });
  it("revoked from public + granted only to authenticated (4-arg signature)", () => {
    expect(code).toMatch(/revoke all\s+on function public\.send_work_instruction\(text, text, text, text\) from public/i);
    expect(code).toMatch(/grant execute\s+on function public\.send_work_instruction\(text, text, text, text\) to authenticated/i);
    expect(code).not.toMatch(/to\s+anon\b/i);
  });
  it("does not create/alter a policy nor open using(true)", () => {
    expect(code).not.toMatch(/create policy|alter policy/i);
    expect(code).not.toMatch(/using\s*\(\s*true\s*\)/i);
  });
});
