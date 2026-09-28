import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The two edges of a REOPENED booking (owner decision 2026-09-28): changed
 * terms that are not accepted leave a truthful state, and expiry never
 * expires a booking that was reopened just now or rewrites an accepted one.
 */
const MIG = readFileSync(
  join(__dirname, "..", "..", "..", "..", "supabase", "migrations", "20260928181000_booking_reopen_lifecycle_edges_v1.sql"),
  "utf8",
);

describe("reopened booking lifecycle edges", () => {
  it("a reopened booking closed without re-acceptance ends ONLY the engagement it minted", () => {
    const fn = MIG.slice(MIG.indexOf("create or replace function public.booking_reopened_close_ends_engagement"));
    expect(fn).toMatch(/old\.status = 'proposed'/);
    expect(fn).toMatch(/new\.status in \('declined', 'withdrawn', 'expired'\)/);
    // only when it had been reopened from an acceptance
    expect(fn).toMatch(/e\.from_status = 'accepted'\s+and e\.to_status = 'proposed'/);
    expect(fn).toMatch(/where source_booking_id = new\.id\s+and status = 'active'/);
    expect(MIG).toMatch(/after update of status on public\.booking_requests/);
  });

  it("expiry is timed from the latest proposal and still touches only 'proposed' rows", () => {
    const fn = MIG.slice(MIG.indexOf("create or replace function public.expire_stale_booking_requests_v1"));
    expect(fn).toMatch(/e\.to_status = 'proposed'\),\s+br\.created_at\)/);
    expect(fn).toMatch(/where br\.status = 'proposed'/);
    expect(fn).toMatch(/where id = r\.id and status = 'proposed'/);
  });
});
