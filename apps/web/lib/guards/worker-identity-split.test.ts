import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * WORKER IDENTITY SPLIT (owner command 2026-10-18, migration 20261018160000).
 *
 * A worker found through the employer-visibility consent is anonymous: the raw `workers` row —
 * name, free text, personal circumstances — is readable only by the worker, an admin, or a viewer
 * with a working relationship. Discovery reads ONLY the professional projection. No plan, paid or
 * VIP, opens identity. These assertions pin each half so neither can quietly drift back.
 */
const WEB = join(__dirname, "..", "..");
const ROOT = join(WEB, "..", "..");
const read = (p: string) => readFileSync(join(WEB, p), "utf8");
const sql = readFileSync(
  join(ROOT, "supabase", "migrations", "20261018160000_worker_identity_split_v1.sql"),
  "utf8",
);
const rollback = readFileSync(
  join(ROOT, "supabase", "rollbacks", "20261018160000_worker_identity_split_v1.down.sql"),
  "utf8",
);
const code = sql.replace(/--[^\n]*/g, "");
const fnBody = (name: string) =>
  code.slice(code.indexOf(`function public.${name}`)).split("$$;")[0] ?? "";

const IDENTITY = /display_name|headline|\bbio\b|availability_note|needs_accommodation|trust_score|docs_aggregate_consent/;

describe("database: the row needs a relationship, discovery gets the projection", () => {
  it("is a RED, human-gated migration with a rollback to the previous policy", () => {
    expect(sql).toMatch(/^--\s*@human-gate-approved/m);
    expect(rollback).toMatch(/for select using \(public\.can_view_worker\(id\)\)/);
    expect(rollback).toMatch(/drop function if exists public\.list_discoverable_worker_profiles_v1/);
    expect(rollback).toMatch(/drop function if exists public\.list_discoverable_worker_ids_v1/);
  });

  it("workers_select uses the relationship predicate, which has no discoverability branch", () => {
    expect(code).toMatch(
      /create policy workers_select on public\.workers\s+for select using \(public\.caller_has_worker_relation_v1\(id\)\);/,
    );
    const relation = fnBody("caller_has_worker_relation_v1");
    expect(relation).not.toMatch(/worker_profile_discoverable|is_employer|organization_access_grants|billing/);
    expect(relation).toMatch(/rt\.grants_worker_visibility/);
  });

  it("the projection returns professional fields only — never a name or free text", () => {
    const projection = fnBody("list_discoverable_worker_profiles_v1");
    const returns = projection.slice(projection.indexOf("returns table"), projection.indexOf("language"));
    expect(returns).not.toMatch(IDENTITY);
    const select = projection.slice(projection.indexOf("select w.id"), projection.indexOf("from public.workers w"));
    // display_name is read ONLY inside the synthetic-fixture boolean, never returned.
    expect(select.replace(/coalesce\(w\.display_name, ''\) ~\*[^\n]*/, "")).not.toMatch(IDENTITY);
    expect(projection).toMatch(/public\.worker_profile_discoverable\(w\.profile_id\)/);
    expect(projection).toMatch(/if not \(public\.is_employer\(\) or public\.is_admin\(\)\) then/);
    expect(projection).toMatch(/cardinality\(p_worker_ids\) > 500/);
  });

  it("the id search returns ids only, for discoverable workers, to employers", () => {
    const ids = fnBody("list_discoverable_worker_ids_v1");
    expect(ids).toMatch(/returns table \(id uuid\)/);
    expect(ids).toMatch(/public\.worker_profile_discoverable\(w\.profile_id\)/);
    expect(ids).toMatch(/if not \(public\.is_employer\(\) or public\.is_admin\(\)\) then/);
  });

  it("no paid or VIP branch exists anywhere in the split", () => {
    expect(code).not.toMatch(/billing_subscriptions|organization_access_grants|company_pilot|vip/i);
  });

  it("anon can execute none of the three functions", () => {
    for (const fn of [
      "caller_has_worker_relation_v1(uuid)",
      "list_discoverable_worker_profiles_v1(uuid[])",
      "list_discoverable_worker_ids_v1(text, integer)",
    ]) {
      expect(code).toContain(`revoke all on function public.${fn} from anon;`);
    }
  });
});

describe("app: discovery reads go through the projection and never carry a name", () => {
  const helper = read("lib/visibility/discoverable-workers.ts").replace(/\/\*[\s\S]*?\*\//g, "");

  it("the shared helper asks the definer reads and never selects identity", () => {
    expect(helper).toContain('rpc("list_discoverable_worker_profiles_v1"');
    expect(helper).toContain('rpc("list_discoverable_worker_ids_v1"');
    expect(helper).not.toMatch(/display_name|headline|availability_note/);
  });

  it("the person page falls back to the projection with no name and no headline", () => {
    const page = read("app/[locale]/dashboard/people/[workerId]/page.tsx");
    expect(page).toMatch(/readDiscoverableWorkers\(supabase, \[workerId\]\)/);
    expect(page).toMatch(/display_name: null,\s*headline: null,/);
  });

  it("scouting merges discovered rows without a name and filters fixtures by flag", () => {
    const match = read("lib/market/match-subject.ts");
    expect(match).toMatch(/readDiscoverableWorkerIds\(supabase, cc, STAGE1_ID_SCAN_CAP\)/);
    expect(match).toMatch(/readDiscoverableWorkerIds\(supabase, null, limit\)/);
    expect(match).toMatch(/workers\.push\(\{ \.\.\.row, display_name: null, headline: null \}\)/);
    expect(match).toMatch(/candidates\.filter\(\(c\) => !c\.syntheticFixture\)/);
  });

  it("server-side profile-id resolution covers related and discovered workers", () => {
    for (const f of [
      "lib/communication/contact-interested-worker.ts",
      "lib/pipeline/candidate-pipeline-facts.ts",
      "lib/privacy/contact-disclosure-actions.ts",
    ]) {
      expect(read(f), f).toContain("readWorkerProfileIds(supabase, ");
    }
    expect(read("lib/communication/request-worker-conversation.ts")).toContain(
      "readDiscoverableWorkers(supabase, [workerId])",
    );
    expect(read("lib/capabilities/marketplace-capabilities.ts")).toContain(
      "workerReachable(caller.supabase, d.workerId as string)",
    );
  });
});
