import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * WRK-6 — "It assigns a whole team or brigade."
 *
 * Rule under guard: a team is fanned out through the ONE existing per-person
 * write (assignWorkerToProjectAction), never a new authority, RPC, table or
 * migration; each member's outcome is explicit; the collision flow is the
 * existing one (ReservationNotice + keep / undo / swap with the decision
 * audit); the person card is the existing PersonIdentityCard.
 */

const APP = join(__dirname, "..", "..");
const read = (p: string) => readFileSync(join(APP, p), "utf8");
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/[^\n]*/gm, " ");

describe("assignTeamToProject — existing authority only", () => {
  const core = strip(read("lib/projects/team-assignment.ts"));

  it("writes only through the existing single-assignment action", () => {
    expect(core).toMatch(/assignWorkerToProjectAction\(null, fd\)/);
    expect(core).not.toMatch(/\.insert\(|\.upsert\(|\.update\(|\.delete\(/);
    expect(core).not.toMatch(/\.rpc\(/);
    expect(core).not.toMatch(/project_team_assignments|team_project_assignments|assign_team_to_project/);
  });

  it("names the team as the caller's own and members as active employee engagements", () => {
    expect(core).toMatch(/\.eq\("organization_type", "team"\)/);
    expect(core).toMatch(/\.eq\("owner_profile_id", user\.id\)/);
    expect(core).toMatch(/\.eq\("relationship_slug", "employee"\)/);
    expect(core).toMatch(/\.eq\("status", "active"\)/);
  });

  it("is bounded and sequential (a team is not a transaction)", () => {
    expect(core).toMatch(/const TEAM_MEMBER_LIMIT = 50;/);
    expect(core).toMatch(/for \(const r of rows\)/);
    expect(core).not.toMatch(/Promise\.all\(\s*rows/);
  });
});

describe("the model — unknown is not clear, a refusal is named", () => {
  const model = strip(read("lib/projects/team-assignment-model.ts"));
  it("an absent or unknown verdict maps to calendar_unknown", () => {
    expect(model).toMatch(/!r\.reservation \|\| r\.reservation\.state === "unknown"/);
  });
  it("the database's 42501-derived refusal maps to refused", () => {
    expect(model).toMatch(/code === "not_authorized" \? "refused" : "error"/);
  });
});

describe("the surface — reuses the conflict flow and the identity card", () => {
  const form = read("components/app/team-assign-form.tsx");
  it("shows the existing collision notice with keep / undo / swap and audits the decision", () => {
    expect(form).toMatch(/ReservationNotice/);
    expect(form).toMatch(/recordAssignmentDecisionAction\(projectId, m\.profileId, "kept"\)/);
    expect(form).toMatch(/endAssignmentAction\(projectId, m\.profileId\)/);
    expect(form).toMatch(/recordAssignmentDecisionAction\(projectId, m\.profileId, what\)/);
  });
  it("renders each person with the existing PersonIdentityCard, no new variant", () => {
    expect(form).toMatch(/<PersonIdentityCard[\s\S]*variant="assignment"/);
  });
  it("labels each member's outcome individually", () => {
    expect(form).toMatch(/t\(`member\.\$\{m\.outcome\}`\)/);
  });
  it("the team panel mounts the form per team and the people page passes open projects", () => {
    const panel = read("components/app/team-brigades-panel.tsx");
    const page = read("app/[locale]/dashboard/company/people/page.tsx");
    expect(panel).toMatch(/<TeamAssignForm teamId=\{team\.id\} memberCount=\{team\.members\.length\} projects=\{projects\} \/>/);
    expect(page).toMatch(/\.filter\(\(p\) => p\.status !== "completed"\)/);
  });
});

describe("i18n — every catalogue carries the keys, no technical wording", () => {
  for (const locale of ["en", "lt", "de", "nl", "pl", "ru"]) {
    it(`${locale}`, () => {
      const a = JSON.parse(read(`messages/${locale}.json`)).teamBrigades?.assign;
      expect(a, `${locale}: teamBrigades.assign`).toBeTruthy();
      for (const k of ["heading", "intro", "projectLabel", "projectPlaceholder", "submit", "assigning", "noProjects", "summary"]) {
        expect(typeof a[k], `${locale}: ${k}`).toBe("string");
      }
      for (const k of ["not_authed", "no_such_team", "empty_team", "needs_migration", "unavailable"]) {
        expect(typeof a.outcome[k], `${locale}: outcome.${k}`).toBe("string");
      }
      for (const k of ["assigned", "calendar_unknown", "calendar_conflict", "refused", "error"]) {
        expect(typeof a.member[k], `${locale}: member.${k}`).toBe("string");
      }
      expect(JSON.stringify(a)).not.toMatch(/\bRPC\b|42501|\bRLS\b|demo/i);
    });
  }
});
