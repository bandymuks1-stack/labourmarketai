import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

/**
 * Wagon 9 — Assets & Logistics guard. Org-scoped, default-closed, no location
 * tracking; manager-gated mutations, worker-only acknowledge.
 */

const repoRoot = join(__dirname, "..", "..", "..", "..");
const webRoot = join(__dirname, "..", "..");
const migration = readFileSync(
  join(repoRoot, "supabase/migrations/20260718170000_assets_logistics.sql"),
  "utf8",
);
const read = (rel: string) => readFileSync(join(webRoot, rel), "utf8");

describe("assets migration is additive, org-scoped, default-closed, reversible", () => {
  it("carries the human-gate acknowledgement", () => {
    expect(migration).toMatch(/--\s*@human-gate-approved/);
  });
  it("both tables enable RLS; SELECT is org-scoped (manages_organization) + worker-self", () => {
    expect((migration.match(/enable row level security/gi) ?? []).length).toBeGreaterThanOrEqual(2);
    expect(migration).toMatch(/manages_organization\(organization_id\)/);
    expect(migration).toMatch(/w\.profile_id = auth\.uid\(\)/);
    expect(migration).not.toMatch(/for (insert|update|delete)/i); // writes RPC-only
  });
  it("acknowledge is worker-only; create/issue/transfer/return are manager-gated", () => {
    expect(migration).toMatch(/acknowledge_asset_assignment_v1[\s\S]*only the assigned worker/);
    expect(migration).toMatch(/create_asset_v1[\s\S]*manages_organization/);
    expect(migration).toMatch(/caller_manages_asset/);
  });
  it("no location tracking / GPS collection", () => {
    expect(migration).not.toMatch(/latitude|longitude|\bgps\b|geolocation|coordinates/i);
  });
  it("write RPCs are SECURITY DEFINER with a pinned search_path", () => {
    expect((migration.match(/security definer/gi) ?? []).length).toBeGreaterThanOrEqual(6);
    expect((migration.match(/set search_path = public/gi) ?? []).length).toBeGreaterThanOrEqual(6);
  });
  it("grants EXECUTE only to authenticated, never anon", () => {
    expect(migration).toMatch(/grant execute on function[\s\S]*to authenticated/i);
    expect(migration).not.toMatch(/to anon/i);
  });
  it("ships a paired rollback file dropping both tables", () => {
    const down = join(repoRoot, "supabase/rollbacks/20260718170000_assets_logistics.down.sql");
    expect(existsSync(down)).toBe(true);
    const d = readFileSync(down, "utf8");
    expect(d).toMatch(/drop table if exists public\.asset_assignments/i);
    expect(d).toMatch(/drop table if exists public\.assets/i);
  });
});

describe("assets code degrades honestly and reuses canonical projects", () => {
  it("read model treats a missing relation as not-applied", () => {
    const model = read("lib/assets/assets.ts");
    expect(model).toMatch(/42P01/);
    expect(model).toMatch(/applied:\s*false/);
    // Reuses the canonical managed-projects reader, not a new project system.
    expect(model).toMatch(/listManagedProjects/);
  });
  it("actions surface needs_migration when the RPC is absent", () => {
    const actions = read("lib/assets/assets-actions.ts");
    expect(actions).toMatch(/needs_migration/);
    expect(actions).toMatch(/42883/);
  });
  it("panel renders an honest pre-apply state", () => {
    const panel = read("components/app/assets-panel.tsx");
    expect(panel).toMatch(/assets-preapply/);
  });
});

describe("assets strings exist in every active-parity locale", () => {
  for (const loc of ["en", "lt", "ru", "nl", "de"]) {
    it(`${loc} has assets with all types + assignment statuses`, () => {
      const msgs = JSON.parse(read(`messages/${loc}.json`));
      expect(msgs.assets?.pageTitle, loc).toBeTruthy();
      for (const ty of ["tool", "equipment", "vehicle", "safety_equipment"]) {
        expect(msgs.assets?.types?.[ty], `${loc}.${ty}`).toBeTruthy();
      }
      for (const st of ["issued", "acknowledged", "transferred", "returned"]) {
        expect(msgs.assets?.assignmentStatus?.[st], `${loc}.${st}`).toBeTruthy();
      }
    });
  }
});
