import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Guard: the company description save has ONE write path with the owner's
 * boundary (owner decision 2026-09-24, option b): a SECURITY DEFINER function
 * gated by the existing `owns_company` (creator + active owner/admin — the
 * `manage-company-profile` capability), description only, <= 2000,
 * authenticated only, anonymous denied, no broader companies UPDATE grant,
 * the existing mirror trigger reused, a paired rollback.
 */
const root = resolve(__dirname, "..", "..");
const repo = resolve(root, "..", "..");
const readRepo = (rel: string) => readFileSync(resolve(repo, rel), "utf8");
const code = (src: string) => src.replace(/\/\*[\s\S]*?\*\/|^\s*--.*$/gm, "");

const NAME = "20260924130000_set_company_description_v1";

describe("Guard: set_company_description_v1 migration", () => {
  const sql = code(readRepo(`supabase/migrations/${NAME}.sql`));
  const fn = sql.match(
    /create or replace function public\.set_company_description_v1\(([\s\S]*?)\)([\s\S]*?)\$\$([\s\S]*?)\$\$;/,
  );
  const header = fn?.[2] ?? "";
  const body = fn?.[3] ?? "";

  it("is ONE security definer function with a pinned search_path", () => {
    expect(fn, "function present").not.toBeNull();
    expect(fn?.[1]).toMatch(/p_company_id uuid,\s*p_description text/);
    expect(header).toMatch(/security definer/);
    expect(header).toMatch(/set search_path = public, pg_temp/);
    expect(sql.match(/security definer/g)?.length).toBe(1);
  });

  it("gates on the existing owns_company boundary and a signed-in caller", () => {
    expect(body).toMatch(/if auth\.uid\(\) is null then/);
    expect(body).toMatch(/not public\.owns_company\(p_company_id\)/);
    // No second authority model: no membership or role list re-derived here.
    expect(body).not.toMatch(/company_memberships|is_admin\(\)|manages_organization/);
  });

  it("writes the description only, bounded at 2000, and nothing else", () => {
    expect(body).toMatch(/char_length\(p_description\) > 2000/);
    const updates = body.match(/update public\.companies\s+set ([\s\S]*?)\s+where id = p_company_id;/);
    expect(updates, "one UPDATE of the target row").not.toBeNull();
    expect(updates?.[1].trim()).toBe("description = nullif(p_description, '')");
    expect(body.match(/\bupdate\b/gi)?.length).toBe(1);
    expect(body).not.toMatch(/\b(insert|delete)\b/i);
  });

  it("EXECUTE for authenticated only; anon and public revoked; no table grant", () => {
    expect(sql).toMatch(/revoke all on function public\.set_company_description_v1\(uuid, text\) from public;/);
    expect(sql).toMatch(/revoke all on function public\.set_company_description_v1\(uuid, text\) from anon;/);
    expect(sql).toMatch(/grant execute on function public\.set_company_description_v1\(uuid, text\) to authenticated;/);
    expect(sql).not.toMatch(/grant (update|insert|delete|all)[^;]*on (table )?public\.companies/i);
    expect(sql).not.toMatch(/grant [^;]* to (anon|public)\b/i);
  });

  it("ships a paired rollback that only drops the function", () => {
    const down = code(readRepo(`supabase/rollbacks/${NAME}.down.sql`)).trim();
    expect(down).toBe("drop function if exists public.set_company_description_v1(uuid, text);");
  });
});
