import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Booking expiry runs on its own (CAL-6, 2026-10-21). The admin RPC needs a
 * signed-in admin, so no scheduler could ever call it; the system function is
 * reachable ONLY by the database owner (pg_cron), never by an API caller, and
 * expires exactly what the admin function would.
 */
const ROOT = join(__dirname, "..", "..", "..", "..", "supabase");
const MIG = readFileSync(join(ROOT, "migrations", "20261021130000_booking_expiry_system_schedule_v1.sql"), "utf8");
const DOWN = readFileSync(join(ROOT, "rollbacks", "20261021130000_booking_expiry_system_schedule_v1.down.sql"), "utf8");
const ADMIN = readFileSync(join(ROOT, "migrations", "20260928181000_booking_reopen_lifecycle_edges_v1.sql"), "utf8");

const body = (src: string, fn: string) => {
  const from = src.indexOf(`create or replace function public.${fn}`);
  return src.slice(from, src.indexOf("$function$;", from));
};

describe("system booking expiry", () => {
  const sys = body(MIG, "expire_stale_booking_requests_system_v1");

  it("no API caller can reach it: every role but the owner loses EXECUTE, nothing is granted", () => {
    expect(MIG).toMatch(
      /revoke all on function public\.expire_stale_booking_requests_system_v1\(integer\)\s+from public, anon, authenticated, service_role;/,
    );
    expect(MIG).not.toMatch(/grant execute on function public\.expire_stale_booking_requests_system_v1/);
  });

  it("selects and updates exactly like the admin function", () => {
    const admin = body(ADMIN, "expire_stale_booking_requests_v1");
    const selection = (s: string) => s.slice(s.indexOf("where br.status = 'proposed'"), s.indexOf("limit 500") + 9);
    expect(selection(sys)).toBe(selection(admin));
    expect(sys).toMatch(/where id = r\.id and status = 'proposed'/);
  });

  it("the event names the lapsed proposer and says the system expired it", () => {
    expect(sys).toContain("values (r.id, r.owner_id, 'expired', 'proposed', 'expired', 'no_response', 'system_expiry')");
    expect(sys).not.toContain("auth.uid()");
  });

  it("is scheduled once a day by pg_cron, and the rollback removes job and function", () => {
    expect(MIG).toMatch(/cron\.schedule\(\s+'booking-expiry-daily',\s+'11 4 \* \* \*',\s+\$job\$select public\.expire_stale_booking_requests_system_v1\(14\)\$job\$/);
    expect(DOWN).toContain("perform cron.unschedule('booking-expiry-daily');");
    expect(DOWN).toContain("drop function if exists public.expire_stale_booking_requests_system_v1(integer);");
  });
});
