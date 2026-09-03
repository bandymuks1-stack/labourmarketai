/**
 * Guard: P0-1 / P0-1b / P2-1 — the anonymous read path and apex 404s
 * (FULL_PRODUCT_VISION_AUDIT_2026-09-03 §0.1, fixed 2026-09-03).
 *
 * Findings this guard keeps closed:
 *   P0-1  count_public_vacancies_v1 / search_public_vacancy_previews_v1 sat on
 *         the anon 3 s statement_timeout on a cold buffer pool → /api/health
 *         flapped 503/200.
 *   P0-1b /jobs-sitemap.xml (advertised in robots.txt) rode the same count and
 *         answered 500 cold.
 *   P2-1  apex paths with a file extension (/foo.xml, /foo.json, /llms.txt)
 *         skip the i18n middleware and, with no root layout, rendered
 *         global-error as a 500 instead of a 404.
 *
 * Text-level guard (no DB): it pins the shape of the fix so a refactor cannot
 * quietly re-open any of the three.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const web = resolve(__dirname, "..", "..");
const repo = resolve(web, "..", "..");
const read = (rel: string, base = web) => readFileSync(resolve(base, rel), "utf8");

const MIGRATION = "supabase/migrations/20260903070000_public_vacancy_board_index_and_count_work_mem_v1.sql";
const ROLLBACK = "supabase/rollbacks/20260903070000_public_vacancy_board_index_and_count_work_mem_v1.down.sql";

describe("P0-1 GREEN migration — board index + count work_mem", () => {
  const sql = read(MIGRATION, repo);

  it("adds a partial index in board order over active rows", () => {
    expect(sql).toMatch(
      /create index if not exists public_vacancies_active_published_idx\s+on public\.public_vacancies \(published_at desc nulls last, id\)\s+where is_active;/,
    );
  });

  it("raises work_mem at function scope so count(distinct) does not spill", () => {
    expect(sql).toMatch(/alter function public\.count_public_vacancies_v1\(\) set work_mem = '64MB';/);
  });

  it("stays GREEN: no SECURITY DEFINER body swap, no GRANT/REVOKE, no policy, no drop outside the ROLLBACK block", () => {
    const executable = sql.replace(/--[^\n]*/g, "");
    expect(executable).not.toMatch(/security\s+definer/i);
    expect(executable).not.toMatch(/(^|\s)(grant|revoke)\s+/i);
    expect(executable).not.toMatch(/create\s+policy|alter\s+policy/i);
    expect(executable).not.toMatch(/\bdrop\b/i);
    expect(sql).toMatch(/^-- ROLLBACK$/m);
  });

  it("ships its paired rollback file", () => {
    expect(existsSync(resolve(repo, ROLLBACK))).toBe(true);
    const down = read(ROLLBACK, repo);
    expect(down).toMatch(/drop index if exists public\.public_vacancies_active_published_idx;/);
    expect(down).toMatch(/alter function public\.count_public_vacancies_v1\(\) reset work_mem;/);
  });
});

describe("P0-1 GREEN migration 2 — covering partial index for the supply count", () => {
  const COVER = "supabase/migrations/20260903090000_public_vacancy_supply_cover_index_v1.sql";
  const sql = read(COVER, repo);

  it("keys on expires_at and INCLUDEs exactly the two payload columns the count reads, active rows only", () => {
    expect(sql).toMatch(
      /create index if not exists public_vacancies_active_supply_cover_idx\s+on public\.public_vacancies \(expires_at\)\s+include \(employer_name, last_seen_at\)\s+where is_active;/,
    );
  });

  it("stays GREEN and ships its rollback", () => {
    const executable = sql.replace(/--[^\n]*/g, "");
    expect(executable).not.toMatch(/security\s+definer|(^|\s)(grant|revoke)\s+|create\s+policy|\bdrop\b/i);
    expect(sql).toMatch(/^-- ROLLBACK$/m);
    const down = read(COVER.replace("migrations", "rollbacks").replace(/\.sql$/, ".down.sql"), repo);
    expect(down).toMatch(/drop index if exists public\.public_vacancies_active_supply_cover_idx;/);
  });
});

