import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { isSafeReturnPath, getSafeReturnPath } from "@/lib/auth/redirect";

/**
 * THE ANONYMOUS VACANCY CONTRACT (owner ruling, P0 product-contract review).
 *
 * Discovery is public; the protected payload is authenticated. Precisely:
 *
 *   anonymous MAY see    job/profession title, and salary only where the
 *                        employer actually provided it
 *   anonymous MUST NOT   employer identity, employer profile, contacts, exact
 *                        location/city, full description, application URL,
 *                        external identifiers, or any other protected field
 *
 * The public vacancy page stays indexable for acquisition, and no additional
 * field is exposed for SEO. Crossing the preview boundary — opening the full
 * vacancy, applying, contacting the employer — requires authentication, and
 * afterwards the visitor returns to the exact vacancy they asked for.
 *
 * WHERE THIS IS ENFORCED, and why these are the right assertions: the boundary
 * is the DATABASE, not this page. `public_vacancies` has RLS enabled, no anon
 * grant and no anon policy, so an anonymous client cannot read the table at
 * all. Anonymous callers can only reach `get_public_vacancy_preview_v1`, a
 * SECURITY DEFINER function whose SQL enumerates the safe columns. These tests
 * pin the application half of that contract: that the page never asks for the
 * member projection without a session, and never leaks a protected field into
 * HTML, metadata or props.
 */

const WEB = join(__dirname, "..", "..");

/**
 * Assertions here must describe CODE, not prose. These files document the
 * boundary at length — the detail page's header explains why `revalidate` was
 * removed and names the very fields it must never render — so a naive
 * substring check reads a warning about a leak as the leak itself.
 */
const stripComments = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/.*$/gm, "$1");

const read = (path: string) =>
  stripComments(readFileSync(join(WEB, path), "utf8"));

const detail = read("app/[locale]/(marketing)/jobs/[id]/page.tsx");
const board = read("app/[locale]/(marketing)/jobs/page.tsx");
const readers = read("lib/vacancy-store/public-vacancy-preview.ts");
const landing = read(
  "app/[locale]/live-market-review/live-market-command.tsx",
);
const sitemap = read("app/jobs-sitemap.xml/route.ts");

/** Fields that may never reach an anonymous caller. */
const PROTECTED_FIELDS = [
  "employer",
  "employer_name",
  "workplace",
  "description",
  "application_url",
  "apply_url",
  "contact",
  "municipality",
  "external_id",
];

describe("1. anonymous jobs board", () => {
  it("lists through the anonymous preview projection only", () => {
    expect(board).toContain("searchPublicVacancyPreviews");
    expect(board).not.toContain("getPublicVacancyById");
  });

  it("never selects a protected column for the board", () => {
    for (const field of PROTECTED_FIELDS) {
      expect(board.toLowerCase()).not.toContain(`preview.${field}`);
    }
  });
});

describe("2. anonymous direct /jobs/{id}", () => {
  it("renders the page rather than redirecting — discovery stays public", () => {
    expect(detail).not.toMatch(/redirect\(\s*[`"']\/\$\{?\w*\}?\/auth/);
    expect(detail).toContain("getPublicVacancyPreview");
  });

  it("fetches the member projection ONLY when a session exists", () => {
    // The ternary is the gate: `user ? getPublicVacancyById(...) : null`.
    expect(detail).toMatch(
      /const\s+member\s*=\s*user\s*\r?\n?\s*\?\s*await\s+getPublicVacancyById/,
    );
    expect(detail).toContain("hasSessionCookie()");
  });

  it("offers the locked panel and an auth door carrying the exact vacancy", () => {
    expect(detail).toContain("LOCKED_TITLE");
    expect(detail).toContain("next");
    expect(detail).toMatch(/encodeURIComponent\(`\/\$\{active\}\/jobs\/\$\{id\}`\)/);
  });
});

describe("3. authenticated /jobs/{id}", () => {
  it("reads the member row through the CALLER's own client, so RLS authorises", () => {
    expect(detail).toContain("getPublicVacancyById(supabase, id)");
    expect(detail).toContain("createClient()");
  });

  it("adds no second login step for a signed-in visitor", () => {
    expect(detail).not.toMatch(/user\s*&&[^\n]*redirect\(/);
  });
});

describe("4. anonymous → auth → return to the same vacancy", () => {
  it("treats a vacancy path as a safe return target", () => {
    expect(isSafeReturnPath("/en/jobs/abc-123")).toBe(true);
    expect(getSafeReturnPath("/lt/jobs/abc-123", "lt")).toBe(
      "/lt/jobs/abc-123",
    );
  });

  it("refuses to bounce the visitor off-site after authentication", () => {
    for (const hostile of [
      "https://evil.example/en/jobs/1",
      "//evil.example/en/jobs/1",
      "http://labourmarket.ai.evil.example/",
    ]) {
      expect(isSafeReturnPath(hostile)).toBe(false);
    }
  });
});

describe("5. sitemap / indexable payload", () => {
  it("publishes only an id and a date — never a protected field", () => {
    expect(sitemap).toContain("public-vacancy-preview");
    expect(sitemap).toContain("PUBLIC_VACANCY_SITEMAP_SHARD_SIZE");
    for (const field of PROTECTED_FIELDS) {
      expect(sitemap.toLowerCase()).not.toContain(field);
    }
  });

  it("builds metadata from the anonymous projection for every caller", () => {
    const meta = detail.slice(
      detail.indexOf("export async function generateMetadata"),
      detail.indexOf("type L ="),
    );
    expect(meta).toContain("getPublicVacancyPreview");
    expect(meta).not.toContain("getPublicVacancyById");
    // Field ACCESS, not bare words: the OpenGraph `description` here is a
    // constant marketing string, which is not the vacancy's description.
    expect(meta).not.toMatch(/\bmember\b/);
    for (const field of PROTECTED_FIELDS) {
      expect(meta.toLowerCase()).not.toContain(`preview.${field}`);
      expect(meta.toLowerCase()).not.toContain(`vacancy.${field}`);
    }
  });

  it("never caches a session-dependent render into a shared cache", () => {
    expect(detail).toContain('export const dynamic = "force-dynamic"');
    expect(detail).not.toMatch(/^\s*export const revalidate/m);
  });
});

describe("6. no protected-field leakage at the DB/API boundary", () => {
  it("keeps the anonymous reader on the SECURITY DEFINER preview RPC", () => {
    expect(readers).toContain("get_public_vacancy_preview_v1");
    expect(readers).toContain("search_public_vacancy_previews_v1");
    expect(readers).toContain("count_public_vacancies_v1");
    // The anonymous readers must never touch the protected table directly.
    expect(readers).not.toMatch(/from\(["']public_vacancies["']\)/);
  });

  it("exposes no protected field through the landing's opportunity stream", () => {
    for (const field of PROTECTED_FIELDS) {
      expect(landing.toLowerCase()).not.toContain(`job.${field}`);
      expect(landing.toLowerCase()).not.toContain(`vacancy.${field}`);
    }
    // The stream carries a title and an id, and links into the gated page.
    expect(landing).toContain("/jobs/${job.id}");
  });

  it("audits every landing opportunity link for the same gate", () => {
    const links = landing.match(/href=\{`\/jobs\/[^`]*`\}/g) ?? [];
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) {
      // Each must be the canonical gated detail route, never an apply/external
      // destination that would skip the boundary.
      expect(link).toMatch(/^href=\{`\/jobs\/\$\{[\w.[\]]+\}`\}$/);
    }
  });
});
