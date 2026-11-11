import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * OPERATOR ALERTS (owner decision 2026-11-11, P1). Keeps the shape the owner approved:
 * three service-only functions, the 24/48 h stages from the application's own clock, the ledger
 * states, a GitHub Actions trigger that is inert until switched on, and its own machine secret.
 * Behaviour is proven by scripts/db-proof/operator-application-alerts-v1.sh (PG16) and
 * lib/notifications/operator-alerts.test.ts.
 */
const ROOT = join(__dirname, "..", "..", "..", "..");
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), "utf8");
const NAME = "20261112090000_operator_application_alerts_v1";
const sql = read("supabase", "migrations", `${NAME}.sql`).replace(/^\s*--.*$/gm, "");
const down = read("supabase", "rollbacks", `${NAME}.down.sql`);
const workflow = read(".github", "workflows", "operator-alerts-cadence.yml");
const route = read("apps", "web", "app", "api", "internal", "operator-alerts", "v1", "route.ts");
const auth = read("apps", "web", "lib", "api", "operator-alerts-auth.ts");
const FUNCS = [
  "operator_alerts_due_v1()",
  "operator_alert_recipients_v1(text)",
  "record_operator_alert_v1(text, text, uuid, text, uuid, uuid, text)",
];

describe("the three functions", () => {
  it("are SECURITY DEFINER with a pinned search_path", () => {
    expect(sql.match(/security definer\s+set search_path = public, pg_temp/g)).toHaveLength(3);
  });

  it("are executable by service_role only", () => {
    for (const f of FUNCS) {
      expect(sql).toContain(`revoke all on function public.${f} from public, anon, authenticated;`);
      expect(sql).toContain(`grant execute on function public.${f} to service_role;`);
    }
    expect(sql).not.toMatch(/\bgrant\b[^;]*\b(anon|authenticated)\b/i);
  });

  it("create no table, column or policy and change no existing row", () => {
    expect(sql).not.toMatch(/create table|alter table|create policy|drop policy/i);
    expect(sql).not.toMatch(/\bupdate public\.|\bdelete from\b/i);
  });

  it("the rollback drops the three functions and keeps the audit rows", () => {
    expect(down).toContain("drop function if exists public.operator_alerts_due_v1();");
    expect(down).not.toMatch(/delete|truncate/i);
  });
});

describe("what counts as waiting on a human", () => {
  it("intakes: status new; claims: requested; companies: pending_verification with a request time", () => {
    expect(sql).toMatch(/i\.status = 'new'/);
    expect(sql).toMatch(/c\.state = 'requested'/);
    expect(sql).toMatch(/co\.verification_status = 'pending_verification'/);
    expect(sql).toMatch(/co\.requested_at is not null/);
    expect(sql).not.toMatch(/needs_checks/);
  });

  it("an admin decision after the request stops it; updated_at never sets the clock", () => {
    expect(sql).toMatch(/a\.action = 'admin_set_company_verification'/);
    expect(sql).not.toMatch(/updated_at/);
  });

  it("stages at 24 and 48 hours, and nothing older than 7 days", () => {
    expect(sql).toMatch(/when s\.age_hours < 24 then 'immediate'/);
    expect(sql).toMatch(/when s\.age_hours < 48 then 'reminder_24h'/);
    expect(sql.match(/interval '7 days'/g)?.length).toBe(3);
  });

  it("a request-door intake gets no immediate alert (the door mails the team inbox already)", () => {
    expect(sql).toMatch(/where not \(s\.from_door and s\.age_hours < 24\)/);
  });
});

describe("the ledger", () => {
  it("separates reserved, sent, failed and skipped_no_recipient, with expiry and a retry cap", () => {
    for (const a of ["operator_alert.reserved", "operator_alert.skipped_no_recipient"]) expect(sql).toContain(`'${a}'`);
    expect(sql).toContain("'operator_alert.' || p_event");
    expect(sql).toMatch(/interval '15 minutes'/);
    expect(sql).toMatch(/v_failures >= 5/);
    expect(sql).toMatch(/pg_advisory_xact_lock/);
  });
});

describe("the trigger", () => {
  it("is a GitHub Actions schedule, inert until the owner sets the variable", () => {
    expect(workflow).toMatch(/cron: "\*\/5 \* \* \* \*"/);
    expect(workflow).toMatch(/if: vars\.OPERATOR_ALERTS_SCHEDULE_ENABLED == 'true'/);
    expect(workflow).toMatch(/permissions: \{\}/);
    expect(workflow).toMatch(/environment: operator-alerts/);
    expect(workflow).not.toMatch(/secrets\.CRON_SECRET/);
  });

  it("never overlaps, never echoes the token, and skips cleanly without it", () => {
    expect(workflow).toMatch(/concurrency:\s+group: operator-alerts\s+cancel-in-progress: false/);
    expect(workflow.replace(/^\s*#.*$/gm, "")).not.toMatch(/set -x|set -o xtrace/);
    expect(workflow).toMatch(/::add-mask::\$TOKEN/);
    expect(workflow).toMatch(/Skipped: OPERATOR_ALERTS_TRIGGER_TOKEN is not set[^\n]*GITHUB_STEP_SUMMARY/);
    expect(workflow).toMatch(/exit 0/);
  });

  it("uses its own machine secret, fail-closed, never CRON_SECRET", () => {
    expect(auth).toContain("OPERATOR_ALERTS_TRIGGER_TOKEN");
    expect(auth).toMatch(/MIN_TOKEN_LENGTH = 32/);
    expect(auth).not.toMatch(/process\.env\.CRON_SECRET/);
    expect(route).toContain("authorizeOperatorAlertsTrigger(request)");
  });

  it("the route answers counts and reason codes only and refuses before reserving without SMTP", () => {
    expect(route.indexOf("smtpConfigFromEnv()")).toBeLessThan(route.indexOf("runOperatorAlertSweep("));
    const bodies = route.match(/NextResponse\.json\(\{[^}]*\}/g) ?? [];
    expect(bodies.length).toBeGreaterThan(0);
    for (const b of bodies) expect(b).not.toMatch(/email|profile_id|entity_id|recipient/);
  });
});
