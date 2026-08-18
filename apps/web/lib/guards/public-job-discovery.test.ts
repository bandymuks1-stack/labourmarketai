import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ANON_SECDEF_ALLOWLIST } from "@/lib/security/anon-secdef-allowlist";

/**
 * PUBLIC JOB DISCOVERY GUARD.
 *
 * The public job board (`/jobs`, `/jobs/[id]`) shipped live with an anonymous
 * projection, and was still invisible to every search engine: `/jobs` was not
 * in `app/sitemap.ts`, no sitemap listed a single `/jobs/[id]` URL, and
 * `robots.txt` advertised only the marketing and answer sitemaps. 39,241 live
 * public pages were orphaned — reachable only by ~1,963 hops of the board's own
 * pagination, which no crawler walks.
 *
 * This guard locks the discovery path back in, and locks the two things that
 * make it SAFE and HONEST:
 *
 *   1. the sitemap projection may never carry vacancy CONTENT (a leak), and
 *   2. <lastmod> may never come from an ingestion timestamp (a false freshness
 *      claim — `updated_at` and `last_seen_at` cluster on 6 import days across
 *      all 39,241 live rows, while `published_at` spans 197 real days).
 */
const APP_ROOT = join(__dirname, "..", "..");
const REPO_ROOT = join(APP_ROOT, "..", "..");

function read(rel: string): string {
  return readFileSync(join(APP_ROOT, rel), "utf8");
}

describe("public job board is discoverable by crawlers", () => {
  it("/jobs is listed in the marketing sitemap", () => {
    const sitemap = read("app/sitemap.ts");
    const staticBlock = sitemap.match(
      /STATIC_PATHS: readonly string\[\] = \[([\s\S]*?)\];/,
    )?.[1];
    expect(staticBlock, "STATIC_PATHS block not found").toBeTruthy();
    expect(staticBlock).toContain('"/jobs"');
  });

  it("robots.txt advertises the job sitemap index on the apex origin", () => {
    const robots = read("app/robots.ts");
    expect(robots).toContain("/jobs-sitemap.xml");
    // The apex binding the public-SEO audit asserts must stay on one line.
    expect(robots).toMatch(/sitemap[^\n]*MARKETING_ORIGIN/);
  });

  it("the sitemap index and its shard route both exist", () => {
    expect(() => read("app/jobs-sitemap.xml/route.ts")).not.toThrow();
    expect(() => read("app/jobs-sitemap/[shard]/route.ts")).not.toThrow();
  });

  /**
   * The subtle one. `middleware.ts` runs on every path WITHOUT a dot and
   * rewrites it into the `/{locale}/...` pipeline. A shard at
   * `/jobs-sitemap/0` would be redirected to `/lt/jobs-sitemap/0` and 404 —
   * the sitemap index would then advertise N dead URLs and the whole board
   * would stay unindexed while every file here still "existed". The `.xml`
   * suffix is what keeps shards out of that pipeline, so it is an invariant,
   * not a naming preference.
   */
  it("shard URLs carry .xml so the locale middleware cannot swallow them", () => {
    const index = read("app/jobs-sitemap.xml/route.ts");
    expect(index).toContain("/jobs-sitemap/${i}.xml");

    const shard = read("app/jobs-sitemap/[shard]/route.ts");
    expect(shard).toMatch(/\\.xml\$/);

    // And prove the middleware really would exclude it, from the real matcher.
    const middleware = read("middleware.ts");
    const matcher = middleware.match(/matcher:\s*\["([^"]+)"\]/)?.[1];
    expect(matcher, "middleware matcher not found").toBeTruthy();
    // The matcher lives in a TS string literal, so a `\\.` in the source text is
    // a `\.` in the pattern Next.js actually compiles. Unescape before compiling
    // or the dot-check silently tests the wrong regex.
    const re = new RegExp(`^${(matcher as string).replace(/\\\\/g, "\\")}$`);
    expect(re.test("/jobs-sitemap.xml"), "index must bypass middleware").toBe(false);
    expect(re.test("/jobs-sitemap/0.xml"), "shard must bypass middleware").toBe(false);
    // Control: the dotless form WOULD be captured, which is the bug this guards.
    expect(re.test("/jobs-sitemap/0"), "dotless shard would be locale-rewritten").toBe(true);
  });
});

