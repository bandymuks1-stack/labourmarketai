import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * AN ORGANIZATION'S READ OF A LEARNER'S JOURNAL FOLLOWS THE LINK
 * (owner decision 2026-11-15, Lane L;
 * 20261115120000_journal_learning_access_follows_link_v1).
 *
 * For a learning relationship (relationship_types.category = 'education') an
 * organization manager reads a journal entry only while the engagement is
 * active AND journal review is on. Every other relationship keeps the read it
 * had (employer review / confirmation / hours). The behaviour is proven on a
 * real local database by signup-isolated.spec.ts E-4 and role-journeys-isolated
 * J-WRK; this guard pins the policy text those proofs depend on.
 */
const web = process.cwd();
const repo = join(web, "..", "..");
const read = (p: string) => readFileSync(join(repo, p), "utf8");
const NAME = "20261115120000_journal_learning_access_follows_link_v1";
const MIG = `supabase/migrations/${NAME}.sql`;
const DOWN = `supabase/rollbacks/${NAME}.down.sql`;

/** SQL without comments, whitespace collapsed, lower case. */
const code = (sql: string) =>
  sql
    .replace(/--[^\n]*/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

/** The `create policy journal_entries_select … ;` statement of a file. */
function policyOf(sql: string): string {
  const c = code(sql);
  const start = c.indexOf("create policy journal_entries_select on public.journal_entries");
  expect(start, "the file defines journal_entries_select").toBeGreaterThanOrEqual(0);
  return c.slice(start, c.indexOf(";", start) + 1);
}

describe("journal_entries_select: a learning relationship reads the journal only while active and reviewed", () => {
  const policy = policyOf(read(MIG));

  it("is the latest definition of the policy: no later migration redefines it", () => {
    const later = readdirSync(join(repo, "supabase/migrations"))
      .filter((f) => f.endsWith(".sql") && f > `${NAME}.sql`)
      .filter((f) => /policy\s+journal_entries_select\b/i.test(code(read(`supabase/migrations/${f}`))));
    expect(later).toEqual([]);
  });

  it("replaces the policy inside one transaction", () => {
    const c = code(read(MIG));
    expect(c).toMatch(
      /^begin; drop policy if exists journal_entries_select on public\.journal_entries; create policy journal_entries_select on public\.journal_entries for select using \(/,
    );
    expect(c.endsWith("commit;")).toBe(true);
  });

  it("keeps the person and the platform admin", () => {
    expect(policy).toContain("using ( owns_worker(worker_id) or is_admin() or exists (");
  });

  it("keeps every non-learning relationship exactly as before (employer review and confirmation)", () => {
    expect(policy).toContain(
      "where ec.id = journal_entries.engagement_context_id and manages_organization(ec.organization_id) and (",
    );
    expect(policy).toContain(
      "exists ( select 1 from public.relationship_types rt where rt.slug = ec.relationship_slug and rt.category <> 'education' )",
    );
  });

  it("opens a learning relationship only while it is active and review is on", () => {
    expect(policy).toContain("or (ec.status = 'active' and ec.journal_review_enabled is true)");
  });

  it("is fail-closed and data-driven: no `not exists` escape, no relationship slug literal", () => {
    expect(policy).not.toMatch(/not exists/);
    expect(policy).not.toMatch(/'(student|intern|employee|collaborator)'/);
    expect(policy).not.toMatch(/\bstatus\s*<>|status\s*!=|status\s+in\b/);
  });

  it("changes nothing else: one policy, no function, grant or data statement", () => {
    const c = code(read(MIG));
    expect(c).not.toMatch(/\b(create or replace function|grant|revoke|update|delete from|insert into|alter table)\b/);
    expect(c.match(/create policy/g)).toHaveLength(1);
  });
});

describe("the rollback restores the 0013 policy exactly", () => {
  it("the .down.sql policy equals the 0013 definition", () => {
    expect(policyOf(read(DOWN))).toBe(policyOf(read("supabase/migrations/0013_work_journal_m1.sql")));
  });

  it("the inline ROLLBACK block carries the same text", () => {
    const sql = read(MIG);
    const block = sql.slice(sql.indexOf("-- ROLLBACK (manual"));
    const uncommented = block.replace(/^--   ?/gm, "");
    expect(policyOf(uncommented)).toBe(policyOf(read("supabase/migrations/0013_work_journal_m1.sql")));
  });

  it("the rollback carries no human-gate marker", () => {
    expect(read(DOWN)).not.toMatch(/(^|\r?\n)[ \t]*--[ \t]*@human-gate-approved\b/i);
  });
});

describe("the local-stack proof travels with the policy", () => {
  it("signup-isolated E-4 reads the learner's journal as the institution after the link ends", () => {
    const spec = read("apps/web/tests/e2e/signup-isolated.spec.ts");
    expect(spec).toContain('test("E-4.');
    expect(spec).toContain("the institution reads none of the learner's journal");
  });

  it("role-journeys J-WRK still reads the confirmed entry as the employer", () => {
    const spec = read("apps/web/tests/e2e/role-journeys-isolated.spec.ts");
    expect(spec).toContain("the employer still reads the entry it confirmed");
  });

  it("the isolated job runs when the migration changes", () => {
    expect(read(".github/workflows/signup-isolated.yml")).toContain(`supabase/migrations/${NAME}.sql`);
  });
});
