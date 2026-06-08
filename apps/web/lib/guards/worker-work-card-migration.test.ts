import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Migration guard for the worker work-card RPCs (slice work-card-state-aware-v1,
 * migration 20260608120000). Pins that the write path is additive, reversible,
 * owner-scoped, and never grants the user write access to system fields.
 */

// lib/guards → lib → apps/web → apps → repo root (4 levels up).
const repo = join(__dirname, "..", "..", "..", "..");
const sql = readFileSync(
  join(repo, "supabase", "migrations", "20260608120000_worker_work_card.sql"),
  "utf8",
);

// Mirror migration-safety.mjs: risk patterns are judged on EXECUTABLE SQL only,
// so a commented `-- drop ...` inside the ROLLBACK block is not a real drop.
const code = sql
  .replace(/\/\*[\s\S]*?\*\//g, " ")
  .replace(/--[^\n]*/g, " ");

describe("work-card migration is additive + reversible", () => {
  it("adds the confirmation column with IF NOT EXISTS (additive)", () => {
    expect(sql).toMatch(
      /add column if not exists work_card_confirmed_at timestamptz/i,
    );
  });
  it("performs no destructive op in executable SQL (drops live only in the rollback comment)", () => {
    expect(code).not.toMatch(/drop\s+table/i);
    expect(code).not.toMatch(/drop\s+column/i);
    expect(code).not.toMatch(/truncate/i);
    expect(code).not.toMatch(/delete\s+from/i);
  });
  it("ships a documented rollback path", () => {
    expect(sql).toMatch(/ROLLBACK \(reversible\)/);
    expect(sql).toMatch(/drop function if exists public\.confirm_worker_card/i);
    expect(sql).toMatch(/drop function if exists public\.save_worker_card/i);
  });
});

describe("writes are owner-scoped + SECURITY DEFINER, never system fields", () => {
  it("both RPCs are SECURITY DEFINER with a fixed search_path", () => {
    // Count the actual SQL clauses (line-anchored), not the prose in the header.
    const definers = sql.match(/^\s*security definer\s*$/gim) ?? [];
    expect(definers.length).toBe(2);
    expect((sql.match(/^\s*set search_path = public\s*$/gim) ?? []).length).toBe(2);
  });
  it("every write is scoped WHERE profile_id = auth.uid()", () => {
    // No update may target another user's row.
    const updates = sql.match(/update public\.workers[\s\S]*?where[^;]*/gi) ?? [];
    expect(updates.length).toBeGreaterThanOrEqual(2);
    for (const u of updates) {
      expect(u).toMatch(/where\s+profile_id\s*=\s*uid/i);
    }
  });
  it("never writes the system trust / completeness fields (no fake score)", () => {
    expect(sql).not.toMatch(/trust_score\s*=/i);
    expect(sql).not.toMatch(/profile_completeness\s*=/i);
  });
  it("does not grant blanket UPDATE on public.workers (RPC-only writes)", () => {
    expect(sql).not.toMatch(/grant[^;]*update[^;]*on\s+public\.workers/i);
  });
  it("validates availability against the allowed set", () => {
    expect(sql).toMatch(/not in \('available','busy','unavailable'\)/i);
  });
  it("grants execute on both RPCs to authenticated", () => {
    expect(sql).toMatch(
      /grant execute on function public\.save_worker_card[\s\S]*to authenticated/i,
    );
    expect(sql).toMatch(
      /grant execute on function public\.confirm_worker_card\(\) to authenticated/i,
    );
  });
});
