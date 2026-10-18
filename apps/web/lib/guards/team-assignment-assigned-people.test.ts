import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * WRK-6 follow-up - ONE meaning of "assigned" and ONE core for assigning a team.
 *
 *  1. every headcount / roster / "N assigned" surface that used to read
 *     `project_worker_assignments` alone routes through
 *     lib/projects/assigned-people.ts (person assignments UNION members of
 *     actively assigned teams, deduped), so a project with one 3-person team can
 *     never read "0 assigned";
 *  2. the assistant / MCP tools for a team assignment call the SAME server core
 *     the web UI calls - no parallel RPC call, no identity argument, draft ->
 *     confirm with a state-bound token;
 *  3. the labels exist in every locale that carries the surface.
 */

const APP = join(__dirname, "..", "..");
const REPO = join(APP, "..", "..");
const read = (p: string) => readFileSync(join(APP, p), "utf8");
const readRepo = (p: string) => readFileSync(join(REPO, p), "utf8");
const strip = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/[^\n]*/gm, " ");

describe("one canonical definition of assigned people", () => {
  const model = strip(read("lib/projects/assigned-people.ts"));

  it("the module is read-only on assignments and resolves teams through the existing RPC as of now", () => {
    expect(model).toMatch(/list_team_assignment_members_v1/);
    expect(model).toMatch(/\.is\("ended_at", null\)/);
    expect(model).not.toMatch(/\.(insert|update|upsert|delete)\(/);
    expect(model).not.toMatch(/project_worker_assignments/);
  });

  it.each([
    ["lib/projects/operations.ts", /mergeAssignedPeople/, /readTeamAssignedPeople/],
    ["lib/projects/projects.ts", /mergeAssignedPeople/, /listProjectAssignedPeople/],
    ["lib/company/company-workers.ts", /readTeamAssignedPeople/, /readActiveProjectTitles/],
    ["lib/assist/assist.ts", /mergeAssignedPeople/, /assignedCountsByProject/],
    ["lib/workforce/workforce.ts", /mergeAssignedPeople/, /readTeamAssignedPeople/],
  ])("%s counts through the canonical module", (file, a, b) => {
    const src = read(file);
    expect(src).toMatch(/@\/lib\/projects\/assigned-people/);
    expect(src).toMatch(a);
    expect(src).toMatch(b);
  });

  it("the names-on-the-project and project-workspace headcount use the canonical list, the person roster keeps its meaning", () => {
    expect(read("lib/company/company-home-field.ts")).toMatch(/listProjectAssignedPeople/);
    expect(read("lib/projects/project-workspace.ts")).toMatch(/listProjectAssignedPeople/);
    expect(read("lib/projects/project-workspace.ts")).not.toMatch(/await listProjectAssignments\(/);
    // the roster with "end assignment" buttons stays the PERSON rows (a team member has none)
    expect(read("app/[locale]/dashboard/projects/page.tsx")).toMatch(/listProjectAssignments/);
  });

  it("operations derive carries viaTeam and the surfaces label it; per-person writes are not offered for team members", () => {
    const derive = read("lib/projects/operations-derive.ts");
    expect(derive).toMatch(/viaTeam: workers\.filter\(\(w\) => w\.viaTeam\)\.length/);
    const board = read("components/app/project-operations-board.tsx");
    expect(board).toMatch(/worker\.viaTeam \? null : \(\s*<StatusEditor/);
    expect(board).toMatch(/worker\.viaTeam \? null : \(\s*<ChecklistEditor/);
    expect(read("app/[locale]/dashboard/projects/[id]/page.tsx")).toMatch(/fieldViaTeam/);
    expect(read("app/[locale]/dashboard/projects/[id]/operations/page.tsx")).toMatch(/counters\.viaTeam/);
  });

  it("the commitments reader keeps counting a person assigned both ways ONCE (audit item)", () => {
    const src = read("lib/planning/employer-committed-work.ts");
    expect(src).toMatch(/A person who is ALSO assigned directly is one commitment, not two/);
    expect(src).toMatch(/directKey\.has\(key\) \|\| seenTeamKey\.has\(key\)/);
  });

  it("the market thermometer is NOT a headcount: it only finds the worker's single roster project for the salary aggregate, which a team deliberately does not widen", () => {
    const src = read("lib/market/thermometer-data.ts");
    expect(src).toMatch(/NOT a headcount/);
  });
});

describe("team assignment tools - the same core as the UI", () => {
  const tools = read("lib/capabilities/team-assignment-capabilities.ts");
  const code = strip(tools);

  it("writes through the shared core with the caller's own client, never its own RPC call", () => {
    expect(code).toMatch(/assignTeamToWork\(/);
    expect(code).toMatch(/endTeamAssignment\(/);
    expect(code).toMatch(/@\/lib\/projects\/team-assignment"/);
    expect(code).not.toMatch(/\.rpc\(\s*["']assign_team_to_work_v1/);
    expect(code).not.toMatch(/\.rpc\(\s*["']end_team_assignment_v1/);
    expect(code).not.toMatch(/\.insert\(|\.update\(|\.upsert\(|\.delete\(/);
    expect(code).not.toMatch(/project_worker_assignments/);
  });

  it("the web UI actions wrap the same core", () => {
    const actions = read("lib/projects/team-assignment-actions.ts");
    expect(actions).toMatch(/assignTeamToWork\(/);
    expect(actions).toMatch(/endTeamAssignment\(/);
    const core = read("lib/projects/team-assignment.ts");
    expect(core).toMatch(/assign_team_to_work_v1/);
    expect(core).toMatch(/end_team_assignment_v1/);
    expect(core).toMatch(/caller\?: TeamAssignmentCaller/);
    // the UI passes no caller: the cookie session stays its authority
    expect(actions).not.toMatch(/supabase:/);
  });

  it("identity is the session, strict schemas, draft -> confirm with a state-bound token, advisory clash verdict", () => {
    expect((tools.match(/\.strict\(\)/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect(code).toMatch(/userId: caller\.userId/);
    expect(code).not.toMatch(/z\.object\(\{[^}]*(userId|profileId|callerId)/);
    expect(code).toMatch(/stateFingerprint: r\.fingerprint/);
    expect(code).toMatch(/currentStateFingerprint: r\.fingerprint/);
    expect(code).toMatch(/memberCalendar/);
    expect(code).toMatch(/membersNeedingNotice/);
    // override receipts are the #2146 lane's: nothing here records or bypasses one
    expect(code).not.toMatch(/receipt|override/i);
  });

  it("is registered, and the MCP toolset register carries the new fingerprint row", () => {
    expect(read("lib/capabilities/registry.ts")).toMatch(/\.\.\.TEAM_ASSIGNMENT_CAPABILITIES/);
    const doc = readRepo("docs/integrations/MCP_TOOLSET_FINGERPRINTS.md");
    expect(doc).toMatch(/team_assignment_create_draft/);
  });
});

describe("i18n - via-team labels", () => {
  const LOCALES = ["en", "lt", "de", "nl", "pl", "ru", "sv", "no", "da", "lv", "et"];
  it("projectOps.stadium.fieldViaTeam in all 11 locales, counters.viaTeam where the namespace exists", () => {
    for (const l of LOCALES) {
      const m = JSON.parse(read(`messages/${l}.json`)) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
      expect(m.projectOps?.stadium?.fieldViaTeam, l).toMatch(/\{n\}/);
      if (m.projectOps?.counters?.totalAssigned) expect(m.projectOps.counters.viaTeam, l).toBeTruthy();
      expect(String(m.projectOps.stadium.fieldViaTeam).toLowerCase(), l).not.toMatch(/demo/);
    }
  });
});
