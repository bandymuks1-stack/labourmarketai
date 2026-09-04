import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const WEB = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(WEB, rel), "utf8");

/**
 * The living project (owner contract 2026-09-04 §11): the chat's project
 * panel shows what is happening now, what evidence exists, what is open or
 * overdue, how ready the roster is — and ONE honest next step — from the
 * SAME canonical reads the operations centre renders. No second count, no
 * new table, no zero pretending to be a fact.
 */
describe("project pulse — one set of canonical reads, honest absence", () => {
  it("the loader composes the pulse from the stadium, gallery and task reads, and nulls it on any failure", () => {
    const src = read("lib/projects/project-workspace.ts");
    expect(src).toContain('import { getProjectStadium } from "@/lib/projects/stadium";');
    expect(src).toContain('import { getProjectGallerySummary } from "@/lib/journal/project-gallery";');
    expect(src).toContain('import { listProjectTasks } from "@/lib/tasks/tasks";');
    expect(src).toContain("deriveProjectReadinessRatio(stadium.ops.workers)");
    expect(src).toContain("workersWithMissingDocs: stadium.ops.counters.withMissingDocs");
    expect(src).toMatch(/\} catch \{\s*pulse = null;/);
    // No own query for these numbers — the canonical readers are the only source.
    const pulseBlock = src.slice(src.indexOf("let pulse: ProjectPulse | null = null;"), src.indexOf("let stages: readonly ProjectStageRow[] | null = null;"));
    expect(pulseBlock).not.toMatch(/\.from\(|\.rpc\(/);
  });

  it("the panel renders the pulse only when it exists and derives ONE next line from the same numbers", () => {
    const panel = read("components/app/workspace/project-result.tsx");
    expect(panel).toContain("<Pulse pulse={p.pulse} assignmentTotal={p.assignmentTotal} />");
    expect(panel).toContain("if (!pulse) return null;");
    expect(panel).toContain('data-testid="project-pulse"');
    expect(panel).toContain('data-testid="project-pulse-next"');
    for (const key of ["pulseNextAssign", "pulseNextOverdue", "pulseNextDocs", "pulseNextNoWork"]) expect(panel).toContain(`t("${key}"`);
  });

  it("copy exists in the five routed catalogs (conversation.results lives only there)", () => {
    for (const locale of ["lt", "en", "ru", "nl", "de"]) {
      const r = JSON.parse(read(`messages/${locale}.json`)).conversation.results as Record<string, string>;
      for (const key of ["pulseTitle", "pulseToday", "pulseEvidence", "pulseEvidenceValue", "pulseTasks", "pulseTasksValue", "pulseReadiness", "pulseNextAssign", "pulseNextOverdue", "pulseNextDocs", "pulseNextNoWork"]) {
        expect(r[key], `${locale}.${key}`).toBeTypeOf("string");
      }
      expect(r.pulseEvidenceValue).toContain("{entries, plural");
      expect(r.pulseTasksValue).toContain("{open}");
    }
  });
});
