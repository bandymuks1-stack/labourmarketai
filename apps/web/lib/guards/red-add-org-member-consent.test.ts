import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * R-16 (2026-09-19 completion window, HIGH): an organization membership may
 * only be minted for a person who already stands in a consent-backed
 * relationship with that organization.
 *
 * WHAT WAS PROVEN ON PRODUCTION (rolled back): as the real owner of a real
 * company, `add_org_member(<own org>, <worker with NO roster row and NO
 * invitation>)` returned `added` and an ACTIVE `employee` engagement context
 * for that person existed — forged_employee_context_rows = 1. `employee`
 * grants worker visibility, so the forged row satisfies the membership branch
 * of `can_view_worker` (private worker row readable without discoverability
 * consent), appears in the person's own context picker as a claim they never
 * made, and is the row the journal-review toggle acts on. Same class as R-1,
 * one table over: R-1 protects the roster tables, the 2026-09-18 trigger
 * protects `organization_people`; neither reaches this SECURITY DEFINER RPC.
 *
 * THE FIX IS RED (SECURITY DEFINER body change) and lives in
 * supabase/migrations/20260919120000_add_org_member_requires_consented_roster_v1.sql,
 * applied only after the owner's approval. This guard pins what is true
 * regardless of apply state:
 *   1. the migration is the minimum: one function body, the roster
 *      precondition added, no policy / table / row / grant change;
 *   2. its rollback restores the prior body verbatim;
 *   3. the ONLY application caller passes workers it derived from the ACTIVE
 *      ROSTER, so the change cannot break a legitimate path.
 *
 * THE HOSTILE CONTRACT (proven on the NEW body inside a rolled-back
 * transaction on production, 2026-09-19):
 *   FAIL  owner calls add_org_member for a worker with no roster row
 *         → 'not_linked', forged rows = 0
 *   PASS  invite → the WORKER accepts → add_org_member → the employee
 *         context exists (the accept RPC provisions it; add_org_member
 *         reports 'already_member' and stays idempotent) → rows = 1
 */
const REPO = join(__dirname, "..", "..", "..", "..");
const FILE = "20260919120000_add_org_member_requires_consented_roster_v1";
const MIGRATION = join(REPO, "supabase", "migrations", `${FILE}.sql`);
const ROLLBACK = join(REPO, "supabase", "rollbacks", `${FILE}.down.sql`);
const WEB = join(REPO, "apps", "web");

const strip = (sql: string) => sql.replace(/--[^\n]*/g, "");

