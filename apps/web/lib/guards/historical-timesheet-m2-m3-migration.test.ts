import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * Pins for the RED packet of the historical timesheet import (PR-4):
 * migration M3 (source preservation) and its rollback. M2 was DROPPED:
 * ordered and additional work is derived on read from existing structures.
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
const M3 = "20260930160000_historical_timesheet_m3_source_preservation";
const M1_VERSION = "20260924100000";
const MIGRATIONS_DIR = join(REPO_ROOT, "supabase/migrations");
const ROLLBACKS_DIR = join(REPO_ROOT, "supabase/rollbacks");
const DESIGN = join(REPO_ROOT, "docs/design/historical-timesheet-import-v3.md");
const GATED_LIST = join(process.cwd(), "lib/guards/booking-engagement-end-v1.test.ts");

/** md5(prosrc) of register_document_file_v1 on production, read-only, 2026-09-24. */
const PRODUCTION_BODY_MD5 = "23ee05137f9e6529fdf989cdbf2ca717";
/** md5 of the same body with ONLY the MIME list widened (what M3 installs). */
const M3_BODY_MD5 = "e4954bc052bffb031d511d5c599649f6";

const lf = (s: string) => s.replace(/\r\n/g, "\n");
const read = (p: string) => lf(readFileSync(p, "utf8"));
const md5 = (s: string) => createHash("md5").update(s).digest("hex");

const m3 = read(join(MIGRATIONS_DIR, `${M3}.sql`));
const m3Down = read(join(ROLLBACKS_DIR, `${M3}.down.sql`));
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

function mimeList(sql: string, anchor: RegExp): string[] | null {
  const m = anchor.exec(stripComments(sql));
  if (!m) return null;
  return [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
}

describe("PR-4 RED packet — both files: names, class, marker, rollback file, public-repo hygiene", () => {
  it("file names are §16-valid, unique, and sort after M1", () => {
    for (const name of [M3]) {
      expect(/^\d{14}_[a-z0-9]+(_[a-z0-9]+)*$/.test(name)).toBe(true);
      expect(name.slice(0, 14) > M1_VERSION).toBe(true);
      const sameVersion = readdirSync(MIGRATIONS_DIR).filter((f) => f.startsWith(name.slice(0, 14)));
      expect(sameVersion).toEqual([`${name}.sql`]);
      expect(existsSync(join(ROLLBACKS_DIR, `${name}.down.sql`))).toBe(true);
    }
  });

  it("each header says CLASS: RED and exactly why, carries the gate's annotation and a rollback heading; the rollbacks carry no marker", () => {
    expect(m3).toMatch(/CLASS: RED/);
    for (const finding of ["security-definer-function", "data-dml", "grant-or-revoke"]) {
      expect(m3, finding).toContain(finding);
    }
    expect(m3).toContain(PRODUCTION_BODY_MD5);
    // the gate requires the annotation to exit 0 (it turns each finding into a
    // notice + a ::warning); the M1 file must NOT carry it (GREEN).
    expect(ANNOTATION.test(m3)).toBe(true);
    expect(ANNOTATION.test(read(join(MIGRATIONS_DIR, `${M1_VERSION}_historical_timesheet_m1.sql`)))).toBe(false);
    expect(ANNOTATION.test(m3Down)).toBe(false);
    for (const sql of [m3]) expect(sql).toMatch(/(^|\n)[ \t]*--[^\w\n]*(ROLLBACK|down)\b/);
    // the annotation must name what it acknowledges, on the file it sits in
    expect(m3).toMatch(/@human-gate-approved[\s\S]{0,400}security-definer-function[\s\S]{0,400}grant-or-revoke[\s\S]{0,400}data-dml/);
  });

  it("the gate would flag exactly the findings the headers acknowledge (its own regexes), and nothing looser", () => {
    const c3 = stripComments(m3);
    expect(GRANT_OR_REVOKE.test(c3)).toBe(true);
    expect(SECURITY_DEFINER.test(c3)).toBe(true);
    expect(DATA_DML.test(c3)).toBe(true);
    for (const c of [c3]) {
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
    expect(ALWAYS_TRUE.test(stripComments("create policy x on t for select using (true);"))).toBe(true);
  });

  it("carries no production or fixture identifier and no e-mail (PUBLIC repo)", () => {
    for (const [label, text] of [["m3", m3], ["m3Down", m3Down]] as const) {
      expect(text, label).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
      expect(text, label).not.toMatch(/@(?!fixture\.invalid\b)[a-z0-9-]+\.[a-z]{2,}/i);
    }
  });

  it("the file is enumerated BY NAME in the human-gated migration list (the third ratchet)", () => {
    const list = read(GATED_LIST);
    expect(list).toContain(`"${M3}.sql"`);
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
