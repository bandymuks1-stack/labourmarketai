import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Journal Evidence Auto-Recompute v1 honesty guard (Slice A, worker side).
 * Pins that the worker-driven source reconcile can NEVER fake a confirmation:
 * it only moves self_declared ↔ work_journal, never writes manager_confirmed,
 * and never touches a verified row. manager_confirmed stays the owner-gated
 * SECURITY DEFINER path.
 */

const APP = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(APP, rel), "utf8");
const stripComments = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");
const action = read("lib/journal/journal-entry-skills-actions.ts");
const apply = read("lib/journal/skill-source-apply.ts");
const applyCode = stripComments(apply);
const pure = read("lib/journal/skill-source.ts");

describe("worker source reconcile is honest (no fake confirmation)", () => {
  it("the link action delegates source reconcile to the dedicated apply module", () => {
    // the link layer stays insert/delete-only (existing guard) and calls out.
    expect(action).toMatch(/applyWorkerSkillSourceReconcile\(/);
  });

  it("the apply module reconciles via the pure helper and fences verified=false", () => {
    expect(apply).toMatch(/reconcileWorkerSkillSources/);
    // the worker UPDATE is fenced to verified=false rows (never a confirmed row)
    expect(applyCode).toMatch(/\.eq\("verified",\s*false\)/);
    // executable code (comments stripped) never writes a manager_confirmed source
    expect(applyCode).not.toMatch(/manager_confirmed/);
    // never sets verified=true (no fake confirmation)
    expect(applyCode).not.toMatch(/verified\s*[:=]\s*true/);
  });

  it("the pure tier rule yields manager_confirmed ONLY from verified, never from journal support", () => {
    // computeSkillSource returns manager_confirmed strictly under `verified`.
    expect(pure).toMatch(/if \(input\.verified\) return "manager_confirmed";/);
    // reconcile skips verified rows entirely.
    expect(pure).toMatch(/if \(r\.verified\) continue;/);
  });

  it("source is derived from real journal links — not invented", () => {
    expect(action).toMatch(/journal_entry_skills/);
    expect(pure).toMatch(/journalSupported/);
  });
});
