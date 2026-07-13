import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * F4 assignment UI/flow guard. The manager surface routes every write through
 * the gated actions/RPCs (no direct table writes), is manager-only, ends
 * assignments (never deletes), surfaces not_authorized, and uses honest empty
 * states. LT/EN parity is covered by the i18n parity guard.
 */

const root = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(root, rel), "utf8");
const lt = JSON.parse(read("messages/lt.json"));
const en = JSON.parse(read("messages/en.json"));
const proj = (j: Record<string, unknown>) => j.projects as Record<string, unknown>;
const page = read("app/[locale]/dashboard/projects/page.tsx");
const comp = read("components/app/project-assignment-manager.tsx");
const actions = read("lib/projects/actions.ts");

describe("the projects surface is role-aware + mounts the assignment manager", () => {
  it("managers keep the draft surface; a worker gets THEIR OWN projects, never a dead 'managers only' page (production UX repair v2, F11)", () => {
    expect(page).toMatch(/MANAGER_ROLES/);
    expect(page).toMatch(/listWorkerProjects/);
    expect(page).toMatch(/worker-projects-list/);
    expect(page).toMatch(/<ProjectAssignmentManager\b/);
  });
});

describe("all writes go through the gated server actions / RPCs (no direct table write)", () => {
  it("the client calls the actions, not the tables", () => {
    expect(comp).toMatch(/createProjectAction/);
    expect(comp).toMatch(/assignWorkerToProjectAction/);
    expect(comp).toMatch(/endAssignmentAction/);
    expect(comp).not.toMatch(/\.from\(["']project_worker_assignments["']\)/);
  });
  it("assignment + end go through the SECURITY DEFINER RPCs", () => {
    expect(actions).toMatch(/rpc\("assign_worker_to_project"/);
    expect(actions).toMatch(/rpc\("end_worker_project_assignment"/);
  });
  it("the assign action surfaces a not_authorized result (relationship gate)", () => {
    expect(actions).toMatch(/code:\s*"not_authorized"/);
    expect(comp).toMatch(/not_authorized/);
  });
});

describe("assignments END (never delete) + honest empty states", () => {
  it("the UI ends an assignment, never deletes a row", () => {
    const code = comp
      .replace(/\/\*[\s\S]*?\*\//g, " ")
      .replace(/\/\/[^\n]*/g, " ");
    expect(code).toMatch(/endAssignmentAction\(/);
    expect(code).not.toMatch(/\.delete\(|"delete"|deleteAction/i);
  });
  it("LT + EN expose honest empty states (no projects / no assignments / manager-only)", () => {
    for (const [name, j] of [["lt", lt], ["en", en]] as const) {
      const p = proj(j) as Record<string, string>;
      expect(p.noProjects, `${name} noProjects`).toBeTruthy();
      expect(p.noAssignments, `${name} noAssignments`).toBeTruthy();
      expect(p.managerOnly, `${name} managerOnly`).toBeTruthy();
    }
    expect((proj(lt) as Record<string, string>).noAssignments).toMatch(/nepriskirti/i);
    expect((proj(en) as Record<string, string>).noAssignments).toMatch(/no workers assigned/i);
  });
  it("no fake/sample project or assignment data in the component", () => {
    expect(comp).not.toMatch(/\bsample\b|\bdemo\b|lorem ipsum/i);
  });
});
