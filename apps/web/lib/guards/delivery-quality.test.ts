import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

/**
 * Wagon 11 — Delivery & Quality guard. Defects + corrections; project-scoped,
 * default-closed, nothing auto-accepted; no second photo store.
 */

const repoRoot = join(__dirname, "..", "..", "..", "..");
const webRoot = join(__dirname, "..", "..");
const migration = readFileSync(
  join(repoRoot, "supabase/migrations/20260718200000_delivery_quality.sql"),
  "utf8",
);
const read = (rel: string) => readFileSync(join(webRoot, rel), "utf8");

describe("delivery-quality migration is additive, project-scoped, reversible", () => {
  it("carries the human-gate acknowledgement", () => {
    expect(migration).toMatch(/--\s*@human-gate-approved/);
  });
  it("both tables enable RLS; defects SELECT via can_manage_project + reporter", () => {
    expect((migration.match(/enable row level security/gi) ?? []).length).toBeGreaterThanOrEqual(2);
    expect(migration).toMatch(/can_manage_project\(project_id\)/);
    expect(migration).toMatch(/reporter_id = auth\.uid\(\)/);
    expect(migration).not.toMatch(/for (insert|update|delete)/i);
  });
  it("defaults status to reported and never auto-accepts on correction", () => {
    expect(migration).toMatch(/status text not null default 'reported'/);
    // A recorded correction moves the defect to in_correction — NOT accepted.
    expect(migration).toMatch(/add_defect_correction_v1[\s\S]*status = 'in_correction'/);
    expect(migration).not.toMatch(/add_defect_correction_v1[\s\S]*status = 'accepted'/);
  });
  it("uses a SECURITY DEFINER helper so the corrections policy cannot recurse", () => {
    expect(migration).toMatch(/create or replace function public\.caller_manages_defect/);
    expect(migration).toMatch(/defect_corrections_select[\s\S]*caller_manages_defect/);
  });
  it("write RPCs are SECURITY DEFINER with a pinned search_path", () => {
    expect((migration.match(/security definer/gi) ?? []).length).toBeGreaterThanOrEqual(5);
    expect((migration.match(/set search_path = public/gi) ?? []).length).toBeGreaterThanOrEqual(5);
  });
  it("grants EXECUTE only to authenticated, never anon", () => {
    expect(migration).toMatch(/grant execute on function[\s\S]*to authenticated/i);
    expect(migration).not.toMatch(/to anon/i);
  });
  it("adds no second photo store (reuses the project gallery)", () => {
    expect(migration).not.toMatch(/create table[^;]*photo/i);
    expect(migration).not.toMatch(/storage\./i);
  });
  it("ships a paired rollback file dropping both tables", () => {
    const down = join(repoRoot, "supabase/rollbacks/20260718200000_delivery_quality.down.sql");
    expect(existsSync(down)).toBe(true);
    const d = readFileSync(down, "utf8");
    expect(d).toMatch(/drop table if exists public\.defect_corrections/i);
    expect(d).toMatch(/drop table if exists public\.defects/i);
  });
});

describe("delivery-quality code degrades honestly", () => {
  it("read model treats a missing relation as not-applied", () => {
    const model = read("lib/quality/quality.ts");
    expect(model).toMatch(/42P01/);
    expect(model).toMatch(/applied:\s*false/);
  });
  it("actions surface needs_migration when the RPC is absent", () => {
    const actions = read("lib/quality/quality-actions.ts");
    expect(actions).toMatch(/needs_migration/);
    expect(actions).toMatch(/42883/);
  });
  it("panel renders an honest pre-apply state", () => {
    const panel = read("components/app/project-defects-panel.tsx");
    expect(panel).toMatch(/defects-preapply/);
  });
});

describe("quality strings exist in every active-parity locale", () => {
  for (const loc of ["en", "lt", "ru", "nl", "de"]) {
    it(`${loc} has quality with all defect statuses`, () => {
      const msgs = JSON.parse(read(`messages/${loc}.json`));
      expect(msgs.quality?.title, loc).toBeTruthy();
      for (const s of ["reported", "in_correction", "accepted", "reopened", "cancelled"]) {
        expect(msgs.quality?.status?.[s], `${loc}.${s}`).toBeTruthy();
      }
    });
  }
});
