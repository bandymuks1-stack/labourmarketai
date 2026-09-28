import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * A worker assigned to a project reaches it from home. Production walk
 * 2026-09-28: the assignment worked and /dashboard/projects listed it, but
 * nothing on the worker's home or navigation led there. ŠIANDIEN now names
 * the active assignments and opens the SAME project page — through the worker
 * project page's own reader, never a second project surface.
 */
const read = (rel: string) => readFileSync(join(__dirname, "..", "..", rel), "utf8");
const SCREEN = read("components/app/today/today-screen.tsx");
const SECTION = read("components/app/today/today-projects-section.tsx");

describe("the worker's home leads to the project they work on", () => {
  it("ŠIANDIEN mounts the projects section, streamed", () => {
    expect(SCREEN).toMatch(/<Suspense fallback=\{null\}>\s*<TodayProjectsSection \/>/);
  });

  it("reads the worker's own assignments with the existing reader and links the existing page", () => {
    expect(SECTION).toMatch(/import \{ listWorkerProjects \} from "@\/lib\/projects\/worker-project-access"/);
    expect(SECTION).toMatch(/assignmentStatus === "active"/);
    expect(SECTION).toMatch(/`\/dashboard\/projects\/\$\{p\.projectId\}`/);
    expect(SECTION).not.toMatch(/\.from\("projects"\)/);
  });

  it("is absent when there is no active assignment", () => {
    expect(SECTION).toMatch(/if \(active\.length === 0\) return null;/);
  });
});
