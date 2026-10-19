import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * GDPR erasure v3 — STATIC coverage guard (audit 2026-10-16, finding 2).
 *
 * The executor refuses at run time when a foreign key onto profiles/workers
 * has no registry decision. This test fails EARLIER, in CI: every FK onto
 * profiles/workers declared by any migration, and every column that looks
 * like a person identifier (e-mail / phone / contact or invited name), must
 * have a row in the v3 registry seed or in the explicit allowlist below.
 * A new table that references a person therefore cannot merge without a
 * reviewed erasure decision.
 *
 * Derivation mirrors the executor's catalog read: create table bodies, alter
 * table add column / add constraint, drop table / drop column, applied in
 * file order. It is a text parse of the migrations, not a database read.
 */

const MIGRATIONS = join(__dirname, "../../../../supabase/migrations");
const V3 = "20261019140000_privacy_erasure_executor_v3.sql";

const PARENT = /references\s+(?:public\.)?(profiles|workers)\s*\(\s*id\s*\)/i;
const IDENT = /^(?:\w*(?:email|phone)\w*|contact_name|invited_name|full_name|first_name|last_name|person_label|person_name)$/i;

function strip(sql: string): string {
  return sql.replace(/--[^\n]*/g, "");
}

type Fk = { table: string; column: string };

function deriveReferences(): { fks: Fk[]; identifiers: Fk[] } {
  const fks = new Map<string, Fk>();
  const identifiers = new Map<string, Fk>();
  const files = readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort();
  for (const f of files) {
    const sql = strip(readFileSync(join(MIGRATIONS, f), "utf8"));
    const events: Array<{ at: number; apply: () => void }> = [];
    let m: RegExpExecArray | null;
    const ct = /create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?(\w+)\s*\(([\s\S]*?)\n\);/gi;
    while ((m = ct.exec(sql))) {
      const table = m[1];
      const body = m[2];
      events.push({
        at: m.index,
        apply: () => {
          for (const raw of body.split(/,\s*\n/)) {
            const line = raw.trim();
            const col = /^(\w+)\s+(\w+)/.exec(line);
            if (!col) continue;
            if (/^uuid$/i.test(col[2]) && PARENT.test(line)) fks.set(`${table}.${col[1]}`, { table, column: col[1] });
            if (/^(text|citext|varchar)/i.test(col[2]) && IDENT.test(col[1])) identifiers.set(`${table}.${col[1]}`, { table, column: col[1] });
          }
        },
      });
    }
    const ac = /alter\s+table\s+(?:if\s+exists\s+)?(?:public\.)?(\w+)\s+((?:add\s+column[\s\S]*?)(?=;))/gi;
    while ((m = ac.exec(sql))) {
      const table = m[1];
      const body = m[2];
      events.push({
        at: m.index,
        apply: () => {
          const re = /add\s+column\s+(?:if\s+not\s+exists\s+)?(\w+)\s+(\w+)([^,;]*)/gi;
          let c: RegExpExecArray | null;
          while ((c = re.exec(body))) {
            if (/^uuid$/i.test(c[2]) && PARENT.test(c[3])) fks.set(`${table}.${c[1]}`, { table, column: c[1] });
            if (/^(text|citext|varchar)/i.test(c[2]) && IDENT.test(c[1])) identifiers.set(`${table}.${c[1]}`, { table, column: c[1] });
          }
        },
      });
    }
    const fk = /alter\s+table\s+(?:if\s+exists\s+)?(?:public\.)?(\w+)\s+add\s+constraint\s+\w+\s+foreign\s+key\s*\(\s*(\w+)\s*\)\s*references\s+(?:public\.)?(profiles|workers)\s*\(\s*id\s*\)/gi;
    while ((m = fk.exec(sql))) {
      const table = m[1];
      const column = m[2];
      events.push({ at: m.index, apply: () => void fks.set(`${table}.${column}`, { table, column }) });
    }
    const dt = /drop\s+table\s+(?:if\s+exists\s+)?(?:public\.)?(\w+)/gi;
    while ((m = dt.exec(sql))) {
      const table = m[1];
      events.push({
        at: m.index,
        apply: () => {
          for (const k of [...fks.keys()]) if (k.startsWith(`${table}.`)) fks.delete(k);
          for (const k of [...identifiers.keys()]) if (k.startsWith(`${table}.`)) identifiers.delete(k);
        },
      });
    }
    const dc = /alter\s+table\s+(?:public\.)?(\w+)\s+drop\s+column\s+(?:if\s+exists\s+)?(\w+)/gi;
    while ((m = dc.exec(sql))) {
      const key = `${m[1]}.${m[2]}`;
      events.push({ at: m.index, apply: () => void (fks.delete(key), identifiers.delete(key)) });
    }
    events.sort((a, b) => a.at - b.at).forEach((e) => e.apply());
  }
  return { fks: [...fks.values()], identifiers: [...identifiers.values()] };
}

