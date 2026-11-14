import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * PLATFORM E-MAIL DELIVERY (owner P0 2026-11-13) — the shape that must not drift.
 *
 *   - the migration is additive, service_role-only, and stores no personal data;
 *   - every send site goes through the ONE delivery control (one event, one
 *     e-mail, outcome recorded) — no caller talks to the mail server itself;
 *   - the recipient of an internal notice is configuration, not a literal;
 *   - nothing is sent to the person who wrote a no-signup request;
 *   - the retry sweep is a machine-authenticated route that creates no event.
 */
const APP = join(__dirname, "..", "..");
const REPO = join(APP, "..", "..");
const app = (p: string) => readFileSync(join(APP, p), "utf8");
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");

const NAME = "20261113220000_platform_email_deliveries_v1";
const sql = readFileSync(join(REPO, `supabase/migrations/${NAME}.sql`), "utf8")
  .split(/\r?\n/)
  .map((l) => l.replace(/--.*$/, ""))
  .join("\n")
  .toLowerCase();

describe("the migration", () => {
  it("is additive: one new table, two new nullable columns, nothing dropped or rewritten", () => {
    expect(sql).toMatch(/create table if not exists public\.platform_email_deliveries_v1/);
    expect(sql.match(/add column if not exists/g)).toHaveLength(2);
    expect(sql).toMatch(/add column if not exists status_changed_at timestamptz;/);
    expect(sql).toMatch(/add column if not exists status_changed_by uuid;/);
    expect(sql).not.toMatch(/\bdrop\s+(table|column|policy|constraint|trigger|function)\b/);
    expect(sql).not.toMatch(/\b(delete\s+from|truncate|insert\s+into)\b/);
    expect(sql).not.toMatch(/\bupdate\s+public\./);
    expect(sql).not.toMatch(/create (or replace )?function|security definer|create trigger|create policy|alter policy/);
    expect(sql).not.toMatch(/not null[^,]*status_changed/);
  });

  it("the record holds no address, name, subject or body — an event key, an outcome, a count", () => {
    const table = sql.match(/create table if not exists public\.platform_email_deliveries_v1 \(([\s\S]*?)\n\);/)![1];
    const columns = [...table.matchAll(/^\s{2}([a-z_]+)\s+(uuid|text|integer|timestamptz)/gm)].map((m) => m[1]);
    expect(columns).toEqual([
      "id", "event_key", "kind", "audience", "subject_id", "locale", "status", "attempts",
      "last_error", "message_id", "next_attempt_at", "created_at", "updated_at", "sent_at",
    ]);
    expect(table).not.toMatch(/\b(email|address|recipient|name|subject|body|html|payload)\b\s+(text|jsonb)/);
    // an error is a machine code, never a server's reply text
    expect(table).toContain("last_error ~ '^[a-z0-9_]{1,60}$'");
  });

  it("one event, one row: the event key is unique", () => {
    expect(sql).toMatch(/constraint platform_email_deliveries_v1_event_key_uq unique \(event_key\)/);
  });

  it("the closed sets match the application", () => {
    const delivery = app("lib/email/platform-email-delivery.ts");
    for (const kind of ["company_registration_notice", "company_welcome", "intake_alert"]) {
      expect(sql).toContain(`'${kind}'`);
      expect(delivery).toContain(`"${kind}"`);
    }
    for (const status of ["sending", "sent", "retry_wait", "failed", "suppressed"]) {
      expect(sql).toContain(`'${status}'`);
      expect(delivery).toContain(`"${status}"`);
    }
    // attempts are bounded in the database too
    expect(sql).toMatch(/attempts >= 0 and attempts <= 20/);
    expect(delivery).toMatch(/export const MAX_ATTEMPTS = 5;/);
  });

  it("RLS on with NO policy; no client role holds anything; every grant is to service_role", () => {
    expect(sql).toMatch(/alter table public\.platform_email_deliveries_v1 enable row level security/);
    for (const role of ["public", "anon", "authenticated"]) {
      expect(sql).toContain(`revoke all on table public.platform_email_deliveries_v1 from ${role}`);
    }
    const grants = [...sql.matchAll(/\bgrant\b[\s\S]*?;/g)].map((m) => m[0]);
    expect(grants).toHaveLength(6);
    for (const g of grants) expect(g).toMatch(/to service_role;$/);
    expect(sql).not.toMatch(/to (anon|authenticated|public)\b/);
    expect(sql).not.toMatch(/\bgrant (all|delete)/);
  });

  it("the reads it grants are column-scoped to what the e-mails are made of", () => {
    expect(sql).toMatch(/grant select \(id, legal_name, display_name, country, owner_profile_id, legacy_company_id, organization_type\)\s+on public\.organizations to service_role/);
    expect(sql).toMatch(/grant select \(full_name\) on public\.profiles to service_role/);
    expect(sql).toMatch(/grant select \(organization_id, status\) on public\.customer_requests to service_role/);
    expect(sql).toMatch(/grant update \(status_changed_at, status_changed_by\) on public\.company_need_public_intakes to service_role/);
    expect(sql).toMatch(/grant execute on function public\.email_is_verified_v1\(uuid, text\) to service_role/);
    // the composer selects nothing beyond them
    const store = code(app("lib/email/platform-email-delivery-store.ts"));
    expect(store).toContain('.select("id, legal_name, display_name, country, owner_profile_id")');
    expect(store).toContain('.select("id, email, full_name, locale")');
    expect(store).toContain('.select("id, source_path, company_name")');
    expect(store).toContain('.select("organization_id", { count: "exact", head: true })');
  });

  it("takes its locks with a timeout, so a busy table fails the apply instead of stalling writes", () => {
    expect(sql).toMatch(/begin;\s*set local lock_timeout = '5s';/);
    expect(sql.indexOf("set local lock_timeout")).toBeLessThan(sql.indexOf("create table"));
  });

  it("status_changed_by has no foreign key, and the migration says why", () => {
    expect(sql).not.toMatch(/status_changed_by uuid\s+references/);
    expect(sql).not.toMatch(/foreign key\s*\(\s*status_changed_by/);
    const header = readFileSync(join(REPO, `supabase/migrations/${NAME}.sql`), "utf8");
    expect(header).toContain("WITHOUT A FOREIGN KEY, ON PURPOSE");
    expect(header).toMatch(/erasure executor/);
  });
});

/**
 * THE ROLLBACK (independent security review 2026-11-14, P2): it must not remove
 * a privilege this migration did not create, and it must not delete data.
 */
describe("the rollback", () => {
  const path = join(REPO, `supabase/rollbacks/${NAME}.down.sql`);
  const raw = existsSync(path) ? readFileSync(path, "utf8") : "";
  const down = raw.split(/\r?\n/).map((l) => l.replace(/--.*$/, "")).join("\n").toLowerCase();

  it("exists and carries no approval marker", () => {
    expect(existsSync(path)).toBe(true);
    expect(raw).not.toContain("@human-gate-approved");
  });

  it("REFUSES while a delivery record or a who/when record exists — before anything is dropped", () => {
    expect(down).toContain("raise exception 'rollback refused: platform_email_deliveries_v1 contains delivery records'");
    expect(down).toContain("raise exception 'rollback refused: company_need_public_intakes holds status-change records (who/when)'");
    expect(down).toMatch(/if exists \(select 1 from public\.platform_email_deliveries_v1\)/);
    expect(down).toMatch(/where status_changed_at is not null or status_changed_by is not null/);
    const lastRefusal = down.lastIndexOf("raise exception");
    for (const destructive of ["drop table", "drop column"]) {
      expect(down.indexOf(destructive)).toBeGreaterThan(lastRefusal);
    }
    // one transaction: a refusal leaves the schema exactly as it was
    expect(down.trim().startsWith("begin;")).toBe(true);
    expect(down.trim().endsWith("commit;")).toBe(true);
  });

  it("never deletes, empties or rewrites a row to get past its own refusal", () => {
    expect(down).not.toMatch(/\b(delete\s+from|truncate|update\s+public\.)/);
    expect(down).not.toMatch(/\bcascade\b/);
  });

  it("revokes ONLY a privilege on an object this migration created", () => {
    const revokes = [...down.matchAll(/\brevoke\b[\s\S]*?;/g)].map((m) => m[0].replace(/\s+/g, " "));
    expect(revokes).toEqual([
      "revoke update (status_changed_at, status_changed_by) on public.company_need_public_intakes from service_role;",
    ]);
    // the four grants on objects that existed before are left alone…
    for (const preExisting of ["public.organizations", "public.profiles", "public.customer_requests", "email_is_verified_v1"]) {
      expect(down).not.toContain(preExisting);
    }
    // …and the file tells the operator exactly how to remove them on evidence
    for (const manual of [
      "revoke execute on function public.email_is_verified_v1(uuid, text) from service_role;",
      "revoke select (organization_id, status) on public.customer_requests from service_role;",
      "revoke select (full_name) on public.profiles from service_role;",
    ]) {
      expect(raw).toContain(`--      ${manual}`);
    }
    expect(readFileSync(join(REPO, `supabase/migrations/${NAME}.sql`), "utf8")).toContain("from information_schema.column_privileges");
  });

  it("drops exactly the one table and the two columns, never `status` or the intake table", () => {
    expect(down.match(/drop table if exists public\.[a-z0-9_]+/g)).toEqual(["drop table if exists public.platform_email_deliveries_v1"]);
    expect(down.match(/drop column if exists [a-z_]+/g)).toEqual([
      "drop column if exists status_changed_by",
      "drop column if exists status_changed_at",
    ]);
  });

  it("can be run twice, and waits for a lock no longer than the migration does", () => {
    expect(down).toContain("to_regclass('public.platform_email_deliveries_v1') is not null");
    expect(down).toContain("from information_schema.columns");
    expect(down).toMatch(/begin;\s*set local lock_timeout = '5s';/);
  });
});

describe("every send goes through the one delivery control", () => {
  it("the company registration hook sits inside the creation condition and is never awaited", () => {
    const src = app("lib/company/company-setup.ts");
    const start = src.indexOf("if (existing.kind === \"ok\" && (!existing.row || existing.row.legalName === null)) {");
    expect(start).toBeGreaterThan(0);
    const block = src.slice(start, src.indexOf("// Funnel \"useful organization\"", start));
    expect(block).toContain("FUNNEL_EVENTS.organizationCreated");
    expect(block).toContain("void deliverCompanyRegistrationEmails({ companyId: data }).catch(() => {});");
    // …and nowhere else: an edit can never send either e-mail
    expect(src.match(/deliverCompanyRegistrationEmails\(/g)).toHaveLength(1);
  });

  it("no existing company is e-mailed on deploy: nothing enumerates companies or backfills events", () => {
    // The two company e-mails are raised in exactly one place (the creation
    // branch of saveCompanySetup, above). Nothing else in the app names those
    // kinds, and neither the delivery core nor the store reads a list of
    // organizations to create events from.
    const walk = (dir: string): string[] =>
      readdirSync(join(APP, dir), { withFileTypes: true }).flatMap((e) =>
        e.isDirectory() ? (e.name === "node_modules" || e.name.startsWith(".") ? [] : walk(join(dir, e.name))) : /\.(ts|tsx)$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) ? [join(dir, e.name)] : [],
      );
    const raisers = [...walk("lib"), ...walk("app")].filter((f) => /deliverCompanyRegistrationEmails\(|kind: "company_(welcome|registration_notice)"/.test(code(app(f))));
    expect(raisers.sort()).toEqual(["lib/company/company-setup.ts", "lib/email/platform-email-delivery-store.ts"]);
    const store = code(app("lib/email/platform-email-delivery-store.ts"));
    // the store raises them only inside deliverCompanyRegistrationEmails, for the one company it is given
    expect(store.match(/kind: "company_(welcome|registration_notice)"/g)).toHaveLength(2);
    expect(store).not.toMatch(/from\("organizations"\)\s*\.select\([^)]*\)\s*\.(order|limit|range)\(/);
    const sweep = code(app("lib/email/platform-email-delivery.ts"));
    expect(sweep.slice(sweep.indexOf("export async function retryDueDeliveries"))).not.toContain("claimNew");
  });

  it("both no-signup paths raise the same alert and neither talks to the mail server itself", () => {
    for (const file of ["lib/staffing/request-door-actions.ts", "lib/staffing/company-need-form-actions.ts"]) {
      const src = code(app(file));
      expect(src).toContain("notifyTeamOfStoredIntake(");
      expect(src).not.toMatch(/sendSmtp|smtpConfigFromEnv|sendTransactionalEmail/);
      expect(src).not.toMatch(/@labourmarket\.ai/);
    }
    const alert = code(app("lib/staffing/intake-alert.ts"));
    expect(alert).toContain('deliverPlatformEmail({ kind: "intake_alert", subjectId: intakeId })');
  });

  it("an internal notice's recipient is configuration; a request's sender is never a recipient", () => {
    const store = code(app("lib/email/platform-email-delivery-store.ts"));
    expect(store).toContain('addressFromEnv("LM_OWNER_NOTIFY_EMAIL", env)');
    expect(store).toContain('addressFromEnv("LM_SUPPORT_REPLY_TO", env)');
    // exactly three composed recipients: owner mailbox twice, the proven account once
    expect(store.match(/\bto: ownerNotifyAddress\(env\)/g)).toHaveLength(2);
    expect(store.match(/\bto: address\b/g)).toHaveLength(1);
    // …and that one address is verified by the platform's ONE rule, never by a
    // session, the JWT or email_confirmed_at
    expect(store).toContain('.rpc("email_is_verified_v1", { p_profile_id: profileId, p_email: address })');
    expect(store).not.toMatch(/email_confirmed_at|getUserById|user\.email/);
    expect(store).not.toMatch(/contact_email/);
    expect(app("../../.env.example")).toMatch(/^LM_OWNER_NOTIFY_EMAIL=info@labourmarket\.ai$/m);
  });

  it("nothing in these e-mails is commercial: no campaign, tracking or unsubscribe machinery", () => {
    const all = code(["lib/email/company-registration-emails.ts", "lib/email/platform-email-delivery-store.ts", "lib/email/platform-email-delivery.ts"].map(app).join("\n"));
    expect(all).not.toMatch(/utm_|campaign|newsletter|promo|unsubscribe|tracking|pixel/i);
  });

  it("the retry sweep is machine-authenticated, read by the VPS cron, and creates no event", () => {
    const route = app("app/api/cron/platform-email-retry/route.ts");
    expect(route).toContain("authorizeCronRequest(request)");
    expect(code(route)).not.toMatch(/headers\.get\(|deliverPlatformEmail|deliverEvent/);
    const sweep = code(app("lib/email/platform-email-delivery.ts"));
    const body = sweep.slice(sweep.indexOf("export async function retryDueDeliveries"));
    expect(body).not.toContain("claimNew");
    expect(readFileSync(join(REPO, "ops/vps/labourmarket.cron"), "utf8")).toMatch(/^\*\/10 \* \* \* \* root sh \/root\/lm-prod\/bin\/lm-cron\.sh platform-email-retry$/m);
    expect(readFileSync(join(REPO, "ops/vps/lm-cron.sh"), "utf8")).toMatch(/\|platform-email-retry\)/);
  });

  it("the delivery core stays pure: no database, no mail server, no environment", () => {
    const core = code(app("lib/email/platform-email-delivery.ts"));
    expect(core).not.toMatch(/^import /m);
    expect(core).not.toMatch(/process\.env|createAdminClient|sendSmtp|console\./);
  });
});
