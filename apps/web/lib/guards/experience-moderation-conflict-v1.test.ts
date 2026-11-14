import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Register 2.24 — the conflict-of-interest rule lives in the DATABASE
 * (20261114070000). The five moderator functions of 20260802120000 checked
 * only is_admin(), so a moderator who was a party could call them directly,
 * below the web app. Behaviour is proven on PostgreSQL 16 by
 * scripts/db-proof/experience-moderation-conflict-v1.sh; this pins the shape.
 */
const ROOT = resolve(__dirname, "..", "..", "..", "..");
const NAME = "20261114070000_experience_moderation_conflict_v1";
const sqlOnly = (s: string) => s.replace(/\r/g, "").split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
const v1 = sqlOnly(readFileSync(resolve(ROOT, "supabase/migrations/20260802120000_experience_records_v1.sql"), "utf8"));
const up = sqlOnly(readFileSync(resolve(ROOT, `supabase/migrations/${NAME}.sql`), "utf8"));
const down = sqlOnly(readFileSync(resolve(ROOT, `supabase/rollbacks/${NAME}.down.sql`), "utf8"));
const FNS = [
  "start_experience_moderation",
  "decide_experience_moderation",
  "moderate_experience_response",
  "review_experience_dispute",
  "resolve_experience_dispute",
];
const bodyOf = (sql: string, fn: string) => {
  const i = sql.indexOf(`create or replace function public.${fn}(`);
  return sql.slice(i, sql.indexOf("$$;", i) + 3);
};

describe("the database refuses a moderator who is a party", () => {
  it("each of the five functions refuses a party right after the unchanged admin check", () => {
    for (const fn of FNS) {
      const b = bodyOf(up, fn);
      const admin = b.indexOf("if not public.is_admin() then return jsonb_build_object('ok', false, 'code', 'not_authorized'); end if;");
      const party = b.indexOf("experience_moderator_is_party(");
      const write = b.indexOf("update public.experience_");
      expect(admin, fn).toBeGreaterThan(-1);
      expect(party, fn).toBeGreaterThan(admin);
      expect(party, `${fn}: the refusal must come before any write`).toBeLessThan(write);
      expect(b, fn).toContain("'code', 'conflict_of_interest'");
      expect(b, fn).toContain("'moderator_conflict_refused'");
      expect(b, fn).toMatch(/security definer set search_path = public/);
    }
  });
  it("a party is the author, the subject, or a manager of the organization on either side", () => {
    const h = bodyOf(up, "experience_moderator_is_party");
    expect(h).toContain("r.author_profile_id = auth.uid()");
    expect(h).toContain("r.subject_profile_id = auth.uid()");
    expect(h).toContain("public.manages_organization(r.subject_organization_id)");
    expect(h).toContain("public.manages_organization(r.author_organization_id)");
  });
  it("the reply's own author is a party to its moderation", () => {
    expect(bodyOf(up, "moderate_experience_response")).toContain("x.author_profile_id = auth.uid()");
  });
  it("the helper is internal: no client role may call it", () => {
    expect(up).toMatch(/revoke all on function public\.experience_moderator_is_party\(uuid\) from public, anon, authenticated;/);
    expect(up).not.toMatch(/grant execute on function public\.experience_moderator_is_party/);
  });
  it("the five keep exactly their v1 grants: authenticated only", () => {
    for (const fn of FNS) {
      expect(up, fn).toMatch(new RegExp(`revoke execute on function public\\.${fn}\\([^)]*\\) from public, anon;`));
      expect(up, fn).toMatch(new RegExp(`grant execute on function public\\.${fn}\\([^)]*\\) to authenticated;`));
    }
    expect(up).not.toMatch(/to anon|to public/i);
  });
  it("'changed' is no longer a recordable decision; the column's CHECK is not narrowed", () => {
    expect(bodyOf(up, "resolve_experience_dispute")).toContain("if p_resolution not in ('upheld','removed') then");
    expect(up).not.toMatch(/alter table|drop |create policy|alter policy/i);
  });
  it("every other line of the five bodies is the v1 line", () => {
    for (const fn of FNS) {
      const stripped = bodyOf(up, fn)
        .replace(/  if (?:public\.experience_moderator_is_party\(p_id\)|exists \([\s\S]*?\)\)\)) then\n    perform public\.experience_audit\('experience_(?:record|response)', p_id, 'moderator_conflict_refused', null, null, null\);\n    return jsonb_build_object\('ok', false, 'code', 'conflict_of_interest'\);\n  end if;\n/, "")
        .replace("if p_resolution not in ('upheld','removed') then", "if p_resolution not in ('upheld','changed','removed') then");
      expect(stripped, fn).toBe(bodyOf(v1, fn));
    }
  });
});

describe("rollback and proof", () => {
  it("the rollback restores the five v1 bodies byte for byte and drops the helper", () => {
    for (const fn of FNS) expect(bodyOf(down, fn), fn).toBe(bodyOf(v1, fn));
    expect(down).toContain("drop function if exists public.experience_moderator_is_party(uuid);");
    expect(down).not.toMatch(/delete from|truncate|drop table|drop column/i);
  });
  it("the PG16 proof ships with the migration", () => {
    expect(existsSync(resolve(ROOT, "scripts/db-proof/experience-moderation-conflict-v1.sh"))).toBe(true);
  });
});
