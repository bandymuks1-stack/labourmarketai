import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Work-instructions permission-scope honesty guard (slice
 * instructions-project-scope-audit-v1, PR F3).
 *
 * The project/object/site model exists + is applied, but `project_worker_assignments`
 * is EMPTY and there is no assignment write flow — so a project-scoped instruction
 * gate would be FAKE PRECISION. PR F3 is audit/design only: it keeps the honest
 * roster-level gate, LABELS it honestly, names the missing primitive, and claims
 * NO active project/site precision.
 */

const root = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(root, rel), "utf8");
const repo = join(root, "..", "..");
const readRepo = (rel: string) => readFileSync(join(repo, rel), "utf8");
const lt = JSON.parse(read("messages/lt.json"));
const en = JSON.parse(read("messages/en.json"));
const mgr = (j: Record<string, unknown>) =>
  (j.instructions as { manager: Record<string, string> }).manager;

describe("the manager composer honestly labels the current (roster) scope", () => {
  const comp = read("components/app/manager-instruction-composer.tsx");
  it("renders the scope note", () => {
    expect(comp).toMatch(/data-testid="instruction-scope-note"/);
    expect(comp).toMatch(/labels\.scopeNote/);
  });
  it("LT scope note says roster/team level now, project/site later (no fake precision)", () => {
    const s = mgr(lt).scopeNote;
    expect(s).toBeTruthy();
    expect(s).toMatch(/komandos lygiu/i);
    expect(s).toMatch(/projekt/i);
    expect(s).toMatch(/bus įjungta|kai darbuotojai bus priskirti/i); // FUTURE, not active
  });
  it("EN scope note says team (roster) level now, project/site later", () => {
    const s = mgr(en).scopeNote;
    expect(s).toBeTruthy();
    expect(s).toMatch(/team \(roster\) level|roster/i);
    expect(s).toMatch(/project/i);
    expect(s).toMatch(/will activate|once workers are assigned/i); // FUTURE, not active
  });
});

describe("no fake project precision shipped — the send gate is still roster-scoped", () => {
  const mig = readRepo("supabase/migrations/20260608150000_work_instructions.sql");
  it("the instruction sender does NOT (yet) gate on project assignment", () => {
    // No project_worker_assignments / can_manage_project / project_id gate in the
    // applied sender — project scope is design-only until assignments exist.
    expect(mig).not.toMatch(/project_worker_assignments/i);
    expect(mig).not.toMatch(/can_manage_project/i);
  });
  it("the roster relationship gate remains (owns_company/owns_agency + active roster)", () => {
    expect(mig).toMatch(/owns_company\(/i);
    expect(mig).toMatch(/owns_agency\(/i);
    expect(mig).toMatch(/status = 'active'/i);
  });
});

describe("the design/audit doc names the missing primitive + forward gate", () => {
  const doc = readRepo("docs/audits/work-instructions-project-scope-design-v1.md");
  it("exists and is labelled audit/design only", () => {
    expect(doc).toMatch(/AUDIT \/ DESIGN ONLY/i);
  });
  it("names the missing primitive: the worker→project assignment write flow", () => {
    expect(doc).toMatch(/project_worker_assignments/);
    expect(doc).toMatch(/assignment write flow/i);
    expect(doc).toMatch(/0 rows|empty/i);
  });
  it("specifies the forward project-scoped gate (can_manage_project + active assignment)", () => {
    expect(doc).toMatch(/can_manage_project/);
    expect(doc).toMatch(/project_worker_assignments[\s\S]*status\s*=\s*'active'/i);
  });
});

describe("unchanged: original-preserving, clarification, attention surfacing", () => {
  it("worker card still preserves + reveals the original and offers clarification", () => {
    const card = read("components/app/worker-instruction-card.tsx");
    expect(card).toMatch(/instruction\.originalText/);
    expect(card).toMatch(/data-testid="instruction-show-original"/);
    expect(card).toMatch(/data-testid="instruction-clarify"/);
  });
  it("attention surfacing stays in Mano pranešimai (communication page)", () => {
    const comm = read("app/[locale]/dashboard/communication/page.tsx");
    expect(comm).toMatch(/<AttentionInstructions\b/);
  });
});
