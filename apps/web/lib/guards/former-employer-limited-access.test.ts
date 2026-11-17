import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * A FORMER EMPLOYER KEEPS LIMITED ACCESS (owner decision 2026-11-17;
 * 20261117060000_former_employer_limited_access_v1).
 *
 * After an employment ends, the organization keeps reading the journal entries
 * recorded up to the end date (retained history), and no new entry, no other
 * employer's entry and no personal entry. It can no longer change, add to or
 * decide on the person's records, and it cannot switch review back on. The
 * behaviour is proven on a real local database by
 * former-employer-access-isolated.spec.ts (FE-0..FE-2); this guard pins the SQL
 * those proofs depend on, and that the rollback restores main's definitions.
 */
const web = process.cwd();
const repo = join(web, "..", "..");
const read = (p: string) => readFileSync(join(repo, p), "utf8");
const NAME = "20261117060000_former_employer_limited_access_v1";
const MIG = `supabase/migrations/${NAME}.sql`;
const DOWN = `supabase/rollbacks/${NAME}.down.sql`;
const migrations = () => readdirSync(join(repo, "supabase/migrations")).filter((f) => f.endsWith(".sql")).sort();

/** SQL without comments, whitespace collapsed, lower case. */
const code = (sql: string) =>
  sql
    .replace(/--[^\n]*/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

/** One statement of a file, from its opening words to the next `;` (policies)
 *  or to the end of its `$…$` body (functions). */
function statement(sql: string, opening: string): string {
  const c = code(sql);
  const start = c.indexOf(opening.toLowerCase());
  expect(start, `the file has: ${opening}`).toBeGreaterThanOrEqual(0);
  const rest = c.slice(start);
  const dollar = rest.match(/ as (\$[a-z_]*\$)/);
  if (dollar && rest.indexOf(dollar[0]) < rest.indexOf(";")) {
    const tag = dollar[1]!;
    const open = rest.indexOf(dollar[0]) + dollar[0].length;
    return rest.slice(0, rest.indexOf(tag, open) + tag.length);
  }
  return rest.slice(0, rest.indexOf(";") + 1);
}

/** The latest definition of an object among main's migrations before this one. */
function previous(opening: string): string {
  const files = migrations().filter((f) => f < `${NAME}.sql` && code(read(`supabase/migrations/${f}`)).includes(opening.toLowerCase()));
  expect(files.length, `an earlier definition of: ${opening}`).toBeGreaterThan(0);
  const sql = read(`supabase/migrations/${files[files.length - 1]!}`);
  // #3421's 20261115120000 is a draft not on main; the rollback restores main.
  return statement(sql, opening);
}

const OBJECTS = [
  "create policy journal_entries_select on public.journal_entries",
  "create or replace function public.can_read_journal_entry_v1",
  "create policy journal_entry_work_items_update on public.journal_entry_work_items",
  "create policy journal_entry_metrics_write on public.journal_entry_metrics",
  "create policy journal_entry_confirmations_insert on public.journal_entry_confirmations",
  "create or replace function public.set_engagement_journal_review",
  "create or replace function public.reviewable_journal_entry_ids()",
] as const;

const WINDOW =
  "(rt.category <> 'education' and (ec.status in ('active', 'paused') or (ec.status = 'ended' and ec.ended_at is not null and";

describe("the read rule: retained history up to the end date, nothing new", () => {
  const sql = read(MIG);

  it("is the latest definition of every object it replaces", () => {
    for (const opening of OBJECTS) {
      const later = migrations()
        .filter((f) => f > `${NAME}.sql`)
        .filter((f) => code(read(`supabase/migrations/${f}`)).includes(opening.toLowerCase()));
      expect(later, opening).toEqual([]);
    }
  });

  it("runs inside one transaction", () => {
    const c = code(sql);
    expect(c.startsWith("begin;")).toBe(true);
    expect(c.endsWith("commit;")).toBe(true);
  });

  it("the policy keeps the person and the admin, and scopes a manager to the entry's own organization", () => {
    const p = statement(sql, OBJECTS[0]);
    expect(p).toContain("using ( owns_worker(worker_id) or is_admin() or exists (");
    expect(p).toContain("where ec.id = journal_entries.engagement_context_id and manages_organization(ec.organization_id) and (");
  });

  it("an ended relationship shows only entries created on or before its end date; no end date shows nothing", () => {
    const p = statement(sql, OBJECTS[0]);
    expect(p).toContain(WINDOW);
    expect(p).toContain("journal_entries.created_at < ((ec.ended_at + 1)::timestamp at time zone 'utc')");
  });

  it("carries #3421's learning rule unchanged (active and reviewed)", () => {
    const p = statement(sql, OBJECTS[0]);
    expect(p).toContain("(rt.category = 'education' and ec.status = 'active' and ec.journal_review_enabled is true)");
  });

  it("is fail-closed and data-driven: an inner join on the relationship type, no slug literal, no `not exists`", () => {
    const p = statement(sql, OBJECTS[0]);
    expect(p).toContain("join public.relationship_types rt on rt.slug = ec.relationship_slug");
    expect(p).not.toMatch(/left join/);
    expect(p).not.toMatch(/not exists/);
    expect(p).not.toMatch(/'(student|intern|employee|collaborator|owner|manager)'/);
  });

  it("the SECURITY DEFINER mirror applies the same predicate to the same entry", () => {
    const f = statement(sql, OBJECTS[1]);
    expect(f).toContain("security definer");
    expect(f).toContain("join public.relationship_types rt on rt.slug = ec.relationship_slug");
    expect(f).toContain("where ec.id = je.engagement_context_id and public.manages_organization(ec.organization_id) and (");
    expect(f).toContain(WINDOW);
    expect(f).toContain("je.created_at < ((ec.ended_at + 1)::timestamp at time zone 'utc')");
    expect(f).toContain("(rt.category = 'education' and ec.status = 'active' and ec.journal_review_enabled is true)");
  });
});

describe("writes: an ended relationship can no longer change or decide on the person's records", () => {
  const sql = read(MIG);

  it("work items, metrics and confirmations need a running relationship for a manager", () => {
    for (const opening of [OBJECTS[2], OBJECTS[3], OBJECTS[4]]) {
      expect(statement(sql, opening), opening).toContain("ec.status in ('active', 'paused')");
    }
    // Both arms of the work-item update.
    expect(statement(sql, OBJECTS[2]).match(/ec\.status in \('active', 'paused'\)/g)).toHaveLength(2);
  });

  it("review can always be switched off, never back on for an ended relationship", () => {
    const f = statement(sql, OBJECTS[5]);
    expect(f).toContain(
      "if p_enabled and v_status is distinct from 'active' and v_status is distinct from 'paused' then return 'engagement_not_active'; end if;",
    );
    // The refusal sits after the authority checks and before the write.
    expect(f.indexOf("return 'not_authorized'")).toBeLessThan(f.indexOf("'engagement_not_active'"));
    expect(f.indexOf("'engagement_not_active'")).toBeLessThan(f.indexOf("update public.engagement_contexts"));
  });

  it("the employer's review queue lists only running relationships", () => {
    expect(statement(sql, OBJECTS[6])).toContain("and ec.status in ('active', 'paused')");
  });

  it("adds no grant, table, column or data change", () => {
    const c = code(sql);
    expect(c).not.toMatch(/\b(alter table|create table|drop table|drop column|delete from|truncate)\b/);
    expect(c).not.toMatch(/\bupdate public\.(?!engagement_contexts set journal_review_enabled)/);
    expect(c).not.toMatch(/grant [a-z, ]+ on (table )?public\./);
    for (const g of c.match(/grant execute on function public\.[a-z_]+\([^)]*\) to [a-z_]+/g) ?? []) {
      expect(g.endsWith("to authenticated"), g).toBe(true);
    }
  });
});

