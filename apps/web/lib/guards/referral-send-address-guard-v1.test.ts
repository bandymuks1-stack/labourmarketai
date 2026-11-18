import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

// Pins the database half of the D-3 referral send guard
// (20261028070000_referral_send_address_guard_v1, RED, NOT applied until the
// owner approves it by name). The behaviour is modelled in
// lib/invitations/external-referral-reprocess.test.ts; this file keeps the SQL
// from silently losing the pieces that model relies on.
const ROOT = join(__dirname, "..", "..", "..", "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8").replace(/\r\n/g, "\n");
const up = read("supabase/migrations/20261028070000_referral_send_address_guard_v1.sql");
const down = read("supabase/rollbacks/20261028070000_referral_send_address_guard_v1.down.sql");
const reissue = up.slice(
  up.indexOf("function public.reissue_external_referral_v1"),
  up.indexOf("function public.mark_external_referral_delivery_v1"),
);

describe("referral send address guard (D-3)", () => {
  it("locks the normalized address before the row, in every reissue", () => {
    const lock = reissue.indexOf("pg_advisory_xact_lock(hashtextextended('referral_send:' || v_email, 0))");
    expect(lock).toBeGreaterThan(-1);
    expect(reissue).toContain("select lower(trim(invited_email)) into v_email");
    expect(lock).toBeLessThan(reissue.indexOf("for update"));
  });

  it("refuses an address already mailed or already reserved, on any partner row", () => {
    expect(reissue).toContain("return 'address_already_sent'");
    expect(reissue).toContain("return 'address_reserved'");
    expect(reissue).toMatch(/lower\(trim\(o\.invited_email\)\) = v_email\s+and o\.delivery_reserved_at is not null/);
  });

  it("a successful reissue reserves; mark clears the reservation", () => {
    expect(reissue).toContain("delivery_reserved_at = now()");
    const mark = up.slice(up.indexOf("function public.mark_external_referral_delivery_v1"));
    expect(mark).toContain("delivery_reserved_at = null");
  });

  it("keeps both functions service_role-only", () => {
    for (const fn of ["reissue_external_referral_v1(uuid, text)", "mark_external_referral_delivery_v1(uuid, text)"]) {
      expect(up).toContain(`revoke all on function public.${fn}\n  from public, anon, authenticated;`);
      expect(up).toContain(`grant execute on function public.${fn}\n  to service_role;`);
    }
  });

  it("the column is additive and the rollback never erases an unknown send outcome", () => {
    expect(up).toContain("add column if not exists delivery_reserved_at timestamptz;");
    expect(down.indexOf("raise exception")).toBeLessThan(down.indexOf("drop column if exists delivery_reserved_at"));
  });

  it("partner intake passes the same address lock before it mails", () => {
    const reserve = up.slice(
      up.indexOf("function public.reserve_external_referral_send_v1"),
      up.indexOf("function public.mark_external_referral_delivery_v1"),
    );
    expect(reserve.indexOf("pg_advisory_xact_lock(hashtextextended('referral_send:' || v_email, 0))")).toBeLessThan(
      reserve.indexOf("for update"),
    );
    expect(reserve).toContain("return 'address_already_sent'");
    expect(reserve).toContain("return 'address_reserved'");
    expect(reserve).toContain("set delivery_reserved_at = now()");
    const intake = read("apps/web/lib/invitations/external-referral-receive.ts");
    expect(intake).toContain('rpc("reserve_external_referral_send_v1"');
    expect(intake).toMatch(/isTransactionalEmailConfigured\(\) && \(await mayMailAddress\(admin, invitationId\)\)/);
    expect(down).toContain("drop function if exists public.reserve_external_referral_send_v1(uuid);");
  });

  it("every replaced function pins search_path with pg_temp last", () => {
    expect(up.match(/security definer\nset search_path = public, pg_temp\nas \$\$/g)).toHaveLength(6);
  });

  it("recovery never mails: ledger row → sent, none and older than 15 min → released, else in flight", () => {
    const resolve = up.slice(
      up.indexOf("function public.resolve_external_referral_reservation_v1"),
      up.indexOf("function public.mark_external_referral_delivery_v1"),
    );
    expect(resolve.indexOf("pg_advisory_xact_lock(hashtextextended('referral_send:' || v_email, 0))")).toBeLessThan(
      resolve.indexOf("for update"),
    );
    expect(resolve).toMatch(/l\.kind = 'invitation'\s+and l\.recipient_hash = p_ledger_hash\s+and l\.sent_at >= v_row\.delivery_reserved_at - interval '1 minute'/);
    expect(resolve.indexOf("return 'resolved_sent'")).toBeLessThan(resolve.indexOf("return 'in_flight'"));
    expect(resolve.indexOf("return 'in_flight'")).toBeLessThan(resolve.indexOf("return 'released'"));
    expect(resolve).toContain("interval '15 minutes'");
    const run = read("apps/web/lib/invitations/external-referral-reprocess-run.ts");
    const rec = run.slice(run.indexOf("async function resolveReservations"));
    expect(rec).not.toMatch(/guardedSendTransactionalEmail|send\(/);
    expect(rec).toContain("hashRecipient(r.invited_email as string)");
  });

  it("the runner leaves reserved addresses out before choosing (v3, falls back to v2)", () => {
    const run = read("apps/web/lib/invitations/external-referral-reprocess-run.ts");
    expect(run).toContain('rpc("external_referral_reprocess_candidates_v3")');
    expect(run).toContain("reservedEmails,");
    expect(down).toContain("drop function if exists public.external_referral_reprocess_candidates_v3();");
    expect(down).toContain("drop function if exists public.resolve_external_referral_reservation_v1(uuid, text);");
  });

  it("referral sends fail closed without a ledger row; recovery lists reserved rows of any status", () => {
    for (const f of ["external-referral-receive.ts", "external-referral-reprocess-run.ts"]) {
      expect(read(`apps/web/lib/invitations/${f}`)).toContain('{ kind: "invitation", requireLedger: true }');
    }
    const store = read("apps/web/lib/email/send-ledger-store.ts");
    expect(store).toContain('if (requireLedger && decision.degraded) return { status: "failed", reason: "ledger_unavailable" };');
    const rows = up.slice(
      up.indexOf("function public.external_referral_reserved_rows_v1"),
      up.indexOf("function public.resolve_external_referral_reservation_v1"),
    );
    expect(rows).toMatch(/where i\.external_source_slug is not null\s+and i\.delivery_reserved_at is not null;/);
    expect(rows).not.toContain("status = 'pending'");
    const run = read("apps/web/lib/invitations/external-referral-reprocess-run.ts");
    expect(run.slice(run.indexOf("async function resolveReservations"))).toContain('rpc("external_referral_reserved_rows_v1")');
    expect(down).toContain("drop function if exists public.external_referral_reserved_rows_v1();");
  });

  it("follow-up 20261028090000: recovery counts only THIS reservation's ledger row (no backward window)", () => {
    const fix = read("supabase/migrations/20261028090000_resolve_reservation_exact_window_v1.sql");
    expect(fix).toContain("and l.sent_at >= v_row.delivery_reserved_at;");
    expect(fix).not.toContain("interval '1 minute'");
    expect(fix).toContain("set search_path = public, pg_temp");
    expect(fix).toContain("revoke all on function public.resolve_external_referral_reservation_v1(uuid, text)\n  from public, anon, authenticated;");
    const back = read("supabase/rollbacks/20261028090000_resolve_reservation_exact_window_v1.down.sql");
    expect(back).toContain("delivery_reserved_at - interval '1 minute'");
  });

  it("the VPS script runs under a non-blocking flock", () => {
    const sh = read("ops/vps/lm-referral-reprocess.sh");
    expect(sh).toMatch(/exec 9>\S+\nflock -n 9 \|\|/);
  });
});
