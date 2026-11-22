import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

// Pins 20261029190000_worker_board_need_skill_slugs_v1 (RED, PREPARED for the
// owner gate — owner decisions 2026-10-29 "APPROVED — PREPARE RED MIGRATION
// ONLY", then "APPROVED — PRODUCTION APPLY" at dbd1363ef). The worker reader gains the need's required skills as
// CATALOGUE SLUGS and changes nothing else; its rollback restores the
// 20261028123000 body byte-for-byte.
const ROOT = join(__dirname, "..", "..", "..", "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8").replace(/\r\n/g, "\n");
const NAME = "20261029190000_worker_board_need_skill_slugs_v1";
const PRIOR = "20261028123000_synthetic_demand_cross_org_readers_v1";
const up = read(`supabase/migrations/${NAME}.sql`);
const down = read(`supabase/rollbacks/${NAME}.down.sql`);
const prior = read(`supabase/migrations/${PRIOR}.sql`);

/** The `CREATE OR REPLACE FUNCTION public.list_open_demand_for_workers()` … `$function$;` block. */
function workersBlock(sql: string): string {
  const start = sql.indexOf("CREATE OR REPLACE FUNCTION public.list_open_demand_for_workers()");
  if (start < 0) throw new Error("no worker reader definition");
  const end = sql.indexOf("$function$;", sql.indexOf("AS $function$", start) + 13) + "$function$;".length;
  return sql.slice(start, end);
}

const GRANTS = [
  "revoke all on function public.list_open_demand_for_workers() from public, anon;",
  "grant execute on function public.list_open_demand_for_workers() to authenticated;",
].join("\n");
const NO_SERVICE_ROLE = "revoke all on function public.list_open_demand_for_workers() from service_role;";

const PREDICATE = [
  "     and (v_sees_fixtures",
  "          or not public.demand_is_synthetic_fixture_v1(cr.organization_id, cr.profile_id)",
  "          or cr.profile_id = uid",
  "          or coalesce(public.has_org_demand_access(cr.organization_id), false))",
].join("\n");

const priorBlock = workersBlock(prior);
const newBlock = workersBlock(up);

