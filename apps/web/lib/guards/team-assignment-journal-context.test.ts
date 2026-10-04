import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * WRK-6 follow-up — a team that is ACTIVELY assigned is a real Journal / work
 * context, not just a row (migration 20261003150700).
 *
 * The first migration (20261003150600) created the relation and the resolver
 * and wired them to nothing: every precondition still asked only
 * `project_worker_assignments`. This guard pins the wiring (static; the runtime
 * proof is scripts/db-proof/team-assignment-journal-context.sh on a real
 * PostgreSQL):
 *   1. the precondition sites resolve the team through the ONE resolver
 *      (team_assignments_for_work_v1 / team_member_at_v1), never through a
 *      copy into project_worker_assignments;
 *   2. the AUTHOR stays the person (journal_entries.worker_id), the migration
 *      writes no journal row and no assignment row;
 *   3. the new functions are closed to anon, NULL-safe, and self/manager-only;
 *   4. scope semantics: project context = any scope; task level = that task or
 *      its work object only;
 *   5. the rollback restores the live bodies and drops only what was added;
 *   6. the app offers the team's project with a visible "via team" label in
 *      every surface that offers a project, in every locale.
 */

const APP = join(__dirname, "..", "..");
const REPO = join(APP, "..", "..");
const read = (p: string) => readFileSync(join(APP, p), "utf8");
const readRepo = (p: string) => readFileSync(join(REPO, p), "utf8");
const strip = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/[^\n]*/gm, " ").replace(/^\s*--[^\n]*/gm, " ");

const MIGRATION = "supabase/migrations/20261003150700_brigade_journal_context_v1.sql";
const ROLLBACK = "supabase/rollbacks/20261003150700_brigade_journal_context_v1.down.sql";

