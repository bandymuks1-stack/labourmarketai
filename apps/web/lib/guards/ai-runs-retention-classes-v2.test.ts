/**
 * ai_runs retention CLASSES v2 — static pins over the migration, the rollback,
 * the app-layer reads and the privacy register.
 *
 * Runtime behaviour is proven by scripts/db-proof/ai-runs-retention-classes.sh
 * (scratch PostgreSQL, real migrations verbatim). These pins keep a later edit
 * from quietly undoing the four things a reviewer must be able to trust:
 *   1. ONE retention mechanism (the #1259 duplicate failure mode);
 *   2. security/audit metadata and evidence provenance are never redacted;
 *   3. no capability is added (no grant on ai_runs, no DELETE);
 *   4. the migration does not approve itself.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(process.cwd(), "..", "..");
const NAME = "20261003150800_ai_runs_retention_classes_v2";
const sql = readFileSync(join(ROOT, "supabase", "migrations", `${NAME}.sql`), "utf8");
const down = readFileSync(join(ROOT, "supabase", "rollbacks", `${NAME}.down.sql`), "utf8");
const strip = (t: string) =>
  t.split(/\r?\n/).filter((l) => !/^\s*--/.test(l)).join("\n");
const exec = strip(sql);

/** Columns of public.ai_runs as the audit migration + later ALTERs define them. */
const AI_RUNS_COLUMNS = [
  "id", "created_at", "task_type", "provider", "model_alias", "model_id",
  "prompt_version", "tier", "route_reason", "locale", "input_source",
  "data_categories_sent", "output_excerpt", "schema_validation", "confidence",
  "estimated_cost_usd", "actual_cost_usd", "input_tokens", "output_tokens",
  "latency_ms", "fallback_applied", "fallback_reason", "escalation_applied",
  "blocked_reason", "human_review_state", "profile_id", "request_context",
];

function policyRows(): { cls: string; col: string; action: string }[] {
  const body = exec.match(/ai_runs_retention_policy\(\)[\s\S]*?\) as t\(/i)![0];
  return [...body.matchAll(/\('(\w+)',\s*'(\w+)',\s*[^,]+,\s*'(\w+)'\)/g)].map((m) => ({
    cls: m[1],
    col: m[2],
    action: m[3],
  }));
}

describe("the registry classifies every ai_runs column exactly once", () => {
  const rows = policyRows();
  it("covers exactly the live column set", () => {
    expect(rows.map((r) => r.col).sort()).toEqual([...AI_RUNS_COLUMNS].sort());
  });
  it("uses the four owner classes and nothing else", () => {
    expect([...new Set(rows.map((r) => r.cls))].sort()).toEqual([
      "ai_content", "evidence_provenance", "security_audit", "subject_linkage",
    ]);
  });
  it("only AI content and subject linkage ever age out", () => {
    const nulled = rows.filter((r) => r.action === "null").map((r) => r.col).sort();
    expect(nulled).toEqual(["output_excerpt", "profile_id"]);
    for (const r of rows.filter((r) => r.cls === "security_audit" || r.cls === "evidence_provenance")) {
      expect(r.action, `${r.col} must be retained`).toBe("retain");
    }
  });
  it("evidence provenance is exactly the proposal-state columns", () => {
    expect(rows.filter((r) => r.cls === "evidence_provenance").map((r) => r.col).sort()).toEqual([
      "confidence", "human_review_state", "prompt_version", "schema_validation",
    ]);
  });
});

