import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * Pins for migration M1 of the historical timesheet import (PR-3):
 * `supabase/migrations/20260924100000_historical_timesheet_m1.sql`, its
 * rollback, and the rolled-back production dry run
 * `docs/design/historical-timesheet-m1-dryrun.sql`.
 *
 * Design: `docs/design/historical-timesheet-import-v3.md` §8 (P1–P9, P7
 * split i/u/d, NO select restriction on project_clients), §14 (M1a–M1i),
 * §15 row PR-3. Owner rules 2026-09-23: nothing dropped, loosened or
 * rewritten; no new SECURITY DEFINER, no trigger, no service-role grant;
 * restrictive CREATE POLICY only, no `(true)` predicate; the CHECK widenings
 * are drop + re-add with the FULL old list plus the new value.
 *
 * Every detector here is exercised on a planted mutant (negative control),
 * so a passing guard is a guard that fires.
 */

const REPO_ROOT = join(process.cwd(), "..", "..");
const NAME = "20260924100000_historical_timesheet_m1";
const MIGRATIONS_DIR = join(REPO_ROOT, "supabase/migrations");
const MIGRATION = join(MIGRATIONS_DIR, `${NAME}.sql`);
const ROLLBACK = join(REPO_ROOT, "supabase/rollbacks", `${NAME}.down.sql`);
const DRYRUN = join(REPO_ROOT, "docs/design/historical-timesheet-m1-dryrun.sql");
const DESIGN = join(REPO_ROOT, "docs/design/historical-timesheet-import-v3.md");

const lf = (s: string) => s.replace(/\r\n/g, "\n");
const migration = lf(readFileSync(MIGRATION, "utf8"));
const rollback = lf(readFileSync(ROLLBACK, "utf8"));
const dryrun = lf(readFileSync(DRYRUN, "utf8"));
const design = lf(readFileSync(DESIGN, "utf8"));

// The same comment stripping the CI gate (.github/scripts/migration-safety.mjs)
// applies before it looks for risk patterns: a commented `drop` is not a drop.
function stripComments(sql: string): string {
  return sql.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, " ");
}

// Every spelling of "always true" the gate refuses (its ALWAYS_TRUE regex).
const ALWAYS_TRUE = /\b(using|with\s+check)\s*\(\s*\(*\s*(true|1\s*=\s*1|'t'|'true')\s*\)*\s*\)/i;

/** The policies the DESIGN lists in its §8 M1 policy SQL block: name → table. */
function designPolicies(): Map<string, string> {
  const out = new Map<string, string>();
  for (const m of design.matchAll(/create policy (hist_p\d+_[a-z_]+) on public\.([a-z_]+)/g)) {
    out.set(m[1], m[2]);
  }
  return out;
}

/** The policies a migration text CREATES, with their table and mode. */
function createdPolicies(sql: string): Array<{ name: string; table: string; restrictive: boolean }> {
  const out: Array<{ name: string; table: string; restrictive: boolean }> = [];
  for (const m of stripComments(sql).matchAll(
    /create policy ([a-z0-9_]+) on public\.([a-z_]+)\s+(as restrictive\s+)?for (insert|update|delete|select|all) to ([a-z_, ]+)/g,
  )) {
    out.push({ name: m[1], table: m[2], restrictive: Boolean(m[3]) });
  }
  return out;
}

/** The M1 body between the two markers (what the dry run must embed verbatim). */
function m1Body(sql: string): string {
  const B = "-- M1 BODY BEGIN\n";
  const E = "-- M1 BODY END";
  const s = sql.indexOf(B);
  const e = sql.indexOf(E);
  if (s < 0 || e < 0 || e < s) throw new Error("M1 BODY markers missing");
  return sql.slice(s + B.length, e);
}