describe("R-16 migration — the minimum authority correction", () => {
  const raw = readFileSync(MIGRATION, "utf8");
  const sql = strip(raw);

  it("carries the human-gate annotation (RED, never auto-merged)", () => {
    expect(raw).toMatch(/^--\s*@human-gate-approved/m);
  });

  it("replaces exactly ONE function — add_org_member — and nothing else", () => {
    const defs = sql.match(/create or replace function public\.([a-z_0-9]+)/gi) ?? [];
    expect(defs).toEqual(["create or replace function public.add_org_member"]);
    expect(sql).not.toMatch(/create policy|drop policy|alter table|create table|update public|delete from/i);
    expect(sql).not.toMatch(/insert into public\.(?!engagement_contexts|audit_logs)/i);
  });

  it("refuses unless an ACTIVE roster row exists on the organization's legacy company or agency", () => {
    expect(sql).toMatch(/return 'not_linked'/);
    expect(sql).toMatch(/cw\.company_id = o\.legacy_company_id/);
    expect(sql).toMatch(/cw\.worker_id = p_worker_id/);
    expect(sql).toMatch(/cw\.status = 'active'/);
    expect(sql).toMatch(/aw\.agency_id = o\.legacy_agency_id/);
    expect(sql).toMatch(/aw\.status = 'active'/);
    // The check comes BEFORE the existing-member short-circuit and the insert.
    const guardAt = sql.indexOf("return 'not_linked'");
    const insertAt = sql.indexOf("insert into public.engagement_contexts");
    const existingAt = sql.indexOf("return 'already_member'");
    expect(guardAt).toBeGreaterThan(0);
    expect(guardAt).toBeLessThan(existingAt);
    expect(guardAt).toBeLessThan(insertAt);
  });

  it("no actor is exempt — admin included — because consent is the worker's, not a role's", () => {
    // The roster check is unconditional: it is not wrapped in `is_admin() or`.
    const fromCheck = sql.slice(sql.indexOf("if not exists ("), sql.indexOf("return 'not_linked'"));
    expect(fromCheck).not.toMatch(/is_admin/);
  });

  it("keeps the function's privilege floor: authenticated only", () => {
    expect(sql).toMatch(/revoke execute on function public\.add_org_member\(uuid, uuid\) from public, anon/);
    expect(sql).toMatch(/grant execute on function public\.add_org_member\(uuid, uuid\) to authenticated/);
    expect(sql).not.toMatch(/grant[^;]*\bto (anon|public)\b/i);
  });

  it("is reversible: the rollback restores the prior body (no roster precondition) verbatim", () => {
    expect(existsSync(ROLLBACK)).toBe(true);
    const down = strip(readFileSync(ROLLBACK, "utf8"));
    expect(down).toMatch(/create or replace function public\.add_org_member\(p_org_id uuid, p_worker_id uuid\)/);
    expect(down).not.toMatch(/not_linked|legacy_company_id|legacy_agency_id/);
    // The prior body, as 20260824130000 declared it.
    const prior = strip(
      readFileSync(join(REPO, "supabase", "migrations", "20260824130000_null_safe_owner_guards_v2.sql"), "utf8"),
    );
    const priorBody = prior.slice(
      prior.indexOf("CREATE OR REPLACE FUNCTION public.add_org_member"),
      prior.indexOf("end $function$;", prior.indexOf("CREATE OR REPLACE FUNCTION public.add_org_member")),
    );
    for (const line of [
      "if v_existing is not null then return 'already_member'; end if;",
      "values (uid, 'add_org_member', 'engagement_contexts', v_new,",
      "return 'added';",
    ]) {
      expect(priorBody).toContain(line);
      expect(down).toContain(line);
    }
  });
});

describe("the only application caller already passes roster-derived workers", () => {
  it("addOrgMember has ONE caller, the members panel, whose addable list comes from the active roster", () => {
    const callers: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name === "node_modules" || entry.name === ".next") continue;
          walk(full);
        } else if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
          const src = readFileSync(full, "utf8");
          if (/\baddOrgMember\(/.test(src) && !/export async function addOrgMember/.test(src)) {
            callers.push(full.replace(WEB, "").replace(/\\/g, "/"));
          }
        }
      }
    };
    walk(join(WEB, "lib"));
    walk(join(WEB, "app"));
    walk(join(WEB, "components"));
    expect(callers).toEqual(["/components/app/org-members-panel.tsx"]);

    const read = readFileSync(join(WEB, "lib", "operations", "org-members.ts"), "utf8");
    // `addable` = active rows of the legacy link table (company_workers /
    // agency_workers), which since R-1 only the worker's acceptance writes.
    expect(read).toMatch(/const linkTable = kind === "company" \? "company_workers" : "agency_workers";/);
    expect(read).toMatch(/\.from\(linkTable\)[^;]*\.eq\("status", "active"\)/s);
  });

  it("the roster tables themselves are RPC-only since R-1 (the consent this migration carries forward)", () => {
    const r1 = strip(
      readFileSync(join(REPO, "supabase", "migrations", "20260919100000_roster_writes_rpc_only_v1.sql"), "utf8"),
    );
    expect(r1).toMatch(/revoke insert, update, delete on public\.company_workers from authenticated/);
    expect(r1).toMatch(/revoke insert, update, delete on public\.agency_workers from authenticated/);
  });
});
