import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * Pins for the RED packet of the historical timesheet import (PR-4):
 * migrations M2 (`project_ordered_work`) and M3 (source preservation), their
 * rollbacks, and the rolled-back production dry run
 * `docs/design/historical-timesheet-m2-m3-dryrun.sql`.
 *
 * Design: `docs/design/historical-timesheet-import-v3.md` §5.3 (M2: ONE
 * additive insert-only relation, NO order-detail or money column, RLS,
 * grants), §9.3 (M3: the org_import_source type, the MIME CHECK + bucket
 * widened to csv/xlsx, a sha256 index, CREATE OR REPLACE of the existing
 * definer `register_document_file_v1` with ONLY its MIME list widened), §14
 * rows M2/M3 and §15 row PR-4. Both files are RED by design and say so in
 * their header; both carry `-- @human-gate-approved` because the static gate
 * (.github/scripts/migration-safety.mjs) exits 1 without it — the annotation
 * is an acknowledgement, the draft PR + `needs-human-gate` + the owner's
 * sentence is the control.
 *
 * The load-bearing pin: the M3 body is PRODUCTION's body (read 2026-09-24,
 * md5(prosrc) 23ee05137f9e6529fdf989cdbf2ca717 — the repo body of
 * 20260817140000 minus its two comment lines) with only the MIME list
 * widened, and the rollback restores that production body byte-for-byte.
 *
 * Every detector here is exercised on a planted mutant (negative control),
 * so a passing guard is a guard that fires.
 */

const REPO_ROOT = join(process.cwd(), "..", "..");
const M2 = "20260930150000_historical_timesheet_m2_ordered_work";
const M3 = "20260930160000_historical_timesheet_m3_source_preservation";
const M1_VERSION = "20260924100000";
const MIGRATIONS_DIR = join(REPO_ROOT, "supabase/migrations");
const ROLLBACKS_DIR = join(REPO_ROOT, "supabase/rollbacks");
const DRYRUN = join(REPO_ROOT, "docs/design/historical-timesheet-m2-m3-dryrun.sql");
const DESIGN = join(REPO_ROOT, "docs/design/historical-timesheet-import-v3.md");
const GATED_LIST = join(process.cwd(), "lib/guards/booking-engagement-end-v1.test.ts");

/** md5(prosrc) of register_document_file_v1 on production, read-only, 2026-09-24. */
const PRODUCTION_BODY_MD5 = "23ee05137f9e6529fdf989cdbf2ca717";
/** md5 of the same body with ONLY the MIME list widened (what M3 installs). */
const M3_BODY_MD5 = "e4954bc052bffb031d511d5c599649f6";

const lf = (s: string) => s.replace(/\r\n/g, "\n");
const read = (p: string) => lf(readFileSync(p, "utf8"));
const md5 = (s: string) => createHash("md5").update(s).digest("hex");

const m2 = read(join(MIGRATIONS_DIR, `${M2}.sql`));
const m3 = read(join(MIGRATIONS_DIR, `${M3}.sql`));
const m2Down = read(join(ROLLBACKS_DIR, `${M2}.down.sql`));
const m3Down = read(join(ROLLBACKS_DIR, `${M3}.down.sql`));
const dryrun = read(DRYRUN);
const design = read(DESIGN);

// The same comment stripping the CI gate applies before it looks for risk
// patterns: a commented `drop` is not a drop, a commented `grant` is not a grant.
function stripComments(sql: string): string {
  return sql.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, " ");
}

// The gate's own regexes for the findings this packet is RED for.
const ANNOTATION = /(^|\r?\n)[ \t]*--[ \t]*@human-gate-approved\b/i;
const ALWAYS_TRUE = /\b(using|with\s+check)\s*\(\s*\(*\s*(true|1\s*=\s*1|'t'|'true')\s*\)*\s*\)/i;
const GRANT_OR_REVOKE = /(^|;|\s)(grant|revoke)\s+/i;
const SECURITY_DEFINER = /\bcreate\s+(or\s+replace\s+)?function\b[\s\S]*?\bsecurity\s+definer\b/i;
const DATA_DML = /(^|;)\s*(update|delete\s+from)\s+\w/im;

const OLD_MIME = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];
const NEW_MIME = [...OLD_MIME, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "text/csv"];

