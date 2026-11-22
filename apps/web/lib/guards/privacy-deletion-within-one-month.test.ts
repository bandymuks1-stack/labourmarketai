/**
 * GUARD — a confirmed account-deletion request is erased within one month of
 * receipt (GDPR Art. 12(3) / 17(1)); the 30-day cooling-off may not carry it
 * past that limit. Static checks on the RED migration
 * 20261122160000_privacy_deletion_within_one_month_v1 and its rollback.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(__dirname, "../../../..");
const N = "20261122160000_privacy_deletion_within_one_month_v1";
const up = readFileSync(resolve(ROOT, `supabase/migrations/${N}.sql`), "utf8");
const down = readFileSync(resolve(ROOT, `supabase/rollbacks/${N}.down.sql`), "utf8");

describe("account deletion within one month", () => {
  it("one rule: the cooling-off, capped 3 days before one month from receipt, never before confirmation", () => {
    expect(up).toContain("when p_confirmed is null then null");
    expect(up).toContain("greatest(\n      p_confirmed,\n      least(p_confirmed + public.privacy_account_deletion_grace(),");
    expect(up).toContain("coalesce(p_received, p_confirmed) + interval '1 month' - interval '3 days'))");
    expect(up).toMatch(/returns timestamptz\s+language sql\s+stable/);
  });

  it("the runner and the holder's status both use it; confirmation is still required", () => {
    expect(up).toContain("join public.privacy_erasure_confirmations_v1 c on c.request_id = cr.id");
    expect(up).toContain("and public.privacy_account_deletion_due_at(cr.created_at, c.confirmed_at) <= now()");
    expect(up).toContain("'scheduled_erasure_at', public.privacy_account_deletion_due_at(r.created_at, v_confirmed),");
    expect(up).not.toContain("c.confirmed_at <= now() - public.privacy_account_deletion_grace()");
  });

  it("no client may call the helper; the rollback restores both bodies", () => {
    expect(up).toContain("revoke all on function public.privacy_account_deletion_due_at(timestamptz, timestamptz) from public, anon, authenticated;");
    expect(down).toContain("c.confirmed_at <= now() - public.privacy_account_deletion_grace()");
    expect(down).toContain("'scheduled_erasure_at', v_confirmed + public.privacy_account_deletion_grace(),");
    expect(down).toContain("drop function if exists public.privacy_account_deletion_due_at(timestamptz, timestamptz);");
  });
});
