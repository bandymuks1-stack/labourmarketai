import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * W14 item 6 — the retention SCHEDULER contract.
 *
 * #1091 shipped the capability. A retention policy that depends on someone
 * remembering to call a function is not a retention policy, so this slice adds
 * the caller. What follows pins the properties that make an automatic,
 * privileged, destructive-by-design job safe to leave running unattended.
 *
 * Behaviour is proven against a real database by
 * `scripts/db-proof/w14-retention-schedule.sh` (48/48). These are the static
 * invariants — the ones that rot silently when someone edits the SQL later.
 */

const REPO = join(__dirname, "..", "..", "..", "..");
const MIGRATION = join(
  REPO,
  "supabase",
  "migrations",
  "20260808140000_ai_runs_retention_schedule_v1.sql",
);
const ROLLBACK = join(
  REPO,
  "supabase",
  "rollbacks",
  "20260808140000_ai_runs_retention_schedule_v1.down.sql",
);

const SQL = readFileSync(MIGRATION, "utf8");
const DOWN = readFileSync(ROLLBACK, "utf8");

/** Executable statements only. Both files deliberately NAME the things they
 *  are explaining the absence of — the credentials pg_cron avoids, the
 *  `drop extension` a rollback must not do — and a scan that flagged the
 *  explanation would push the next author to delete the reasoning to go green.
 *  Rules about SQL should read SQL. */
const execOnly = (src: string) =>
  src
    .split(/\r?\n/)
    .filter((l) => !/^\s*--/.test(l))
    .join("\n");

const EXEC = execOnly(SQL);
const DOWN_EXEC = execOnly(DOWN);

