import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * WRK-6 — "It assigns a whole team or brigade." The CONNECT half.
 *
 * The rule under guard: a brigade is assigned through the ONE existing
 * per-person write, never through a new authority; every member's outcome is
 * the database's own answer, named; and every assigned member gets their own
 * calendar verdict so a brigade assignment cannot silently put a person in
 * two places. The UNIT link is honestly absent, and this guard pins that the
 * code does not pretend otherwise (no team↔project write anywhere).
 */

const APP = join(__dirname, "..", "..");
const read = (p: string) => readFileSync(join(APP, p), "utf8");

describe("assignTeamToProject — existing authority, per-member truth", () => {
  const core = read("lib/projects/team-assignment.ts");

  it("writes ONLY through assign_worker_to_project — no new RPC, no direct insert", () => {
    expect(core).toMatch(/\.rpc\("assign_worker_to_project"/);
    expect(core).not.toMatch(/\.insert\(/);
    expect(core).not.toMatch(/\.upsert\(/);
    expect(core).not.toMatch(/project_team_assignments|team_project_assignments/);
  });

  it("names the team as the caller's own brigade and its members as the canonical employee engagements", () => {
    expect(core).toMatch(/\.eq\("organization_type", "team"\)/);
    expect(core).toMatch(/\.eq\("owner_profile_id", user\.id\)/);
    expect(core).toMatch(/\.eq\("relationship_slug", "employee"\)/);
    expect(core).toMatch(/\.eq\("status", "active"\)/);
  });

  it("reports each member's own outcome — a refusal is named, never swallowed", () => {
    expect(core).toMatch(/outcome: error\.code === "42501" \? "not_authorized" : "error"/);
    expect(core).toMatch(/outcome: "no_worker"/);
    expect(core).toMatch(/outcome: "assigned"/);
  });

  it("gives every ASSIGNED member their own reservation verdict, read once, excluding the project just written", () => {
    expect(core).toMatch(/readRosterHeldTime\(\{ workerIds: assignedWorkerIds, projectId: input\.projectId \}\)/);
    expect(core).toMatch(/reserveCapacity\(\{/);
    expect(core).toMatch(/unreadableSources: held\.unreadableSources/);
    expect(core).toMatch(/exclude: \[input\.projectId\]/);
  });

  it("is bounded", () => {
    expect(core).toMatch(/const TEAM_MEMBER_LIMIT = 50;/);
  });
});

describe("the surface — the form is on the team panel, fed with the caller's projects", () => {
  it("the team panel mounts the form per team and the company page passes open projects", () => {
    const panel = read("components/app/team-brigades-panel.tsx");
    const page = read("app/[locale]/dashboard/company/page.tsx");
    expect(panel).toMatch(/<TeamAssignForm teamId=\{team\.id\} memberCount=\{team\.members\.length\} projects=\{projects\} \/>/);
    expect(page).toMatch(/\.filter\(\(p\) => p\.status !== "completed"\)/);
  });

  it("the form shows per-member outcome and calendar state, and says a clash does not undo anything", () => {
    const form = read("components/app/team-assign-form.tsx");
    expect(form).toMatch(/t\(`member\.\$\{m\.outcome\}`\)/);
    expect(form).toMatch(/reservation\.collides/);
    expect(form).toMatch(/reservation\.unknown/);
    expect(form).toMatch(/t\("notBlocking"\)/);
  });

  it("every routed locale carries the keys", () => {
    for (const locale of ["en", "lt", "de", "nl", "ru"]) {
      const m = JSON.parse(read(`messages/${locale}.json`));
      const a = m.teamBrigades?.assign;
      expect(a, `${locale}: teamBrigades.assign`).toBeTruthy();
      for (const k of ["heading", "intro", "projectLabel", "projectPlaceholder", "submit", "assigning", "noProjects", "notBlocking"]) {
        expect(typeof a[k], `${locale}: ${k}`).toBe("string");
      }
      for (const k of ["not_authed", "no_such_team", "empty_team", "needs_migration", "unavailable"]) {
        expect(typeof a.outcome[k], `${locale}: outcome.${k}`).toBe("string");
      }
      for (const k of ["assigned", "not_authorized", "no_worker", "error"]) {
        expect(typeof a.member[k], `${locale}: member.${k}`).toBe("string");
      }
      for (const k of ["clear", "unknown", "collides"]) {
        expect(typeof a.reservation[k], `${locale}: reservation.${k}`).toBe("string");
      }
    }
  });
});