describe("one canonical sweep, extended in place", () => {
  it("replaces redact_expired_ai_run_content; adds no second sweep or cron job", () => {
    expect(exec).toMatch(/create or replace function public\.redact_expired_ai_run_content\(/i);
    expect(exec).not.toMatch(/ai_runs_apply_retention/i);
    expect(exec).not.toMatch(/cron\.schedule/i);
    expect(exec).not.toMatch(/run_ai_runs_retention_sweep/i);
  });
  it("de-links profile_id and clears output_excerpt, and nothing else", () => {
    const upd = exec.match(/update public\.ai_runs\s+set([\s\S]*?)where/i)![1];
    expect(upd).toMatch(/output_excerpt\s*=/i);
    expect(upd).toMatch(/profile_id\s*=/i);
    for (const keep of ["request_context", "task_type", "prompt_version", "human_review_state", "actual_cost_usd"]) {
      expect(upd, `${keep} must not be redacted by the sweep`).not.toMatch(new RegExp(keep, "i"));
    }
  });
  it("keeps the approved floor", () => {
    expect(exec).toMatch(/using errcode = '22023'/i);
  });
});

describe("the table enforces its own classes", () => {
  it("has a BEFORE UPDATE trigger that only permits moving to NULL", () => {
    expect(exec).toMatch(/create trigger ai_runs_enforce_retention_classes\s+before update on public\.ai_runs/i);
    expect(exec).toMatch(/may only be redacted to NULL/i);
    expect(exec).toMatch(/may only be de-linked to NULL/i);
  });
});

describe("no capability is added; it does not approve itself", () => {
  it("grants nothing on the ai_runs table and never deletes rows", () => {
    expect(exec).not.toMatch(/grant\s+[^;]*\bon\s+(table\s+)?public\.ai_runs\b/i);
    expect(exec).not.toMatch(/delete\s+from\s+public\.ai_runs\b/i);
  });
  it("erasure + sweep are service_role only; export is authenticated only", () => {
    expect(exec).toMatch(/grant execute on function public\.ai_runs_delink_subject\(uuid\) to service_role/i);
    expect(exec).toMatch(/revoke all on function public\.ai_runs_delink_subject\(uuid\) from authenticated/i);
    expect(exec).toMatch(/grant execute on function public\.redact_expired_ai_run_content\(integer\) to service_role/i);
    expect(exec).toMatch(/grant execute on function public\.privacy_export_ai_runs_subject_v1\(\) to authenticated/i);
    expect(exec).not.toMatch(/to anon/i);
  });
  it("export read never selects free-form content", () => {
    const fn = exec.match(/privacy_export_ai_runs_subject_v1\(\)\s+returns[\s\S]*?order by/i)![0];
    expect(fn).not.toMatch(/output_excerpt|route_reason/i);
    expect(fn).toMatch(/auth\.uid\(\)/i);
  });
  it("is not annotated human-gate-approved and says it is a draft", () => {
    expect(exec).not.toMatch(/@human-gate-approved/i);
    expect(sql).toMatch(/needs-human-gate/);
  });
  it("ships a rollback that restores the live one-column sweep", () => {
    const d = strip(down);
    expect(d).toMatch(/drop trigger if exists ai_runs_enforce_retention_classes/i);
    expect(d).toMatch(/set output_excerpt = null\s+where/i);
    expect(d).not.toMatch(/profile_id\s*=\s*null/i);
  });
  it("has a proof script", () => {
    expect(readdirSync(join(ROOT, "scripts", "db-proof"))).toContain("ai-runs-retention-classes.sh");
  });
});

describe("app layer tolerates de-linked rows and keeps the export honest", () => {
  const writer = readFileSync(join(process.cwd(), "lib", "ai", "runtime", "audit-store.ts"), "utf8");
  const reg = readFileSync(join(process.cwd(), "lib", "privacy", "personal-relations.ts"), "utf8");
  it("profile_id is already nullable at write time", () => {
    expect(writer).toMatch(/readonly profile_id: string \| null/);
  });
  it("no application code reads profile_id or output_excerpt back from ai_runs", () => {
    const readers = [
      join(process.cwd(), "lib", "admin", "ai-cost.ts"),
      join(process.cwd(), "scripts", "generate-activation-report.ts"),
    ];
    for (const f of readers) {
      const src = readFileSync(f, "utf8");
      const aiRunsSelects = [
        ...src.matchAll(/from(?:Any)?\("ai_runs"\)\s*\.select\(([^)]*)\)/g),
      ].map((m) => m[1]);
      expect(aiRunsSelects.length, `${f} must still read ai_runs`).toBeGreaterThan(0);
      for (const sel of aiRunsSelects) {
        expect(sel, f).not.toMatch(/\b(profile_id|output_excerpt|request_context)\b/);
      }
    }
  });
  it("ai_runs is exported through the subject-safe function, no longer withheld wholesale", () => {
    expect(reg).toMatch(/table: "ai_runs",\s+key: "profile_id",\s+rpc: "privacy_export_ai_runs_subject_v1"/);
    expect(reg).not.toMatch(/table: "ai_runs",\s+reason:/);
  });
});
