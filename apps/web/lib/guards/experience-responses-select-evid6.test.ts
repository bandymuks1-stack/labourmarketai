import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * GUARD — EVID-6: experience_responses_select resolves the REPLY's moderation
 * status (20261002143000_experience_responses_select_reply_status_v1).
 *
 * THE DEFECT. The record author's branch of the SELECT policy tested
 * `moderation_status = 'published'` inside `exists (select 1 from
 * experience_records r ...)`, where the unqualified column binds to `r` (the
 * RECORD). The REPLY's own status was never consulted, so the record author
 * could read a reply that moderation had not published.
 *
 * Static, secret-free, no database. The behavioural proof (the exposure
 * reproduced on the live policy text, then refused; every other actor
 * unchanged) is scripts/db-proof/evid6-experience-responses.sh on a real
 * PostgreSQL 16.
 */

const REPO = join(__dirname, "..", "..", "..", "..");
const MIGRATIONS = join(REPO, "supabase", "migrations");
const NAME = "20261002143000_experience_responses_select_reply_status_v1";
const lf = (s: string) => s.replace(/\r\n/g, "\n");
const UP = lf(readFileSync(join(MIGRATIONS, `${NAME}.sql`), "utf8"));
const DOWN = lf(readFileSync(join(REPO, "supabase", "rollbacks", `${NAME}.down.sql`), "utf8"));
const code = (s: string) =>
  s
    .split("\n")
    .map((l) => l.replace(/\s--\s.*$|^\s*--.*$/, ""))
    .join("\n");
const flat = (s: string) => code(s).replace(/\s+/g, " ").trim();

