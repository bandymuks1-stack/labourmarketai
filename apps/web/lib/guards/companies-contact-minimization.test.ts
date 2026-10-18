import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { ROLES_THAT_OPEN } from "@/lib/company/organization-authority";

/**
 * Guard: K2-1 v2 — company data minimization (supersedes the unapplied #1430
 * draft, which predated #1859's member access).
 *
 * Pins the migration shape (the authenticated grant keeps only discovery
 * columns; ONE SECURITY DEFINER reader admits exactly the creator, an active
 * ROLES_THAT_OPEN member of the bound organization, or an admin), the paired
 * rollback, and the app side: every read of a private company column goes
 * through `readCompaniesPrivate`, which falls back to the direct read while
 * the migration is unapplied — so the same code is correct before and after
 * apply. No other app path may select a private company column from the table.
 */
const root = resolve(__dirname, "..", "..");
const repo = resolve(root, "..", "..");
const read = (rel: string) => readFileSync(resolve(root, rel), "utf8");
const readRepo = (rel: string) => readFileSync(resolve(repo, rel), "utf8");
const code = (src: string) => src.replace(/\/\*[\s\S]*?\*\/|^\s*\/\/.*$|^\s*--.*$/gm, "");

const NAME = "20260924120000_companies_contact_minimization_v2";
const PRIVATE = [
  "contact_email",
  "contact_phone",
  "address",
  "registration_code",
  "vat_number",
  "requester_role",
  "verification_note",
  "requested_at",
];
const DISCOVERY = [
  "id",
  "profile_id",
  "legal_name",
  "display_name",
  "company_type",
  "country",
  "website",
  "description",
  "verification_status",
  "created_at",
  "updated_at",
];

describe("Guard: K2-1 v2 migration", () => {
  const sql = code(readRepo(`supabase/migrations/${NAME}.sql`));

  it("narrows the authenticated SELECT grant to discovery columns only", () => {
    expect(sql).toMatch(/revoke select on public\.companies from authenticated;/);
    const grant = sql.match(/grant select \(([\s\S]*?)\) on public\.companies to authenticated/);
    expect(grant, "column-level grant present").not.toBeNull();
    const cols = (grant?.[1] ?? "").split(",").map((c) => c.trim());
    for (const p of PRIVATE) expect(cols, `private column ${p} must not be granted`).not.toContain(p);
    for (const d of DISCOVERY) expect(cols, `discovery column ${d} stays readable`).toContain(d);
    // Every private column is also revoked at column level.
    const revoke = sql.match(/revoke select \(([\s\S]*?)\) on public\.companies from authenticated/);
    const revoked = (revoke?.[1] ?? "").split(",").map((c) => c.trim());
    for (const p of PRIVATE) expect(revoked, `private column ${p} revoked`).toContain(p);
  });

  it("defines ONE SECURITY DEFINER reader over exactly creator / ROLES_THAT_OPEN member / admin", () => {
    const fn = sql.match(
      /create or replace function public\.read_companies_private_v1\(\)([\s\S]*?)\$\$([\s\S]*?)\$\$;/,
    );
    expect(fn, "reader present").not.toBeNull();
    expect(fn?.[1]).toMatch(/security definer/);
    expect(fn?.[1]).toMatch(/set search_path = public, pg_temp/);
    const body = fn?.[2] ?? "";
    expect(body).toMatch(/c\.profile_id = auth\.uid\(\)/);
    expect(body).toMatch(/public\.is_admin\(\)/);
    expect(body).toMatch(/o\.legacy_company_id = c\.id/);
    expect(body).toMatch(/m\.status = 'active'/);
    const roles = [...(body.match(/m\.role in \(([^)]*)\)/)?.[1] ?? "").matchAll(/'([a-z_]+)'/g)].map(
      (m) => m[1],
    );
    // The SQL set IS the app's open set — no wider, no narrower.
    expect([...roles].sort()).toEqual([...ROLES_THAT_OPEN].sort());
    expect(sql).toMatch(/revoke all on function public\.read_companies_private_v1\(\) from public;/);
    expect(sql).toMatch(/revoke all on function public\.read_companies_private_v1\(\) from anon;/);
    expect(sql).toMatch(/grant execute on function public\.read_companies_private_v1\(\) to authenticated;/);
    // Exactly one definer; no data change; nothing granted to anon / public.
    expect(sql.match(/security definer/g)?.length).toBe(1);
    expect(sql).not.toMatch(/\b(drop table|drop column|delete from|truncate|update public\.)/i);
    expect(sql).not.toMatch(/grant [^;]* to (anon|public)\b/i);
  });

  it("ships a paired rollback that restores the whole-table grant and drops the reader", () => {
    const down = readRepo(`supabase/rollbacks/${NAME}.down.sql`);
    expect(down).toMatch(/grant select on public\.companies to authenticated;/);
    expect(down).toMatch(/drop function if exists public\.read_companies_private_v1\(\);/);
  });

  it("the unapplied v1 draft is not on this branch (v2 supersedes it; no second reader)", () => {
    const files = readdirSync(resolve(repo, "supabase/migrations"));
    expect(files.filter((f) => /companies_contact_minimization/.test(f))).toEqual([`${NAME}.sql`]);
  });
});

describe("Guard: K2-1 v2 app side", () => {
  const reader = code(read("lib/company/company-private-read.ts"));

  it("the reader tries the definer first and falls back to the table only when it is absent", () => {
    expect(reader).toMatch(/COMPANY_PRIVATE_READER = "read_companies_private_v1"/);
    expect(reader).toMatch(/\.rpc\(COMPANY_PRIVATE_READER\)\.select\(columns\)/);
    expect(reader).toMatch(/UNDEFINED_FUNCTION_CODES = new Set\(\["42883", "PGRST202"\]\)/);
    expect(reader).toMatch(/\.from\("companies"\)\.select\(columns\)/);
  });

  it("owner / member / admin surfaces read private columns through the reader", () => {
    const setup = code(read("lib/company/company-setup.ts"));
    const admin = code(read("lib/admin/company-verification.ts"));
    expect(setup.match(/readCompaniesPrivate\(supabase, SELECT_COLUMNS,/g)?.length).toBe(3);
    expect(admin.match(/readCompaniesPrivate\(supabase, SELECT_COLUMNS,/g)?.length).toBe(1);
  });

  const selectsPrivateFromTable = (src: string): boolean => {
    const selects = src.match(/\.from\("companies"\)[\s\S]{0,200}?\.select\(\s*([A-Z_]+|"[^"]*")/g) ?? [];
    return selects.some((sel) => {
      if (/\.select\(\s*[A-Z_]+$/.test(sel)) return true; // a named column list: treat as private
      return PRIVATE.some((p) => new RegExp(`\\b${p}\\b`).test(sel));
    });
  };

  it("the detector fires on a planted private select (negative control)", () => {
    expect(selectsPrivateFromTable('x.from("companies").select("id, contact_email")')).toBe(true);
    expect(selectsPrivateFromTable('x.from("companies")\n  .select(SELECT_COLUMNS)')).toBe(true);
    expect(selectsPrivateFromTable('x.from("companies").select("id, profile_id")')).toBe(false);
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
    for (const d of ["lib", "app", "components"]) walk(resolve(root, d));
    const offenders = files
      .filter((f) => !f.endsWith("company-private-read.ts"))
      .filter((f) => selectsPrivateFromTable(code(readFileSync(f, "utf8"))))
      .map((f) => f.replace(root, ""));
    expect(offenders).toEqual([]);
  });
});
