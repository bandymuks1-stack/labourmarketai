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

describe("the manager composer offers team-level OR project-level scope (F5)", () => {
  const comp = read("components/app/manager-instruction-composer.tsx");
  it("renders the scope note + the optional project selector", () => {
    expect(comp).toMatch(/data-testid="instruction-scope-note"/);
    expect(comp).toMatch(/labels\.scopeNote/);
    expect(comp).toMatch(/data-testid="instruction-project-scope"/);
    expect(comp).toMatch(/name="project_id"/);
  });
  it("LT scope note describes team-level OR project-level (project = assigned only)", () => {
    const s = mgr(lt).scopeNote;
    expect(s).toBeTruthy();
    expect(s).toMatch(/komandos lyg/i);
    expect(s).toMatch(/projekt/i);
    expect(s).toMatch(/priskirti/i); // project instruction → only assigned workers
  });
  it("EN scope note describes team-level OR project-level", () => {
    const s = mgr(en).scopeNote;
    expect(s).toBeTruthy();
    expect(s).toMatch(/team-level|team level/i);
    expect(s).toMatch(/project/i);
    expect(s).toMatch(/assigned/i);
  });
});

describe("F5 ships the real project-scoped gate (no fake precision)", () => {
  const mig = readRepo(
    "supabase/migrations/20260609140000_work_instruction_project_scope.sql",
  );
  it("project-scoped send requires an ACTIVE assignment + can_manage_project", () => {
    expect(mig).toMatch(/project_worker_assignments[\s\S]*status = 'active'/i);
    expect(mig).toMatch(/can_manage_project\(pid\)/i);
    expect(mig).toMatch(/Not authorized to instruct this worker on this project/i);
  });
  it("the team-level (roster) branch is preserved for null project", () => {
    expect(mig).toMatch(/owns_company\(/i);
    expect(mig).toMatch(/owns_agency\(/i);
  });
  it("stores project_id + never overwrites the original body; participant RLS unchanged", () => {
    expect(mig).toMatch(/add column if not exists project_id/i);
    expect(mig).not.toMatch(/update public\.conversation_messages\s+set\s+body/i);
    expect(mig).not.toMatch(/create policy|alter policy|using\s*\(\s*true\s*\)|to anon/i);
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
