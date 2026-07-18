import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

/**
 * Wagon 7 — Workforce Operations (Leave & Absence) guard. Pins the
 * default-closed, manager-approved, never-auto-approved shape.
 */

const repoRoot = join(__dirname, "..", "..", "..", "..");
const webRoot = join(__dirname, "..", "..");
const migration = readFileSync(
  join(repoRoot, "supabase/migrations/20260718150000_leave_absence.sql"),
  "utf8",
);
const read = (rel: string) => readFileSync(join(webRoot, rel), "utf8");

describe("worker_absences migration is additive, default-closed, reversible", () => {
  it("carries the human-gate acknowledgement", () => {
    expect(migration).toMatch(/--\s*@human-gate-approved/);
  });

  it("defaults status to requested — never auto-approved", () => {
    expect(migration).toMatch(/status text not null default 'requested'/);
    expect(migration).toMatch(/check \(status in \('requested','approved','rejected','cancelled'\)\)/);
  });

  it("enables RLS and scopes SELECT to the worker or a real manager", () => {
    expect(migration).toMatch(/enable row level security/i);
    expect(migration).toMatch(/w\.profile_id = auth\.uid\(\)/);
    expect(migration).toMatch(/caller_manages_worker\(worker_id\)/);
    expect(migration).not.toMatch(/for (insert|update|delete)/i);
  });

  it("approval RPC is manager-gated; request/cancel are worker-self", () => {
    // review requires caller_manages_worker; request/cancel require own worker.
    expect(migration).toMatch(/review_worker_absence_v1[\s\S]*caller_manages_worker/);
    expect(migration).toMatch(/request_worker_absence_v1[\s\S]*profile_id = auth\.uid\(\)/);
  });

  it("write RPCs are SECURITY DEFINER with a pinned search_path", () => {
    expect((migration.match(/security definer/gi) ?? []).length).toBeGreaterThanOrEqual(3);
    expect((migration.match(/set search_path = public/gi) ?? []).length).toBeGreaterThanOrEqual(3);
  });

  it("grants EXECUTE only to authenticated, never anon", () => {
    expect(migration).toMatch(/grant execute on function[\s\S]*to authenticated/i);
    expect(migration).not.toMatch(/to anon/i);
  });

  it("ships a paired rollback file", () => {
    const down = join(repoRoot, "supabase/rollbacks/20260718150000_leave_absence.down.sql");
    expect(existsSync(down)).toBe(true);
    expect(readFileSync(down, "utf8")).toMatch(/drop table if exists public\.worker_absences/i);
  });
});

describe("leave & absence code degrades honestly", () => {
  it("read model treats a missing relation as not-applied", () => {
    const model = read("lib/leave/absences.ts");
    expect(model).toMatch(/42P01/);
    expect(model).toMatch(/applied:\s*false/);
  });
  it("actions surface needs_migration when the RPC is absent", () => {
    const actions = read("lib/leave/absences-actions.ts");
    expect(actions).toMatch(/needs_migration/);
    expect(actions).toMatch(/42883/);
  });
  it("panel renders an honest pre-apply state", () => {
    const panel = read("components/app/absence-panel.tsx");
    expect(panel).toMatch(/absences-preapply/);
  });
});

describe("leave & absence strings exist in every active-parity locale", () => {
  for (const loc of ["en", "lt", "ru", "nl", "de"]) {
    it(`${loc} has absences with all types + statuses`, () => {
      const msgs = JSON.parse(read(`messages/${loc}.json`));
      expect(msgs.absences?.pageTitle, loc).toBeTruthy();
      for (const ty of ["annual_leave", "sickness", "unpaid", "training", "other"]) {
        expect(msgs.absences?.types?.[ty], `${loc}.${ty}`).toBeTruthy();
      }
      for (const st of ["requested", "approved", "rejected", "cancelled"]) {
        expect(msgs.absences?.statuses?.[st], `${loc}.${st}`).toBeTruthy();
      }
    });
  }
});
