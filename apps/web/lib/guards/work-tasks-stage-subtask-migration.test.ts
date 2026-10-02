import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * GUARD — PROJECT → STAGE → TASK → SUBTASK on the EXISTING work model
 * (20261002150000_work_tasks_stage_and_subtask_v1).
 *
 * Static, secret-free, no database. Pins the properties that make this a
 * structural extension and NOT a new engine: additive nullable columns, the
 * same RPC names and authority, no stored WBS / progress, grants identical to
 * the latest applied definitions (no anon), and a rollback that refuses to
 * destroy planning structure.
 */

const REPO = join(__dirname, "..", "..", "..", "..");
const NAME = "20261002150000_work_tasks_stage_and_subtask_v1";
const UP = readFileSync(join(REPO, "supabase", "migrations", `${NAME}.sql`), "utf8");
const DOWN = readFileSync(
  join(REPO, "supabase", "rollbacks", `${NAME}.down.sql`),
  "utf8",
);
const V2 = readFileSync(
  join(
    REPO,
    "supabase",
    "migrations",
    "20260817151000_work_tasks_v2_collaboration.sql",
  ),
  "utf8",
);

const code = (s: string) =>
  s
    .split(/\r?\n/)
    .filter((l) => !/^\s*--/.test(l))
    .join("\n");
const UP_CODE = code(UP);
const DOWN_CODE = code(DOWN);

describe("migration shape — additive, gated, reversible", () => {
  it("is RED-routed: human-gate marker present", () => {
    expect(UP).toMatch(/^[ \t]*--[ \t]*@human-gate-approved\b/m);
    expect(UP).toMatch(/needs-human-gate/);
  });

  it("uses the §16 14-digit timestamp name and has a rollback sibling", () => {
    expect(NAME).toMatch(/^\d{14}_[a-z0-9_]+$/);
    expect(existsSync(join(REPO, "supabase", "rollbacks", `${NAME}.down.sql`))).toBe(true);
  });

  it("adds exactly two NULLABLE columns with the right FK actions", () => {
    expect(UP_CODE).toMatch(
      /add column if not exists stage_id uuid\s+references public\.project_stages\(id\) on delete set null/i,
    );
    expect(UP_CODE).toMatch(
      /add column if not exists parent_task_id uuid\s+references public\.work_tasks\(id\) on delete no action/i,
    );
    expect(UP_CODE).not.toMatch(/stage_id uuid[^,;]*not null/i);
    expect(UP_CODE).not.toMatch(/parent_task_id uuid[^,;]*not null/i);
  });

  it("creates no new table, no policy, and never alters/drops an existing one", () => {
    expect(UP_CODE).not.toMatch(/create\s+table/i);
    expect(UP_CODE).not.toMatch(/(create|alter|drop)\s+policy/i);
    expect(UP_CODE).not.toMatch(/\bdelete\s+from\b|\btruncate\b/i);
    expect(UP_CODE).not.toMatch(/disable\s+(trigger|row\s+level)/i);
  });

  it("stores no WBS number and no progress/percent anywhere", () => {
    // ('in_progress' is the existing task status, not a stored progress value.)
    expect(UP_CODE).not.toMatch(/\bwbs\b|wbs_|(?<!in_)progress|percent/i);
    expect(UP_CODE).not.toMatch(/add column[^;]*(wbs|progress|percent|position|seq)/i);
  });
});

describe("integrity — same project, no cycle, depth cap, stage inheritance", () => {
  it("trigger and helper enforce the same rules", () => {
    for (const rule of [
      "work_task_stage_project_mismatch",
      "work_task_parent_project_mismatch",
      "work_task_self_parent",
      "work_task_parent_cycle",
      "work_task_depth_exceeded",
      "work_task_child_stage_mismatch",
    ]) {
      expect(UP_CODE).toContain(rule);
    }
    for (const word of ["invalid_stage", "invalid_parent", "'cycle'", "depth_exceeded"]) {
      expect(UP_CODE).toContain(word);
    }
    // depth cap 3 including the moved subtree's height
    expect(UP_CODE).toMatch(/\+ 1 \+ v_down_height > 3/);
    // recursion is bounded
    expect(UP_CODE).toMatch(/up\.d < 10/);
    expect(UP_CODE).toMatch(/down\.d < 10/);
  });

  it("a subtask inherits its parent's stage and re-staging cascades", () => {
    expect(UP_CODE).toMatch(/select wt\.stage_id into v_stage[\s\S]*?where wt\.id = v_parent/);
    expect(UP_CODE).toMatch(/for v_level in 1\.\.2 loop/);
  });

  it("re-structuring an existing task is a MANAGING act", () => {
    expect(UP_CODE).toMatch(
      /public\.is_admin\(\)\s*or \(t\.project_id is not null and public\.can_manage_project\(t\.project_id\)\)\s*or \(t\.project_id is null and t\.created_by = uid\)/,
    );
  });
});

