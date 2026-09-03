import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Guard: K2-1 — company contact columns are not readable by every signed-in
 * person (FINAL COMPLETION Train K2, 2026-09-02).
 *
 * Pins the migration shape (column-level SELECT grant without the private
 * columns; two SECURITY DEFINER readers scoped to the owner / an admin), the
 * rollback, and the app side: the owner and admin surfaces read private
 * columns ONLY through the readers in lib/company/company-private-read.ts,
 * which fall back to the direct read while the migration is unapplied — so
 * the same code is correct before and after apply. No other app path may
 * select a private company column from the table.
 */
const root = resolve(__dirname, "..", "..");
const repo = resolve(root, "..", "..");
const read = (rel: string) => readFileSync(resolve(root, rel), "utf8");
const readRepo = (rel: string) => readFileSync(resolve(repo, rel), "utf8");
const code = (src: string) => src.replace(/\/\*[\s\S]*?\*\/|^\s*\/\/.*$|^\s*--.*$/gm, "");

const PRIVATE = ["contact_email", "contact_phone", "address", "registration_code", "requester_role", "verification_note", "requested_at"];

describe("Guard: K2-1 migration", () => {
  const sql = code(readRepo("supabase/migrations/20260902210000_companies_contact_minimization_v1.sql"));

  it("narrows the authenticated SELECT grant to discovery columns only", () => {
    expect(sql).toMatch(/revoke select on public\.companies from authenticated/);
    const grant = sql.match(/grant select \(([\s\S]*?)\) on public\.companies to authenticated/);
    expect(grant, "column-level grant present").not.toBeNull();
    const cols = (grant?.[1] ?? "").split(",").map((c) => c.trim());
    for (const p of PRIVATE) expect(cols, `private column ${p} must not be granted`).not.toContain(p);
    for (const pub of ["id", "profile_id", "legal_name", "display_name", "country", "verification_status"]) {
      expect(cols, `discovery column ${pub} stays readable`).toContain(pub);
    }
  });

  it("defines the owner and admin readers as SECURITY DEFINER, executable by authenticated only", () => {
    expect(sql).toMatch(/function public\.list_own_companies_private_v1\(\)[\s\S]*?security definer[\s\S]*?profile_id = auth\.uid\(\)/);
    expect(sql).toMatch(/function public\.admin_list_companies_private_v1\(\)[\s\S]*?security definer[\s\S]*?is_admin\(\)/);
    for (const fn of ["list_own_companies_private_v1", "admin_list_companies_private_v1"]) {
      expect(sql).toMatch(new RegExp(`revoke all on function public\\.${fn}\\(\\) from anon`));
      expect(sql).toMatch(new RegExp(`grant execute on function public\\.${fn}\\(\\) to authenticated`));
    }
    expect(sql).not.toMatch(/drop table|drop column|delete from|truncate/i);
  });

  it("ships a rollback that restores the full grant and drops the readers", () => {
    const down = readRepo("supabase/rollbacks/20260902210000_companies_contact_minimization_v1.down.sql");
    expect(down).toMatch(/grant select on public\.companies to authenticated/);
    expect(down).toMatch(/drop function if exists public\.list_own_companies_private_v1\(\)/);
    expect(down).toMatch(/drop function if exists public\.admin_list_companies_private_v1\(\)/);
  });
});

describe("Guard: K2-1 app side", () => {
  const reader = read("lib/company/company-private-read.ts");

  it("the readers try the RPC first and fall back to the direct read only when the function is absent", () => {
    expect(reader).toMatch(/rpc\("list_own_companies_private_v1"\)/);
    expect(reader).toMatch(/rpc\("admin_list_companies_private_v1"\)/);
    expect(reader).toMatch(/UNDEFINED_FUNCTION_CODES = new Set\(\["42883", "PGRST202"\]\)/);
    expect(reader).toMatch(/\.eq\("profile_id", profileId\)/);
  });

  it("owner + admin surfaces read private columns through the readers, never the table directly", () => {
    const setup = code(read("lib/company/company-setup.ts"));
    const admin = code(read("lib/admin/company-verification.ts"));
    expect(setup).toMatch(/readOwnCompaniesPrivate\(supabase, user\.id\)/);
    expect(admin).toMatch(/readAllCompaniesPrivateAsAdmin\(supabase\)/);
    for (const src of [setup, admin]) {
      for (const p of ["contact_email", "contact_phone", "registration_code"]) {
        // The column may be MAPPED from a row; it may not be SELECTED from the table here.
        expect(src).not.toMatch(new RegExp(`\\.select\\([^)]*${p}`));
      }
    }
  });

  it("no other app path selects a private company column from the table", () => {
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const e of readdirSync(dir)) {
        const full = resolve(dir, e);
        if (statSync(full).isDirectory()) walk(full);
        else if (/\.(ts|tsx)$/.test(e) && !/\.test\.tsx?$/.test(e)) files.push(full);
      }
    };
    walk(resolve(root, "lib"));
    walk(resolve(root, "app"));
    const offenders: string[] = [];
    for (const f of files) {
      if (f.endsWith("company-private-read.ts")) continue;
      const src = code(readFileSync(f, "utf8"));
      const m = src.match(/\.from\("companies"\)[\s\S]{0,200}?\.select\(\s*"([^"]*)"/g) ?? [];
      for (const sel of m) {
        if (PRIVATE.some((p) => sel.includes(p))) offenders.push(f.replace(root, ""));
      }
    }
    expect(offenders).toEqual([]);
  });
});
