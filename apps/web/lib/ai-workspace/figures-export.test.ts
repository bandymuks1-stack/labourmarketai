import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Owner contract 2026-09-04 §19 — REPORTING / OUTPUT: "normal users must be
 * able to VIEW · FILTER · EXPORT · DOWNLOAD … reports derived from canonical
 * operational data. No parallel report truth store."
 *
 * "paruošk ataskaitą" answers the organisation's figures AND offers the
 * project operations CSV the operations page already serves — the ONE file
 * route, manager-gated + RLS there — for the projects the person manages.
 */
const ROOT = join(__dirname, "..", "..");
const read = (rel: string): string => readFileSync(join(ROOT, rel), "utf8");
const WF = read("lib/ai-workspace/workflows.ts");
const CHAT = read("components/app/conversation/chat/conversation-chat.tsx");

describe("§19 export by sentence — the figures answer offers the canonical CSV", () => {
  it("the chips point at the existing report route for managed projects only, bounded", () => {
    const at = WF.indexOf("export async function runFigures");
    const body = WF.slice(at, WF.indexOf("// 5. Open a project", at));
    expect(body).toContain("listManagedProjects()");
    expect(body).toContain("managed.slice(0, 3)");
    expect(body).toContain("`download:/${locale}/dashboard/projects/${p.id}/operations/report`");
    // no report store of its own: the workflow reads, it never builds a CSV
    expect(body).not.toMatch(/buildOperationsCsv|csvCell/);
  });

  it("the route the chip names exists and is the manager-gated CSV", () => {
    const route = read("app/[locale]/dashboard/projects/[id]/operations/report/route.ts");
    expect(route).toContain("buildOperationsCsv(");
    expect(route).toContain("getProjectOperations");
    expect(route).toMatch(/status: 401/);
  });

  it("the chat treats a download chip as a file, never as a page", () => {
    const at = CHAT.indexOf('chip.id.startsWith("download:")');
    expect(at).toBeGreaterThan(-1);
    const block = CHAT.slice(at, at + 500);
    expect(block).toContain("window.location.assign(chip.id.slice(9))");
    expect(block).not.toContain("router.push(chip.id.slice(9)");
  });

  it("every catalogue carries the chip copy with the title placeholder", () => {
    for (const loc of ["da", "de", "en", "et", "lt", "lv", "nl", "no", "pl", "ru", "sv"]) {
      const doc = JSON.parse(read(`messages/${loc}.json`)) as { workspace: { ai: Record<string, string> } };
      expect(doc.workspace.ai.chipProjectCsv, loc).toContain("{title}");
      expect(doc.workspace.ai.chipProjectCsv.startsWith("[EN]"), loc).toBe(false);
    }
  });
});