const NEW_COLUMNS: Array<[string, string]> = [
  ["projects", "historical_key"],
  ["projects", "created_session_id"],
  ["project_clients", "customer_key"],
  ["project_clients", "customer_code"],
  ["project_clients", "customer_kind"],
  ["project_clients", "created_session_id"],
  ["organization_evidence_records", "project_id"],
  ["organization_evidence_records", "source_row_index"],
  ["organization_evidence_records", "row_origin"],
  ["evidence_import_sessions", "source_bytes_sha256"],
  ["evidence_import_rows", "row_origin"],
  ["evidence_import_rows", "customer_label"],
  ["evidence_import_rows", "customer_code"],
  ["evidence_import_rows", "customer_key"],
  ["evidence_import_rows", "project_id"],
];

const OLD_IMPORT_EVENTS = ["created", "rows_submitted", "previewed", "committed", "rolled_back", "reinstated", "failed"];
const OLD_EVIDENCE_EVENTS = [
  "attested", "attestation_withdrawn", "independently_verified", "verification_withdrawn",
  "withdrawn", "reinstated", "disputed", "corrected",
];

function checkList(sql: string, constraint: string): string[] | null {
  const m = new RegExp(`add constraint ${constraint}\\s+check \\(event_type in \\(([^)]*)\\)\\)`, "i").exec(stripComments(sql));
  if (!m) return null;
  return [...m[1].matchAll(/'([a-z_]+)'/g)].map((x) => x[1]);
}

