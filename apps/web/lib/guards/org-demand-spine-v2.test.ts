import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * M-P0-6 — organization demand spine v2 (supersedes PR #1016). Pinned:
 *
 *   1. the migration ships RED — NO `@human-gate-approved` marker until an
 *      owner apply decision is recorded;
 *   2. stamping comes from the VALIDATED workspace via explicit v2 entry
 *      RPCs whose server re-verifies live membership — never from the v1
 *      exactly-one-org GUESS (#1016's resolve_caller_organization_id);
 *   3. downstream (shortlist, booking) INHERITS the demand's organization
 *      through triggers — no client-writable org id exists there;
 *   4. attribution is IMMUTABLE (guard trigger, invoker rights so the raw
 *      authenticated surface is actually caught);
 *   5. the read legs use the §11 capability roles (member excluded) and the
 *      public demand surfaces are untouched;
 *   6. the rollback ARCHIVES attribution before dropping columns;
 *   7. the app calls v2 with the workspace organization and falls back
 *      honestly to v1 while the migration is unapplied.
 */

const WEB = join(__dirname, "..", "..");
const MIGRATION = join(
  WEB, "..", "..", "supabase", "migrations", "20260806200000_org_demand_spine_v2.sql",
);
const ROLLBACK = join(
  WEB, "..", "..", "supabase", "rollbacks", "20260806200000_org_demand_spine_v2.down.sql",
);
const sql = readFileSync(MIGRATION, "utf8");
const down = readFileSync(ROLLBACK, "utf8");
// Executable text only — the header COMMENT legitimately references v1
// (#1016) names while explaining why v2 differs.
const executable = sql
  .split(/\r?\n/)
  .filter((l) => !/^\s*--/.test(l))
  .join("\n");

describe("M-P0-6 v2 migration package", () => {
  it("ships RED — no human-gate marker before an owner apply decision", () => {
    const ANNOTATION = /(^|\r?\n)[ \t]*--[ \t]*@human-gate-approved\b/i;
    expect(ANNOTATION.test(sql)).toBe(false);
    expect(ANNOTATION.test(down)).toBe(false);
  });

  it("stamps from the validated workspace — never the v1 guess", () => {
    expect(sql).toMatch(/submit_demand_request_v2/);
    expect(sql).toMatch(/save_demand_draft_v2/);
    expect(sql).toMatch(/has_org_demand_access\(p_organization_id\)/);
    expect(executable).not.toMatch(/resolve_caller_organization_id/);
  });

  it("demand access = §11 capability roles, member excluded", () => {
    expect(sql).toMatch(
      /m\.role in \('owner','admin','manager','external_manager'\)/,
    );
  });

  it("downstream inherits — no client org parameter below the demand", () => {
    expect(sql).toMatch(/demand_chain_inherit_organization/);
    expect(sql).toMatch(/demand_shortlist_org_inherit/);
    expect(sql).toMatch(/booking_requests_org_inherit/);
    // the v1 booking RPC keeps its signature — inheritance is trigger-borne
    expect(executable).not.toMatch(
      /create or replace function public\.propose_booking_request/i,
    );
  });

  it("attribution is immutable and the guard runs with INVOKER rights", () => {
    expect(sql).toMatch(/organization_attribution_immutable/);
    const guard = sql.slice(
      sql.indexOf("demand_org_attribution_guard"),
      sql.indexOf("drop trigger if exists customer_requests_org_guard"),
    );
    expect(guard).not.toMatch(/security definer/i);
  });

  it("public demand surfaces are untouched (explicit marketplace decision)", () => {
    expect(executable).not.toMatch(/list_open_demand_for_workers/);
    expect(executable).not.toMatch(/list_open_demand_for_agencies/);
    expect(executable).not.toMatch(/contact_demand_owner/);
  });

  it("backfill stamps only unambiguous single-org owners", () => {
    expect(sql).toMatch(/count\(distinct c\.id\) = 1 and count\(distinct o\.id\) = 1/);
  });

  it("rollback archives before dropping", () => {
    expect(down).toMatch(/demand_org_attribution_archive/);
    const archiveIdx = down.indexOf("demand_org_attribution_archive");
    const dropIdx = down.indexOf("drop column if exists organization_id");
    expect(archiveIdx).toBeGreaterThan(-1);
    expect(dropIdx).toBeGreaterThan(archiveIdx);
  });
});

describe("M-P0-6 app-side stamping", () => {
  it("submit passes the workspace organization to v2 with an honest v1 fallback", () => {
    const req = readFileSync(join(WEB, "lib", "demand", "demand-request.ts"), "utf8");
    expect(req).toMatch(/submit_demand_request_v2/);
    expect(req).toMatch(/p_organization_id: employer\.organizationId/);
    expect(req).toMatch(/42883/);
  });

  it("draft save passes the workspace organization to v2 with an honest v1 fallback", () => {
    const drafts = readFileSync(join(WEB, "lib", "demand", "demand-drafts.ts"), "utf8");
    expect(drafts).toMatch(/save_demand_draft_v2/);
    expect(drafts).toMatch(/p_organization_id: organizationId/);
    expect(drafts).toMatch(/42883/);
  });

  it("no app code sends a client-chosen org into shortlist or booking writes", () => {
    const scouting = readFileSync(join(WEB, "lib", "scouting", "scouting.ts"), "utf8");
    const booking = readFileSync(join(WEB, "lib", "booking", "booking-actions.ts"), "utf8");
    expect(scouting).not.toMatch(/organization_id/);
    expect(booking).not.toMatch(/organization_id/);
  });
});