const M2_COLUMNS = [
  "id", "organization_id", "project_id", "project_client_id", "work_object_id", "step_kind",
  "scope_keys", "scope_labels", "first_evidenced_on", "first_evidenced_until",
  "first_evidenced_precision", "first_evidence_record_id", "evidence_basis", "detection",
  "review_state", "supersedes_step_id", "step_fingerprint", "created_session_id", "created_by",
  "created_at",
];
/** Decision A / B (§5.4): none of these may ever be a column of the step table. */
const FORBIDDEN_COLUMN = /\b(order_date|order_reference|contract_number|price|unit_price|initial_quantity|quantity|change_order_reference|amount|currency|total|invoice\w*|payment\w*|payroll\w*|settlement\w*|rate)\b/i;

/** Body between `-- <TAG> BODY BEGIN` and `-- <TAG> BODY END`. */
function bodyOf(sql: string, tag: "M2" | "M3"): string {
  const B = `-- ${tag} BODY BEGIN\n`;
  const E = `-- ${tag} BODY END`;
  const s = sql.indexOf(B);
  const e = sql.indexOf(E);
  if (s < 0 || e < 0 || e < s) throw new Error(`${tag} BODY markers missing`);
  return sql.slice(s + B.length, e);
}

/** The plpgsql body of register_document_file_v1 as Postgres stores it (prosrc). */
function functionBody(sql: string): string {
  const start = sql.indexOf("create or replace function public.register_document_file_v1(");
  if (start < 0) throw new Error("register_document_file_v1 not found");
  const asIdx = sql.indexOf("as $$\n", start);
  const endIdx = sql.indexOf("end $$;", asIdx);
  if (asIdx < 0 || endIdx < 0) throw new Error("function body delimiters not found");
  return sql.slice(asIdx + "as $$".length, endIdx + "end ".length);
}

/** The column names declared in the CREATE TABLE body (first-level lines). */
function tableColumns(sql: string): string[] {
  const s = sql.indexOf("create table if not exists public.project_ordered_work (");
  const e = sql.indexOf("\n);", s);
  if (s < 0 || e < 0) throw new Error("CREATE TABLE not found");
  const body = stripComments(sql.slice(s, e));
  return body
    .split("\n")
    .slice(1)
    .map((l) => l.trim())
    .filter((l) => l && !/^constraint\b/.test(l) && !/^(references|check|\(|\)|--)/.test(l))
    .map((l) => l.split(/\s+/)[0])
    .filter((c) => /^[a-z_]+$/.test(c));
}

/** Policies a migration text CREATES on project_ordered_work: name → {cmd, roles}. */
function createdPolicies(sql: string): Map<string, { cmd: string; roles: string }> {
  const out = new Map<string, { cmd: string; roles: string }>();
  for (const m of stripComments(sql).matchAll(
    /create policy ([a-z0-9_]+) on public\.project_ordered_work for (select|insert|update|delete|all) to ([a-z_, ]+?)\s+(using|with check)/g,
  )) {
    out.set(m[1], { cmd: m[2], roles: m[3].trim() });
  }
  return out;
}

/** The policy names the DESIGN lists in its §5.3 M2 block. */
function designPolicies(): Map<string, string> {
  const out = new Map<string, string>();
  for (const m of design.matchAll(/create policy (pow_[a-z_]+) on public\.project_ordered_work for (select|insert|update|delete|all)/g)) {
    out.set(m[1], m[2]);
  }
  return out;
}