describe("RPCs — same names, optional params, authority kept, grants unchanged", () => {
  it("create/update gain OPTIONAL params (default null) — old signatures dropped, not overloaded", () => {
    expect(UP_CODE).toMatch(/p_stage_id\s+text default null/);
    expect(UP_CODE).toMatch(/p_parent_task_id\s+text default null/);
    expect(UP_CODE).toMatch(
      /drop function if exists public\.create_work_task_v2\(text, text, text, text, text, text, text\)/,
    );
    expect(UP_CODE).toMatch(
      /drop function if exists public\.update_work_task_v2\(text, text, text, text, text, text\)/,
    );
  });

  it("keeps SECURITY DEFINER + pinned search_path + the v2 authority checks verbatim", () => {
    const create = UP_CODE.slice(UP_CODE.indexOf("function public.create_work_task_v2("));
    expect(create).toMatch(/security definer\s+set search_path = public/);
    for (const kept of [
      "public.can_manage_project(v_project)",
      "public.work_task_assignee_eligible_v1(v_assignee, v_proj_org)",
      "public.is_org_member_or_engaged_v1(v_obj_org)",
      ">= 200 then",
    ]) {
      expect(create).toContain(kept);
    }
    const update = UP_CODE.slice(UP_CODE.indexOf("function public.update_work_task_v2("));
    for (const kept of [
      "t.created_by = uid",
      "t.assignee_profile_id = uid",
      "public.is_admin()",
      "public.can_manage_project(t.project_id)",
    ]) {
      expect(update).toContain(kept);
    }
  });

  it("grants are IDENTICAL to the latest applied definitions: revoke public+anon, grant authenticated only", () => {
    // latest applied: v2 migration
    expect(V2).toMatch(/revoke all on function public\.create_work_task_v2\(text, text, text, text, text, text, text\) from anon/);
    for (const sig of [
      "create_work_task_v2(text, text, text, text, text, text, text, text, text)",
      "update_work_task_v2(text, text, text, text, text, text, text, text)",
      "set_project_stage_responsible_v1(uuid, uuid)",
    ]) {
      expect(UP_CODE).toContain(`revoke all on function public.${sig} from public;`);
      expect(UP_CODE).toContain(`revoke all on function public.${sig} from anon;`);
      expect(UP_CODE).toContain(`grant execute on function public.${sig} to authenticated;`);
    }
    // internal functions: no grant to anyone
    for (const internal of [
      "work_tasks_structure_guard_v1()",
      "work_task_structure_check_v1(uuid, uuid, uuid, uuid, uuid)",
    ]) {
      for (const role of ["public", "anon", "authenticated"]) {
        expect(UP_CODE).toContain(`revoke all on function public.${internal} from ${role};`);
      }
      expect(UP_CODE).not.toContain(`grant execute on function public.${internal}`);
    }
    expect(UP_CODE).not.toMatch(/\bto\s+(anon|public)\b/i);
  });

  it("every SECURITY DEFINER function pins search_path", () => {
    const defs = UP_CODE.match(/security definer\s+set search_path = public/g) ?? [];
    const count = (UP_CODE.match(/security definer/g) ?? []).length;
    expect(defs.length).toBe(count);
    // trigger fn, structure helper, create_v2, update_v2, link_journal (replaced),
    // stage responsible setter
    expect(count).toBe(6);
  });
});

