import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * SIGNED-IN COMPANY SEARCH (owner decision 2026-11-11, option D2). An unconfirmed company is findable
 * by signed-in users only, under a publicly sourced name, marked unconfirmed; signing in opens no
 * private company data. Proven on a real PostgreSQL by scripts/db-proof/search-organizations-directory-v2.sh;
 * this guard keeps the shape.
 */
const ROOT = join(__dirname, "..", "..", "..", "..");
const NAME = "20261111090000_search_organizations_directory_v2";
const sql = readFileSync(join(ROOT, "supabase", "migrations", `${NAME}.sql`), "utf8").replace(/^\s*--.*$/gm, "");
const down = readFileSync(join(ROOT, "supabase", "rollbacks", `${NAME}.down.sql`), "utf8").replace(/^\s*--.*$/gm, "");
const network = readFileSync(join(ROOT, "apps", "web", "lib", "invitations", "network.ts"), "utf8");
const page = readFileSync(join(ROOT, "apps", "web", "app", "[locale]", "dashboard", "network", "page.tsx"), "utf8");

describe("who a signed-in caller finds", () => {
  it("an unclaimed company only under a name that came from a public source", () => {
    expect(sql).toMatch(/f\.field in \('display_name', 'legal_name'\)/);
    expect(sql).toMatch(/f\.source_kind in \('public_register', 'company_website', 'job_posting'\)/);
    expect(sql).toMatch(/f\.superseded_by is null/);
    // the public fact is the name shown, not just any public name fact
    expect(sql).toMatch(/lower\(btrim\(f\.value #>> '\{\}'\)\) = lower\(btrim\(o\.display_name\)\)/);
    // an unconfirmed company's country needs a matching public fact too
    expect(sql).toMatch(/c\.field = 'country'/);
  });

  it("never an archived organization", () => {
    expect(sql).toMatch(/o\.archived_at is null/);
  });

  it("keeps the v1 term rules and the 20-row cap", () => {
    expect(sql).toMatch(/char_length\(t\.term\) >= 2/);
    expect(sql).toMatch(/limit 20;/);
  });
});

describe("what it shows and who may call it", () => {
  it("returns exactly id, name, type, country and confirmed", () => {
    const ret = sql.slice(sql.indexOf("returns table"), sql.indexOf("language sql"));
    expect(ret.match(/^\s+([a-z_]+)\s+(uuid|text|boolean)/gm)?.map((l) => l.trim().split(/\s+/)[0])).toEqual([
      "id",
      "display_name",
      "organization_type",
      "country",
      "confirmed",
    ]);
  });

  it("signed-in callers only; v1 closed; read only", () => {
    expect(sql).toMatch(/grant execute on function public\.search_organizations_directory_v2\(p_term text\) to authenticated;/);
    expect(sql).not.toMatch(/\bgrant\b[^;]*\banon\b/i);
    expect(sql).toMatch(/revoke execute on function public\.search_organizations_directory_v1\(p_term text\) from public, anon, authenticated;/);
    expect(sql).not.toMatch(/\b(insert|update|delete)\b/i);
  });

  it("the rollback restores v1 for signed-in callers only", () => {
    expect(down).toMatch(/grant execute on function public\.search_organizations_directory_v1\(p_term text\) to authenticated;/);
    expect(down).not.toMatch(/anon/);
  });
});

describe("the network search", () => {
  it("reads v2 and falls back to v1 only while v2 does not exist", () => {
    expect(network).toContain('rpc("search_organizations_directory_v2"');
    expect(network).toMatch(/DIRECTORY_V2_ABSENT_CODES: readonly string\[\] = \[UNDEFINED_FUNCTION_CODE, "PGRST202"\]/);
  });

  it("marks an unconfirmed company and offers it no team enquiry", () => {
    expect(page).toMatch(/c\.confirmed === false && \(/);
    expect(page).toContain('t("search.unconfirmed")');
    expect(page).toMatch(/c\.organizationType === "team" && \(/);
    // an unconfirmed organization is never a team (v2 lists unclaimed companies, agencies and other only)
    expect(sql).toMatch(/o\.organization_type in \('company', 'agency', 'other'\)/);
  });
});
