import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * ANONYMOUS PUBLIC-VACANCY BOUNDARY (owner directive 2026-08-24).
 *
 * Before registration, public job information must not reveal employer
 * identity, country, city, workplace or identifying source data — INCLUDING
 * wording embedded in imported titles ("Väktare till Lunds Universitetet",
 * "Finance & Accounting Manager till MuoviTech Sweden AB") and the named
 * source employment service (which identifies the country).
 *
 * The boundary is the DATABASE projection: the anon SECURITY DEFINER preview
 * functions return `title_raw` and `attribution_code` as NULL, and anonymous
 * search matches only the VISIBLE occupation label (matching a hidden field
 * would be a probe oracle for employer/city names).
 *
 * This guard pins:
 *  1. the LATEST definition of each anon preview function keeps the NULLs;
 *  2. anonymous search never matches `title_raw`;
 *  3. shared metadata on /jobs/[id] is never built from the raw title;
 *  4. the anonymous card/detail render falls back to occupation, so a NULL
 *     title can never regress into an empty or undefined heading.
 */

const ROOT = join(__dirname, "..", "..", "..", "..");
const MIGRATIONS = join(ROOT, "supabase", "migrations");

/** The last migration (filename order = apply order) that defines `fn`. */
function latestDefinition(fn: string): { file: string; body: string } {
  const files = readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  let found: { file: string; body: string } | null = null;
  for (const f of files) {
    const sql = readFileSync(join(MIGRATIONS, f), "utf8");
    const marker = `function public.${fn}(`;
    if (!sql.includes(marker)) continue;
    // The function body: from its CREATE to the closing `$$;` after it.
    const start = sql.indexOf(marker);
    const end = sql.indexOf("$$;", start);
    if (end === -1) continue;
    found = { file: f, body: sql.slice(start, end) };
  }
  if (!found) throw new Error(`no migration defines ${fn}`);
  return found;
}

describe("anonymous public-vacancy boundary (owner directive 2026-08-24)", () => {
  it("search projection: latest definition NULLs title_raw and attribution_code", () => {
    const { file, body } = latestDefinition("search_public_vacancy_previews_v1");
    expect(body, `latest definition is in ${file}`).toContain(
      "null::text as title_raw",
    );
    expect(body, `latest definition is in ${file}`).toContain(
      "null::text as attribution_code",
    );
  });

  it("detail projection: latest definition NULLs title_raw and attribution_code", () => {
    const { file, body } = latestDefinition("get_public_vacancy_preview_v1");
    expect(body, `latest definition is in ${file}`).toContain(
      "null::text as title_raw",
    );
    expect(body, `latest definition is in ${file}`).toContain(
      "null::text as attribution_code",
    );
  });

  it("anonymous search never matches the hidden raw title", () => {
    const { file, body } = latestDefinition("search_public_vacancy_previews_v1");
    // Probing a hidden field confirms restricted content ("Göteborg" →
    // which ads are in Göteborg). Only the displayed occupation may match.
    expect(body, `latest definition is in ${file}`).not.toMatch(
      /title_raw\s+ilike/i,
    );
    expect(body, `latest definition is in ${file}`).toMatch(
      /occupation_raw\s+ilike/i,
    );
  });

  it("shared /jobs/[id] metadata is never built from the raw title", () => {
    const page = readFileSync(
      join(ROOT, "apps", "web", "app", "[locale]", "(marketing)", "jobs", "[id]", "page.tsx"),
      "utf8",
    );
    const metadataSection = page.slice(
      page.indexOf("generateMetadata"),
      page.indexOf("export default"),
    );
    expect(metadataSection).not.toContain("preview.title");
    expect(metadataSection).toContain("preview.occupation");
  });

  it("anonymous detail heading is the occupation, member heading the real title", () => {
    const page = readFileSync(
      join(ROOT, "apps", "web", "app", "[locale]", "(marketing)", "jobs", "[id]", "page.tsx"),
      "utf8",
    );
    expect(page).toContain("member?.titleRaw ?? preview.occupation");
  });

  it("card heading falls back when the anonymous title is NULL", () => {
    const card = readFileSync(
      join(ROOT, "apps", "web", "components", "marketing", "public-vacancy-card.tsx"),
      "utf8",
    );
    expect(card).toContain("vacancy.title ?? headingFallback ?? vacancy.occupation");
  });

  it("anonymous TS contract declares title as nullable (member-only data)", () => {
    const lib = readFileSync(
      join(ROOT, "apps", "web", "lib", "vacancy-store", "public-vacancy-preview.ts"),
      "utf8",
    );
    expect(lib).toContain("readonly title: string | null;");
  });
});
