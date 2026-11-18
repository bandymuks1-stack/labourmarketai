import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * A FORMER EMPLOYER KEEPS LIMITED ACCESS (owner decision 2026-11-17;
 * 20261118164500_former_employer_limited_access_v1).
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
const NAME = "20261118164500_former_employer_limited_access_v1";
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
  // This migration is applied after #3421's 20261115120000 (R2): for the three
  // objects both define, the previous definition is #3421's.
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
  "create or replace function public.journal_entry_review_authority_v1",
] as const;

const WINDOW =
  "(rt.category <> 'education' and (ec.status in ('active', 'paused') or (ec.status = 'ended' and public.org_retains_journal_entry_v1(";

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

  it("an ended relationship shows only entries whose original record is retained; no end date shows nothing", () => {
    const p = statement(sql, OBJECTS[0]);
    expect(p).toContain(WINDOW);
    expect(p).toContain("public.org_retains_journal_entry_v1(journal_entries.id))))");
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
    expect(f).toContain("public.org_retains_journal_entry_v1(je.id))))");
    expect(f).toContain("(rt.category = 'education' and ec.status = 'active' and ec.journal_review_enabled is true)");
  });
});

describe("retained history is decided by the ORIGINAL record (owner option A)", () => {
  const sql = read(MIG);
  const ROOT = "create or replace function public.journal_entry_chain_root_at_v1";
  const RETAINS = "create or replace function public.org_retains_journal_entry_v1";

  it("the chain root walks back through supersede and correction_of, bounded, and is internal", () => {
    const f = statement(sql, ROOT);
    expect(f).toContain("security definer");
    expect(f).toContain("left join public.journal_entries pred on pred.superseded_by = up.node_id");
    expect(f).toContain("join public.journal_entries o on o.id = coalesce(pred.id, up.node_correction_of)");
    expect(f).toContain("where up.depth < 32");
    expect(f).toContain("order by up.depth desc limit 1");
    // R2 P3-1 (owner point 5): the walk never leaves the entry's own context, so a
    // personal or another organization's record moved in after the end is not retained.
    expect(f).toContain("e.engagement_context_id as ctx");
    expect(f).toContain("and o.engagement_context_id is not distinct from up.ctx");
    expect(code(sql)).toContain(
      "revoke all on function public.journal_entry_chain_root_at_v1(uuid) from public, anon, authenticated;",
    );
    expect(code(sql)).not.toMatch(/grant execute on function public\.journal_entry_chain_root_at_v1/);
  });

  it("the organization retains an entry only when it manages it, the relationship ended outside education with an end date, and the ORIGINAL was created before the end of that day", () => {
    const f = statement(sql, RETAINS);
    expect(f).toContain("security definer");
    expect(f).toContain(
      "select public.journal_entry_chain_root_at_v1(je.id) < ((ec.ended_at + 1)::timestamp at time zone 'utc')",
    );
    for (const cond of [
      "and ec.status = 'ended'",
      "and ec.ended_at is not null",
      "and rt.category <> 'education'",
      "and public.manages_organization(ec.organization_id)",
    ]) {
      expect(f, cond).toContain(cond);
    }
    expect(f).toContain("), false);");
  });

  it("the rollback drops both added functions after restoring what referenced them", () => {
    const c = code(read(DOWN));
    const dropRetains = c.indexOf("drop function if exists public.org_retains_journal_entry_v1(uuid);");
    const dropRoot = c.indexOf("drop function if exists public.journal_entry_chain_root_at_v1(uuid);");
    expect(dropRetains).toBeGreaterThan(c.indexOf("create policy journal_entries_select"));
    expect(dropRetains).toBeGreaterThan(c.indexOf("create or replace function public.can_read_journal_entry_v1"));
    expect(dropRoot).toBeGreaterThan(dropRetains);
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

  it("the employer review basis needs a running relationship (R2 P2-1): learning while active, any other while active or paused", () => {
    const f = statement(sql, OBJECTS[7]);
    expect(f).toContain("security definer");
    expect(f).toContain(
      "and (ec2.status = 'active' or (ec2.status = 'paused' and exists (select 1 from public.relationship_types rt where rt.slug = ec2.relationship_slug and rt.category <> 'education')))",
    );
    // The condition sits inside the employer branch, after the review switch and the management checks.
    expect(f.indexOf("if v_org is not null and v_enabled")).toBeLessThan(f.indexOf("(ec2.status = 'active' or"));
    expect(f.indexOf("(ec2.status = 'active' or")).toBeLessThan(f.indexOf("'basis', 'employer'"));
    // #3421's escape for every non-learning relationship, whatever its status, is gone.
    expect(f).not.toMatch(/rt\.category <> 'education'\) or ec2\.status = 'active'/);
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

describe("corrections of an ended relationship's records stay in its context (owner 2026-11-18, R2 P3-4)", () => {
  const sql = read(MIG);
  const ANC = "create or replace function public.journal_entries_ancestor_context_v1()";
  const SUC = "create or replace function public.journal_entries_successor_context_v1()";

  it("a correction of a confirmed record of an ended relationship takes the original's context, for the same worker only", () => {
    const f = statement(sql, ANC);
    expect(f).toContain("security definer");
    expect(f).toContain("where o.id = new.correction_of and o.worker_id = new.worker_id and ec.status = 'ended'");
    expect(f).toContain("new.engagement_context_id := v_ctx");
    const c = code(sql);
    expect(c).toContain(
      "create trigger journal_entries_ancestor_context_v1 before insert on public.journal_entries for each row execute function public.journal_entries_ancestor_context_v1();",
    );
    // Fires before the ownership check and the hash, so both see the stored context.
    expect("journal_entries_ancestor_context_v1" < "journal_entries_attribution_guard_v1").toBe(true);
    expect("journal_entries_ancestor_context_v1" < "journal_entries_chain_v1").toBe(true);
  });

  it("an edit of a record of an ended relationship into another context is refused when it is linked", () => {
    const f = statement(sql, SUC);
    expect(f).toContain("if old.superseded_by is null and new.superseded_by is not null");
    expect(f).toContain("ec.id = old.engagement_context_id and ec.status = 'ended'");
    expect(f).toContain("s.engagement_context_id is distinct from old.engagement_context_id");
    expect(f).toContain("raise exception 'correction_context_locked");
    expect(code(sql)).toContain(
      "create trigger journal_entries_successor_context_v1 before update of superseded_by on public.journal_entries for each row execute function public.journal_entries_successor_context_v1();",
    );
  });

  it("both trigger functions are internal, and the rollback drops triggers before functions", () => {
    const c = code(sql);
    for (const fn of ["journal_entries_ancestor_context_v1", "journal_entries_successor_context_v1"]) {
      expect(c).toContain(`revoke all on function public.${fn}() from public, anon, authenticated;`);
      expect(c).not.toMatch(new RegExp(`grant execute on function public\\.${fn}`));
    }
    const d = code(read(DOWN));
    for (const fn of ["journal_entries_ancestor_context_v1", "journal_entries_successor_context_v1"]) {
      const trig = d.indexOf(`drop trigger if exists ${fn} on public.journal_entries;`);
      const func = d.indexOf(`drop function if exists public.${fn}();`);
      expect(trig, fn).toBeGreaterThan(0);
      expect(func, fn).toBeGreaterThan(trig);
    }
  });

  it("the app's edit sends the original context for a record of an ended relationship", () => {
    const a = read("apps/web/lib/journal/actions.ts");
    expect(a).toContain('.select("id, superseded_by, deleted_at, original_text, original_language, engagement_context_id")');
    expect(a).toMatch(/if \(oldContext\?\.status === "ended"\) engagementId = oldContextId;/);
    expect(a).toContain("p_engagement_context_id: engagementId,");
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
  it("it is applied after #3421 and says so", () => {
    const head = read(MIG).slice(0, 2500);
    expect(head).toContain("APPLY ORDER");
    expect(head).toContain("AFTER 20261115120000_journal_learning_access_");
    expect(NAME > "20261115120000_journal_learning_access_follows_link_v1").toBe(true);
  });

  it("the walk covers every part of the rule", () => {
    const spec = read("apps/web/tests/e2e/former-employer-access-isolated.spec.ts");
    for (const phrase of [
      "A keeps only the entries recorded during the employment",
      "W still reads every one of their entries",
      "the work item is unchanged",
      "A cannot add a metric to the historical entry",
      "review cannot be switched back on for an ended employment",
      "A cannot confirm an entry of the ended employment",
      "the historical entry is intact and nothing was removed",
      "B still reads its own entry",
      "an ended employment with review left on decides nothing",
      "a paused relationship keeps A's reads, including the entry filed during the pause",
      "a paused relationship keeps A's review basis",
      "W's corrections of retained records stay with A, beside their originals",
      "each correction is traceable to its original, its author and its time",
      "a personal or another organization's record moved into the ended context after the end stays out of A's reach",
      "an edit of a historical record into the personal journal is refused, and nothing is written",
      "a correction of a confirmed historical record stays in the employment's context, and A reads it",
      "the original's text, author, time and hash are unchanged by its corrections",
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
