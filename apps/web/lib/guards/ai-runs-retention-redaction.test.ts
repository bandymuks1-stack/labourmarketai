import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * AI_RUNS RETENTION REDACTION — the required 90-day retention block recorded in
 * docs/APPLIED_LEDGER.md against the applied `ai_runs` table.
 *
 * `ai_runs` may hold model output excerpts and a user pointer; the ledger
 * requires that the full rows + `output_excerpt` be retained no longer than
 * 90 days, with long-horizon KPI history coming from the minimised aggregate.
 * This guard pins the shape of the retention migration statically (CI has no
 * DB): a SECURITY DEFINER redaction function that nulls only the sensitive
 * columns past a ≥1-day, default-90-day window, is service_role-only, never
 * deletes rows or touches any other table, and ships a paired rollback.
 *
 * WHY a redaction (not a delete): `ai_runs` is AI-operations telemetry, not the
 * author-content legal spine (journal/chat/experiences), which this migration
 * must never touch. Redaction keeps the non-identifying aggregate row for KPIs
 * while removing personal / model-generated content.
 */

const MIGRATIONS = join(__dirname, "..", "..", "..", "..", "supabase", "migrations");
const ROLLBACKS = join(__dirname, "..", "..", "..", "..", "supabase", "rollbacks");
const MIG = "20260824140000_ai_runs_retention_redaction_v1.sql";

const sql = readFileSync(join(MIGRATIONS, MIG), "utf8");
const codeLines = sql.split("\n").filter((l) => !l.trimStart().startsWith("--"));
const code = codeLines.join("\n");

/** The only columns the redaction may null — the fields that can carry personal
 *  or model-generated content. */
const REDACTED = ["output_excerpt", "profile_id", "request_context"] as const;

describe("ai_runs retention redaction migration", () => {
  it("creates the retention function as SECURITY DEFINER", () => {
    expect(sql).toMatch(
      /CREATE OR REPLACE FUNCTION public\.ai_runs_apply_retention\(/i,
    );
    expect(sql).toMatch(/security definer/i);
    expect(sql).toMatch(/set search_path to 'public'/i);
  });

  it("redacts only the sensitive columns and deletes nothing", () => {
    for (const col of REDACTED) {
      expect(code, `${col} must be nulled`).toMatch(
        new RegExp(`${col}\\s*=\\s*null`, "i"),
      );
    }
    // It is an UPDATE-to-null, never a row delete, and never a truncate.
    expect(code).toMatch(/update\s+public\.ai_runs/i);
    expect(code).not.toMatch(/delete\s+from\s+public\.ai_runs/i);
    expect(code).not.toMatch(/truncate/i);
    // The minimised aggregate must survive: it must NOT null the KPI columns.
    for (const keep of ["task_type", "provider", "actual_cost_usd", "created_at"]) {
      expect(code, `${keep} must be kept`).not.toMatch(
        new RegExp(`${keep}\\s*=\\s*null`, "i"),
      );
    }
  });

  it("defaults to a 90-day window and refuses a too-short one", () => {
    expect(code).toMatch(/default\s+interval\s+'90 days'/i);
    expect(code).toMatch(/interval\s+'1 day'/i); // the floor guard
  });

  it("is service_role-only — revoked from public/anon/authenticated", () => {
    expect(code).toMatch(
      /revoke execute on function public\.ai_runs_apply_retention\(interval\) from public, anon, authenticated/i,
    );
    expect(code).toMatch(
      /grant execute on function public\.ai_runs_apply_retention\(interval\) to service_role/i,
    );
    // Defense-in-depth in-body gate.
    expect(code).toMatch(/service_role/i);
    expect(code).toMatch(/42501/);
  });

  it("touches no other object — no table/policy DDL, no other table mutated", () => {
    expect(code).not.toMatch(/\b(create|alter|drop)\s+table\b/i);
    expect(code).not.toMatch(/\b(create|drop|alter)\s+policy\b/i);
    // The only table named in executable SQL is ai_runs.
    for (const m of code.match(/\b(?:from|update|into|join)\s+public\.(\w+)/gi) ?? []) {
      expect(m.toLowerCase()).toContain("ai_runs");
    }
  });

  it("is annotated RED and ships a paired rollback with no marker", () => {
    expect(sql).toMatch(/^--[ \t]*@human-gate-approved/m);
    const down = readFileSync(join(ROLLBACKS, MIG.replace(".sql", ".down.sql")), "utf8");
    expect(down).toMatch(/drop function if exists public\.ai_runs_apply_retention\(interval\)/i);
    expect(down).not.toMatch(/^--[ \t]*@human-gate-approved/m);
  });
});
