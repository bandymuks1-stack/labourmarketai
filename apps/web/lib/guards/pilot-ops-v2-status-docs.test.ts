import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

/**
 * Pilot Operations v2 — operational status + readiness/document checklist guard.
 *
 * Enforces the v2 contract: additive RLS-enabled tables, RPC-only writes gated
 * by can_manage_project + active assignment, no anon/PUBLIC grants, no
 * destructive op, and honest copy (manager-set "ready"/"checked" is NOT legal
 * verification or automatic document approval).
 */

const APP = join(__dirname, "..", "..");
const REPO = resolve(APP, "..", "..");
const readApp = (rel: string) => readFileSync(join(APP, rel), "utf8");

// The single v2 migration file.
const migDir = resolve(REPO, "supabase", "migrations");
const migFile = readdirSync(migDir).find((f) =>
  f.endsWith("_pilot_ops_v2_status_readiness.sql"),
);
const migration = migFile ? readFileSync(join(migDir, migFile), "utf8") : "";
// Strip SQL line comments so the reversible-rollback comment block (which
// legitimately documents drop statements) cannot trip the destructive checks.
const sqlNoComments = migration.replace(/^\s*--.*$/gm, "");

describe("v2 migration is additive, RLS-enabled, and safe", () => {
  it("the migration file exists", () => {
    expect(migFile).toBeTruthy();
    expect(migration.length).toBeGreaterThan(800);
  });
  it("creates both tables with row level security enabled", () => {
    expect(migration).toMatch(/create table if not exists public\.project_worker_operational_statuses/);
    expect(migration).toMatch(/create table if not exists public\.project_worker_readiness_items/);
    const rls = migration.match(/enable row level security/g) ?? [];
    expect(rls.length).toBeGreaterThanOrEqual(2);
  });
  it("grants SELECT + EXECUTE to authenticated only — never anon/PUBLIC", () => {
    expect(migration).toMatch(/grant select on public\.project_worker_operational_statuses to authenticated/);
    expect(migration).toMatch(/grant select on public\.project_worker_readiness_items to authenticated/);
    expect(migration).toMatch(/grant execute on function public\.set_worker_operational_status/);
    expect(migration).toMatch(/grant execute on function public\.upsert_worker_readiness_item/);
    // No broad grants. (\b avoids matching "into public" from insert statements.)
    expect(sqlNoComments).not.toMatch(/grant[\s\S]*?\bto\s+anon\b/i);
    expect(sqlNoComments).not.toMatch(/grant[\s\S]*?\bto\s+public\b/i);
  });
  it("routes all writes through SECURITY DEFINER RPCs (direct writes revoked)", () => {
    expect(migration).toMatch(/security definer/);
    expect(migration).toMatch(/revoke insert, update, delete on public\.project_worker_operational_statuses from authenticated/);
    expect(migration).toMatch(/revoke insert, update, delete on public\.project_worker_readiness_items from authenticated/);
  });
  it("gates writes on can_manage_project AND an active assignment (no broad access)", () => {
    expect(migration).toMatch(/can_manage_project/);
    expect(migration).toMatch(/project_worker_assignments[\s\S]*?status = 'active'/);
  });
  it("contains no destructive op outside the reversible-rollback comment", () => {
    expect(sqlNoComments).not.toMatch(/drop\s+table/i);
    expect(sqlNoComments).not.toMatch(/drop\s+column/i);
    expect(sqlNoComments).not.toMatch(/delete\s+from/i);
    expect(sqlNoComments).not.toMatch(/using\s*\(\s*true\s*\)/i);
  });
  it("status CHECK constraints bound the allowed values (no free text)", () => {
    expect(migration).toMatch(/status in \([\s\S]*?'candidate'[\s\S]*?'rejected'\)/);
    expect(migration).toMatch(/status in \([\s\S]*?'not_required'[\s\S]*?'expired'\)/);
  });
});

describe("v2 read service stays read-only", () => {
  const service = readApp("lib/projects/operations.ts");
  it("reads the new tables but never writes them", () => {
    expect(service).toMatch(/project_worker_operational_statuses/);
    expect(service).toMatch(/project_worker_readiness_items/);
    expect(service).not.toMatch(/\.insert\(|\.update\(|\.upsert\(|\.delete\(/);
  });
});

describe("v2 write actions go only through the gated RPCs", () => {
  const actions = readApp("lib/projects/operations-actions.ts");
  it("call the SECURITY DEFINER RPCs (no direct table writes)", () => {
    expect(actions).toMatch(/set_worker_operational_status/);
    expect(actions).toMatch(/upsert_worker_readiness_item/);
    expect(actions).not.toMatch(/\.from\(["']project_worker_operational_statuses["']\)/);
    expect(actions).not.toMatch(/\.from\(["']project_worker_readiness_items["']\)/);
  });
  it("surface needs_migration + not_authorized cleanly (tagged returns)", () => {
    expect(actions).toMatch(/needs_migration/);
    expect(actions).toMatch(/not_authorized/);
    expect(actions).toMatch(/42501/);
  });
});

describe("v2 board UI is wired for status, checklist, and filters", () => {
  const board = readApp("components/app/project-operations-board.tsx");
  it("renders the status editor and checklist controls", () => {
    expect(board).toMatch(/ops-status-editor/);
    expect(board).toMatch(/ops-status-select/);
    expect(board).toMatch(/ops-checklist/);
    expect(board).toMatch(/ops-checklist-seed/);
  });
  it("renders the operations filters", () => {
    expect(board).toMatch(/ops-filters/);
    expect(board).toMatch(/ops-filter-status/);
    expect(board).toMatch(/filterBtn\("missingDocs"/);
    expect(board).toMatch(/filterBtn\("followUp"/);
  });
});

describe("v2 honesty copy (en + lt) — ready/checked is not legal verification", () => {
  const ops = (locale: "en" | "lt") => {
    const m = JSON.parse(readApp(`messages/${locale}.json`)) as {
      projectOps?: Record<string, unknown>;
    };
    return JSON.stringify(m.projectOps ?? {}).toLowerCase();
  };
  it("status helper says ready is not automatic legal verification", () => {
    expect(ops("en")).toMatch(/not (automatic )?legal verification|not automatic legal/);
    expect(ops("lt")).toMatch(/nėra[\s\S]*?teisin/);
  });
  it("checklist helper says checked is a manager mark, not approval/verification", () => {
    expect(ops("en")).toMatch(/not a legal verification/);
    expect(ops("en")).toMatch(/nothing is approved automatically/);
    expect(ops("lt")).toMatch(/nėra teisinis patvirtinimas/);
  });
});
