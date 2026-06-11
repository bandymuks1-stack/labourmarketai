import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * F5 project-scoped instruction migration guard
 * (slice f5-project-scoped-instructions-v1, migration 20260609140000).
 *
 * Purely ADDITIVE: adds project_id + a SEPARATE project-scoped sender
 * (send_work_instruction_to_project) with a STRICT active-assignment +
 * can_manage_project gate. The team-level send_work_instruction is left
 * untouched (no drop, no signature change). Owner-scoped SECURITY DEFINER,
 * authenticated-only, reversible, no RLS loosening, original body untouched.
 */

const repo = join(__dirname, "..", "..", "..", "..");
const sql = readFileSync(
  join(repo, "supabase", "migrations", "20260609140000_work_instruction_project_scope.sql"),
  "utf8",
);
const code = sql.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, " ");

describe("F5 migration is purely additive + reversible (NO drop)", () => {
  it("adds project_id; no drop/delete/truncate of any kind", () => {
    expect(code).toMatch(/add column if not exists project_id uuid/i);
    expect(code).not.toMatch(/drop\s+table/i);
    expect(code).not.toMatch(/drop\s+column/i);
    expect(code).not.toMatch(/drop\s+function/i);
    expect(code).not.toMatch(/delete\s+from/i);
    expect(code).not.toMatch(/truncate/i);
  });
  it("does NOT modify the team-level send_work_instruction (no signature change)", () => {
    expect(code).not.toMatch(/create or replace function public\.send_work_instruction\(/i);
    expect(code).toMatch(/create or replace function public\.send_work_instruction_to_project\(/i);
  });
  it("ships a documented rollback", () => {
    expect(sql).toMatch(/ROLLBACK \(reversible\)/);
    expect(sql).toMatch(/drop function if exists public\.send_work_instruction_to_project/i);
    expect(sql).toMatch(/drop column if exists project_id/i);
  });
});

describe("the project-scoped sender enforces a STRICT assignment gate", () => {
  it("requires an ACTIVE assignment AND can_manage_project (or admin)", () => {
    expect(code).toMatch(/pwa\.status = 'active'/i);
    expect(code).toMatch(/can_manage_project\(pid\)/i);
    expect(code).toMatch(/Not authorized to instruct this worker on this project/i);
  });
  it("a project is required (no silent team-level fallback in this RPC)", () => {
    expect(code).toMatch(/if pid is null then[\s\S]*Project is required/i);
  });
  it("records project_id on the instruction; original body untouched", () => {
    expect(code).toMatch(/insert into public\.conversation_messages[\s\S]*project_id/i);
    expect(code).not.toMatch(/update public\.conversation_messages\s+set\s+body/i);
  });
});

describe("security: SECURITY DEFINER, authenticated-only, no RLS loosening", () => {
  it("SECURITY DEFINER with fixed search_path", () => {
    expect(code).toMatch(/security definer/i);
    expect(code).toMatch(/set search_path = public/i);
  });
  it("revoked from public + granted only to authenticated", () => {
    expect(code).toMatch(/revoke all\s+on function public\.send_work_instruction_to_project\(text, text, text, text\) from public/i);
    expect(code).toMatch(/grant execute\s+on function public\.send_work_instruction_to_project\(text, text, text, text\) to authenticated/i);
    expect(code).not.toMatch(/to\s+anon\b/i);
  });
  it("does not create/alter a policy nor open using(true)", () => {
    expect(code).not.toMatch(/create policy|alter policy/i);
    expect(code).not.toMatch(/using\s*\(\s*true\s*\)/i);
  });
});