describe("the rollback restores main's definitions exactly", () => {
  const down = read(DOWN);

  it("every object equals its latest definition before this migration", () => {
    for (const opening of OBJECTS) {
      expect(statement(down, opening), opening).toBe(previous(opening));
    }
  });

  it("the rollback carries no human-gate marker and runs in one transaction", () => {
    expect(down).not.toMatch(/(^|\r?\n)[ \t]*--[ \t]*@human-gate-approved\b/i);
    const c = code(down);
    expect(c.startsWith("begin;")).toBe(true);
    expect(c.endsWith("commit;")).toBe(true);
  });
});

describe("the local-stack proof travels with the SQL", () => {
  it("the walk covers every part of the rule", () => {
    const spec = read("apps/web/tests/e2e/former-employer-access-isolated.spec.ts");
    for (const phrase of [
      "A keeps only the entry recorded during the employment",
      "W still reads every one of their entries",
      "the work item is unchanged",
      "A cannot add a metric to the historical entry",
      "review cannot be switched back on for an ended employment",
      "A cannot confirm an entry of the ended employment",
      "the historical entry is intact and nothing was removed",
      "B still reads its own entry",
    ]) {
      expect(spec, phrase).toContain(phrase);
    }
  });

  it("the isolated job runs the walk, and runs when the migration changes", () => {
    const wf = read(".github/workflows/signup-isolated.yml");
    expect(wf).toContain("tests/e2e/former-employer-access-isolated.spec.ts");
    expect(wf).toContain(`supabase/migrations/${NAME}.sql`);
  });
});