function registrySeed(): { fkRows: Set<string>; valueRows: Set<string> } {
  const sql = readFileSync(join(MIGRATIONS, V3), "utf8");
  const fkRows = new Set<string>();
  const valueRows = new Set<string>();
  const registry = /insert into public\.privacy_erasure_registry_v3[\s\S]*?(?=\n(?:insert|commit|--\s*─))/gi;
  let m: RegExpExecArray | null;
  while ((m = registry.exec(sql))) {
    const row = /\(\s*'(\w+)',\s*'(\w+)',\s*'(\w+)',\s*'(profiles|workers)'/g;
    let r: RegExpExecArray | null;
    while ((r = row.exec(m[0]))) fkRows.add(`${r[2]}.${r[3]}`);
  }
  const values = /insert into public\.privacy_erasure_value_rules_v3[\s\S]*?on conflict/gi;
  while ((m = values.exec(sql))) {
    const row = /\(\s*'(\w+)',\s*'(\w+)',\s*'(\w+)',\s*'(email_exact|phone_exact|mention)'/g;
    let r: RegExpExecArray | null;
    while ((r = row.exec(m[0]))) valueRows.add(`${r[2]}.${r[3]}`);
  }
  return { fkRows, valueRows };
}

/**
 * Identifier columns that are deliberately NOT value rules, each with the
 * reason. Adding a column here is an erasure decision and needs review.
 */
const IDENTIFIER_ALLOWLIST: Record<string, string> = {
  "profiles.email": "the subject row itself: deleted with auth.users",
  "profiles.phone": "the subject row itself: deleted with auth.users",
  "profiles.full_name": "the subject row itself: deleted with auth.users",
  "privacy_erasure_notices_v1.recipient_email": "the address the deletion notice goes to, captured before the account is deleted and set to NULL by privacy_erasure_notice_result_v1 once sent (owner decision 2026-10-19: confirm by e-mail)",
  "companies.contact_phone": "scrubbed by the companies.contact_email value rule (scrub_columns)",
  "agency_clients.contact_name": "scrubbed by the agency_clients.contact_email value rule",
  "project_clients.contact_name": "scrubbed by the project_clients.contact_email value rule",
  "company_need_public_intakes.contact_name": "scrubbed by the contact_email value rule",
  "company_need_public_intakes.contact_phone": "scrubbed by the contact_email value rule",
  "invitations.invited_name": "scrubbed by the invitations.invited_email value rule",
  "leads.full_name": "scrubbed by the leads.email value rule",
  "customers.contact_name": "DECISION PENDING (design doc L-12): customer contact person without an e-mail column to match on",
  "companies.public_contact_email": "organisation's published contact, not a person record (owner-entered)",
  "companies.public_contact_phone": "organisation's published contact, not a person record (owner-entered)",
  "organizations.public_contact_email": "organisation's published contact, not a person record (owner-entered)",
  "organizations.public_contact_phone": "organisation's published contact, not a person record (owner-entered)",
  "evidence_import_rows.person_label": "report_only via the value rule (mention)",
};

describe("privacy erasure v3: every person reference has a registry decision", () => {
  const derived = deriveReferences();
  const seed = registrySeed();

  it("derives a non-trivial inventory (sanity)", () => {
    expect(derived.fks.length).toBeGreaterThan(200);
    expect(seed.fkRows.size).toBeGreaterThan(200);
  });

  it("every FK onto profiles/workers in the migrations has a registry row", () => {
    const missing = derived.fks
      .filter((f) => !seed.fkRows.has(`${f.table}.${f.column}`))
      .map((f) => `${f.table}.${f.column}`);
    expect(missing, "add a row to privacy_erasure_registry_v3 (reviewed migration) for each").toEqual([]);
  });

  it("every registry row still points at a column the migrations declare (no stale decisions)", () => {
    const live = new Set(derived.fks.map((f) => `${f.table}.${f.column}`));
    const stale = [...seed.fkRows].filter(
      (k) => !live.has(k) && !k.startsWith("privacy_erasure_authorizations_v3.") && !k.startsWith("privacy_erasure_receipts_v3."),
    );
    expect(stale).toEqual([]);
  });

  it("every e-mail / phone / name column has a value rule or an explicit allowlist reason", () => {
    const missing = derived.identifiers
      .map((c) => `${c.table}.${c.column}`)
      .filter((k) => !seed.valueRows.has(k) && !(k in IDENTIFIER_ALLOWLIST));
    expect(missing, "add a privacy_erasure_value_rules_v3 row or an allowlist reason").toEqual([]);
  });
});
