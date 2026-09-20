import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * R-15 (2026-09-19) — demand collaboration with a FIELD/ACTION boundary.
 *
 * A colleague with `has_org_demand_access` on the need's organization may
 * CLOSE and REOPEN it — through two gated SECURITY DEFINER writes that touch
 * `status` and `updated_at` only. The UPDATE policy stays owner-only, so the
 * requirement set, `payload` (estimate, compensation, accommodation pricing),
 * `agency_client_id`, `notes` and the §19 confirm act remain the creator's.
 * "Widen UPDATE to has_org_demand_access" is exactly what this guard refuses.
 *
 * The migration is RED (owner-gated) and ships its rollback; the app falls
 * back to the owner-only direct update while the RPCs are absent.
 */

const WEB = join(__dirname, "..", "..");
const REPO = join(WEB, "..", "..");
const MIG = "20260919190000_demand_lifecycle_colleague_v1";
const read = (...p: string[]) => readFileSync(join(...p), "utf8");

describe("the migration: two narrow writes, nothing else", () => {
  const up = read(REPO, "supabase", "migrations", `${MIG}.sql`);

  it("defines exactly close_demand_v1 and reopen_demand_v1, SECURITY DEFINER with a pinned search_path", () => {
    expect(up).toContain("create or replace function public.close_demand_v1(p_request_id uuid)");
    expect(up).toContain("create or replace function public.reopen_demand_v1(p_request_id uuid)");
    expect((up.match(/create or replace function/g) ?? []).length).toBe(2);
    expect((up.match(/security definer\s*\n\s*set search_path = public/g) ?? []).length).toBe(2);
  });

  it("authority ladder: admin · creator · has_org_demand_access(organization) — everything else not_found", () => {
    expect((up.match(/elsif public\.has_org_demand_access\(v_org\) then/g) ?? []).length).toBe(2);
    expect((up.match(/elsif v_profile = uid then/g) ?? []).length).toBe(2);
    expect((up.match(/return jsonb_build_object\('outcome', 'not_found'\);/g) ?? []).length).toBeGreaterThanOrEqual(4);
  });

  it("writes ONLY status + updated_at; never payload, agency_client_id, notes or a requirement column", () => {
    const updates = up.match(/update public\.customer_requests[\s\S]*?where id = p_request_id;/g) ?? [];
    expect(updates.length).toBe(2);
    for (const u of updates) {
      expect(u).toMatch(/set status = '(closed|submitted)', updated_at = now\(\)/);
      expect(u).not.toMatch(/payload|agency_client_id|notes|team_size|title|need_summary|organization_id|manual_review_note/);
    }
    // No policy, grant-on-table, trigger or row change rides along.
    expect(up).not.toMatch(/create policy|alter policy|drop policy|grant .* on table|grant (select|insert|update|delete)|create trigger|alter table/i);
  });

  it("transitions are the two the status guard already whitelists, idempotent", () => {
    expect(up).toContain("if v_status = 'closed' then\n    return jsonb_build_object('outcome', 'already_closed');");
    expect(up).toContain("if v_status = 'submitted' then\n    return jsonb_build_object('outcome', 'already_open');");
    expect((up.match(/'invalid_transition'/g) ?? []).length).toBe(2);
  });

  it("is audited, RED-annotated, executable by authenticated only, and ships a rollback that drops both", () => {
    expect(up.startsWith("-- @human-gate-approved")).toBe(true);
    expect(up).toContain("values (uid, 'close_demand', 'customer_requests', p_request_id,");
    expect(up).toContain("values (uid, 'reopen_demand', 'customer_requests', p_request_id,");
    expect(up).toContain("revoke all on function public.close_demand_v1(uuid) from public, anon;");
    expect(up).toContain("grant execute on function public.reopen_demand_v1(uuid) to authenticated;");
    const downPath = join(REPO, "supabase", "rollbacks", `${MIG}.down.sql`);
    expect(existsSync(downPath)).toBe(true);
    const down = read(downPath);
    expect(down).toContain("drop function if exists public.reopen_demand_v1(uuid);");
    expect(down).toContain("drop function if exists public.close_demand_v1(uuid);");
    expect(down).not.toMatch(/create (or replace )?function/);
  });
});

describe("the app: RPC-first with the owner-only fallback; confirm stays the creator's", () => {
  const src = read(WEB, "lib", "demand", "demand-lifecycle.ts");

  it("close and reopen call the gated RPCs and fall back only on 42883 / PGRST202", () => {
    expect(src).toContain('rpc("close_demand_v1", { p_request_id: requestId })');
    expect(src).toContain('rpc("reopen_demand_v1", { p_request_id: requestId })');
    expect(src).toMatch(/RPC_MISSING_CODES[^;]*new Set\(\["42883", "PGRST202"\]\)/);
    // The fallback is the pre-R-15 owner-only write, byte-for-byte in spirit.
    expect((src.match(/\.eq\("profile_id", user\.id\)/g) ?? []).length).toBeGreaterThanOrEqual(3);
  });

  it("the read is the SELECT policy pinned to the active workspace, never a raw org-wide read", () => {
    expect(src).toMatch(/row\.profile_id === user\.id \|\| row\.organization_id === employer\.organizationId/);
  });

  it("the §19 confirm act refuses a non-creator before touching payload", () => {
    const confirm = src.slice(src.indexOf("export async function confirmRecognizedNeed"), src.indexOf("export async function closeDemand"));
    expect(confirm).toContain('if (req.profile_id !== user.id) return { kind: "not-owner" };');
    expect(confirm.indexOf("req.profile_id !== user.id")).toBeLessThan(confirm.indexOf(".update({ payload"));
  });

  it("reopen re-runs the open-needs ceiling BEFORE the RPC, for creator and colleague alike", () => {
    const reopen = src.slice(src.indexOf("export async function reopenDemand"));
    expect(reopen.indexOf("gateOpenNeeds(")).toBeLessThan(reopen.indexOf('rpc("reopen_demand_v1"'));
  });
});

describe("the surface: the organization's needs are listed; only the creator sees the confirm act", () => {
  it("scouting reads own rows OR the active organization's rows and carries ownedByCaller", () => {
    const scouting = read(WEB, "lib", "scouting", "scouting.ts");
    expect((scouting.match(/\.or\(`profile_id\.eq\.\$\{user\.id\},organization_id\.eq\.\$\{[a-z]+\.organizationId\}`\)/g) ?? []).length).toBe(2);
    expect(scouting).toContain("readonly ownedByCaller: boolean;");
    expect((scouting.match(/ownedByCaller: (r|req)\.profile_id === user\.id/g) ?? []).length).toBe(2);
  });

  it("the scouting page offers confirm only to the creator", () => {
    const page = read(WEB, "app", "[locale]", "dashboard", "company", "scouting", "page.tsx");
    expect(page).toMatch(/showConfirm=\{\s*result\.demand\.ownedByCaller &&/);
  });
});