describe("public job board is reachable by a human", () => {
  /**
   * The other half of the same defect. A sitemap gets crawlers to the board;
   * it does nothing for a person on the homepage. `/jobs` shipped with no link
   * from anywhere on the site — the only route in was the vacancy card ON the
   * board — so the board was unreachable by navigation, and it had no internal
   * inbound link for PageRank either.
   */
  it("the site nav links to /jobs", () => {
    const nav = read("components/layouts/site-nav.tsx");
    expect(nav).toMatch(/key:\s*"jobs",\s*href:\s*"\/jobs"/);
  });

  it("the footer links to /jobs", () => {
    const footer = read("components/layouts/site-footer.tsx");
    expect(footer).toContain('href="/jobs"');
  });

  // ALL_LINKS is the single source for the desktop nav AND the mobile
  // disclosure, so one entry covers both. Assert that stays true — if the
  // mobile menu ever grows its own list, a phone visitor silently loses the
  // board again, which is exactly the state this PR is fixing.
  it("the mobile menu is fed from the same link list, not its own copy", () => {
    const nav = read("components/layouts/site-nav.tsx");
    expect(nav).toMatch(/<MobileNavMenu[\s\S]*?items=\{links\.map\(/);
  });

  it("every active locale has a real, non-English nav.jobs label", () => {
    const en = JSON.parse(read("messages/en.json")) as {
      nav: Record<string, string>;
    };
    expect(en.nav.jobs, "en nav.jobs missing").toBeTruthy();

    for (const locale of ["lt", "ru", "nl", "de"]) {
      const messages = JSON.parse(read(`messages/${locale}.json`)) as {
        nav: Record<string, string>;
      };
      expect(messages.nav.jobs, `${locale} nav.jobs missing`).toBeTruthy();
      // A key copied from English is the exact defect the untranslated
      // ratchet exists for — catch it here too, at the point of use.
      expect(
        messages.nav.jobs,
        `${locale} nav.jobs is raw English`,
      ).not.toBe(en.nav.jobs);
    }
  });

  // Doctrine §2.4: the 11 catalogues never drift apart, even the inactive six.
  it("all 11 message catalogues carry nav.jobs", () => {
    for (const locale of [
      "en", "lt", "ru", "nl", "de", "lv", "et", "da", "no", "sv", "pl",
    ]) {
      const messages = JSON.parse(read(`messages/${locale}.json`)) as {
        nav: Record<string, string>;
      };
      expect(messages.nav.jobs, `${locale} nav.jobs missing`).toBeTruthy();
      expect(messages.nav.jobs).not.toContain("[EN]");
    }
  });
});

describe("the sitemap projection cannot leak restricted vacancy fields", () => {
  /** Exactly the columns the owner ruled restricted for anonymous callers. */
  const RESTRICTED = [
    "employer_name",
    "employer_homepage",
    "employer_external_org_id",
    "country",
    "region",
    "city",
    "lat",
    "lng",
    "application_url",
    "description_raw",
    "compensation_description",
  ];

  const migration = readFileSync(
    join(
      REPO_ROOT,
      "supabase/migrations/20260818160000_public_vacancy_sitemap_v1.sql",
    ),
    "utf8",
  );

  /** The RETURNS TABLE clause is the whole security contract — assert on it. */
  const returnsTable = migration.match(/returns table \(([\s\S]*?)\)\s*language sql/)?.[1];

  it("the function's RETURNS TABLE exposes only id and last_modified", () => {
    expect(returnsTable, "RETURNS TABLE clause not found").toBeTruthy();
    const columns = (returnsTable as string)
      .split(",")
      .map((c) => c.trim().split(/\s+/)[0])
      .filter(Boolean);
    expect(columns.sort()).toEqual(["id", "last_modified"]);
  });

  for (const column of RESTRICTED) {
    it(`never returns ${column}`, () => {
      expect(returnsTable).not.toContain(column);
    });
  }

  it("only advertises live, unexpired ads", () => {
    expect(migration).toContain("v.is_active");
    expect(migration).toContain("v.expires_at is null or v.expires_at > now()");
  });

  it("revokes the default PUBLIC grant before granting anon", () => {
    const revokeAt = migration.indexOf("revoke execute on function");
    const grantAt = migration.indexOf("grant execute on function");
    expect(revokeAt).toBeGreaterThan(-1);
    expect(grantAt).toBeGreaterThan(revokeAt);
  });

  it("is registered in the anon SECURITY DEFINER allowlist with its exact signature", () => {
    const entry = ANON_SECDEF_ALLOWLIST.find(
      (e) => e.name === "list_public_vacancy_sitemap_v1",
    );
    expect(entry, "sitemap function missing from the anon allowlist").toBeTruthy();
    expect(entry?.identityArgs).toBe("p_limit integer, p_offset integer");
    expect(entry?.mutates).toBe(false);
  });
});

describe("sitemap lastmod is an honest publication date", () => {
  const migration = readFileSync(
    join(
      REPO_ROOT,
      "supabase/migrations/20260818160000_public_vacancy_sitemap_v1.sql",
    ),
    "utf8",
  );
  const body = migration.slice(migration.indexOf("language sql"));

  it("selects published_at as the last_modified value", () => {
    expect(body).toContain("v.published_at");
  });

  // `updated_at` / `last_seen_at` move when the IMPORTER re-reads an ad, not
  // when the ad changes. Using either as <lastmod> would tell search engines
  // that tens of thousands of pages changed on days their content did not.
  for (const ingestion of ["updated_at", "last_seen_at", "captured_at", "first_seen_at"]) {
    it(`never uses the ingestion timestamp ${ingestion} as lastmod`, () => {
      expect(body).not.toContain(ingestion);
    });
  }
});