describe("migration — the team resolver is wired into every precondition", () => {
  const sql = strip(readRepo(MIGRATION));

  it("adds no table and writes no assignment or journal row", () => {
    expect(sql).not.toMatch(/create table/i);
    expect(sql).not.toMatch(/insert into public\.project_worker_assignments/i);
    expect(sql).not.toMatch(/update public\.project_worker_assignments/i);
    expect(sql).not.toMatch(/(update|delete from) public\.journal_entries/i);
    expect(sql).not.toMatch(/(update|delete from|insert into) public\.team_assignments/i);
    // the only journal write is the entry the CALLER creates, authored by p_worker_id
    expect(sql).toMatch(/insert into public\.journal_entries[\s\S]*?p_worker_id, p_engagement_context_id/);
  });

  it("team_work_context_v1 is built on the resolver, NULL-safe, completed projects excluded", () => {
    const fn = sql.match(/create or replace function public\.team_work_context_v1[\s\S]*?\$\$;/)?.[0] ?? "";
    expect(fn).toMatch(/team_assignments_for_work_v1\(p_profile, p_project, coalesce\(p_at, now\(\)\)\)/);
    expect(fn).toMatch(/auth\.uid\(\) is null or p_profile is null or p_project is null then\s+return false/);
    expect(fn).toMatch(/pr\.status is distinct from 'completed'/);
    expect(fn).toMatch(/coalesce\(\(/);
  });

  it("scope semantics: project context = any scope; task level = that task or its work object", () => {
    const fn = sql.match(/create or replace function public\.team_work_context_v1[\s\S]*?\$\$;/)?.[0] ?? "";
    expect(fn).toMatch(/p_task is null/);
    expect(fn).toMatch(/r\.task_id = p_task/);
    expect(fn).toMatch(/t\.object_id = r\.work_object_id/);
    // a project-wide assignment must NOT satisfy a task-level check
    expect(fn).not.toMatch(/r\.task_id is null and r\.work_object_id is null/);
  });

  it("new functions are closed to anon and granted to authenticated only", () => {
    for (const sig of [
      "team_work_context_v1\\(uuid, uuid, uuid, uuid, timestamptz\\)",
      "my_team_work_contexts_v1\\(\\)",
    ]) {
      expect(sql).toMatch(new RegExp(`revoke all on function public\\.${sig} from public, anon`));
      expect(sql).toMatch(new RegExp(`grant execute on function public\\.${sig} to authenticated`));
    }
    expect(sql).not.toMatch(/to anon\b/i);
    expect(sql).not.toMatch(/using \(true\)/i);
  });

  it("my_team_work_contexts_v1 is self-only and as-of-now", () => {
    const fn = sql.match(/create or replace function public\.my_team_work_contexts_v1[\s\S]*?\$\$;/)?.[0] ?? "";
    expect(fn).toMatch(/auth\.uid\(\) is not null/);
    expect(fn).toMatch(/ta\.ended_at is null/);
    expect(fn).toMatch(/team_member_at_v1\(ta\.team_org_id, auth\.uid\(\), now\(\)\)/);
    expect(fn).toMatch(/limit 200/);
  });

  it("create_journal_entry_full: person branch kept, team branch added to explicit AND auto-link", () => {
    const fn = sql.match(/create or replace function public\.create_journal_entry_full[\s\S]*?\$function\$;/)?.[0] ?? "";
    expect(fn).toMatch(/project_not_assignable/);
    expect(fn).toMatch(/public\.project_worker_assignments pwa/);
    expect(fn).toMatch(/v_ec_org is not null\s+and public\.team_work_context_v1\(v_profile, p_project_id, null, v_ec_org\)/);
    // the team branch applies only when the worker is the CALLER
    expect(fn).toMatch(/w\.id = p_worker_id and w\.profile_id = auth\.uid\(\)/);
    // auto-link counts DISTINCT projects across both sources (union), so two teams on one project stay one
    expect(fn).toMatch(/\bunion\b[\s\S]*?my_team_work_contexts_v1\(\)/);
    // the author is the person
    expect(fn).toMatch(/values \(\s*p_worker_id,/);
  });

  it("link_journal_entry_to_task_v1: team task authority + project precondition + org context", () => {
    const fn = sql.match(/create or replace function public\.link_journal_entry_to_task_v1[\s\S]*?\$function\$;/)?.[0] ?? "";
    expect(fn).toMatch(/public\.team_work_context_v1\(uid, t\.project_id, v_task\)/);
    expect(fn).toMatch(/public\.team_work_context_v1\(v_author, t\.project_id\)/);
    expect(fn).toMatch(/v_entry_org is not null\s+and public\.team_work_context_v1\(v_author, t\.project_id, null, v_entry_org\)/);
    // the pre-existing person rules are still there
    expect(fn).toMatch(/t\.assignee_profile_id = uid/);
    expect(fn).toMatch(/project_mismatch/);
    expect(fn).toMatch(/organization_mismatch/);
  });

  it("is_assigned_to_project, wt_select, project_stages_select, work instruction reuse the resolver", () => {
    const isAssigned = sql.match(/create or replace function public\.is_assigned_to_project[\s\S]*?\$function\$;/)?.[0] ?? "";
    expect(isAssigned).toMatch(/project_worker_assignments a/);
    expect(isAssigned).toMatch(/team_member_at_v1\(ta\.team_org_id, auth\.uid\(\), now\(\)\)/);
    expect(isAssigned).toMatch(/ta\.ended_at is null/);
    expect(sql).toMatch(/alter policy wt_select on public\.work_tasks[\s\S]*?team_work_context_v1\(auth\.uid\(\), project_id, id\)/);
    expect(sql).toMatch(/alter policy project_stages_select on public\.project_stages[\s\S]*?is_assigned_to_project\(project_id\)/);
    const instr = sql.match(/create or replace function public\.send_work_instruction_to_project[\s\S]*?\$function\$;/)?.[0] ?? "";
    expect(instr).toMatch(/team_work_context_v1\(worker_pid, pid\)/);
    expect(instr).toMatch(/public\.can_manage_project\(pid\)/);
  });

  it("is declared RED and does not overlap the evid2 / retention / friction lanes", () => {
    const raw = readRepo(MIGRATION);
    expect(raw).toMatch(/@human-gate-approved/);
    expect(raw).toMatch(/needs-human-gate/);
    for (const other of ["review_journal_entry", "reviewable_journal_entry_ids", "journal_entry_confirmations_guard", "redact_expired_ai_run_content", "email_is_verified_v1"]) {
      expect(sql, other).not.toMatch(new RegExp(other));
    }
  });
});

describe("migration — an independent person with a PERSON assignment on a client's project", () => {
  const sql = strip(readRepo(MIGRATION));
  const fn = sql.match(/create or replace function public\.independent_journal_context_v1[\s\S]*?\$\$;/)?.[0] ?? "";

  it("needs the ACTIVE person assignment, the person's OWN active context, and is NULL-safe", () => {
    expect(fn).toMatch(/a\.status = 'active'/);
    expect(fn).toMatch(/ec\.profile_id = w\.profile_id and ec\.status = 'active'/);
    expect(fn).toMatch(/auth\.uid\(\) is not null/);
    expect(fn).toMatch(/w\.profile_id = auth\.uid\(\) or public\.can_manage_project\(p_project\) or public\.is_admin\(\)/);
    expect(fn).toMatch(/coalesce\(\(/);
  });

  it("the context is personal (organization NULL) or the person's own owned workspace, never the project's organisation", () => {
    expect(fn).toMatch(/ec\.organization_id is null/);
    expect(fn).toMatch(/ec\.organization_id <> pr\.organization_id/);
    expect(fn).toMatch(/o\.relationship_slug = 'owner'/);
  });

  it("employer semantics are untouched: a member of the project's organisation is excluded", () => {
    expect(fn).toMatch(/m\.organization_id = pr\.organization_id/);
    expect(fn).toMatch(/cm\.organization_id = pr\.organization_id/);
  });

  it("is wired into explicit attribution, auto-link, the evidence link and the org check", () => {
    const create = sql.match(/create or replace function public\.create_journal_entry_full[\s\S]*?\$function\$;/)?.[0] ?? "";
    expect(create).toMatch(/independent_journal_context_v1\(p_worker_id, p_project_id, p_engagement_context_id\)/);
    expect(create).toMatch(/independent_journal_context_v1\(p_worker_id, pwa\.project_id, p_engagement_context_id\)/);
    const link = sql.match(/create or replace function public\.link_journal_entry_to_task_v1[\s\S]*?\$function\$;/)?.[0] ?? "";
    expect((link.match(/independent_journal_context_v1\(e\.worker_id, t\.project_id, e\.engagement_context_id\)/g) ?? []).length).toBe(2);
  });

  it("closed to anon; does not depend on, edit or fan out into the #2143 objects", () => {
    expect(sql).toMatch(/revoke all on function public\.independent_journal_context_v1\(uuid, uuid, uuid\) from public, anon/);
    expect(sql).toMatch(/grant execute on function public\.independent_journal_context_v1\(uuid, uuid, uuid\) to authenticated/);
    for (const other of ["work_counterparty_links", "journal_entry_review_authority_v1", "work_relationship_active_v1", "profile_is_member_of_organization_v1"]) {
      expect(sql, other).not.toMatch(new RegExp(other));
    }
  });

  it("the rollback drops it", () => {
    expect(strip(readRepo(ROLLBACK))).toMatch(/drop function if exists public\.independent_journal_context_v1\(uuid, uuid, uuid\)/);
  });

  it("the picker keys exist in all 11 locales and the app reads personal-context projects", () => {
    for (const l of ["en", "lt", "de", "nl", "pl", "ru", "sv", "no", "da", "lv", "et"]) {
      const j = JSON.parse(read(`messages/${l}/journal.json`)) as Record<string, string>;
      expect(j.projectClient, l).toMatch(/\{project\}/);
      expect(j.projectClient.toLowerCase(), l).not.toMatch(/demo/);
    }
    expect(read("lib/journal/project-attribution-read.ts")).toMatch(/addClientProjects/);
    expect(read("lib/journal/journal-write-core.ts")).toMatch(/projectsForContext/);
  });
});

describe("rollback — restores the live bodies and drops only what was added", () => {
  const sql = strip(readRepo(ROLLBACK));
  it("restores the person-only bodies", () => {
    for (const fn of ["is_assigned_to_project", "create_journal_entry_full", "link_journal_entry_to_task_v1", "send_work_instruction_to_project"]) {
      expect(sql, fn).toMatch(new RegExp(`create or replace function public\\.${fn}`));
    }
    expect(sql).toMatch(/alter policy wt_select on public\.work_tasks/);
    expect(sql).toMatch(/alter policy project_stages_select on public\.project_stages/);
    expect(sql).not.toMatch(/team_work_context_v1\(uid|team_member_at_v1|my_team_work_contexts_v1\(\) t/);
  });
  it("drops exactly the two added functions, after nothing references them", () => {
    expect(sql).toMatch(/drop function if exists public\.my_team_work_contexts_v1\(\);/);
    expect(sql).toMatch(/drop function if exists public\.team_work_context_v1\(uuid, uuid, uuid, uuid, timestamptz\);/);
    expect(sql).not.toMatch(/drop table|delete from|truncate/i);
  });
});

describe("app — the team's project is offered, labelled 'via team', from one reader", () => {
  it("one server reader wraps the RPC and degrades to empty", () => {
    const src = strip(read("lib/projects/team-work-context.ts"));
    expect(src).toMatch(/my_team_work_contexts_v1/);
    expect(src).toMatch(/catch \{\s*return \[\];/);
    expect(src).not.toMatch(/project_worker_assignments/);
    expect(src).not.toMatch(/\.insert\(|\.update\(|\.upsert\(/);
  });

  it("the journal attribution read merges team projects and never writes an assignment", () => {
    const src = read("lib/journal/project-attribution-read.ts");
    expect(src).toMatch(/readMyTeamWorkContexts/);
    expect(src).toMatch(/addTeamProjects/);
    expect(src).not.toMatch(/\.insert\(|\.update\(|\.upsert\(/);
  });

  it("every project picker renders the via-team label through ONE helper", () => {
    for (const f of [
      "components/app/journal-entry-composer.tsx",
      "components/app/conversation/worker-worklog-flow.tsx",
      "components/app/document-journal-draft-form.tsx",
    ]) {
      const src = read(f);
      expect(src, f).toMatch(/projectDisplayLabel/);
    }
  });

  it("the worker's project list, project view, planner and task list read the same contexts", () => {
    const access = read("lib/projects/worker-project-access.ts");
    expect(access).toMatch(/readMyTeamWorkContexts/);
    expect(access).toMatch(/viaTeam/);
    expect(read("lib/planning/planning.ts")).toMatch(/readMyTeamWorkContexts/);
    expect(read("lib/tasks/tasks.ts")).toMatch(/export async function listMyTeamTasks/);
    expect(read("app/[locale]/dashboard/tasks/page.tsx")).toMatch(/task-via-team-/);
    expect(read("app/[locale]/dashboard/projects/page.tsx")).toMatch(/worker-project-via-team/);
    expect(read("components/app/worker-project-panel.tsx")).toMatch(/worker-project-via-team/);
  });

  it("listMyTasks keeps its assignee/creator meaning (team tasks are a separate, labelled read)", () => {
    const src = read("lib/tasks/tasks.ts");
    expect(src).toMatch(/q\.or\(`assignee_profile_id\.eq\.\$\{user\.id\},created_by\.eq\.\$\{user\.id\}`\)/);
  });
});

describe("i18n — the label exists in every locale that carries the surface, honest copy", () => {
  const LOCALES = ["en", "lt", "de", "nl", "pl", "ru", "sv", "no", "da", "lv", "et"];
  it("journal.projectViaTeam in all 11 locales with both placeholders", () => {
    for (const l of LOCALES) {
      const j = JSON.parse(read(`messages/${l}/journal.json`)) as Record<string, string>;
      expect(j.projectViaTeam, l).toMatch(/\{project\}/);
      expect(j.projectViaTeam, l).toMatch(/\{team\}/);
    }
  });
  it("projectOps viaTeam (list + worker view) in all 11 locales; tasks.viaTeam where the namespace exists", () => {
    for (const l of LOCALES) {
      const raw = read(`messages/${l}.json`);
      const m = JSON.parse(raw) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
      const holders: Array<Record<string, string>> = [];
      const walk = (o: unknown) => {
        if (o && typeof o === "object") {
          const rec = o as Record<string, unknown>;
          if ("assignmentActive" in rec && "assignmentEnded" in rec) holders.push(rec as Record<string, string>);
          Object.values(rec).forEach(walk);
        }
      };
      walk(m);
      expect(holders.length, l).toBeGreaterThanOrEqual(2);
      for (const h of holders) expect(h.viaTeam, l).toMatch(/\{team\}/);
      if (m.tasks?.assignee) expect(m.tasks.viaTeam, l).toMatch(/\{team\}/);
    }
  });
  it("no 'demo' in the new copy", () => {
    for (const l of LOCALES) {
      const j = JSON.parse(read(`messages/${l}/journal.json`)) as Record<string, string>;
      expect(j.projectViaTeam.toLowerCase(), l).not.toMatch(/demo/);
    }
  });
});
