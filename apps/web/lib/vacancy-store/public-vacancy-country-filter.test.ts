import { readFileSync } from "node:fs";
import { join } from "node:path";

import { beforeEach, describe, expect, it } from "vitest";

import {
  __resetPublicVacancyCache,
  readPublicVacancyCountries,
  searchPublicVacancyPreviews,
} from "./public-vacancy-preview";

/**
 * THE COUNTRY FILTER (owner 2026-11-09, migration 20261109120000, RED). `?country=NO`
 * really restricts the board, in every combination with a word and a profession, and
 * an app that sends no country makes exactly the call it made before.
 */

function client(result: { data?: unknown; error?: { code: string } | null }) {
  const calls: { name: string; params: Record<string, unknown> | undefined }[] = [];
  return {
    calls,
    rpc: async (name: string, params?: Record<string, unknown>) => {
      calls.push({ name, params });
      return { data: result.data ?? [], error: result.error ?? null };
    },
  };
}

beforeEach(() => __resetPublicVacancyCache());

describe("the search sends p_country only when a country is chosen", () => {
  it("no country: the four arguments it always sent, nothing more", async () => {
    const c = client({});
    await searchPublicVacancyPreviews({ query: "kock" }, c as never);
    expect(Object.keys(c.calls[0]!.params!).sort()).toEqual(["p_limit", "p_offset", "p_profession_slug", "p_query"]);
  });

  it("a country: sent upper-cased, and cached apart from the all-countries search", async () => {
    const c = client({});
    await searchPublicVacancyPreviews({ query: "kock", country: "no" }, c as never);
    await searchPublicVacancyPreviews({ query: "kock" }, c as never);
    expect(c.calls.map((x) => x.params?.p_country ?? null)).toEqual(["NO", null]);
  });
});

describe("the country choice", () => {
  it("lists live countries with their totals and drops anything that is not a code", async () => {
    const c = client({
      data: [
        { country: "SE", active_vacancies: "45600" },
        { country: "NO", active_vacancies: 8436 },
        { country: "xx", active_vacancies: 3 },
        { country: "DE", active_vacancies: 0 },
      ],
    });
    expect(await readPublicVacancyCountries(c as never)).toEqual({
      status: "ok",
      countries: [
        { code: "SE", activeVacancies: 45600 },
        { code: "NO", activeVacancies: 8436 },
      ],
    });
  });

  it("an error (function not applied yet, or a timeout) is not_available, never a fake list", async () => {
    expect(await readPublicVacancyCountries(client({ error: { code: "PGRST202" } }) as never)).toEqual({
      status: "not_available",
    });
  });
});

describe("the page never shows a country it did not filter by", () => {
  const page = readFileSync(
    join(__dirname, "..", "..", "app", "[locale]", "(marketing)", "jobs", "page.tsx"),
    "utf8",
  );

  it("filters only by a country the facet answered for, and says so otherwise", () => {
    expect(page).toContain('const country = countries?.status === "ok" ? requestedCountry : null;');
    expect(page).toContain('data-testid="public-jobs-country-not-filtered"');
    expect(page).toContain('data-testid="public-jobs-country-choice"');
  });

  it("keeps the country on page links and on the profession redirect", () => {
    expect(page).toMatch(/if \(country\) qs\.set\("country", country\)/);
    expect(page).toMatch(/&country=\$\{country\}/);
  });
});

describe("the migration and its rollback", () => {
  const root = join(__dirname, "..", "..", "..", "..", "supabase");
  const up = readFileSync(join(root, "migrations", "20261109120000_public_jobs_country_filter_v2.sql"), "utf8");
  const down = readFileSync(join(root, "rollbacks", "20261109120000_public_jobs_country_filter_v2.down.sql"), "utf8");

  it("extends the ONE search; no second search function", () => {
    expect(up).toContain("p_country text default null)");
    expect(up).not.toMatch(/create (or replace )?function public\.search_public_vacancy_country/);
    expect(up).toMatch(/grant execute on function public\.search_public_vacancy_previews_v1\(p_query text, p_profession_slug text, p_limit integer, p_offset integer, p_country text\) to anon, authenticated/);
  });

  it("the rollback restores the four-argument search and its grants", () => {
    expect(down).toContain("drop function if exists public.search_public_vacancy_previews_v1(text, text, integer, integer, text);");
    expect(down).toMatch(/grant execute on function public\.search_public_vacancy_previews_v1\(text, text, integer, integer\) to anon, authenticated/);
    expect(down).toContain("drop function if exists public.list_public_vacancy_countries_v1();");
  });
});
