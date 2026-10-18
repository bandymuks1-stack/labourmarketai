import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * BLOCKER A (owner decision 2026-10-06): no table created by the pending
 * migration chain may leave `authenticated` (or `anon`) holding TRUNCATE /
 * REFERENCES / TRIGGER through the Supabase bootstrap default ACL.
 *
 * Root cause (measured): 20261003150500 ended its revoke list at `anon`, so
 * `authenticated` kept all seven inherited privileges on two APPEND-ONLY
 * tables; TRUNCATE is outside both RLS and row triggers. Production holds
 * 0/216 such privileges, so the chain must reproduce that invariant instead
 * of relying on an out-of-ledger state.
 *
 * Static ratchet over migration TEXT (the live proof is the rolled-back
 * catalog query in the PR). Every `create table public.X` in a migration at or
 * after FIRST_CHAIN_VERSION must be named by a `revoke ... authenticated`
 * statement somewhere in the chain.
 */
const MIGRATIONS = join(__dirname, "..", "..", "..", "..", "supabase", "migrations");
const FIRST_CHAIN_VERSION = "20261003150000";
const CLOSURE = "20261006100400_append_only_privilege_closure_v1.sql";

const files = readdirSync(MIGRATIONS)
  .filter((f) => f.endsWith(".sql") && f.slice(0, 14) >= FIRST_CHAIN_VERSION)
  .sort();
const text = (f: string) => readFileSync(join(MIGRATIONS, f), "utf8").replace(/\r/g, "");
const chain = files.map((f) => ({ f, s: text(f) }));

function createdTables(): { file: string; table: string }[] {
  const out: { file: string; table: string }[] = [];
  for (const { f, s } of chain) {
    const re = /create table (?:if not exists )?public\.([a-z_0-9]+)/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(s))) out.push({ file: f, table: m[1].toLowerCase() });
  }
  return out;
}

/** All `revoke ... on <objects> from <roles>` statements in the chain. */
function revokes(): { objects: string; roles: string; what: string }[] {
  const out: { objects: string; roles: string; what: string }[] = [];
  for (const { s } of chain) {
    const noComments = s.replace(/--.*$/gm, "");
    const re = /revoke\s+([^;]*?)\s+on\s+(?:table\s+)?([^;]*?)\s+from\s+([^;]*?);/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(noComments))) {
      out.push({ what: m[1].toLowerCase(), objects: m[2].toLowerCase(), roles: m[3].toLowerCase() });
    }
  }
  return out;
}

describe("append-only / new-table privilege invariant (blocker A)", () => {
  it("the closure migration exists with its paired rollback", () => {
    expect(files).toContain(CLOSURE);
    const down = readFileSync(
      join(MIGRATIONS, "..", "rollbacks", CLOSURE.replace(/\.sql$/, ".down.sql")),
      "utf8",
    );
    expect(down).toMatch(/drop trigger if exists work_counterparty_links_no_truncate/);
  });

  it("every table created in the chain has `authenticated` explicitly revoked from the inherited TRUNCATE/REFERENCES/TRIGGER", () => {
    const rv = revokes();
    const uncovered = createdTables().filter(({ table }) => {
      return !rv.some(
        (r) =>
          new RegExp(`(^|[\\s,.])${table}([\\s,]|$)`).test(r.objects) &&
          /authenticated/.test(r.roles) &&
          /(^|\s|,)(all|truncate)(\s|,|$)/.test(r.what),
      );
    });
    expect(
      uncovered,
      `tables created in the chain whose authenticated privileges are inherited, not set: ${uncovered
        .map((u) => `${u.table} (${u.file})`)
        .join(", ")}`,
    ).toEqual([]);
  });

  it("both append-only tables refuse TRUNCATE for every role, owner included", () => {
    const s = text(CLOSURE);
    for (const t of ["work_counterparty_links", "journal_entry_review_submissions"]) {
      expect(s).toMatch(new RegExp(`before truncate on public\\.${t}`));
    }
    expect(s).toMatch(/revoke all on public\.work_counterparty_links, public\.journal_entry_review_submissions\s+from public, anon, authenticated, service_role/);
    // reads stay: authenticated + service_role keep SELECT only
    expect(s).toMatch(/grant select on public\.work_counterparty_links, public\.journal_entry_review_submissions\s+to authenticated, service_role/);
  });

  it("no migration in the chain grants TRUNCATE/REFERENCES/TRIGGER/ALL to anon or authenticated", () => {
    for (const { f, s } of chain) {
      const noComments = s.replace(/--.*$/gm, "");
      const re = /grant\s+([^;]*?)\s+on\s+[^;]*?\s+to\s+([^;]*?);/gi;
      let m: RegExpExecArray | null;
      while ((m = re.exec(noComments))) {
        const bad = /(^|\s|,)(truncate|references|trigger|all)(\s|,|$)/i.test(m[1]);
        const toApp = /\b(anon|authenticated)\b/i.test(m[2]);
        // `grant execute ... on function` is a different privilege class
        const onFunction = /\bon\s+function\b/i.test(m[0]);
        expect(bad && toApp && !onFunction, `${f}: ${m[0].slice(0, 120)}`).toBe(false);
      }
    }
  });
});