describe(`${NAME} — the forward migration`, () => {
  it("is one transaction: drop, create, grants (return type widened → DROP + CREATE)", () => {
    expect(up.trimStart().startsWith("--")).toBe(true);
    const body = up.replace(/^--.*$/gm, "");
    expect(body.indexOf("begin;")).toBeGreaterThanOrEqual(0);
    expect(body.indexOf("drop function if exists public.list_open_demand_for_workers();")).toBeGreaterThan(body.indexOf("begin;"));
    expect(body.indexOf("CREATE OR REPLACE FUNCTION public.list_open_demand_for_workers()")).toBeGreaterThan(
      body.indexOf("drop function if exists"),
    );
    expect(body).toContain(GRANTS);
    expect(body, "the same ACL as production, whatever the default privileges").toContain(NO_SERVICE_ROLE);
    expect(body.trimEnd().endsWith("commit;")).toBe(true);
  });

  it("carries the owner's production-apply approval for this migration only", () => {
    expect(up).toMatch(/^-- @human-gate-approved \(owner, 2026-10-29, .*#2887 at dbd1363ef.*this migration only.*\)$/m);
  });

  it("keeps the caller gate, SECURITY DEFINER, search_path, verified-company join and the synthetic predicate", () => {
    expect(newBlock).toContain(" STABLE SECURITY DEFINER\n SET search_path TO 'public'");
    expect(newBlock).toContain("raise exception 'Not authenticated' using errcode = '42501';");
    expect(newBlock).toContain("return; -- not a worker -> empty, never an error surface");
    expect(newBlock).toContain("v_sees_fixtures := public.is_synthetic_viewer_v1();");
    expect(newBlock).toContain("     and c.verification_status = 'verified'");
    expect(newBlock).toContain("and (cr.kind is null or cr.kind in ('company_request', 'buyer_request'))");
    expect(newBlock).toContain(PREDICATE);
    expect(newBlock).toContain("   limit 100;");
  });

  it("adds exactly two columns at the END of the return type", () => {
    const priorReturns = /RETURNS TABLE\((.*)\)\n/.exec(priorBlock)![1];
    const newReturns = /RETURNS TABLE\((.*)\)\n/.exec(newBlock)![1];
    expect(newReturns).toBe(`${priorReturns}, need_skill_slugs text[], need_skill_source text`);
  });

  it("changes nothing else in the prior body (removing the additions gives it back exactly)", () => {
    let stripped = newBlock
      .replace(", need_skill_slugs text[], need_skill_source text)", ")")
      .replace(
        /           as structured,\n         -- THE NEED'S REQUIRED SKILLS[\s\S]*?ns\.source as need_skill_source\n/,
        "           as structured\n",
      )
      .replace(/    -- 1\. the company's confirmed set; 2\. the set derived at intake\.\n[\s\S]*?    \) ns\n/, "");
    stripped = stripped.replace(/\n+$/, "");
    expect(stripped).toBe(priorBlock.replace(/\n+$/, ""));
  });

  it("projects catalogue slugs only: every slug re-checked against active public.skills, never need text", () => {
    const additions = newBlock.slice(newBlock.indexOf("-- THE NEED'S REQUIRED SKILLS"), newBlock.indexOf("   where cr.status = 'submitted'"));
    expect(additions.match(/exists \(select 1 from public\.skills s\n\s+where s\.slug = v and s\.is_active is not false\)/g)).toHaveLength(2);
    // The employer's private words never enter the reader.
    for (const col of ["need_summary", "cr.notes", "cr.title", "description", "'skills'", "payload ->> 'role'"]) {
      expect(newBlock).not.toContain(col);
    }
    // Closed source set; human first.
    expect(additions).toContain("'esco_mapped', 'recognized_from_text', 'profession_expanded'");
    expect(additions).toContain("when nsr.human_slugs is not null then 'human_structured'");
  });
});

describe(`${NAME} — the rollback`, () => {
  it("drops the widened reader and restores the 20261028123000 block byte-for-byte, with its grants", () => {
    expect(down).toContain("drop function if exists public.list_open_demand_for_workers();");
    expect(down.indexOf("drop function if exists")).toBeLessThan(down.indexOf("CREATE OR REPLACE FUNCTION"));
    expect(workersBlock(down)).toBe(priorBlock);
    expect(down).toContain(`${priorBlock}\n\n${GRANTS}`);
    expect(down).toContain(NO_SERVICE_ROLE);
    expect(down.trimEnd().endsWith("commit;")).toBe(true);
    expect(down.replace(/^--.*$/gm, "")).not.toContain("need_skill");
  });
});

// The ONE SQL dependant of the function (production pg_depend): the RLS
// policy demand_interest_signals_worker_insert of 20261021095100. DROP FUNCTION
// refuses while it exists, so both directions drop it first and recreate it
// VERBATIM after the function — never loosened, never left out.
describe(`${NAME} — the dependent worker-insert policy`, () => {
  const source = read("supabase/migrations/20261021095100_demand_interest_worker_writes_v1.sql");
  const start = source.indexOf("drop policy if exists demand_interest_signals_worker_insert");
  const create = source.indexOf("create policy demand_interest_signals_worker_insert", start);
  const end = source.indexOf("  );\n", create) + "  );".length;
  const DROP = source.slice(start, create).trimEnd();
  const CREATE = source.slice(create, end);

  it("is the latest definition of the policy (no later migration redefines it)", () => {
    expect(CREATE).toContain("public.list_open_demand_for_workers() b");
    expect(CREATE).toContain("to authenticated");
  });

  for (const [label, sql] of [
    ["forward", up],
    ["rollback", down],
  ] as const) {
    it(`${label}: drop policy → drop function → create function → grants → the SAME policy text`, () => {
      const body = sql.replace(/^--.*$/gm, "");
      const iDropPolicy = body.indexOf(DROP);
      const iDropFn = body.indexOf("drop function if exists public.list_open_demand_for_workers();");
      const iCreateFn = body.indexOf("CREATE OR REPLACE FUNCTION public.list_open_demand_for_workers()");
      const iGrant = body.indexOf(GRANTS);
      const iCreatePolicy = body.indexOf(CREATE);
      expect(iDropPolicy).toBeGreaterThan(body.indexOf("begin;"));
      expect(iDropFn).toBeGreaterThan(iDropPolicy);
      expect(iCreateFn).toBeGreaterThan(iDropFn);
      expect(iGrant).toBeGreaterThan(iCreateFn);
      expect(iCreatePolicy).toBeGreaterThan(iGrant);
      expect(body.indexOf("commit;")).toBeGreaterThan(iCreatePolicy);
      // Exactly one policy touched, exactly once.
      expect(body.match(/create policy/gi)).toHaveLength(1);
      expect(body.match(/drop policy/gi)).toHaveLength(1);
    });
  }
});
