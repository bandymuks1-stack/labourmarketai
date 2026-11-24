/**
 * Guard — MP-3 worker demand structured_v2 exposure draft pair (marketplace
 * precision Phase 2). Pins that the draft migration:
 *  1. stays human-gated (needs-human-gate + @human-gate-approved visible);
 *  2. exposes structured data ONLY through the SQL-side whitelist helper —
 *     never the raw payload cluster;
 *  3. NEVER projects a free-text key to workers (notes, worksite_type,
 *     certificates, right_to_work, title/need_summary stay out);
 *  4. keeps the standing exclusions (no address_text/locality, no contacts);
 *  5. has a rollback restoring the exact prior column list and dropping the
 *     helper.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO = join(__dirname, "..", "..", "..", "..");
const MP3 = "20260711330000_worker_demand_structured_v2_exposure";
const up = readFileSync(join(REPO, "supabase", "migrations", `${MP3}.sql`), "utf8");
const down = readFileSync(join(REPO, "supabase", "rollbacks", `${MP3}.down.sql`), "utf8");

describe("MP-3 structured exposure pair", () => {
  it("stays human-gated with the no-auto-apply doctrine visible", () => {
    expect(up).toContain("needs-human-gate");
    expect(up).toContain("@human-gate-approved");
    expect(up).toContain("Never `db push`");
  });

  it("exposure goes ONLY through the whitelist helper, never raw payload", () => {
    expect(up).toContain(
      "public.demand_structured_v2_public(cr.payload -> 'structured_v2')",
    );
    // The RPC body must not select the raw cluster or whole payload directly
    // — every payload access stays scoped to the four known keys.
    const rpcBody = up.slice(up.indexOf("create or replace function public.list_open_demand_for_workers"));
    expect(rpcBody).not.toMatch(
      /cr\.payload(?!\s*->>?\s*'(structured_v2|accommodation|transport|required_tools)')/,
    );
  });

  it("no free-text key is ever projected to workers", () => {
    const helper = up.slice(
      up.indexOf("create or replace function public.demand_structured_v2_public"),
      up.indexOf("-- 2. Recreate"),
    );
    for (const banned of [
      "'worksite_type'",
      "'right_to_work_notes'",
      "'required_permits'",
      "'overtime_rate_note'",
      "'bonuses_note'",
      "'note'",
      "'certificates'",
      "'education'",
      "'equipment_permissions'",
      "'physical_conditions'",
      "'medical_prerequisites'",
      "'rotation_pattern'",
      "'holiday_pay_note'",
      "'agreement_note'",
    ]) {
      expect(helper, `helper must not project ${banned}`).not.toContain(
        `${banned},`,
      );
    }
    // Standing RPC exclusions stay intact — checked in the SQL body only
    // (the doc header may NAME the exclusions).
    const sqlBody = up.slice(up.indexOf("\nbegin;"));
    expect(sqlBody).not.toMatch(/need_summary/);
    expect(sqlBody).not.toMatch(/cr\.title/);
    expect(sqlBody).not.toMatch(/address_text/);
    expect(sqlBody).not.toMatch(/cdl\.locality/);
  });

  it("every projected enum key is validated against a closed set", () => {
    const helper = up.slice(
      up.indexOf("create or replace function public.demand_structured_v2_public"),
      up.indexOf("-- 2. Recreate"),
    );
    // Spot-pin the closed sets that make the projection safe.
    expect(helper).toContain(
      "('employment','temporary_assignment','project_work','subcontract','service_request')",
    );
    expect(helper).toContain("('gross','net','unspecified')");
    expect(helper).toContain("in ('day','night','weekend')");
    expect(helper).toContain("in ('B','BE','C','CE','D')");
    expect(helper).toContain("('en','lt','lv','et','nl','de','da','no','sv','pl','ru')");
    expect(helper).toContain("in ('A1','A2','B1','B2','C1','C2')");
    expect(helper).toContain("('active_vacancy','talent_pool')");
  });

  it("rollback restores the prior 12-column definition and drops the helper", () => {
    expect(down).toContain("drop function if exists public.demand_structured_v2_public(jsonb)");
    expect(down).toContain("required_tools text[]");
    expect(down).not.toContain("structured     jsonb");
    expect(down).toContain("'approved_direct_partner'::text as route_status");
  });
});
