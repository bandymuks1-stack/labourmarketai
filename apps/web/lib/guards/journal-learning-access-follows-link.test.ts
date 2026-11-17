import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * AN ORGANIZATION'S ACCESS TO A LEARNER'S JOURNAL FOLLOWS THE LINK
 * (owner decision, binding, 2026-11-17;
 * 20261115120000_journal_learning_access_follows_link_v1).
 *
 * An ended relationship removes current access, never the organization's
 * lawfully retained records. For a learning relationship
 * (relationship_types.category = 'education') an organization manager reaches
 * a journal entry only while the engagement is active AND journal review is on
 * — in the RLS policy AND in the two SECURITY DEFINER copies of the manager
 * rule (RLS does not apply inside them): journal_entry_review_authority_v1
 * (the employer review basis behind reviewable_journal_entry_ids and
 * review_journal_entry) and can_read_journal_entry_v1. Every other
 * relationship keeps what it had. Proven on a real local database by
 * signup-isolated.spec.ts E-4 and role-journeys-isolated J-WRK; this guard
 * pins the SQL those proofs depend on.
 */
const web = process.cwd();
const repo = join(web, "..", "..");
const read = (p: string) => readFileSync(join(repo, p), "utf8");
const NAME = "20261115120000_journal_learning_access_follows_link_v1";
const MIG = `supabase/migrations/${NAME}.sql`;
const DOWN = `supabase/rollbacks/${NAME}.down.sql`;
/** The one later migration allowed to redefine these objects: it carries this rule. */
const SUCCESSOR = "20261117060000_former_employer_limited_access_v1.sql";

