import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Pilot Operations Launch v1 — access-control, reachability, and honesty guard.
 *
 * The operations board composes existing RLS'd surfaces into a manager view. It
 * must stay read-only, manager-gated, project-scoped, and honest: no fabricated
 * readiness, no manager-side candidate-skill read, no fake document verification,
 * and no fake translation.
 */

const root = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(root, rel), "utf8");

const service = read("lib/projects/operations.ts");
const route = read("app/[locale]/dashboard/projects/[id]/operations/page.tsx");
const csvRoute = read(
  "app/[locale]/dashboard/projects/[id]/operations/report/route.ts",
);
const board = read("components/app/project-operations-board.tsx");
const projectsPage = read("app/[locale]/dashboard/projects/page.tsx");
const en = JSON.parse(read("messages/en.json")) as Record<string, unknown>;
const lt = JSON.parse(read("messages/lt.json")) as Record<string, unknown>;

describe("operations read service — read-only & RLS-scoped", () => {
  it("never uses the service role", () => {
    expect(service).not.toMatch(/service_role|createServiceClient|SERVICE_ROLE/);
  });
  it("does not write to the database (no insert/update/upsert/delete)", () => {
    expect(service).not.toMatch(/\.insert\(|\.update\(|\.upsert\(|\.delete\(/);
  });
  it("reads only the existing RLS-allowed surfaces", () => {
    expect(service).toMatch(/from\("projects"\)/);
    expect(service).toMatch(/from\("project_worker_assignments"\)/);
    expect(service).toMatch(/getWorkerReadiness/);
  });
  it("does NOT read owner-only candidate-skill data on the manager side", () => {
    expect(service).not.toMatch(/skill_candidate_clarifications|profile_skill_claims/);
  });
});

describe("access control — manager-gated, project-scoped", () => {
  it("the page gates on company/agency manager roles", () => {
    expect(route).toMatch(/MANAGER_ROLES/);
    expect(route).toMatch(/"company"/);
    expect(route).toMatch(/"agency"/);
    // Control room PR G: the page reads through the operations-centre
    // composition, whose authorisation gate IS getProjectOperations
    // (null = not the caller's project) — guarded in
    // project-operations-centre.test.ts.
    expect(route).toMatch(/getOperationsCentre/);
    expect(read("lib/projects/operations-centre.ts")).toMatch(
      /getProjectOperations/,
    );
    expect(route).toMatch(/notAuthorized/);
  });
  it("the CSV route rejects anon (401) and non-managers (403)", () => {
    expect(csvRoute).toMatch(/status:\s*401/);
    expect(csvRoute).toMatch(/status:\s*403/);
    expect(csvRoute).toMatch(/MANAGER_ROLES/);
    expect(csvRoute).toMatch(/getProjectOperations/);
  });
});

describe("reachability", () => {
  it("the projects page links to each project's operations board", () => {
    // TASK 07 slice 2: the per-project link moved into the MAP card component
    // mounted by the page — reachability is page → <ProjectMap> → link.
    expect(projectsPage).toMatch(/<ProjectMap\b/);
    const mapCard = readFileSync(
      join(root, "components/app/arena/project-map.tsx"),
      "utf8",
    );
    expect(mapCard).toMatch(/operations/);
    expect(mapCard).toMatch(/project-operations-link/);
  });
  it("the board links Mano CV (work records), instructions, and skill clarify", () => {
    // Player-card merged into the Mano CV surface (/dashboard/journal).
    expect(board).toMatch(/dashboard\/journal/);
    expect(board).toMatch(/dashboard\/instructions/);
    expect(board).toMatch(/dashboard\/profile/);
  });
  it("the board renders an honest empty state for zero workers", () => {
    expect(board).toMatch(/ops-no-workers/);
    expect(board).toMatch(/labels\.noWorkers/);
  });
});

describe("honesty copy (en + lt)", () => {
  const ops = (m: Record<string, unknown>) =>
    JSON.stringify((m as { projectOps?: unknown }).projectOps ?? {});

  it("ready is framed as based on checked fields, never as verification", () => {
    for (const m of [en, lt]) {
      const s = ops(m).toLowerCase();
      expect(s).toMatch(/checked field|patikrint/);
      expect(s).not.toMatch(/\bverified by ai\b|ai understand|guaranteed ready/);
    }
  });
  it("states documents are not tracked (never approved/verified here)", () => {
    expect(ops(en).toLowerCase()).toMatch(/not tracked/);
    expect(ops(lt).toLowerCase()).toMatch(/nesekam/);
  });
  it("states candidate-skill clarifications are private to the worker", () => {
    expect(ops(en).toLowerCase()).toMatch(/private/);
    expect(ops(lt).toLowerCase()).toMatch(/privat/);
  });
});
