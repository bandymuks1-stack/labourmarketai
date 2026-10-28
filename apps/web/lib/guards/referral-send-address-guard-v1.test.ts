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

  it("the VPS script runs under a non-blocking flock", () => {
    const sh = read("ops/vps/lm-referral-reprocess.sh");
    expect(sh).toMatch(/exec 9>\S+\nflock -n 9 \|\|/);
  });
});