describe("journal link attribution consistency (link_journal_entry_to_task_v1)", () => {
  const LINK_V1 = readFileSync(
    join(REPO, "supabase", "migrations", "20260819190000_journal_task_evidence_link_v1.sql"),
    "utf8",
  );
  const fnBody = (src: string) => {
    const a = src.indexOf("function public.link_journal_entry_to_task_v1(");
    return src.slice(a, src.indexOf("grant execute on function public.link_journal_entry_to_task_v1", a));
  };

  it("keeps every v1 check, limit, idempotency and audit row", () => {
    const next = fnBody(UP_CODE);
    for (const kept of [
      "public.can_read_journal_entry_v1(v_entry)",
      "'entry_not_current'",
      "public.can_manage_project(t.project_id)",
      ">= 200 then",
      ">= 20 then",
      "on conflict do nothing",
      "'already_linked'",
      "'journal_entry_task_linked'",
    ]) {
      expect(next).toContain(kept);
      expect(fnBody(LINK_V1)).toContain(kept);
    }
  });

  it("adds project and organization refusals, and the active-assignment rule", () => {
    const next = fnBody(UP_CODE);
    expect(next).toMatch(/t\.project_id is distinct from e\.project_id/);
    expect(next).toContain("'project_mismatch'");
    expect(next).toContain("'organization_mismatch'");
    expect(next).toMatch(/pwa\.worker_id = e\.worker_id[\s\S]*pwa\.status = 'active'/);
  });

  it("grants unchanged: revoke public+anon, grant authenticated", () => {
    expect(UP_CODE).toContain("revoke all on function public.link_journal_entry_to_task_v1(text, text) from anon;");
    expect(UP_CODE).toContain("grant execute on function public.link_journal_entry_to_task_v1(text, text) to authenticated;");
  });

  it("task side: stage/project change is blocked while live evidence exists; no journal_entries column added", () => {
    expect(UP_CODE).toContain("work_task_has_live_evidence");
    expect(UP_CODE).toContain("return 'evidence_linked'");
    expect(UP_CODE).not.toMatch(/alter table public\.journal_entries/i);
    expect(UP_CODE).not.toMatch(/project_objects/i);
  });

  it("rollback restores the original link function verbatim", () => {
    const orig = fnBody(LINK_V1).replace(/\r\n/g, "\n");
    expect(orig.length).toBeGreaterThan(1000);
    expect(fnBody(DOWN).replace(/\r\n/g, "\n")).toBe(orig);
  });
});

describe("stage responsible setter", () => {
  it("is gated by can_manage_project and validates the org + active engagement", () => {
    const fn = UP_CODE.slice(UP_CODE.indexOf("function public.set_project_stage_responsible_v1("));
    expect(fn).toContain("public.can_manage_project(v_project)");
    expect(fn).toContain("ec.organization_id = pr.organization_id");
    expect(fn).toContain("ec.status = 'active'");
    expect(fn).toMatch(/set responsible_engagement_id = p_engagement_id/);
  });
});

describe("rollback — refuses to destroy structure, restores v2 verbatim", () => {
  it("refuses while any task carries a stage or parent", () => {
    expect(DOWN_CODE).toMatch(/stage_id is not null or parent_task_id is not null/);
    expect(DOWN_CODE).toMatch(/raise exception[\s\S]*rollback refused/);
    expect(DOWN_CODE.indexOf("rollback refused")).toBeLessThan(
      DOWN_CODE.indexOf("drop column"),
    );
  });

  it("drops only what the up created and recreates the two original signatures", () => {
    for (const d of [
      "drop function if exists public.set_project_stage_responsible_v1(uuid, uuid)",
      "drop function if exists public.update_work_task_v2(text, text, text, text, text, text, text, text)",
      "drop function if exists public.create_work_task_v2(text, text, text, text, text, text, text, text, text)",
      "drop trigger if exists trg_work_tasks_structure_guard on public.work_tasks",
      "drop column if exists parent_task_id",
      "drop column if exists stage_id",
    ]) {
      expect(DOWN_CODE).toContain(d);
    }
    // never touches the pre-existing responsible column or any table
    expect(DOWN_CODE).not.toMatch(/drop column[^;]*responsible_engagement_id/i);
    expect(DOWN_CODE).not.toMatch(/drop table/i);
  });

  it("the restored functions are byte-identical to the 20260817151000 originals", () => {
    const extract = (src: string, fn: string) => {
      const start = src.indexOf(`create or replace function public.${fn}(`);
      const end = src.indexOf("to authenticated;", start) + "to authenticated;".length;
      return src.slice(start, end).replace(/\r\n/g, "\n");
    };
    for (const fn of ["create_work_task_v2", "update_work_task_v2"]) {
      const original = extract(V2, fn);
      expect(original.length).toBeGreaterThan(500);
      expect(extract(DOWN, fn)).toBe(original);
    }
  });
});