describe("the scheduled job is narrow", () => {
  it("runs DAILY and nothing more frequent", () => {
    // A 90-day boundary moves once a day. Anything finer is work without
    // corresponding accuracy, against a privileged capability.
    expect(EXEC).toMatch(/'17 3 \* \* \*'/);
    expect(EXEC, "sub-daily cadence").not.toMatch(/'\*\/\d+ /);
    expect(EXEC, "hourly cadence").not.toMatch(/'0 \* \* \* \*'/);
  });

  it("invokes ONLY the retention wrapper", () => {
    const scheduled = EXEC.match(/cron\.schedule\([\s\S]*?\)\s*;/)?.[0] ?? "";
    expect(scheduled).toContain("run_ai_runs_retention_sweep()");
    // One statement, one call. No batching a second job onto the same tick.
    expect(scheduled.match(/select /gi)?.length ?? 0).toBe(1);
  });

  it("passes NO retention argument, so a scheduler can never shorten the horizon", () => {
    expect(EXEC).toMatch(/redact_expired_ai_run_content\(\s*\)/);
    expect(
      EXEC,
      "the wrapper must not pass a horizon of its own",
    ).not.toMatch(/redact_expired_ai_run_content\(\s*\d/);
  });
});

describe("the job cannot do the things it must never do", () => {
  it("deletes nothing", () => {
    expect(EXEC.toLowerCase()).not.toMatch(/\bdelete\s+from\b/);
    expect(EXEC.toLowerCase()).not.toMatch(/\btruncate\b/);
  });

  it("never writes ai_runs — the telemetry table is a different relation", () => {
    // `into public.ai_runs` is a PREFIX of `into public.ai_runs_retention_sweeps`,
    // so the boundary matters: match the table name with its terminator.
    expect(EXEC.toLowerCase()).not.toMatch(/into\s+public\.ai_runs\s/);
    expect(EXEC.toLowerCase()).toMatch(/into\s+public\.ai_runs_retention_sweeps/);
  });

  it("adds no UPDATE or DELETE grant on ai_runs to any role", () => {
    const grants = EXEC.split(/\r?\n/).filter((l) => /^\s*grant\b/i.test(l));
    for (const g of grants) {
      if (/\bon\s+public\.ai_runs\b/i.test(g)) {
        expect(g, `widened ai_runs: ${g}`).not.toMatch(/\b(update|delete|all)\b/i);
      }
    }
  });

  it("activates no AI provider and holds no credential", () => {
    expect(EXEC).not.toMatch(/AI_PROVIDER|ANTHROPIC|OPENAI|api[_-]?key/i);
    expect(EXEC).not.toMatch(/service_role_key|cron_secret|password|bearer |eyJ[A-Za-z0-9]{6}/i);
    // No outbound anything: pg_net / http would make this a sending path.
    expect(EXEC).not.toMatch(/pg_net|\bhttp\b|net\.http_/i);
  });
});

describe("privilege posture", () => {
  it("the sweep is default-closed — revoked from public, anon AND authenticated", () => {
    for (const role of ["public", "anon", "authenticated"]) {
      expect(
        EXEC,
        `run_ai_runs_retention_sweep not revoked from ${role}`,
      ).toMatch(
        new RegExp(
          `revoke all on function public\\.run_ai_runs_retention_sweep\\(\\) from ${role}`,
          "i",
        ),
      );
    }
    expect(EXEC).toMatch(
      /grant execute on function public\.run_ai_runs_retention_sweep\(\) to service_role/i,
    );
  });

  it("every new definer function pins its search_path", () => {
    const definers = EXEC.split(/create or replace function/i).slice(1);
    const secdef = definers.filter((d) => /security definer/i.test(d));
    expect(secdef.length, "expected the wrapper and the health read").toBeGreaterThan(0);
    for (const d of secdef) {
      expect(d, `unpinned search_path in: ${d.slice(0, 80)}`).toMatch(
        /set search_path = public/i,
      );
    }
  });

  it("the telemetry table is append-only and closed to anon", () => {
    expect(EXEC).toMatch(/revoke all on public\.ai_runs_retention_sweeps from anon/i);
    expect(EXEC).toMatch(
      /revoke insert, update, delete on public\.ai_runs_retention_sweeps from authenticated/i,
    );
    expect(EXEC).toMatch(
      /revoke insert, update, delete on public\.ai_runs_retention_sweeps from service_role/i,
    );
    expect(EXEC).toMatch(/enable row level security/i);
  });
});

describe("telemetry cannot report a success it did not have", () => {
  it("the wrapper has NO exception handler", () => {
    // A handler cannot honestly record its own failure: the telemetry INSERT
    // would be inside the transaction being rolled back. So the semantics are
    // structural instead — a sweep row exists IFF that sweep completed. Adding
    // a handler here would silently convert a broken sweep into a green one.
    const wrapper =
      EXEC.match(
        /create or replace function public\.run_ai_runs_retention_sweep[\s\S]*?\$\$;/i,
      )?.[0] ?? "";
    expect(wrapper, "wrapper not found").not.toBe("");
    expect(wrapper.toLowerCase()).not.toMatch(/\bexception\s+when\b/);
  });

  it("the health read requires POSITIVE evidence and defaults to false", () => {
    const health =
      EXEC.match(
        /create or replace function public\.ai_runs_retention_health[\s\S]*?\$\$;/i,
      )?.[0] ?? "";
    expect(health, "health read not found").not.toBe("");
    // It consults the completed-sweep table AND pg_cron's own run details —
    // either alone can be misleading.
    expect(health).toMatch(/ai_runs_retention_sweeps/);
    expect(health).toMatch(/cron\.job_run_details/);
    expect(health).toMatch(/cron\.job\b/);
    // A NULL anywhere must collapse to false, never to "probably fine".
    expect(health).toMatch(/coalesce\([\s\S]*?false\s*\)/i);
  });
});

describe("the migration is honest about what it is", () => {
  it("ships as an owner-gated draft that is NOT auto-applied", () => {
    expect(SQL).toMatch(/OWNER_APPROVAL_REQUIRED_BEFORE_APPLY/);
    expect(SQL).toMatch(/@human-gate-approved/);
    expect(SQL).toMatch(/Never `db push`/);
  });

  it("has a paired rollback that undoes the schedule but not the capability", () => {
    expect(DOWN_EXEC).toMatch(/cron\.unschedule\('ai-runs-retention-daily'\)/);
    expect(DOWN_EXEC).toMatch(/drop function if exists public\.run_ai_runs_retention_sweep/i);
    expect(DOWN_EXEC).toMatch(/drop table if exists public\.ai_runs_retention_sweeps/i);
    // #1091's capability is not ours to drop.
    expect(DOWN_EXEC).not.toMatch(
      /drop function if exists public\.redact_expired_ai_run_content/i,
    );
    // Dropping a shared extension is never part of a feature rollback.
    expect(DOWN_EXEC).not.toMatch(/drop extension/i);
  });

  it("the rollback guard probes the RELATION, not the extension catalog", () => {
    // Those are different questions. The thing that errors is a missing
    // relation, and an environment can hold one without the other — after a
    // manual `drop extension`, or in a shimmed harness. Probing pg_extension
    // made the rollback silently skip its own unschedule; the DB proof failed
    // on exactly that.
    expect(DOWN_EXEC).toMatch(/to_regclass\('cron\.job'\)/);
    expect(DOWN_EXEC).not.toMatch(/from pg_extension where extname = 'pg_cron'/);
  });

  it("the rollback does not pretend redacted content can come back", () => {
    expect(DOWN).toMatch(/cannot resurrect|stay redacted/i);
  });
});
