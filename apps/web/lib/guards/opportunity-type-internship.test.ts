/**
 * Guard: internship / apprenticeship are CANONICAL opportunity types
 * (owner direction 2026-09-03) — one more value on the existing structured
 * demand contract, never a parallel student job system.
 *
 * Pins: the TS union carries both; the SQL projection allowlist carries both
 * (migration 20260903130000) and the rollback restores the previous five;
 * the projection function in the migration is otherwise byte-identical to
 * the one the rollback restores (only the one list differs).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { OPPORTUNITY_TYPES } from "@/lib/demand/structured-demand-v2";

const repo = resolve(__dirname, "..", "..", "..", "..");
const read = (rel: string) => readFileSync(resolve(repo, rel), "utf8");

const MIG = "supabase/migrations/20260903130000_opportunity_type_internship_apprenticeship_v1.sql";
const DOWN = "supabase/rollbacks/20260903130000_opportunity_type_internship_apprenticeship_v1.down.sql";
const OLD_LIST = "('employment','temporary_assignment','project_work','subcontract','service_request')";
const NEW_LIST =
  "('employment','temporary_assignment','project_work','subcontract','service_request',\n           'internship','apprenticeship')";

describe("internship / apprenticeship — canonical opportunity types", () => {
  it("the TS union carries both, after the five original values", () => {
    expect([...OPPORTUNITY_TYPES]).toEqual([
      "employment",
      "temporary_assignment",
      "project_work",
      "subcontract",
      "service_request",
      "internship",
      "apprenticeship",
    ]);
  });

  it("the SQL projection allowlist is widened by exactly those two values, and the rollback restores the five", () => {
    const mig = read(MIG);
    const down = read(DOWN);
    expect(mig).toContain(NEW_LIST);
    // executable text only — the ROLLBACK comment is allowed to quote the old list
    expect(mig.replace(/--[^\n]*/g, "")).not.toContain(OLD_LIST);
    expect(down).toContain(OLD_LIST);
    expect(down.replace(/--[^\n]*/g, "")).not.toContain("'internship'");
  });

  it("the migration is GREEN by shape: plain IMMUTABLE SQL, no definer, no grant, no data change", () => {
    const code = read(MIG).replace(/--[^\n]*/g, "");
    expect(code).toMatch(/create or replace function public\.demand_structured_v2_public\(p jsonb\)/);
    expect(code).toMatch(/immutable/i);
    expect(code).not.toMatch(/security\s+definer|(^|\s)(grant|revoke)\s+|\binsert\b|\bupdate\b|\bdelete\b|\bdrop\b/i);
  });

  it("only the one list differs between the migration's function and the rollback's function", () => {
    const fnOf = (s: string) => {
      const start = s.indexOf("create or replace function public.demand_structured_v2_public(p jsonb)");
      const end = s.indexOf("$$;", start) + 3;
      return s.slice(start, end);
    };
    const migFn = fnOf(read(MIG)).replace(NEW_LIST, OLD_LIST);
    const downFn = fnOf(read(DOWN));
    expect(migFn).toBe(downFn);
  });
});
