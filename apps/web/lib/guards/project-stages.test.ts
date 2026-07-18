import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

/**
 * Wagon 6 — Project Operations Core (slice 1: Project Stages) guard.
 *
 * Pins the canonical, default-closed, honest shape of the project_stages
 * feature so a later refactor cannot silently loosen RLS, drop the rollback,
 * or introduce a fabricated progress percentage.
 */

const repoRoot = join(__dirname, "..", "..", "..", "..");
const webRoot = join(__dirname, "..", "..");
const migration = readFileSync(
  join(repoRoot, "supabase/migrations/20260718140000_project_operations_stages.sql"),
  "utf8",
);
const read = (rel: string) => readFileSync(join(webRoot, rel), "utf8");

describe("project stages migration is additive, default-closed, reversible", () => {
  it("carries the human-gate acknowledgement (RED, owner-authorized)", () => {
    expect(migration).toMatch(/--\s*@human-gate-approved/);
  });

  it("enables RLS and scopes SELECT via canonical can_manage_project + assignment", () => {
    expect(migration).toMatch(/enable row level security/i);
    expect(migration).toMatch(/for select/i);
    expect(migration).toMatch(/can_manage_project\(project_id\)/);
    expect(migration).toMatch(/project_worker_assignments/);
    // No direct write policy — writes are RPC-only (default-deny).
    expect(migration).not.toMatch(/for (insert|update|delete)/i);
  });

  it("write RPCs are SECURITY DEFINER with a pinned search_path", () => {
    const definerCount = (migration.match(/security definer/gi) ?? []).length;
    expect(definerCount).toBeGreaterThanOrEqual(3);
    const searchPathCount = (migration.match(/set search_path = public/gi) ?? []).length;
    expect(searchPathCount).toBeGreaterThanOrEqual(3);
    // Every write RPC re-checks manager authorization.
    expect(migration).toMatch(/can_manage_project/);
  });

  it("grants EXECUTE only to authenticated, never anon", () => {
    expect(migration).toMatch(/grant execute on function[\s\S]*to authenticated/i);
    expect(migration).not.toMatch(/to anon/i);
  });

  it("ships a paired rollback file", () => {
    const down = join(
      repoRoot,
      "supabase/rollbacks/20260718140000_project_operations_stages.down.sql",
    );
    expect(existsSync(down)).toBe(true);
    expect(readFileSync(down, "utf8")).toMatch(/drop table if exists public\.project_stages/i);
  });

  it("has no stored progress percentage column (progress is derived, never faked)", () => {
    expect(migration).not.toMatch(/progress[_ ]?(pct|percent|percentage)/i);
  });
});

describe("project stages code degrades honestly", () => {
  it("read model treats a missing relation as not-applied, not an error", () => {
    const model = read("lib/projects/stages.ts");
    expect(model).toMatch(/42P01/);
    expect(model).toMatch(/applied:\s*false/);
  });

  it("write actions surface needs_migration when the RPC is absent", () => {
    const actions = read("lib/projects/stages-actions.ts");
    expect(actions).toMatch(/needs_migration/);
    expect(actions).toMatch(/42883/);
  });

  it("panel renders an honest pre-apply state and no fabricated percentage", () => {
    const panel = read("components/app/project-stages-panel.tsx");
    expect(panel).toMatch(/project-stages-preapply/);
    expect(panel).not.toMatch(/%/);
  });
});

describe("project stages strings exist in every active-parity locale", () => {
  for (const loc of ["en", "lt", "ru", "nl", "de"]) {
    it(`${loc} has projectStages with all five statuses`, () => {
      const msgs = JSON.parse(read(`messages/${loc}.json`));
      expect(msgs.projectStages?.title, loc).toBeTruthy();
      for (const s of ["planned", "in_progress", "blocked", "done", "cancelled"]) {
        expect(msgs.projectStages?.statuses?.[s], `${loc}.${s}`).toBeTruthy();
      }
    });
  }
});