/** SQL without comments, whitespace collapsed, lower case. */
const code = (sql: string) =>
  sql
    .replace(/--[^\n]*/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

/** The `create or replace function public.<name>( … $$;` statement of a file. */
function fnOf(sql: string, name: string): string {
  const c = code(sql);
  const start = c.indexOf(`create or replace function public.${name}(`);
  expect(start, `the file defines ${name}`).toBeGreaterThanOrEqual(0);
  const open = c.indexOf("$$", start);
  const close = c.indexOf("$$", open + 2);
  return c.slice(start, c.indexOf(";", close) + 1);
}

/** Every GRANT / REVOKE statement of a file, in order. */
const privileges = (sql: string) => code(sql).match(/\b(grant|revoke) [^;]*;/g) ?? [];

const AUTH = "journal_entry_review_authority_v1";
const READ = "can_read_journal_entry_v1";
const AUTH_FROM = "supabase/migrations/20261003150500_journal_counterparty_review_authority_v1.sql";
const READ_FROM = "supabase/migrations/20260819190000_journal_task_evidence_link_v1.sql";
/** The ONE condition each definer function gains (normalized SQL). */
const AUTH_ADDED =
  " and exists ( select 1 from public.journal_entries je2 join public.engagement_contexts ec2 on ec2.id = je2.engagement_context_id where je2.id = p_entry_id and (exists (select 1 from public.relationship_types rt where rt.slug = ec2.relationship_slug and rt.category <> 'education') or ec2.status = 'active') )";
const READ_ADDED =
  " and ( exists ( select 1 from public.relationship_types rt where rt.slug = ec.relationship_slug and rt.category <> 'education' ) or (ec.status = 'active' and ec.journal_review_enabled is true) )";

/** The `create policy journal_entries_select … ;` statement of a file. */
function policyOf(sql: string): string {
  const c = code(sql);
  const start = c.indexOf("create policy journal_entries_select on public.journal_entries");
  expect(start, "the file defines journal_entries_select").toBeGreaterThanOrEqual(0);
  return c.slice(start, c.indexOf(";", start) + 1);
}

describe("journal_entries_select: a learning relationship reads the journal only while active and reviewed", () => {
  const policy = policyOf(read(MIG));

  it("is the latest definition of the policy except its one successor, which carries this rule (former employer, #3474)", () => {
    const later = readdirSync(join(repo, "supabase/migrations"))
      .filter((f) => f.endsWith(".sql") && f > `${NAME}.sql`)
      .filter((f) => /policy\s+journal_entries_select\b/i.test(code(read(`supabase/migrations/${f}`))));
    // Applied AFTER this migration (R2, 2026-11-17); it keeps the learning
    // condition word for word, pinned by former-employer-limited-access.test.ts.
    expect(later).toEqual([SUCCESSOR]);
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

  it("changes nothing else: one policy, two definer functions, the existing ACL restated, no data", () => {
    const c = code(read(MIG));
    expect(c).not.toMatch(/\b(update|delete from|insert into|alter table|alter function|drop function)\b/);
    expect(c.match(/create policy/g)).toHaveLength(1);
    expect(c.match(/create or replace function/g)).toHaveLength(2);
    expect(privileges(read(MIG))).toEqual([
      `revoke all on function public.${AUTH}(uuid, uuid) from public, anon, authenticated;`,
      `revoke all on function public.${READ}(uuid) from public;`,
      `revoke all on function public.${READ}(uuid) from anon;`,
      `grant execute on function public.${READ}(uuid) to authenticated;`,
    ]);
  });
});

describe("the SECURITY DEFINER copies of the manager rule follow the same condition", () => {
  const sql = read(MIG);

  it("journal_entry_review_authority_v1 is the current body with ONLY the learning condition added", () => {
    const now = fnOf(sql, AUTH);
    expect(now).toContain(
      `not public.profiles_co_manage_organization_v1(v_subject, p_actor)${AUTH_ADDED} then return jsonb_build_object('basis', 'employer'`,
    );
    expect(now.replace(AUTH_ADDED, "")).toBe(fnOf(read(AUTH_FROM), AUTH));
  });

  it("can_read_journal_entry_v1 is the previous body with ONLY the policy's condition added", () => {
    const now = fnOf(sql, READ);
    expect(now).toContain(`and public.manages_organization(ec.organization_id)${READ_ADDED} )`);
    expect(now.replace(READ_ADDED, "")).toBe(fnOf(read(READ_FROM), READ));
  });

  it("keeps signature, security definer and search_path", () => {
    expect(fnOf(sql, AUTH)).toMatch(
      /^create or replace function public\.journal_entry_review_authority_v1\(p_entry_id uuid, p_actor uuid\) returns jsonb language plpgsql stable security definer set search_path to 'public' as \$\$/,
    );
    expect(fnOf(sql, READ)).toMatch(
      /^create or replace function public\.can_read_journal_entry_v1\(p_entry_id uuid\) returns boolean language sql stable security definer set search_path = public as \$\$/,
    );
  });

  it("they are the latest definitions except their one successor, which carries this rule (#3474)", () => {
    const fn = new RegExp(`function\\s+(public\\.)?(${AUTH}|${READ})\\b`, "i");
    const later = readdirSync(join(repo, "supabase/migrations"))
      .filter((f) => f.endsWith(".sql") && f > `${NAME}.sql`)
      .filter((f) => fn.test(code(read(`supabase/migrations/${f}`))));
    expect(later).toEqual([SUCCESSOR]);
  });
});

describe("the rollback restores the previous policy and function bodies exactly", () => {
  it("the .down.sql policy equals the 0013 definition", () => {
    expect(policyOf(read(DOWN))).toBe(policyOf(read("supabase/migrations/0013_work_journal_m1.sql")));
  });

  it("restores both function bodies exactly as their source migrations defined them", () => {
    expect(fnOf(read(DOWN), AUTH)).toBe(fnOf(read(AUTH_FROM), AUTH));
    expect(fnOf(read(DOWN), READ)).toBe(fnOf(read(READ_FROM), READ));
  });

  it("restates the same grants and runs in one transaction", () => {
    const c = code(read(DOWN));
    expect(c.startsWith("begin;")).toBe(true);
    expect(c.endsWith("commit;")).toBe(true);
    expect([...privileges(read(DOWN))].sort()).toEqual([...privileges(read(MIG))].sort());
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
    expect(spec).toContain("ended link: nothing in the institution's review queue");
    expect(spec).toContain("ended link: a review decision is refused");
    expect(spec).toContain("ended link: can_read_journal_entry_v1 is false");
    expect(spec).toContain("the institution still reads its own recognition");
  });

  it("role-journeys J-WRK still reads the confirmed entry as the employer", () => {
    const spec = read("apps/web/tests/e2e/role-journeys-isolated.spec.ts");
    expect(spec).toContain("the employer still reads the entry it confirmed");
    expect(spec).toContain("active work relationship: the entry is in the employer's review queue");
  });

  it("the isolated job runs when the migration changes", () => {
    expect(read(".github/workflows/signup-isolated.yml")).toContain(`supabase/migrations/${NAME}.sql`);
  });
});
