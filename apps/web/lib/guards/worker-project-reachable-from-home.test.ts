import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * A worker assigned to a project reaches it from home. Production walk
 * 2026-09-28: the assignment worked and /dashboard/projects listed it, but
 * nothing on the worker's home or navigation led there. The home's RUNNING
 * region now names the active assignments and opens the SAME project page —
 * through the worker project page's own reader (its failure-honest sibling,
 * so "could not read" is never "no projects"), never a second project
 * surface.
 */
const read = (rel: string) => readFileSync(join(__dirname, "..", "..", rel), "utf8");
const SCREEN = read("components/app/today/today-screen.tsx");
const REGIONS = read("components/app/home/home-regions.tsx");
const LOADER = read("lib/home/home-server.ts");

describe("the worker's home leads to the project they work on", () => {
  it("ŠIANDIEN mounts the RUNNING region (which carries the projects), streamed", () => {
    expect(SCREEN).toMatch(/<Suspense fallback=\{<HomeRegionPending label=\{t\("reading"\)\} \/>\}>\s*<HomeRunning locale=\{locale\} \/>/);
  });

  it("reads the worker's own assignments with the existing reader and links the existing page", () => {
    expect(LOADER).toMatch(/listWorkerProjectsResult[\s\S]*from "@\/lib\/projects\/worker-project-access"|from "@\/lib\/projects\/worker-project-access"/);
    expect(LOADER).toMatch(/assignmentStatus === "active"/);
    expect(REGIONS).toMatch(/`\/dashboard\/projects\/\$\{p\.projectId\}`/);
    expect(REGIONS).not.toMatch(/\.from\("projects"\)/);
    expect(LOADER).not.toMatch(/\.from\("projects"\)/);
  });

  it("lists nothing when there is no active assignment, and names a failed read instead", () => {
    expect(REGIONS).toMatch(/projects\.length > 0 \? \(/);
    expect(REGIONS).toMatch(/projects === null \? \(/);
  });
});