describe(`${NAME} — M1 of the historical timesheet import (design §8, §14)`, () => {
  it("creates EXACTLY the policies the design lists, each AS RESTRICTIVE on its table, none on SELECT", () => {
    const wanted = designPolicies();
    expect(wanted.size).toBe(13); // P1, P2, P3i/u/d, P4, P6, P7i/u/d, P8, P9i/u
    const created = createdPolicies(migration);
    expect(created.map((p) => p.name).sort()).toEqual([...wanted.keys()].sort());
    for (const p of created) {
      expect(p.table, p.name).toBe(wanted.get(p.name));
      expect(p.restrictive, `${p.name} must be AS RESTRICTIVE`).toBe(true);
    }
    // P7 deliberately adds no SELECT restriction (managers keep reading keyed rows).
    expect(stripComments(migration)).not.toMatch(/for select/i);
    expect(stripComments(migration)).not.toMatch(/for all/i);
    // negative control: a policy that the design does not list is detected
    const mutant = migration.replace("create policy hist_p8_import_events_insert", "create policy hist_p8_extra_insert");
    expect(createdPolicies(mutant).map((p) => p.name).sort()).not.toEqual([...wanted.keys()].sort());
    // negative control: dropping AS RESTRICTIVE is detected
    const permissive = migration.replace("as restrictive for insert to authenticated\n      with check (\n        project_clients", "for insert to authenticated\n      with check (\n        project_clients");
    expect(createdPolicies(permissive).some((p) => !p.restrictive)).toBe(true);
  });

  it("has no `(true)` predicate in any spelling (the gate's rls-permissive-true), proven on a mutant", () => {
    expect(ALWAYS_TRUE.test(stripComments(migration))).toBe(false);
    const mutant = migration.replace(
      "with check (\n        project_clients.customer_key is null",
      "with check (true)",
    );
    expect(mutant).not.toBe(migration);
    expect(ALWAYS_TRUE.test(stripComments(mutant))).toBe(true);
  });

  it("carries none of the RED shapes: definer, trigger, grant/revoke, alter/drop policy, set role, anon, service role, drops, NOT NULL changes, data DML, dynamic SQL, human-gate marker", () => {
    const code = stripComments(migration);
    expect(code).not.toMatch(/security\s+definer/i);
    expect(code).not.toMatch(/create\s+(or\s+replace\s+)?(function|trigger|rule|view)\b/i);
    expect(code).not.toMatch(/(^|;|\s)(grant|revoke)\s+/i);
    expect(code).not.toMatch(/\b(alter|drop)\s+policy\b/i);
    expect(code).not.toMatch(/\bset\s+role\b/i);
    expect(code).not.toMatch(/\bto\s+anon\b/i);
    expect(code).not.toMatch(/service_role/i);
    expect(code).not.toMatch(/\bdrop\s+(table|function|index)\b|\bdrop\s+column\b/i);
    expect(code).not.toMatch(/\b(set|drop)\s+not\s+null\b/i);
    expect(code).not.toMatch(/(^|;)\s*(update|delete\s+from)\s+\w/im);
    expect(code).not.toMatch(/\bexecute\s+/i);
    expect(code).not.toMatch(/\btruncate\b/i);
    expect(migration).not.toMatch(/@human-gate-approved/);
    // no `to public` policy (every policy is `to authenticated`)
    expect(code).not.toMatch(/\bto\s+public\b/i);
    // negative control: the definer detector fires on a planted body
    expect(/security\s+definer/i.test(stripComments(`${migration}\ncreate function public.f() returns int language sql security definer as $$ select 1 $$;`))).toBe(true);
  });

  it("widens the two event_type CHECKs by drop + re-add with the FULL old list plus the one new value", () => {
    expect(checkList(migration, "evidence_import_events_event_type_chk")).toEqual([...OLD_IMPORT_EVENTS, "decided"]);
    expect(checkList(migration, "organization_evidence_events_event_type_chk")).toEqual([...OLD_EVIDENCE_EVENTS, "source_preserved"]);
    const code = stripComments(migration);
    // the drop of the CREATE TABLE auto-name and of the new name both precede the add
    for (const t of ["evidence_import_events", "organization_evidence_events"]) {
      expect(code).toMatch(new RegExp(`drop constraint if exists ${t}_event_type_check;`));
      expect(code).toMatch(new RegExp(`drop constraint if exists ${t}_event_type_chk;`));
      expect(code).toMatch(new RegExp(`validate constraint ${t}_event_type_chk;`));
    }
    // every drop constraint in the file is matched by an add constraint (the gate's GREEN idiom)
    const drops = [...code.matchAll(/drop constraint if exists ([a-z_]+)/g)].map((m) => m[1]);
    expect(drops.length).toBe(4);
    expect(/add constraint/.test(code)).toBe(true);
    // negative control: a list missing one old value is detected
    const mutant = migration.replace("'rolled_back','reinstated','failed',\n        'decided'", "'rolled_back','failed',\n        'decided'");
    expect(checkList(mutant, "evidence_import_events_event_type_chk")).not.toEqual([...OLD_IMPORT_EVENTS, "decided"]);
  });

  it("adds every M1a–M1f column (nullable, no default), the keys, the historical CHECK and the indexes", () => {
    const code = stripComments(migration);
    for (const [table, column] of NEW_COLUMNS) {
      const re = new RegExp(`alter table public\\.${table} add column if not exists ${column} (text|uuid|integer);`);
      expect(code, `${table}.${column}`).toMatch(re);
    }
    expect(code).not.toMatch(/add column if not exists \w+ \w+ (not null|default)/i);
    expect(code).toMatch(/add constraint projects_org_scope unique \(id, organization_id\)/);
    expect(code).toMatch(/add constraint work_objects_org_scope unique \(id, organization_id\)/);
    expect(code).toMatch(/add constraint project_clients_project_scope unique \(id, project_id\)/);
    expect(code).toMatch(/foreign key \(created_session_id, organization_id\)\s+references public\.evidence_import_sessions \(id, organization_id\)/);
    expect(code).toMatch(/foreign key \(project_id, organization_id\)\s+references public\.projects \(id, organization_id\)/);
    expect(code).toMatch(/foreign key \(created_session_id\)\s+references public\.evidence_import_sessions \(id\)/);
    // The historical CHECK carries BOTH clauses: a historical project needs its
    // own org's session, and a session reference is never unbound from the
    // organization (the composite FK is MATCH SIMPLE — a NULL organization_id
    // would leave created_session_id unchecked; PR-3 review round 2).
    const HISTORICAL_CHECK =
      /add constraint projects_historical_requires_session\s+check \(\(historical_key is null\s+or \(created_session_id is not null and organization_id is not null\)\)\s+and \(created_session_id is null or organization_id is not null\)\);/;
    expect(code).toMatch(HISTORICAL_CHECK);
    // negative control: the CHECK without the MATCH SIMPLE clause is detected
    const unbound = migration.replace(
      "\n             and (created_session_id is null or organization_id is not null));",
      ");",
    );
    expect(unbound).not.toBe(migration);
    expect(stripComments(unbound)).not.toMatch(HISTORICAL_CHECK);
    expect(code).toMatch(/customer_kind in \('organization','private_person','unknown'\)/);
    expect(code.match(/row_origin in \('parsed_file','agent_rows','typed'\)/g)?.length).toBe(2);
    expect(code).toMatch(/char_length\(source_bytes_sha256\) = 64/);
    expect(code).toMatch(/create unique index if not exists projects_historical_key_uidx\s+on public\.projects \(organization_id, historical_key\)\s+where historical_key is not null/);
    expect(code).toMatch(/create unique index if not exists project_clients_customer_key_uidx\s+on public\.project_clients \(project_id, customer_key\)\s+where customer_key is not null/);
    expect(code).toMatch(/create index if not exists organization_evidence_records_project_idx\s+on public\.organization_evidence_records \(organization_id, project_id\)/);
    // every constraint / policy is guarded so a re-run is a no-op:
    // 11 constraint adds + the 2 CHECK-widening guards; 13 policies
    expect((code.match(/if not exists \(select 1 from pg_constraint/g) ?? []).length).toBe(13);
    expect((code.match(/if not exists \(select 1 from pg_policies/g) ?? []).length).toBe(13);
  });

  it("writes the design's predicates verbatim: G excludes external_manager, OA is owner/admin only, P2 maps every capability, P4 keeps the subject and party paths", () => {
    const code = stripComments(migration);
    expect(code).not.toMatch(/external_manager/);
    // G, written out: P1, P2 (org + supplier), P3i, P3u (USING + WITH CHECK), P3d, P4, P6, P8 = 10
    expect((code.match(/m\.role in \('owner','admin','manager'\)/g) ?? []).length).toBe(10);
    expect((code.match(/ec\.relationship_slug in \('owner','manager'\)/g) ?? []).length).toBe(10);
    expect((code.match(/m\.role in \('owner','admin'\)\)/g) ?? []).length).toBe(1); // OA (P5)
    expect((code.match(/ec\.relationship_slug in \('owner'\)\)/g) ?? []).length).toBe(1);
    for (const role of ["employer", "agency", "subcontractor", "training_provider", "education_provider", "placement_provider", "assessor", "client", "end_client", "project_owner"]) {
      expect(code, role).toMatch(new RegExp(`when '${role}'\\s+then array\\[`));
    }
    expect(code).toMatch(/evidence_import_sessions\.supplier_role = 'other'/);
    expect(code).toMatch(/event_type in \('disputed','independently_verified','verification_withdrawn'\)\s+and not public\.manages_organization/);
    expect(code).toMatch(/od\.status = 'active'\s+and od\.classification = 'classified'\s+and df\.superseded_at is null/);
    expect(code).toMatch(/row_origin is distinct from 'parsed_file'\s+or \( s\.actor_kind = 'human'\s+and s\.source_kind in \('csv','xlsx'\)\s+and s\.source_bytes_sha256 is not null \)/);
    expect(code).toMatch(/pc\.customer_key is not null/);
    expect(code).toMatch(/o\.legacy_company_id = projects\.company_id/);
    expect(code).toMatch(/public\.owns_company\(p\.company_id\)/);
  });

  it("names the class, the checks and the rollback in its header, and the file name is §16-valid and unique", () => {
    expect(migration).toMatch(/CLASS: GREEN/);
    expect(migration).toMatch(/CHECKS \(the §14 pre-merge list/);
    expect(migration).toMatch(/(^|\n)[ \t]*--[^\w\n]*(ROLLBACK|down)\b/);
    expect(/^\d{14}_[a-z0-9]+(_[a-z0-9]+)*\.sql$/.test(`${NAME}.sql`)).toBe(true);
    const sameVersion = readdirSync(MIGRATIONS_DIR).filter((f) => f.startsWith(NAME.slice(0, 14)));
    expect(sameVersion).toEqual([`${NAME}.sql`]);
  });

  it("carries no production or fixture identifier and no e-mail (PUBLIC repo)", () => {
    for (const [label, text] of [["migration", migration], ["rollback", rollback], ["dryrun", dryrun]] as const) {
      expect(text, label).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
      expect(text, label).not.toMatch(/@(?!fixture\.invalid\b)[a-z0-9-]+\.[a-z]{2,}/i);
    }
  });
});

describe(`${NAME}.down.sql — the rollback`, () => {
  it("exists, refuses while any new column holds a value or a widened event exists, then reverses M1 in dependency order", () => {
    expect(existsSync(ROLLBACK)).toBe(true);
    const code = stripComments(rollback);
    // the refusal guard comes first and covers every new column plus the two widened values
    const guardEnd = code.indexOf("$hist_m_one_down_guard$;");
    const firstDrop = code.search(/\bdrop\b/i);
    expect(guardEnd).toBeGreaterThan(0);
    expect(firstDrop).toBeGreaterThan(guardEnd);
    expect((code.match(/raise exception 'REFUSED:/g) ?? []).length).toBe(7);
    for (const [, column] of NEW_COLUMNS) expect(code.slice(0, guardEnd), column).toContain(column);
    expect(code.slice(0, guardEnd)).toMatch(/event_type = 'decided'/);
    expect(code.slice(0, guardEnd)).toMatch(/event_type = 'source_preserved'/);
    // every policy is dropped, every column is dropped, both CHECKs are restored under the original name with the original list
    for (const p of createdPolicies(migration)) {
      expect(code, p.name).toMatch(new RegExp(`drop policy if exists ${p.name}\\s+on public\\.${p.table};`));
    }
    for (const [table, column] of NEW_COLUMNS) {
      expect(code, `${table}.${column}`).toMatch(new RegExp(`alter table public\\.${table} drop column if exists ${column};`));
    }
    expect(checkList(rollback, "evidence_import_events_event_type_check")).toEqual(OLD_IMPORT_EVENTS);
    expect(checkList(rollback, "organization_evidence_events_event_type_check")).toEqual(OLD_EVIDENCE_EVENTS);
    expect(code).toMatch(/drop index if exists public\.projects_historical_key_uidx/);
    expect(code).toMatch(/drop index if exists public\.project_clients_customer_key_uidx/);
    expect(code).toMatch(/drop index if exists public\.organization_evidence_records_project_idx/);
    for (const c of ["projects_org_scope", "projects_created_session_fk", "projects_historical_requires_session", "work_objects_org_scope", "project_clients_project_scope", "project_clients_created_session_fk", "project_clients_customer_kind_chk", "organization_evidence_records_project_fk", "organization_evidence_records_row_origin_chk", "evidence_import_sessions_source_bytes_sha256_chk", "evidence_import_rows_row_origin_chk"]) {
      expect(code, c).toMatch(new RegExp(`drop constraint if exists ${c};`));
    }
    expect(rollback).not.toMatch(/@human-gate-approved/);
    expect(code).not.toMatch(/security\s+definer|(^|;|\s)(grant|revoke)\s+|\bto\s+anon\b|service_role/i);
  });
});

describe("docs/design/historical-timesheet-m1-dryrun.sql — the rolled-back production dry run", () => {
  it("is ONE DO block that can never commit, embeds the M1 body byte-for-byte, asserts the pre-merge checks and reports counts", () => {
    const code = stripComments(dryrun);
    expect((code.match(/\bdo \$dry\$/g) ?? []).length).toBe(1);
    expect(code.trim().endsWith("end $dry$;")).toBe(true);
    expect(code).not.toMatch(/(^|;)\s*commit\b/im);
    // the last statement of the block is the unconditional raise
    const lastRaise = code.lastIndexOf("raise exception 'DRYRUN_RESULT:%'");
    expect(lastRaise).toBeGreaterThan(0);
    expect(code.slice(lastRaise)).toMatch(/^raise exception 'DRYRUN_RESULT:%'[\s\S]*::text;\s*end \$dry\$;\s*$/);
    for (const n of [1, 2, 3, "3B"]) expect(code).toContain(`PREMERGE_CHECK_${n}_FAILED`);
    // 3b (review round 2): P9u reachability — a legacy company owner who can
    // neither see the organizations row as its owner_profile_id nor as an
    // active member would lose the project updates owns_company admits today.
    expect(code).toMatch(/join public\.companies c on c\.id = p\.company_id[\s\S]*o\.owner_profile_id = c\.profile_id[\s\S]*m\.profile_id = c\.profile_id[\s\S]*and m\.status = 'active'/);
    expect(code).toContain("'legacy_owner_projects_without_membership'");
    expect(m1Body(dryrun)).toBe(m1Body(migration));
    // the widened M1a CHECK is exercised on the gap it closes (expect 23514)
    expect(code).toMatch(/values \(a_company, null, 'Fixture unbound session', 'draft', a_session\);[\s\S]{0,400}'expect', '23514'/);
    // negative control: one changed byte in the embedded body is detected
    const mutant = dryrun.replace("add column if not exists historical_key text;", "add column if not exists historical_key varchar;");
    expect(mutant).not.toBe(dryrun);
    expect(m1Body(mutant)).not.toBe(m1Body(migration));
  });

  it("switches actor with SET LOCAL ROLE authenticated + request.jwt.claims, reads every touched table per actor, and runs every T14 control M1 can answer (the rest marked not_in_m1)", () => {
    const code = stripComments(dryrun);
    expect((code.match(/set local role authenticated;/g) ?? []).length).toBeGreaterThanOrEqual(6); // O, M, E, X, Y, N (+S)
    expect((code.match(/set_config\('request\.jwt\.claims'/g) ?? []).length).toBeGreaterThanOrEqual(6);
    expect(code).toMatch(/execute format\('select count\(\*\) from public\.%I', v_t\)/);
    for (const t of ["projects", "work_objects", "project_clients", "organization_people", "evidence_import_sessions", "evidence_import_rows", "evidence_import_events", "organization_evidence_records", "organization_evidence_parties", "organization_evidence_events", "organization_roles", "organizations", "company_memberships", "engagement_contexts", "org_documents", "document_files"]) {
      expect(code, t).toContain(`'${t}'`);
    }
    // legitimate paths
    for (const id of ["+1a", "+1b", "+1c", "+1d", "+1e", "+1f", "+1g", "+1h", "+1i", "+1j", "+1k", "+1l", "+2 ", "+3a", "+3b", "+4 ", "+5a", "+5b", "+6 ", "+7 "]) {
      expect(code, id).toContain(`'${id}`);
    }
    // T14 negative controls M1 can answer
    for (const id of ["A1 ", "A2 ", "A3 ", "A4 ", "A5 ", "A6 ", "A7 ", "A8 ", "A9 ", "A10 ", "A11 ", "A12 ", "A13 ", "A14 ", "A15 ", "A16a", "A16b", "A16c", "A16d", "A17 ", "A19 ", "A21 ", "A22 ", "A24 ", "A25 ", "A26a", "A26b", "A30 "]) {
      expect(code, id).toMatch(new RegExp(`'${id.trim().replace("+", "\\+")}\\b`));
    }
    // outside M1's reach: reported as such, never as a pass of M1
    expect(code).toMatch(/A18 \/ A20 \(project_ordered_work\)[^;]*not_in_m1/);
    expect(code).toMatch(/A27 \/ A28 \/ A29[^;]*not_in_m1/);
    expect(code).toMatch(/source_preserved with a matching ACTIVE CLASSIFIED org_import_source document[^;]*not_in_m1/);
    // discovery is by structure: no literal ids (asserted above), and the seeds are named as rolled back
    expect(code).toMatch(/'dryrun-rolled-back'/);
    // the subject and the party org are exercised
    expect(code).toMatch(/'disputed'\);\s+v_got := 'admitted';/);
    expect(code).toMatch(/'independently_verified', 'client', b_org\)/);
  });
});
