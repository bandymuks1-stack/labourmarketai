import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * WRK-6 — a team on a project / work object / task is ONE canonical
 * relationship (`team_assignments`), not N unrelated person assignments.
 *
 * Rules under guard (static; the runtime proof is
 * scripts/db-proof/team-assignment-canonical.sh on a real PostgreSQL):
 *   1. one table, one active row per (team, project, scope), append-friendly
 *      lifecycle (ended, never deleted), writes RPC-only, RLS select;
 *   2. every RPC authorizes with coalesce(...,false) and is closed to anon;
 *   3. the app writes through the ONE RPC and never fans a team out into
 *      per-person assign_worker_to_project calls;
 *   4. members resolve THROUGH the relation at a point in time, so a person
 *      who left the team is not credited — the journal/hours stay per person;
 *   5. the commitments reader (calendar / capacity / reservation) counts the
 *      members of an assigned team from the same single source;
 *   6. i18n carries every key in every active locale.
 */

const APP = join(__dirname, "..", "..");
const REPO = join(APP, "..", "..");
const read = (p: string) => readFileSync(join(APP, p), "utf8");
const readRepo = (p: string) => readFileSync(join(REPO, p), "utf8");
const strip = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/[^\n]*/gm, " ").replace(/^\s*--[^\n]*/gm, " ");

const MIGRATION = "supabase/migrations/20261003150600_brigade_work_assignment_v1.sql";
const ROLLBACK = "supabase/rollbacks/20261003150600_brigade_work_assignment_v1.down.sql";

