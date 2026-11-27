import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * HIRE-5 (owner addendum 2026-11-23): an accepted booking (a direct hire) is a
 * work relationship with the company, so it reaches projects, the journal, the
 * employer's review and the Living CV. Pins migration 20261123113700 (RED, NOT
 * applied) and its rollback.
 */
const REPO = join(__dirname, "..", "..", "..", "..");
const strip = (sql: string): string => sql.replace(/--[^\n]*/g, "");
const N = "20261123113700_booking_hire_opens_work_relationship_v1";
const RAW = readFileSync(join(REPO, `supabase/migrations/${N}.sql`), "utf8");
const UP = strip(RAW).toLowerCase();
const DOWN = strip(readFileSync(join(REPO, `supabase/rollbacks/${N}.down.sql`), "utf8")).toLowerCase();

describe("a direct hire opens the work relationship (HIRE-5)", () => {
  it("one trigger on the booking ledger, not a fifth copy of the booking-accept bodies", () => {
    expect(UP).toMatch(/create trigger booking_hire_opens_relationship\s+after insert or update of status on public\.company_worker_engagements/);
    expect(UP).toMatch(/create trigger booking_hire_closes_relationship\s+after update of status on public\.company_worker_engagements/);
    expect(UP).not.toMatch(/create or replace function public\.respond_booking_request/);
  });

  it("no new table: the employment model stays engagement_contexts", () => {
    expect(UP).not.toMatch(/create table/);
  });

  it("the type is 'collaborator', never 'employee' (a booking does not prove employment)", () => {
    expect(UP).toMatch(/v_slug\s+constant text := 'collaborator';/);
    expect(UP).not.toMatch(/'employee'/);
  });

  it("an existing relationship is reused; only one the hire opened ends with it", () => {
    expect(UP).toMatch(/where profile_id = v_profile and organization_id = v_org and status = 'active'/);
    expect(UP).toMatch(/a\.action = 'booking_hire_relationship_opened'/);
  });

  it("the organization is resolved like the booking accept, never guessed", () => {
    expect(UP).toMatch(/join public\.organizations o on o\.id = cr\.organization_id and o\.legacy_company_id = new\.company_id/);
    expect(UP).toMatch(/where o\.legacy_company_id = new\.company_id\) <> 1 then\s+v_org := null;/);
  });

  it("no app role calls the trigger functions; RED with no approval marker; the rollback refuses once used", () => {
    expect(UP).toMatch(/revoke all on function public\.booking_hire_open_relationship_v1\(\) from public, anon, authenticated;/);
    expect(UP).toMatch(/revoke all on function public\.booking_hire_close_relationship_v1\(\) from public, anon, authenticated;/);
    expect(RAW).not.toMatch(/@human-gate-approved/);
    expect(DOWN).toMatch(/raise exception 'hires already opened work relationships/);
  });
});