describe("EVID-6 — the fix", () => {
  it("changes ONE policy in place (ALTER POLICY ... USING): no drop/create, no role change", () => {
    const c = flat(UP);
    expect(c).toMatch(/^alter policy experience_responses_select on public\.experience_responses using \(/);
    expect(c).not.toMatch(/\b(drop|create)\s+policy\b/i);
    expect(c).not.toMatch(/\bto\s+(anon|public|authenticated)\b/i);
    expect(c.match(/alter policy/gi)?.length).toBe(1);
  });

  it("the record author's branch now requires the REPLY's own moderation_status = 'published' (fully qualified)", () => {
    const c = flat(UP);
    expect(c).toContain("public.experience_responses.moderation_status = 'published'");
    // and still requires the RECORD to be published and authored by the caller
    expect(c).toContain("r.author_profile_id = auth.uid()");
    expect(c).toContain("r.moderation_status = 'published'");
    expect(c).toContain("r.id = public.experience_responses.experience_record_id");
    // every column reference in the policy is qualified
    expect(c).not.toMatch(/\band moderation_status\b/);
    expect(c).not.toMatch(/[^.\w]moderation_status\s*=/);
  });

  it("the reply author's branch and the admin branch are unchanged (never narrowed)", () => {
    const c = flat(UP);
    expect(c).toContain("public.experience_responses.author_profile_id = auth.uid() or public.is_admin() or (");
    // strictly narrowing: the new third branch is an AND of the old branch with one more condition
    expect(c).toMatch(/or \( public\.experience_responses\.moderation_status = 'published' and exists \(/);
  });

  it("is strictly narrowing: no `or true`, no `using (true)`, no widening of the reply/admin branches", () => {
    const c = flat(UP);
    expect(c).not.toMatch(/using\s*\(\s*true\s*\)/i);
    expect(c).not.toMatch(/\bor\s+true\b/i);
    expect(c).not.toMatch(/\bor\s+exists\s*\(\s*select 1 from public\.experience_records r where r\.id = public\.experience_responses\.experience_record_id and r\.author_profile_id = auth\.uid\(\) and r\.moderation_status = 'published'\s*\)\s*\)\s*;?$/i);
  });

  it("touches nothing else: no table, column, grant, function, trigger, data or other policy", () => {
    const c = code(UP).replace(/\$([a-z_]*)\$[\s\S]*?\$\1\$/gi, "");
    expect(c).not.toMatch(/\b(create|alter|drop)\s+(table|index|trigger|type|function|policy\s+(?!experience_responses_select))/i);
    expect(c).not.toMatch(/\b(grant|revoke)\b/i);
    expect(c).not.toMatch(/\b(insert\s+into|delete\s+from|update\s+public\.|truncate)\b/i);
    expect(c).not.toMatch(/submit_experience_response|moderate_experience_response/);
  });

  it("is flagged for the human gate: marker, DO NOT APPLY header, rollback has no marker", () => {
    expect(UP).toMatch(/(^|\n)[ \t]*--[ \t]*@human-gate-approved\b/i);
    expect(UP).toContain("needs-human-gate");
    expect(UP).toContain("DO NOT APPLY");
    expect(DOWN).not.toMatch(/(^|\n)[ \t]*--[ \t]*@human-gate-approved\b/i);
  });
});

describe("EVID-6 — the rollback restores the live pre-image and says so", () => {
  const ORIGINAL = lf(readFileSync(join(MIGRATIONS, "20260802120000_experience_records_v1.sql"), "utf8"));

  it("is a policy swap only and states plainly that it reintroduces the defect", () => {
    const c = flat(DOWN);
    expect(c).toMatch(/^alter policy experience_responses_select on public\.experience_responses using \(/);
    expect(c).not.toMatch(/\b(drop|create)\s+policy\b|\bgrant\b|\brevoke\b|\binsert\b|\bdelete\b|\bupdate\b/i);
    expect(DOWN).toMatch(/REINTRODUCES EVID-6/);
    expect(DOWN).toMatch(/PREFER FIXING FORWARD/i);
  });

  it("restores the live expression: the only moderation_status consulted is the RECORD's (r.)", () => {
    const c = flat(DOWN);
    expect(c).toContain("author_profile_id = auth.uid()");
    expect(c).toContain("public.is_admin()");
    expect(c).toContain("r.moderation_status = 'published'");
    expect(c).not.toContain("experience_responses.moderation_status");
  });

  it("and that expression is the original policy of 20260802120000 (same three terms)", () => {
    const orig = flat(ORIGINAL.slice(ORIGINAL.indexOf("create policy experience_responses_select")));
    for (const term of ["author_profile_id = auth.uid()", "public.is_admin()", "r.author_profile_id = auth.uid()"]) {
      expect(orig).toContain(term);
    }
    // the original's unqualified `moderation_status = 'published'` sits INSIDE the exists() on r
    expect(orig).toMatch(/and moderation_status = 'published' \)/);
  });
});

describe("EVID-6 — the table keeps exactly one policy and no new reader", () => {
  it("no migration other than the original creation and this fix defines a policy on experience_responses", () => {
    const owners: string[] = [];
    for (const f of readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort()) {
      const src = code(lf(readFileSync(join(MIGRATIONS, f), "utf8")));
      if (/\b(create|alter|drop)\s+policy\s+(if exists\s+)?\w+\s+on\s+(public\.)?experience_responses\b/i.test(src)) owners.push(f);
    }
    expect(owners).toEqual(["20260802120000_experience_records_v1.sql", `${NAME}.sql`]);
  });

  it("writes stay RPC-only: no insert/update/delete policy or grant on experience_responses anywhere", () => {
    for (const f of readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql"))) {
      const src = code(lf(readFileSync(join(MIGRATIONS, f), "utf8")));
      expect(src, f).not.toMatch(/create\s+policy\s+\w+\s+on\s+(public\.)?experience_responses\s+for\s+(insert|update|delete|all)\b/i);
      expect(src, f).not.toMatch(/grant\s+(insert|update|delete|all)[^;]*\bon\s+(public\.)?experience_responses\b/i);
      expect(src, f).not.toMatch(/grant\s+[^;]*\bon\s+(public\.)?experience_responses\s+to\s+(anon|public)\b/i);
    }
  });
});
