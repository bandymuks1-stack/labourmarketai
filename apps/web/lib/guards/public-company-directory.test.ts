import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * PUBLIC COMPANY SEARCH (owner decision 2026-11-11). An unconfirmed company is listed only when its
 * name came from a public source, shows no contact or internal data and gains no rights. Proven on a
 * real PostgreSQL by scripts/db-proof/search-organizations-directory-v2.sh; this guard keeps the shape.
 */
const ROOT = join(__dirname, "..", "..", "..", "..");
const NAME = "20261111090000_search_organizations_directory_v2";
const sql = readFileSync(join(ROOT, "supabase", "migrations", `${NAME}.sql`), "utf8").replace(/^\s*--.*$/gm, "");
const page = readFileSync(join(ROOT, "apps", "web", "app", "[locale]", "business", "page.tsx"), "utf8");
const lib = readFileSync(join(ROOT, "apps", "web", "lib", "company", "public-directory.ts"), "utf8");

describe("who the public search lists", () => {
  it("a claimed company only when it opted in to its public profile", () => {
    expect(sql).toMatch(/o\.claim_state = 'claimed' and o\.public_profile_enabled = true and o\.public_slug is not null/);
  });

  it("an unclaimed company only when its name came from a public source", () => {
    expect(sql).toMatch(/f\.field in \('display_name', 'legal_name'\)/);
    expect(sql).toMatch(/f\.source_kind in \('public_register', 'company_website', 'job_posting'\)/);
    expect(sql).toMatch(/f\.superseded_by is null/);
  });

  it("never an archived organization or a team", () => {
    expect(sql).toMatch(/o\.archived_at is null/);
    expect(sql).toMatch(/o\.organization_type in \('company', 'agency', 'other'\)/);
  });

  it("keeps the v1 term rules and the 20-row cap", () => {
    expect(sql).toMatch(/char_length\(t\.term\) >= 2/);
    expect(sql).toMatch(/limit 20;/);
  });
});

describe("what it shows", () => {
  it("returns no contact, identifier, owner or description column", () => {
    const ret = sql.slice(sql.indexOf("returns table"), sql.indexOf("language sql"));
    expect(ret).not.toMatch(/contact|email|phone|vat|registration|owner|description|website/);
  });

  it("links only a confirmed company, and the page offers no action on an unconfirmed one", () => {
    expect(sql).toMatch(/case when o\.claim_state = 'claimed' then o\.public_slug end/);
    expect(lib).toMatch(/slug: r\.confirmed \? r\.public_slug : null/);
    expect(page).not.toMatch(/<form[^>]*method="post"|action=\{[a-zA-Z]+Action\}/);
  });

  it("is the only new anon grant, read only", () => {
    expect(sql).toMatch(/grant execute on function public\.search_organizations_directory_v2\(p_term text\) to anon, authenticated;/);
    expect(sql).not.toMatch(/\b(insert|update|delete)\b/i);
  });
});