describe("migration — one relation, closed by default", () => {
  const sql = strip(readRepo(MIGRATION));

  it("adds exactly one table and reuses the team + person structures", () => {
    expect(sql.match(/create table/gi)?.length).toBe(1);
    expect(sql).toMatch(/references public\.organizations\(id\)/);
    expect(sql).toMatch(/references public\.projects\(id\)/);
    expect(sql).toMatch(/references public\.work_objects\(id\)/);
    expect(sql).toMatch(/references public\.work_tasks\(id\)/);
    // It touches no person-assignment, task or journal structure.
    expect(sql).not.toMatch(/insert into public\.project_worker_assignments/i);
    expect(sql).not.toMatch(/(alter|create or replace)[^;]*(assign_worker_to_project|link_journal_entry_to_task_v1|work_tasks)\b/i);
    expect(sql).not.toMatch(/insert into public\.journal_entries/i);
  });

  it("scope is at most one of object/task, lifecycle is ended_at-driven, one ACTIVE row per scope", () => {
    expect(sql).toMatch(/num_nonnulls\(work_object_id, task_id\) <= 1/);
    expect(sql).toMatch(/\(status = 'active'\) = \(ended_at is null\)/);
    expect(sql).toMatch(/create unique index[^;]*team_assignments_one_active_v1[^;]*where ended_at is null/i);
  });

  it("writes are RPC-only: no write grant, RLS on, select policy is manager/admin/member with coalesce", () => {
    expect(sql).toMatch(/enable row level security/);
    expect(sql).toMatch(/revoke all on public\.team_assignments from public, anon, authenticated/);
    expect(sql).toMatch(/grant select on public\.team_assignments to authenticated/);
    expect(sql).not.toMatch(/grant (insert|update|delete)/i);
    const policy = sql.match(/create policy team_assignments_select_v1[\s\S]*?;\s/)?.[0] ?? "";
    expect(policy).toMatch(/coalesce\(/);
    expect(policy).toMatch(/can_manage_project/);
    expect(policy).toMatch(/manages_organization/);
    expect(policy).toMatch(/is_admin\(\)/);
    expect(policy).not.toMatch(/using \(true\)|to anon|to public/i);
  });

  it("every RPC is NULL-safe, closed to anon, and rows are ended not deleted", () => {
    for (const fn of ["assign_team_to_work_v1", "end_team_assignment_v1", "list_team_assignment_members_v1", "team_assignments_for_work_v1"]) {
      expect(sql, fn).toMatch(new RegExp(`revoke all on function public\\.${fn}\\([^)]*\\) from public, anon`));
      expect(sql, fn).toMatch(new RegExp(`grant execute on function public\\.${fn}\\([^)]*\\) to authenticated`));
    }
    expect(sql).toMatch(/revoke all on function public\.team_member_at_v1\(uuid, uuid, timestamptz\) from public, anon, authenticated/);
    expect(sql).not.toMatch(/grant execute on function public\.team_member_at_v1/);
    expect(sql).toMatch(/if not coalesce\(\(/);
    expect(sql).not.toMatch(/delete from public\.team_assignments/i);
    expect(sql).not.toMatch(/to anon\b/i);
  });

  it("assign needs authority over BOTH the project and the team (or admin)", () => {
    expect(sql).toMatch(
      /can_manage_project\(p_project_id\)\s+and \(public\.manages_organization\(p_team_org_id\) or public\.is_admin\(\)\)/,
    );
  });

  it("membership is resolved AS OF an instant: left-before is not credited, ended-without-date covers nothing", () => {
    expect(sql).toMatch(/ec\.created_at <= p_at/);
    expect(sql).toMatch(/ec\.ended_at > \(p_at at time zone 'UTC'\)::date/);
    expect(sql).toMatch(/ec\.status = 'ended'\s+and ec\.ended_at is not null/);
    expect(sql).toMatch(/ta\.assigned_at <= at_/);
  });

  it("a member sees only their own member row; managers see all", () => {
    expect(sql).toMatch(/ec\.profile_id = uid\s+and public\.team_member_at_v1\(ta\.team_org_id, uid, now\(\)\)/);
  });

  it("ships a rollback that refuses while history exists", () => {
    expect(existsSync(join(REPO, ROLLBACK))).toBe(true);
    const down = readRepo(ROLLBACK);
    expect(down).toMatch(/rollback refused/);
    expect(down).toMatch(/drop table if exists public\.team_assignments/);
  });

  it("the real-PostgreSQL proof script and its fixtures exist", () => {
    for (const f of ["team-assignment-canonical.sh", "team-assignment-canonical.seed.sql", "team-assignment-canonical.prelude2.sql"]) {
      expect(existsSync(join(REPO, "scripts/db-proof", f)), f).toBe(true);
    }
  });
});

describe("app — one RPC, never a fan-out", () => {
  const core = strip(read("lib/projects/team-assignment.ts"));
  const actions = strip(read("lib/projects/team-assignment-actions.ts"));
  const form = strip(read("components/app/team-assign-form.tsx"));
  const panel = strip(read("components/app/project-team-assignments.tsx"));

  it("writes through assign_team_to_work_v1 / end_team_assignment_v1 only", () => {
    expect(core).toMatch(/rpc\("assign_team_to_work_v1"/);
    expect(core).toMatch(/rpc\("end_team_assignment_v1"/);
    expect(core).not.toMatch(/assignWorkerToProjectAction|assign_worker_to_project/);
    expect(core).not.toMatch(/\.insert\(|\.upsert\(|\.update\(|\.delete\(/);
    expect(core).not.toMatch(/for \(const r of rows\)[\s\S]{0,200}assign/);
  });

  it("members come from the database's resolver, not from a client-side engagement read", () => {
    expect(core).toMatch(/rpc\("list_team_assignment_members_v1"/);
    expect(core).not.toMatch(/relationship_slug", "employee"/);
  });

  it("the advisory calendar check reuses the ONE reservation check, after the write, excluding this project", () => {
    expect(core).toMatch(/checkWorkerReservation\(\{ workerId: m\.worker_id, window, exclude: \[projectId\] \}\)/);
  });

  it("the actions are thin and shape-check ids", () => {
    expect(actions).toMatch(/assignTeamToWork\(/);
    expect(actions).toMatch(/endTeamAssignment\(/);
    expect(actions).toMatch(/UUID\.test\(input\.teamId\)/);
  });

  it("the project page mounts the control beside the person list and the people panel uses the same write", () => {
    expect(read("components/app/project-assignment-manager.tsx")).toMatch(/<ProjectTeamAssignments/);
    expect(read("app/[locale]/dashboard/projects/page.tsx")).toMatch(/teamWork=\{teamWork\}/);
    expect(form).toMatch(/assignTeamToWorkAction\(\{ teamId, projectId \}\)/);
    expect(panel).toMatch(/endTeamAssignmentAction/);
    expect(panel).toMatch(/replaceAssignmentId: row\.id/);
    expect(panel).toMatch(/htmlFor=/);
    expect(panel).toMatch(/role="status"/);
  });
});

describe("one source of commitments", () => {
  const reader = strip(read("lib/planning/employer-committed-work.ts"));

  it("the employer commitments reader resolves team members through the relation", () => {
    expect(reader).toMatch(/from\("team_assignments"\)/);
    expect(reader).toMatch(/rpc\("list_team_assignment_members_v1"/);
    // No new commitment kind: capacity, the reservation verdict and its `exclude` keep one vocabulary.
    expect(reader).toMatch(/readonly kind: "project" \| "booking" \| "trip"/);
  });

  it("before the migration is applied the read still works; a real failure is never an empty list", () => {
    expect(reader).toMatch(/if \(!MISSING_OBJECT_CODES\.has\(teamRes\.error\.code \?\? ""\)\) return \{ status: "unavailable" \}/);
  });

  it("a person also assigned directly is one commitment, and task/object scope is reported undated", () => {
    expect(reader).toMatch(/directKey\.has\(key\)/);
    expect(reader).toMatch(/teamNarrow/);
  });
});

describe("i18n — every active locale carries the same keys, in the product's own words", () => {
  const locales = ["en", "lt", "de", "nl", "pl", "ru"];
  const paths = (o: Record<string, unknown>, p = ""): string[] =>
    Object.entries(o).flatMap(([k, v]) =>
      v && typeof v === "object" ? paths(v as Record<string, unknown>, `${p}${k}.`) : [`${p}${k}`],
    );
  const en = JSON.parse(read("messages/en.json")).teamAssignment as Record<string, unknown>;

  it("English carries a refusal for every word the model can return", () => {
    const refusal = Object.keys(en.refusal as object);
    for (const w of [
      "not_authorized",
      "not_authed",
      "not_a_team",
      "team_has_no_members",
      "project_completed",
      "task_not_assignable",
      "object_not_assignable",
      "one_scope_only",
      "replace_target_not_active",
      "team_and_project_required",
      "needs_migration",
      "error",
    ]) {
      expect(refusal).toContain(w);
    }
  });

  for (const locale of locales) {
    it(`${locale}: same key set, no empty value, no technical wording`, () => {
      const a = JSON.parse(read(`messages/${locale}.json`)).teamAssignment as Record<string, unknown>;
      expect(a, `${locale}: teamAssignment`).toBeTruthy();
      expect(paths(a).sort()).toEqual(paths(en).sort());
      expect(paths(a).filter((k) => String(k.split(".").reduce((x: unknown, s) => (x as Record<string, unknown>)[s], a)).trim() === "")).toEqual([]);
      expect(JSON.stringify(a)).not.toMatch(/\bRPC\b|42501|\bRLS\b|demo/i);
    });
  }

  it("the legacy fan-out wording is gone from the team panel catalogue", () => {
    for (const locale of locales) {
      const tb = JSON.parse(read(`messages/${locale}.json`)).teamBrigades as Record<string, unknown>;
      expect(tb.assign, locale).toBeUndefined();
    }
  });
});
