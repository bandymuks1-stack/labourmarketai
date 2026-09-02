/**
 * ai_runs retention — SUBJECT DE-LINKING (owner direction 2026-08-24).
 *
 * "AI technical telemetry must not become a second permanent copy of a
 * person's professional history."
 *
 * `redact_expired_ai_run_content` cleared `output_excerpt` and stopped, so past
 * the 90-day horizon `ai_runs` still held a live FK to `profiles` plus the
 * agent key — a permanent, per-person, timestamped index of every AI run
 * someone was the subject of. This slice extends the SAME canonical function
 * to clear those two as well.
 *
 * These are STATIC pins over the migration text. They cannot prove the
 * function's runtime behaviour — that is what `scripts/db-proof/` is for — but
 * they can prove the four things a reviewer most needs to trust, and that a
 * later edit cannot quietly undo:
 *
 *   1. one function, not a second retention mechanism (the #1259 failure mode);
 *   2. no new capability — no grant widened, no table UPDATE added;
 *   3. cost history survives (owner decision D2);
 *   4. it does not approve itself.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(process.cwd(), "..", "..");
const MIGRATION = join(
  REPO_ROOT,
  "supabase",
  "migrations",
  "20260824170000_ai_runs_retention_delink_subject_v1.sql",
);
const ROLLBACK = join(
  REPO_ROOT,
  "supabase",
  "rollbacks",
  "20260824170000_ai_runs_retention_delink_subject_v1.down.sql",
);

const sql = readFileSync(MIGRATION, "utf8");
const down = readFileSync(ROLLBACK, "utf8");
/** Comments narrate; only executable lines bind. */
const exec = sql
  .split(/\r?\n/)
  .filter((l) => !/^\s*--/.test(l))
  .join("\n");

describe("the subject is de-linked past the horizon", () => {
  it("clears all three columns in ONE update", () => {
    expect(exec).toMatch(/set\s+output_excerpt\s*=\s*null/i);
    expect(exec).toMatch(/profile_id\s*=\s*null/i);
    expect(exec).toMatch(/request_context\s*=\s*null/i);
    // One statement, so no row can ever be half-redacted by a partial failure.
    expect(exec.match(/update\s+public\.ai_runs/gi)?.length).toBe(1);
  });

  it("stays idempotent — a second sweep over the same rows changes nothing", () => {
    // Widened with the update: predicating on `output_excerpt is not null`
    // alone would skip a row already redacted by the OLD one-column rule and
    // leave its profile_id linked forever.
    expect(exec).toMatch(/output_excerpt\s+is not null/i);
    expect(exec).toMatch(/or\s+profile_id\s+is not null/i);
    expect(exec).toMatch(/or\s+request_context\s+is not null/i);
  });

  it("only ever touches rows past the horizon", () => {
    expect(exec).toMatch(
      /where\s+created_at\s*<\s*now\(\)\s*-\s*make_interval\(days\s*=>\s*v_days\)/i,
    );
  });
});

describe("the carried-over guarantees are carried over", () => {
  it("keeps the 90-day floor and its errcode", () => {
    expect(exec).toMatch(/v_days\s*<\s*public\.ai_runs_retention_days\(\)/i);
    expect(exec).toMatch(/errcode\s*=\s*'22023'/i);
  });

  it("keeps SECURITY DEFINER pinned to a fixed search_path", () => {
    expect(exec).toMatch(/security definer/i);
    expect(exec).toMatch(/set search_path\s*=\s*public/i);
  });

  it("does not touch the sweep wrapper or the retention horizon function", () => {
    // The scheduler must keep calling with NO argument, and 90 must stay 90.
    expect(exec).not.toMatch(/create or replace function public\.run_ai_runs_retention_sweep/i);
    expect(exec).not.toMatch(/create or replace function public\.ai_runs_retention_days/i);
  });
});

describe("no capability is added", () => {
  it("adds no UPDATE or DELETE on the table for any role", () => {
    // The append-only grant posture is the guarantee `ai_runs` exists to give.
    expect(exec).not.toMatch(/grant\s+[^;]*\b(update|delete)\b[^;]*\bon\s+(table\s+)?public\.ai_runs\b/i);
  });

  it("grants EXECUTE to service_role and to nobody else", () => {
    for (const role of ["public", "anon", "authenticated"]) {
      expect(
        exec,
        `not revoked from ${role}`,
      ).toMatch(
        new RegExp(
          `revoke all on function public\\.redact_expired_ai_run_content\\(integer\\) from ${role}`,
          "i",
        ),
      );
    }
    expect(exec).toMatch(
      /grant execute on function public\.redact_expired_ai_run_content\(integer\) to service_role/i,
    );
    expect(exec).not.toMatch(/grant execute[^;]*to (anon|authenticated)/i);
  });
});

describe("cost history survives (owner decision D2)", () => {
  it("clears no cost or operational column", () => {
    // What is lost after 90 days is only WHOSE run it was. Everything that
    // answers an operational or accounting question is retained forever.
    for (const col of [
      "actual_cost_usd",
      "estimated_cost_usd",
      "input_tokens",
      "output_tokens",
      "latency_ms",
      "task_type",
      "provider",
      "model_id",
      "created_at",
    ]) {
      expect(exec, `${col} must survive`).not.toMatch(
        new RegExp(`${col}\\s*=\\s*null`, "i"),
      );
    }
  });

  it("deletes no row — REDACT-NOT-DELETE is unchanged", () => {
    expect(exec).not.toMatch(/delete\s+from\s+public\.ai_runs/i);
    expect(exec).not.toMatch(/truncate/i);
  });
});

describe("it is a draft, and it does not approve itself", () => {
  it("carries the needs-human-gate header", () => {
    expect(sql).toMatch(/DRAFT — needs-human-gate — DO NOT APPLY/);
  });

  it("does NOT carry a self-added @human-gate-approved marker", () => {
    // The owner gave the direction; nobody has approved this SQL. Writing the
    // marker here would be the agent approving its own privacy change.
    expect(sql).not.toMatch(/^\s*--\s*@human-gate-approved/m);
  });
});

describe("the rollback restores the rule rather than removing it", () => {
  it("re-creates the one-column body instead of dropping the function", () => {
    // Dropping it would take the whole retention capability with it and leave
    // the daily cron calling something that no longer exists.
    expect(down).toMatch(/create or replace function public\.redact_expired_ai_run_content/i);
    expect(down).not.toMatch(/drop function[^;]*redact_expired_ai_run_content/i);
  });

  it("restores exactly the pre-change behaviour — one column, same floor", () => {
    const downExec = down
      .split(/\r?\n/)
      .filter((l) => !/^\s*--/.test(l))
      .join("\n");
    expect(downExec).toMatch(/set\s+output_excerpt\s*=\s*null\s*\n?\s*where/i);
    expect(downExec).not.toMatch(/profile_id\s*=\s*null/i);
    expect(downExec).not.toMatch(/request_context\s*=\s*null/i);
    expect(downExec).toMatch(/errcode\s*=\s*'22023'/i);
  });
});