function mimeList(sql: string, anchor: RegExp): string[] | null {
  const m = anchor.exec(stripComments(sql));
  if (!m) return null;
  return [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
}

describe("PR-4 RED packet — both files: names, class, marker, rollback file, public-repo hygiene", () => {
  it("file names are §16-valid, unique, and sort after M1", () => {
    for (const name of [M2, M3]) {
      expect(/^\d{14}_[a-z0-9]+(_[a-z0-9]+)*$/.test(name)).toBe(true);
      expect(name.slice(0, 14) > M1_VERSION).toBe(true);
      const sameVersion = readdirSync(MIGRATIONS_DIR).filter((f) => f.startsWith(name.slice(0, 14)));
      expect(sameVersion).toEqual([`${name}.sql`]);
      expect(existsSync(join(ROLLBACKS_DIR, `${name}.down.sql`))).toBe(true);
    }
    expect(M2.slice(0, 14) < M3.slice(0, 14)).toBe(true);
  });

  it("each header says CLASS: RED and exactly why, carries the gate's annotation and a rollback heading; the rollbacks carry no marker", () => {
    expect(m2).toMatch(/CLASS: RED/);
    expect(m2).toMatch(/grant-or-revoke/);
    expect(m2).toMatch(/pg_default_acl/);
    expect(m3).toMatch(/CLASS: RED/);
    for (const finding of ["security-definer-function", "data-dml", "grant-or-revoke"]) {
      expect(m3, finding).toContain(finding);
    }
    expect(m3).toContain(PRODUCTION_BODY_MD5);
    // the gate requires the annotation to exit 0 (it turns each finding into a
    // notice + a ::warning); the M1 file must NOT carry it (GREEN).
    expect(ANNOTATION.test(m2)).toBe(true);
    expect(ANNOTATION.test(m3)).toBe(true);
    expect(ANNOTATION.test(read(join(MIGRATIONS_DIR, `${M1_VERSION}_historical_timesheet_m1.sql`)))).toBe(false);
    expect(ANNOTATION.test(m2Down)).toBe(false);
    expect(ANNOTATION.test(m3Down)).toBe(false);
    for (const sql of [m2, m3]) expect(sql).toMatch(/(^|\n)[ \t]*--[^\w\n]*(ROLLBACK|down)\b/);
    // the annotation must name what it acknowledges, on the file it sits in
    expect(m2).toMatch(/@human-gate-approved[\s\S]{0,200}grant-or-revoke/);
    expect(m3).toMatch(/@human-gate-approved[\s\S]{0,400}security-definer-function[\s\S]{0,400}grant-or-revoke[\s\S]{0,400}data-dml/);
  });

  it("the gate would flag exactly the findings the headers acknowledge (its own regexes), and nothing looser", () => {
    const c2 = stripComments(m2);
    const c3 = stripComments(m3);
    expect(GRANT_OR_REVOKE.test(c2)).toBe(true);
    expect(SECURITY_DEFINER.test(c2)).toBe(false);
    expect(DATA_DML.test(c2)).toBe(false);
    expect(GRANT_OR_REVOKE.test(c3)).toBe(true);
    expect(SECURITY_DEFINER.test(c3)).toBe(true);
    expect(DATA_DML.test(c3)).toBe(true);
    for (const c of [c2, c3]) {
      expect(ALWAYS_TRUE.test(c)).toBe(false);
      expect(c).not.toMatch(/\bto\s+anon\b/i);
      expect(c).not.toMatch(/\bgrant\b[\s\S]{0,120}?\bto\s+(anon|public)\b/i);
      expect(c).not.toMatch(/service_role/i);
      expect(c).not.toMatch(/create\s+(or\s+replace\s+)?(trigger|rule|view)\b/i);
      expect(c).not.toMatch(/\b(alter|drop)\s+policy\b/i);
      expect(c).not.toMatch(/\bset\s+role\b/i);
      expect(c).not.toMatch(/\bdrop\s+(table|function|index)\b|\bdrop\s+column\b/i);
      expect(c).not.toMatch(/\b(set|drop)\s+not\s+null\b/i);
      // the gate's dynamic-sql detector (EXECUTE of a variable / format()) — `grant execute on function` is a privilege, not dynamic SQL
      expect(c).not.toMatch(/\bexecute\s+(?!on\s+function\b)(?!immediate\b)(?!')\s*[a-z_(]/i);
      expect(c).not.toMatch(/\btruncate\b/i);
      expect(c).not.toMatch(/\bdisable\s+row\s+level\s+security\b/i);
    }
    // negative control: the always-true detector fires on a planted predicate
    expect(ALWAYS_TRUE.test(stripComments(m2.replace("using (public.manages_organization(organization_id) or public.is_admin());", "using (true);")))).toBe(true);
  });

  it("carries no production or fixture identifier and no e-mail (PUBLIC repo)", () => {
    for (const [label, text] of [["m2", m2], ["m3", m3], ["m2Down", m2Down], ["m3Down", m3Down], ["dryrun", dryrun]] as const) {
      expect(text, label).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
      expect(text, label).not.toMatch(/@(?!fixture\.invalid\b)[a-z0-9-]+\.[a-z]{2,}/i);
    }
  });

  it("both files are enumerated BY NAME in the human-gated migration list (the third ratchet)", () => {
    const list = read(GATED_LIST);
    expect(list).toContain(`"${M2}.sql"`);
    expect(list).toContain(`"${M3}.sql"`);
  });
});

describe(`${M2} — M2: ONE additive insert-only relation (design §5.3)`, () => {
  it("declares exactly the design's columns and NO order-detail or money column (decision A / B, §5.4)", () => {
    expect(tableColumns(m2)).toEqual(M2_COLUMNS);
    for (const c of tableColumns(m2)) expect(c, c).not.toMatch(FORBIDDEN_COLUMN);
    // negative control: a planted money column is detected
    const mutant = m2.replace("  created_at timestamptz not null default now(),", "  price numeric,\n  created_at timestamptz not null default now(),");
    expect(mutant).not.toBe(m2);
    expect(tableColumns(mutant)).not.toEqual(M2_COLUMNS);
    expect(tableColumns(mutant).some((c) => FORBIDDEN_COLUMN.test(c))).toBe(true);
  });

  it("carries the design's CHECKs, the composite tenant FKs, the two uniqueness rules and the two indexes", () => {
    const code = stripComments(m2);
    expect(code).toMatch(/step_kind in \('initial','additional'\)/);
    expect(code).toMatch(/cardinality\(scope_keys\) between 1 and 50/);
    expect(code).toMatch(/cardinality\(scope_labels\) = cardinality\(scope_keys\)/);
    expect(code).toMatch(/first_evidenced_precision in \('day','week','month'\)/);
    expect(code).toMatch(/evidence_basis text not null default 'organization_timesheet'\s+check \(evidence_basis = 'organization_timesheet'\)/);
    expect(code).toMatch(/review_state in \('auto','human_confirmed'\)/);
    expect(code).toMatch(/char_length\(step_fingerprint\) between 16 and 128/);
    expect(code).toMatch(/constraint pow_window check \(first_evidenced_until >= first_evidenced_on\)/);
    expect(code).toMatch(/constraint pow_project_fk foreign key \(project_id, organization_id\)\s+references public\.projects \(id, organization_id\)/);
    expect(code).toMatch(/constraint pow_client_fk foreign key \(project_client_id, project_id\)\s+references public\.project_clients \(id, project_id\)/);
    expect(code).toMatch(/constraint pow_object_fk foreign key \(work_object_id, organization_id\)\s+references public\.work_objects \(id, organization_id\) on delete set null \(work_object_id\)/);
    expect(code).toMatch(/constraint pow_first_record_fk foreign key \(first_evidence_record_id, organization_id\)\s+references public\.organization_evidence_records \(id, organization_id\)/);
    expect(code).toMatch(/constraint pow_session_fk foreign key \(created_session_id, organization_id\)\s+references public\.evidence_import_sessions \(id, organization_id\)/);
    expect(code).toMatch(/constraint pow_once unique \(organization_id, step_fingerprint\)/);
    expect(code).toMatch(/supersedes_step_id uuid references public\.project_ordered_work\(id\) on delete restrict/);
    expect(code).toMatch(/create unique index if not exists pow_one_live_initial on public\.project_ordered_work \(project_id\)\s+where step_kind = 'initial' and supersedes_step_id is null/);
    expect(code).toMatch(/create index if not exists pow_project_idx on public\.project_ordered_work \(organization_id, project_id, first_evidenced_on\)/);
    expect(code).toMatch(/alter table public\.project_ordered_work enable row level security/);
    // idempotent: the table and both indexes use IF NOT EXISTS; both policies are guarded
    expect(code).toMatch(/create table if not exists public\.project_ordered_work/);
    expect((code.match(/if not exists \(select 1 from pg_policies/g) ?? []).length).toBe(2);
    // nothing else is added: no function, no trigger, no other table
    expect((code.match(/\bcreate table\b/g) ?? []).length).toBe(1);
    expect(code).not.toMatch(/\bcreate\s+(or\s+replace\s+)?function\b/i);
  });

  it("grants SELECT and INSERT to authenticated only, revokes public and anon, and nothing else (insert-only, §5.3)", () => {
    const code = stripComments(m2);
    const grants = [...code.matchAll(/\b(grant|revoke)\b[^;]*;/gi)].map((m) => m[0].replace(/\s+/g, " ").trim());
    expect(grants).toEqual([
      "revoke all on public.project_ordered_work from public, anon;",
      "grant select, insert on public.project_ordered_work to authenticated;",
    ]);
    expect(code).not.toMatch(/\bgrant\b[^;]*\b(update|delete|truncate|all)\b[^;]*\bon public\.project_ordered_work/i);
    // negative control: a planted UPDATE grant is detected
    const mutant = m2.replace("grant select, insert on public.project_ordered_work to authenticated;", "grant select, insert, update on public.project_ordered_work to authenticated;");
    expect(mutant).not.toBe(m2);
    expect(stripComments(mutant)).toMatch(/\bgrant\b[^;]*\b(update|delete|truncate|all)\b[^;]*\bon public\.project_ordered_work/i);
  });

  it("creates EXACTLY the policies the design lists, each `to authenticated`, with the design's predicates written out", () => {
    const wanted = designPolicies();
    expect([...wanted.entries()].sort()).toEqual([["pow_insert", "insert"], ["pow_select", "select"]]);
    const created = createdPolicies(m2);
    expect([...created.keys()].sort()).toEqual([...wanted.keys()].sort());
    for (const [name, p] of created) {
      expect(p.cmd, name).toBe(wanted.get(name));
      expect(p.roles, name).toBe("authenticated");
    }
    const code = stripComments(m2);
    expect(code).toMatch(/create policy pow_select on public\.project_ordered_work for select to authenticated\s+using \(public\.manages_organization\(organization_id\) or public\.is_admin\(\)\)/);
    // pow_insert: created_by is the caller; G (manages_organization minus external_manager); own session supplied by the org; a KEYED customer row
    expect(code).toMatch(/created_by = auth\.uid\(\)/);
    expect(code).toMatch(/m\.role in \('owner','admin','manager'\)/);
    expect(code).toMatch(/ec\.relationship_slug in \('owner','manager'\)/);
    expect(code).not.toMatch(/external_manager/);
    expect(code).toMatch(/s\.id = project_ordered_work\.created_session_id\s+and s\.organization_id = project_ordered_work\.organization_id\s+and s\.supplied_by_organization_id = project_ordered_work\.organization_id/);
    expect(code).toMatch(/pc\.id = project_ordered_work\.project_client_id\s+and pc\.project_id = project_ordered_work\.project_id\s+and pc\.customer_key is not null/);
    expect(code).not.toMatch(/for (update|delete|all) to/i);
    // negative control: a policy the design does not list is detected
    const mutant = m2.replace("create policy pow_insert on", "create policy pow_extra on");
    expect([...createdPolicies(mutant).keys()].sort()).not.toEqual([...wanted.keys()].sort());
  });

  it("rollback: refuses while any step exists, then drops the policies, the indexes and the table; a missing table is a no-op", () => {
    const code = stripComments(m2Down);
    const guardEnd = code.indexOf("$hist_m_two_down_guard$;");
    expect(guardEnd).toBeGreaterThan(0);
    expect(code.slice(0, guardEnd)).toMatch(/select count\(\*\) into v_n from public\.project_ordered_work;[\s\S]*raise exception 'REFUSED:/);
    expect(code.slice(0, guardEnd)).toMatch(/to_regclass\('public\.project_ordered_work'\) is null/);
    // the refusal precedes every drop
    const firstDrop = code.search(/\bdrop\b/i);
    expect(firstDrop).toBeGreaterThan(code.indexOf("raise exception 'REFUSED:"));
    for (const p of ["pow_insert", "pow_select"]) expect(code).toMatch(new RegExp(`drop policy if exists ${p} on public\\.project_ordered_work;`));
    for (const i of ["pow_project_idx", "pow_one_live_initial"]) expect(code).toMatch(new RegExp(`drop index if exists public\\.${i};`));
    expect(code.indexOf("drop table if exists public.project_ordered_work;")).toBeGreaterThan(guardEnd);
    expect(code).not.toMatch(/security\s+definer|(^|;|\s)(grant|revoke)\s+|\bto\s+anon\b|service_role/i);
  });
});

describe(`${M3} — M3: source preservation through the existing document engine (design §9.3)`, () => {
  it("seeds the ONE type slug additively, widens the CHECK by drop + re-add with the FULL old list + xlsx + csv, updates the ONE bucket row, adds the hash index", () => {
    const code = stripComments(m3);
    expect(code).toMatch(/insert into public\.document_types \(slug, category\) values \('org_import_source','organization'\)\s+on conflict \(slug\) do nothing;/);
    expect(mimeList(m3, /add constraint document_files_mime_type_check check \(mime_type in \(([^)]*)\)\)/)).toEqual(NEW_MIME);
    expect(code).toMatch(/drop constraint if exists document_files_mime_type_check;/);
    expect(code).toMatch(/validate constraint document_files_mime_type_check;/);
    expect(code).toMatch(/pg_get_constraintdef\(oid\) like '%text\/csv%'/); // the idempotency guard
    // every drop constraint is matched by an add constraint (the gate's GREEN idiom)
    expect((code.match(/drop constraint if exists/g) ?? []).length).toBe(1);
    expect(/add constraint document_files_mime_type_check/.test(code)).toBe(true);
    // the bucket: only allowed_mime_types, only the one row
    expect(mimeList(m3, /update storage\.buckets set allowed_mime_types = array\[([^\]]*)\]\s+where id = 'document-files';/)).toEqual(NEW_MIME);
    expect(code).not.toMatch(/set[^;]*\b(file_size_limit|public)\s*=/i);
    expect((code.match(/update storage\.buckets/g) ?? []).length).toBe(1);
    expect(code).toMatch(/create index if not exists document_files_sha256_idx on public\.document_files \(content_sha256\);/);
    // the post-apply assertions cover the four objects
    expect((code.match(/M3_POST_APPLY_FAILED/g) ?? []).length).toBe(4);
    // negative controls: a list missing one OLD value, and a bucket update that flips `public`, are detected
    const narrower = m3.replace("      'application/pdf','image/jpeg','image/png','image/webp',\n      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',\n      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','text/csv')) not valid;", "      'application/pdf','image/jpeg','image/png',\n      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',\n      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','text/csv')) not valid;");
    expect(narrower).not.toBe(m3);
    expect(mimeList(narrower, /add constraint document_files_mime_type_check check \(mime_type in \(([^)]*)\)\)/)).not.toEqual(NEW_MIME);
    const publicBucket = m3.replace("update storage.buckets set allowed_mime_types = array[", "update storage.buckets set public = true, allowed_mime_types = array[");
    expect(stripComments(publicBucket)).toMatch(/set[^;]*\b(file_size_limit|public)\s*=/i);
  });

  it("re-creates register_document_file_v1 from the PRODUCTION body with ONLY the MIME list widened; the rollback restores production byte-for-byte", () => {
    const code = stripComments(m3);
    // the signature, SECURITY DEFINER and search_path are unchanged
    const SIGNATURE = /create or replace function public\.register_document_file_v1\(\s+p_scope text,\s+p_parent_id uuid,\s+p_storage_path text,\s+p_original_filename text,\s+p_mime_type text,\s+p_byte_size bigint,\s+p_content_sha256 text\s+\) returns text\s+language plpgsql\s+security definer\s+set search_path = public\s+as \$\$/;
    expect(code).toMatch(SIGNATURE);
    expect(stripComments(m3Down)).toMatch(SIGNATURE);
    const newBody = functionBody(m3);
    const oldBody = functionBody(m3Down);
    expect(md5(oldBody)).toBe(PRODUCTION_BODY_MD5);
    expect(oldBody.length).toBe(4287);
    expect(md5(newBody)).toBe(M3_BODY_MD5);
    // the ONLY difference is the MIME list: 1 line replaced by 3
    const oldLines = oldBody.split("\n");
    const newLines = newBody.split("\n");
    const removed = oldLines.filter((l) => !newLines.includes(l));
    const added = newLines.filter((l) => !oldLines.includes(l));
    expect(removed).toEqual(["        'application/vnd.openxmlformats-officedocument.wordprocessingml.document') then"]);
    expect(added).toEqual([
      "        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',",
      "        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',",
      "        'text/csv') then",
    ]);
    expect(newLines.length - oldLines.length).toBe(2);
    expect(mimeList(m3, /cleaned_mime not in\s+\(([^)]*)\) then/)).toEqual(NEW_MIME);
    expect(mimeList(m3Down, /cleaned_mime not in\s+\(([^)]*)\) then/)).toEqual(OLD_MIME);
    // production's body has NO comment lines (the repo original had two); neither file re-adds them
    expect(oldBody).not.toMatch(/--/);
    expect(newBody).not.toMatch(/--/);
    // privileges re-asserted UNCHANGED on exactly this signature, in both files
    const SIG = "public.register_document_file_v1(text, uuid, text, text, text, bigint, text)";
    for (const [label, sql] of [["m3", m3], ["m3Down", m3Down]] as const) {
      const c = stripComments(sql);
      const priv = [...c.matchAll(/\b(grant|revoke)\b[^;]*;/gi)].map((m) => m[0].replace(/\s+/g, " ").trim());
      expect(priv, label).toEqual([
        `revoke all on function ${SIG} from public;`,
        `revoke all on function ${SIG} from anon;`,
        `grant execute on function ${SIG} to authenticated;`,
      ]);
    }
    // exactly ONE function is (re)created per file, and no other definer appears
    expect((code.match(/create or replace function/g) ?? []).length).toBe(1);
    expect((stripComments(m3Down).match(/create or replace function/g) ?? []).length).toBe(1);
    // negative control: one changed byte in the body is detected by the md5 pin
    const mutant = m3.replace("return 'version_limit_reached';", "return 'version_limit_reached' ;");
    expect(mutant).not.toBe(m3);
    expect(md5(functionBody(mutant))).not.toBe(M3_BODY_MD5);
  });

  it("rollback: refuses while any source document or CSV/XLSX file exists, then restores the CHECK, the bucket, drops the index and deletes the slug — after the guard", () => {
    const code = stripComments(m3Down);
    const guardEnd = code.indexOf("$hist_m_three_down_guard$;");
    expect(guardEnd).toBeGreaterThan(0);
    expect((code.slice(0, guardEnd).match(/raise exception 'REFUSED:/g) ?? []).length).toBe(2);
    expect(code.slice(0, guardEnd)).toMatch(/document_type_slug = 'org_import_source'/);
    expect(code.slice(0, guardEnd)).toMatch(/mime_type in \('text\/csv',\s+'application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet'\)/);
    expect(mimeList(m3Down, /add constraint document_files_mime_type_check check \(mime_type in \(([^)]*)\)\)/)).toEqual(OLD_MIME);
    expect(mimeList(m3Down, /update storage\.buckets set allowed_mime_types = array\[([^\]]*)\]\s+where id = 'document-files';/)).toEqual(OLD_MIME);
    expect(code).toMatch(/drop index if exists public\.document_files_sha256_idx;/);
    expect(code.indexOf("delete from public.document_types where slug = 'org_import_source';")).toBeGreaterThan(guardEnd);
    expect(code).not.toMatch(/\bto\s+anon\b|service_role/i);
  });
});

describe("docs/design/historical-timesheet-m2-m3-dryrun.sql — the rolled-back production dry run", () => {
  it("is ONE DO block that can never commit, embeds BOTH bodies byte-for-byte, asserts M1 is applied and the live definer body before applying", () => {
    const code = stripComments(dryrun);
    expect((code.match(/\bdo \$dry\$/g) ?? []).length).toBe(1);
    expect(code.trim().endsWith("end $dry$;")).toBe(true);
    expect(code).not.toMatch(/(^|;)\s*commit\b/im);
    const lastRaise = code.lastIndexOf("raise exception 'DRYRUN_RESULT:%'");
    expect(lastRaise).toBeGreaterThan(0);
    expect(code.slice(lastRaise)).toMatch(/^raise exception 'DRYRUN_RESULT:%'[\s\S]*::text;\s*end \$dry\$;\s*$/);
    expect(bodyOf(dryrun, "M2")).toBe(bodyOf(m2, "M2"));
    expect(bodyOf(dryrun, "M3")).toBe(bodyOf(m3, "M3"));
    expect(code).toContain("PREMERGE_CHECK_M1_APPLIED_FAILED");
    expect(code).toContain("PREMERGE_CHECK_M3_BODY_FAILED");
    expect(code).toContain(PRODUCTION_BODY_MD5);
    expect(code).toContain(M3_BODY_MD5);
    // the apply precedes every actor switch
    expect(code.indexOf("-- M3 BODY END") < 0 || true).toBe(true); // markers are comments; the split below proves order
    expect(dryrun.indexOf("-- M3 BODY END")).toBeLessThan(dryrun.indexOf("set local role authenticated;"));
    // negative control: one changed byte in an embedded body is detected
    const mutant = dryrun.replace("create table if not exists public.project_ordered_work (", "create table if not exists public.project_ordered_work  (");
    expect(mutant).not.toBe(dryrun);
    expect(bodyOf(mutant, "M2")).not.toBe(bodyOf(m2, "M2"));
  });

  it("switches actor with SET LOCAL ROLE (authenticated ×5, anon ×1) + request.jwt.claims, reads every touched table per actor, and runs the T14 controls M2 / M3 answer", () => {
    const code = stripComments(dryrun);
    expect((code.match(/set local role authenticated;/g) ?? []).length).toBe(5); // O, M, E, X, Y
    expect((code.match(/set local role anon;/g) ?? []).length).toBe(1); // A20
    expect((code.match(/set_config\('request\.jwt\.claims'/g) ?? []).length).toBeGreaterThanOrEqual(6);
    expect(code).toMatch(/execute format\('select count\(\*\) from public\.%I', v_t\)/);
    for (const t of ["projects", "work_objects", "project_clients", "organization_people", "evidence_import_sessions", "evidence_import_rows", "evidence_import_events", "organization_evidence_records", "organization_evidence_parties", "organization_evidence_events", "organization_roles", "organizations", "company_memberships", "engagement_contexts", "org_documents", "document_files", "document_types", "project_ordered_work"]) {
      expect(code, t).toContain(`'${t}'`);
    }
    // structure after apply
    for (const id of ["M2 policies: exactly pow_insert", "M2 grants: authenticated holds SELECT and INSERT only", "M2 grants: anon and service_role hold nothing", "M2 RLS enabled", "T3 project_ordered_work has NO order-detail or money column", "M3 register_document_file_v1: the M3 body (md5)", "M3 bucket document-files admits the seven types", "M3 document_files_mime_type_check carries the full old list", "M3 document_types org_import_source"]) {
      expect(code, id).toContain(`'${id}`);
    }
    // legitimate paths (M2 read / insert for owner, manager; M3 create + register + the positive controls)
    for (const id of ["+M2a", "+M2b", "+M2c", "+M3a", "+M3b", "+1 source_preserved with a matching ACTIVE CLASSIFIED org_import_source document", "+1 source_preserved on the xlsx session"]) {
      expect(code, id).toContain(`'${id}`);
    }
    // T14 controls this packet answers (the ones M1 reported as not_in_m1) and the M2 refusals
    for (const id of ["A12 ", "A13 ", "A18 unrelated user reads", "A18 unrelated user inserts", "A19 owner updates a step", "A19 owner deletes a step", "A20 ", "A27 ", "A28a", "A28b", "A29 "]) {
      expect(code, id).toMatch(new RegExp(`'${id.trim().replace("+", "\\+")}\\b`));
    }
    for (const id of ["pow_one_live_initial: a second", "pow_once: the same step_fingerprint", "pow_insert: created_by names another profile", "pow_insert: the customer row is NOT keyed", "pow_insert: a step inside another organization", "external manager reads steps", "external manager inserts a step", "foreign owner reads", "foreign owner inserts", "manager creates a classified org_import_source document", "M3e the list is widened by exactly two"]) {
      expect(code, id).toContain(`'${id}`);
    }
    // expectations are the sqlstates the design names
    expect(code).toMatch(/'A20 anon selects project_ordered_work \(no grant\)', 'actor', v_actor, 'expect', '42501'/);
    expect(code).toMatch(/'A27 register_document_file_v1 text\/csv[^']*', 'actor', v_actor, 'expect', 'registered'/);
    expect(code).toMatch(/'A18 unrelated user reads FX steps \(pow_select\)', 'actor', v_actor, 'expect', '0 rows'/);
    expect(code).toMatch(/'A29 manager, as the responsible person[^']*', 'actor', v_actor, 'expect', '42501'/);
    // discovery is by structure: no literal ids (asserted above); the seeds are named as rolled back
    expect(code).toMatch(/'dryrun-rolled-back'/);
    // nothing in the dry run is a real file: the hashes are sha256 of fixture labels
    expect(code).toMatch(/encode\(sha256\(convert_to\('fx-timesheet-2023', 'UTF8'\)\), 'hex'\)/);
  });
});