describe("P0-1b — /jobs-sitemap.xml never answers 500 on a transient count failure", () => {
  const route = read("app/jobs-sitemap.xml/route.ts");

  it("wraps the count in try/catch and answers 503 + Retry-After, uncached", () => {
    expect(route).toMatch(/try \{\s*counts = await readPublicVacancySupplyCounts\(\);\s*\} catch/);
    expect(route).toMatch(/status: 503/);
    expect(route).toMatch(/"Retry-After": "600"/);
    expect(route).toMatch(/"Cache-Control": "no-store"/);
  });

  it("still emits a VALID EMPTY index when the feature is off or there are zero live ads (unchanged)", () => {
    expect(route).toMatch(/counts\.status === "ok" && counts\.activeVacancies > 0/);
    expect(route).toMatch(/<sitemapindex xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">/);
  });
});

describe("P2-1 — apex paths with a file extension answer a truthful 404", () => {
  it("a root layout exists and is a pass-through (the locale layout keeps the document)", () => {
    const layout = read("app/layout.tsx");
    expect(layout).toMatch(/export default function RootLayout/);
    expect(layout).toMatch(/return children;/);
    // JSX only (the doc comment may name the tags): no document of its own
    const jsx = layout.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
    expect(jsx).not.toMatch(/<html|<body/);
  });

  it("a root not-found renders a full document with tokens only", () => {
    const nf = read("app/not-found.tsx");
    expect(nf).toMatch(/<html lang="en"/);
    expect(nf).toMatch(/<body className="/);
    expect(nf).toMatch(/data-testid="branded-not-found-root"/);
    expect(nf).toMatch(/href="\/"/);
    // design-tokens guard territory: no raw colours, no inline styles
    expect(nf).not.toMatch(/#[0-9a-fA-F]{3,8}\b|style=\{\{/);
    // doctrine §18: no banned framing
    expect(nf).not.toMatch(/(?<![\p{L}\p{N}_])demos?(?![\p{L}\p{N}_])/iu);
  });

  it("the [locale] segment closes its param set (dynamicParams = false) — the actual 500 source is never rendered", () => {
    // Reproduced on the local production build 2026-09-03: `/foo-control.xml`
    // → `[locale]/page` with locale "foo-control.xml" → `RangeError:
    // Incorrect locale information provided` from Intl.NumberFormat, thrown
    // before the layout's notFound() could win (layout and page render
    // concurrently). The landing page is FROZEN (landing-freeze guard), so the
    // fix lives on the segment: an unknown locale is a 404 before any render.
    const layout = read("app/[locale]/layout.tsx");
    expect(layout).toMatch(/export function generateStaticParams\(\) \{\s*return routing\.locales\.map/);
    expect(layout).toMatch(/^export const dynamicParams = false;$/m);
    expect(layout).toMatch(/if \(!hasLocale\(routing\.locales, locale\)\) \{\s*notFound\(\);/);
  });

  it("the middleware matcher still skips dotted paths (so these reach the root boundary, not the locale rewrite)", () => {
    const mw = read("middleware.ts");
    const m = mw.match(/matcher: \["(.+)"\]/);
    expect(m).not.toBeNull();
    // the source carries JS string escapes (`\\.`) — decode them before use
    const pattern = JSON.parse(`"${m![1]}"`) as string;
    const re = new RegExp(`^${pattern}$`);
    expect(re.test("/foo.xml")).toBe(false);
    expect(re.test("/llms.txt")).toBe(false);
    expect(re.test("/foo")).toBe(true);
  });
});

describe("AEO — /llms.txt is served as plain text at the apex", () => {
  it("has a route handler with a text/plain content type and a builder in lib/seo", () => {
    const route = read("app/llms.txt/route.ts");
    expect(route).toMatch(/from "@\/lib\/seo\/llms-txt"/);
    expect(route).toMatch(/"Content-Type": "text\/plain; charset=utf-8"/);
    expect(route).toMatch(/export function GET\(\): Response/);
  });
});
