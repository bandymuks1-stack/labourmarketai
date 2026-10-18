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
    // display_name / headline are read ONLY inside the synthetic-fixture boolean, never returned.
    const flag = /\(coalesce\(w\.display_name, ''\) \|\| ' ' \|\| coalesce\(w\.headline, ''\)\)\s*~\*[^\n]*/;
    expect(select).toMatch(flag);
    expect(select.replace(flag, "")).not.toMatch(IDENTITY);
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

describe("database: indirect identity paths are closed", () => {
  it("the projection carries no profile id and no exact timestamps", () => {
    const projection = fnBody("list_discoverable_worker_profiles_v1");
    const returns = projection.slice(projection.indexOf("returns table"), projection.indexOf("language"));
    expect(returns).not.toMatch(/profile_id|created_at|updated_at/);
    expect(returns).toMatch(/last_active_week date/);
    expect(projection).toMatch(/date_trunc\('week', coalesce\(w\.updated_at, w\.created_at\)\)::date/);
  });

  it("a candidate is named in a candidate thread only by relationship or their own grant", () => {
    const names = fnBody("conversation_counterpart_identities");
    // only candidate threads (opened from scouting / a demand interest) hide a name …
    expect(names).toMatch(/when coalesce\(c\.source_type, ''\) not in \('scouting', 'demand_interest'\) then p\.full_name/);
    // … and only the candidate's (the creator's side is never hidden)
    expect(names).toMatch(/when cp\.profile_id = c\.created_by then p\.full_name/);
    // Owner rule 2026-10-18: writing a message or being shortlisted is NEVER consent.
    expect(names).not.toMatch(/conversation_messages|demand_shortlist/);
    expect(names).toMatch(/when public\.caller_has_worker_relation_v1\(w\.id\) then p\.full_name/);
    expect(names).toMatch(/l\.selected_fields \? 'full_name'/);
    expect(names).toMatch(/else 'Candidate ' \|\|/);
    // the rollback restores the previous body
    expect(rollback).toMatch(/select cp\.conversation_id, p\.full_name\s+from public\.conversation_participants cp/);
  });

  it("the contact door needs the caller's own demand AND a shortlist or interest", () => {
    const door = fnBody("candidate_profile_for_contact_v1");
    expect(door).toMatch(/cr\.profile_id = auth\.uid\(\)/);
    expect(door).toMatch(/from public\.demand_shortlist s/);
    expect(door).toMatch(/from public\.demand_interest_signals i/);
    expect(door).not.toMatch(/worker_profile_discoverable/);
    // a shortlist row alone never reaches a person the caller may not see
    expect(door).toMatch(/public\.can_view_worker\(p_worker_id\)/);
  });

  it("legitimate organization contexts the old predicate missed are kept", () => {
    const relation = fnBody("caller_has_worker_relation_v1");
    expect(relation).toMatch(/o\.legacy_company_id = cw\.company_id[\s\S]*public\.manages_organization\(o\.id\)/);
    expect(relation).toMatch(/o\.legacy_agency_id = aw\.agency_id/);
    expect(relation).toMatch(/from public\.booking_requests b[\s\S]*b\.status = 'accepted'/);
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
    expect(page).toMatch(/profile_id: null,\s*display_name: null,\s*headline: null,/);
  });

  it("scouting merges discovered rows without a name and filters fixtures by flag", () => {
    const match = read("lib/market/match-subject.ts");
    expect(match).toMatch(/readDiscoverableWorkerIds\(supabase, cc, STAGE1_ID_SCAN_CAP\)/);
    expect(match).toMatch(/readDiscoverableWorkerIds\(supabase, null, limit\)/);
    expect(match).toMatch(/workers\.push\(\{\s*\.\.\.row,\s*profile_id: null,\s*display_name: null,\s*headline: null,/);
    expect(match).toMatch(/candidates\.filter\(\(c\) => !c\.syntheticFixture\)/);
  });

  it("server flows reach a found worker only through context-bound doors, never a profile id", () => {
    expect(read("lib/communication/contact-interested-worker.ts")).toContain(
      "candidateProfileForContact(supabase, workerId, requestId)",
    );
    const conv = read("lib/communication/request-worker-conversation.ts");
    expect(conv).toContain("readDiscoverableWorkers(supabase, [workerId])");
    expect(conv).toContain("candidateProfileForContact(supabase, workerId, requestId)");
    expect(read("lib/pipeline/candidate-pipeline-facts.ts")).toContain('"my_direct_conversations_with_workers_v1"');
    expect(read("lib/privacy/contact-disclosure-actions.ts")).toContain('"employer_disclosure_granted_v1"');
    expect(read("lib/capabilities/marketplace-capabilities.ts")).toContain(
      "workerReachable(caller.supabase, d.workerId as string)",
    );
    expect(helper).toContain('rpc("candidate_profile_for_contact_v1"');
  });
});
