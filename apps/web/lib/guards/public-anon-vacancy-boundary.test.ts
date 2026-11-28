import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * ANONYMOUS PUBLIC-VACANCY BOUNDARY (owner directive 2026-08-24).
 *
 * Before registration, public job information must not reveal employer
 * identity, city or workplace — INCLUDING
 * wording embedded in imported titles ("Väktare till Lunds Universitetet",
 * "Finance & Accounting Manager till MuoviTech Sweden AB"). Owner approval
 * 2026-11-27 permits the recorded NAV / Arbetsförmedlingen source labels only.
 *
 * The boundary is the DATABASE projection: the anon SECURITY DEFINER preview
 * functions keep `title_raw` NULL and whitelist the approved source codes. Anonymous search
 * matches the occupation label and, by the owner's ruling of 2026-11-05, the
 * public ad title through a folded copy that is never returned. It matches
 * nothing else: probing any other hidden field would still confirm restricted
 * content.
 *
 * This guard pins:
 *  1. the LATEST definition of each anon preview function keeps the title NULL and limits source disclosure;
 *  2. anonymous search matches only the folded copy of the title and occupation;
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
    if (!sql.toLowerCase().includes(marker)) continue;
    // The function body: from its CREATE to the closing `$$;` or `$function$;` after it.
    // Reading only `$$;` skipped every definition since v2 and tested an old file.
    const start = sql.toLowerCase().indexOf(marker);
    const closes = ["$$;", "$function$;"].map((c) => sql.indexOf(c, start)).filter((i) => i !== -1);
    if (closes.length === 0) continue;
    const end = Math.min(...closes);
    found = { file: f, body: sql.slice(start, end) };
  }
  if (!found) throw new Error(`no migration defines ${fn}`);
  return found;
}

describe("anonymous public-vacancy boundary (owner directive 2026-08-24)", () => {
  it("search projection: latest definition keeps titles private and whitelists the source", () => {
    const { file, body } = latestDefinition("search_public_vacancy_previews_v1");
    expect(body, `latest definition is in ${file}`).toMatch(
      /select v\.id, null::text, v\.profession_slug,/,
    );
    expect(body, `latest definition is in ${file}`).toMatch(
      /v\.source_language,\s+case v\.provider_key[\s\S]*?else null::text end, v\.published_at,/,
    );
    expect(body, `latest definition is in ${file}`).not.toMatch(/\bv\.title_raw\b/);
  });

  it("detail projection: latest definition keeps the title private and whitelists the source", () => {
    const { file, body } = latestDefinition("get_public_vacancy_preview_v1");
    expect(body, `latest definition is in ${file}`).toContain(
      "null::text as title_raw",
    );
    expect(body, `latest definition is in ${file}`).toContain(
      "else null::text end as attribution_code",
    );
  });

  it("both latest functions expose only the two approved codes, including every search branch", () => {
    for (const [name, count] of [["get_public_vacancy_preview_v1", 1], ["search_public_vacancy_previews_v1", 6]] as const) {
      const { file, body } = latestDefinition(name);
      expect(file).toBe("20261127120000_public_vacancy_source_labels_v1.sql");
      expect(body.match(/when 'nav' then 'vacancySources.attribution.nav'::text/g)).toHaveLength(count);
      expect(body.match(/when 'arbetsformedlingen' then 'vacancySources.attribution.arbetsformedlingen'::text/g)).toHaveLength(count);
      expect(body.match(/else null::text end/g)).toHaveLength(count);
      expect(body).not.toMatch(/v\.attribution_code/);
    }
  });

  it("anonymous search matches the folded title and occupation, and nothing non-public", () => {
    const { file, body } = latestDefinition("search_public_vacancy_previews_v1");
    // Owner 2026-11-05: searching public ad titles is allowed, revealing non-public
    // content is not. This replaces the 2026-08-24 rule that kept the title out of
    // matching. Probing any other hidden field still confirms restricted content.
    expect(body, `latest definition is in ${file}`).toMatch(/search_text like v_match/);
    expect(body, `latest definition is in ${file}`).not.toMatch(/\bh\.title_raw\b/);
    for (const col of ["description_raw", "employer_name", "application_url", "city", "region", "country"]) {
      expect(body, `${col} in ${file}`).not.toMatch(new RegExp(`\b${col}\b`));
    }
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
    // 2026-10-10: the anonymous heading names the occupation in the reader's
    // language when the catalogue knows it (the board card's rule); the
    // member-only raw title still only ever comes from the member read.
    expect(page).toContain("publicOccupation = preview.occupation?.trim() || null");
    expect(page).toMatch(/publicTitle = publicJobName\(\s*publicOccupation,\s*localizedProfession,\s*PUBLIC_JOB_GENERIC_TITLE\[active\]/);
    expect(page).toContain("member?.titleRaw ?? publicTitle");
    const structuredData = page.match(/buildJobDetailJsonLd\(\{([\s\S]*?)\}\)/)?.[1];
    expect(structuredData).toContain("localizedName: localizedProfession");
    expect(structuredData).toContain("genericTitle: PUBLIC_JOB_GENERIC_TITLE[active]");
    expect(structuredData).not.toMatch(/member|titleRaw/);
  });

  it("the jobs list and card use the same localized public profession", () => {
    const page = readFileSync(
      join(ROOT, "apps", "web", "app", "[locale]", "(marketing)", "jobs", "page.tsx"),
      "utf8",
    );
    expect(page).toContain("localizedName: (vacancy) => localizedProfessionName(vacancy.professionSlug)");
    expect(page).toContain("genericTitle: PUBLIC_JOB_GENERIC_TITLE[active]");
    expect(page.match(/genericTitle=\{PUBLIC_JOB_GENERIC_TITLE\[active\]\}/g)).toHaveLength(2);
    expect(page.match(/headingFallback=\{localizedProfessionName\(v\.professionSlug\) \?\? undefined\}/g)).toHaveLength(2);
  });

  it("card heading falls back when the anonymous title is NULL", () => {
    const card = readFileSync(
      join(ROOT, "apps", "web", "components", "marketing", "public-vacancy-card.tsx"),
      "utf8",
    );
    expect(card).toContain("occupation = vacancy.occupation?.trim() || null");
    expect(card).toContain("vacancy.title ?? headingFallback ?? occupation ?? genericTitle");
  });

  it("anonymous TS contract declares title as nullable (member-only data)", () => {
    const lib = readFileSync(
      join(ROOT, "apps", "web", "lib", "vacancy-store", "public-vacancy-preview.ts"),
      "utf8",
    );
    expect(lib).toContain("readonly title: string | null;");
  });
});
