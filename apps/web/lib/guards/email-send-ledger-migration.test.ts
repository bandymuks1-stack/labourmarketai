import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * email_send_ledger_v1 migration safety: additive, RLS on with no policy,
 * hash-only recipient, atomic definer RPC with pinned search_path, REVOKE
 * before GRANT, service_role only, paired rollback file.
 */
const REPO = join(__dirname, "..", "..", "..", "..");
const NAME = "20261006130000_email_send_ledger_v1";
const raw = readFileSync(join(REPO, `supabase/migrations/${NAME}.sql`), "utf8");
const code = raw
  .split(/\r?\n/)
  .map((l) => l.replace(/--.*$/, ""))
  .join("\n")
  .toLowerCase();
const SIG = "public.reserve_email_send_v1(uuid, uuid, text, text, integer, integer, integer)";

describe("email send ledger migration", () => {
  it("is additive and idempotent: one table, one function, nothing dropped or altered", () => {
    expect(code).toMatch(/create table if not exists public\.email_send_ledger_v1/);
    expect(code).not.toMatch(/\bdrop\s+(table|column|policy|constraint|trigger|function)\b/);
    expect(code).not.toMatch(/\balter\s+table\s+(?!public\.email_send_ledger_v1)/);
    expect(code).not.toMatch(/\b(update|delete\s+from|truncate)\b/);
    expect(code).not.toMatch(/(^|[;\s])execute\s+(format|'|v_)/);
    expect(code.match(/create index if not exists/g)?.length).toBe(2);
  });
  it("stores a hash only: no email/address/subject/body column, hash shape enforced", () => {
    const table = code.match(/create table if not exists public\.email_send_ledger_v1 \([\s\S]*?\n\);/)![0];
    expect(table).toMatch(/recipient_hash\s+text not null/);
    expect(table).toMatch(/\^\[0-9a-f\]\{64\}\$/);
    expect(table).not.toMatch(/\b(email|address|subject|body|text_body)\b\s+text/);
  });
  it("indexes (organization_id, sent_at) and (recipient_hash, sent_at)", () => {
    expect(code).toMatch(/\(organization_id, sent_at\)/);
    expect(code).toMatch(/\(recipient_hash, sent_at\)/);
  });
  it("RLS enabled with NO policy; no client role privilege", () => {
    expect(code).toMatch(/alter table public\.email_send_ledger_v1 enable row level security/);
    expect(code).not.toMatch(/create policy/);
    for (const r of ["public", "anon", "authenticated"]) {
      expect(code).toContain(`revoke all on table public.email_send_ledger_v1 from ${r}`);
    }
    expect(code).not.toMatch(/grant[^;]*on table public\.email_send_ledger_v1/);
  });
  it("RPC is definer, search_path pinned, atomic (advisory locks, count, insert)", () => {
    const fn = code.match(/create or replace function public\.reserve_email_send_v1[\s\S]*?\$\$;/)![0];
    expect(fn).toMatch(/security definer/);
    expect(fn).toMatch(/set search_path = public, pg_temp/);
    expect(fn).toMatch(/pg_advisory_xact_lock/);
    expect(fn.indexOf("pg_advisory_xact_lock")).toBeLessThan(fn.indexOf("count(*)"));
    expect(fn.indexOf("count(*)")).toBeLessThan(fn.indexOf("insert into public.email_send_ledger_v1"));
    expect(fn).toMatch(/sent_at > v_since/);
  });
  it("REVOKE precedes GRANT; service_role only, never anon/authenticated/public", () => {
    const rp = code.indexOf(`revoke all on function ${SIG} from public`);
    const ra = code.indexOf(`revoke all on function ${SIG} from anon`);
    const rx = code.indexOf(`revoke all on function ${SIG} from authenticated`);
    const g = code.indexOf(`grant execute on function ${SIG} to service_role`);
    expect(rp).toBeGreaterThan(-1);
    expect(ra).toBeGreaterThan(rp);
    expect(rx).toBeGreaterThan(ra);
    expect(g).toBeGreaterThan(rx);
    expect(code).not.toMatch(/grant[^;]*\bto\s+(anon|public|authenticated)\b/);
  });
  it("has the human-gate marker, ROLLBACK heading and paired down file", () => {
    expect(raw).toMatch(/^--\s*@human-gate-approved/m);
    expect(raw).toMatch(/^--\s*ROLLBACK/m);
    expect(existsSync(join(REPO, `supabase/rollbacks/${NAME}.down.sql`))).toBe(true);
  });
  it("the app calls the RPC only via the service-role store module", () => {
    const store = readFileSync(join(__dirname, "..", "email", "send-ledger-store.ts"), "utf8");
    expect(store).toMatch(/createAdminClient/);
    expect(store).toContain('"reserve_email_send_v1"');
  });
});
