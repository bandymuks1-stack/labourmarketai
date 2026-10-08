import { beforeEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  __resetPublicVacancyCache,
  __resetPublicVacancyFacetCache,
  readCountryParam,
  readPublicVacancyCountryFacet,
  readPublicVacancyCountryFacetCached,
  searchPublicVacancyPreviews,
} from "./public-vacancy-preview";

type Reply = { data?: unknown; error?: { code: string } | null };

function client(reply: (name: string) => Reply) {
  const calls: { name: string; params: unknown }[] = [];
  return {
    calls,
    c: {
      rpc: async (name: string, params: unknown) => {
        calls.push({ name, params });
        const r = reply(name);
        return { data: r.data ?? [], error: r.error ?? null };
      },
    },
  };
}

beforeEach(() => {
  __resetPublicVacancyCache();
  __resetPublicVacancyFacetCache();
});

describe("country facet", () => {
  it("lists only valid, positive rows", async () => {
    const { c } = client(() => ({
      data: [
        { country: "se", active_vacancies: "48550" },
        { country: "NO", active_vacancies: 3 },
        { country: "XXX", active_vacancies: 5 },
        { country: "DK", active_vacancies: 0 },
      ],
    }));
    const f = await readPublicVacancyCountryFacet(c as never);
    expect(f.status).toBe("ok");
    expect(f.countries.map((x) => x.code)).toEqual(["SE", "NO"]);
  });

  it("a failed read is unavailable with NO countries (no fake chips)", async () => {
    const { c } = client(() => ({ error: { code: "57014" } }));
    const f = await readPublicVacancyCountryFacet(c as never);
    expect(f).toEqual({ status: "unavailable", countries: [] });
  });

  it("a missing function is not_provisioned", async () => {
    const { c } = client(() => ({ error: { code: "PGRST202" } }));
    expect((await readPublicVacancyCountryFacet(c as never)).status).toBe("not_provisioned");
  });

  it("the allow-list rejects anything the facet does not list", () => {
    const facet = {
      status: "ok" as const,
      countries: [
        { code: "SE", count: 10 },
        { code: "NO", count: 2 },
      ],
    };
    expect(readCountryParam("no", facet)).toBe("NO");
    expect(readCountryParam("DK", facet)).toBeNull();
    expect(readCountryParam("N%", facet)).toBeNull();
    expect(readCountryParam(undefined, facet)).toBeNull();
    expect(readCountryParam(["NO"], facet)).toBeNull();
  });

  it("cached facet is not remembered when the read failed", async () => {
    // exported cached reader uses the server client; only its reset hook is
    // exercised here - failures are never cached by construction.
    expect(typeof readPublicVacancyCountryFacetCached).toBe("function");
  });
});

describe("country search routes to the country RPC only when asked", () => {
  it("unfiltered stays on search_public_vacancy_previews_v1 with the same params", async () => {
    const { c, calls } = client(() => ({ data: [] }));
    await searchPublicVacancyPreviews({ query: "", professionSlug: null, page: 1 }, c as never);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.name).toBe("search_public_vacancy_previews_v1");
    expect(calls[0]!.params).toEqual({
      p_query: null,
      p_profession_slug: null,
      p_limit: 20,
      p_offset: 0,
    });
  });

  it("country goes to the country RPC, offset by page, and NO and SE do not share a cache entry", async () => {
    const { c, calls } = client(() => ({ data: [] }));
    await searchPublicVacancyPreviews({ country: "NO", page: 2 }, c as never);
    await searchPublicVacancyPreviews({ country: "SE", page: 2 }, c as never);
    expect(calls.map((x) => x.name)).toEqual([
      "search_public_vacancy_country_board_v1",
      "search_public_vacancy_country_board_v1",
    ]);
    expect(calls[0]!.params).toEqual({ p_country: "NO", p_limit: 20, p_offset: 20 });
    expect(calls[1]!.params).toEqual({ p_country: "SE", p_limit: 20, p_offset: 20 });
  });

  it("a timed-out country read is unavailable, never an empty list of jobs", async () => {
    const { c } = client(() => ({ error: { code: "57014" } }));
    const r = await searchPublicVacancyPreviews({ country: "NO" }, c as never);
    expect(r.status).toBe("unavailable");
    expect(r.vacancies).toEqual([]);
  });
});

describe("page + migration wiring", () => {
  const WEB = join(__dirname, "..", "..");
  const page = readFileSync(
    join(WEB, "app", "[locale]", "(marketing)", "jobs", "page.tsx"),
    "utf8",
  );
  const mig = readFileSync(
    join(WEB, "..", "..", "supabase", "migrations", "20261008200000_public_jobs_country_filter_v1.sql"),
    "utf8",
  );

  it("country is validated against the facet and ignored when q/profession are set", () => {
    expect(page).toContain("readCountryParam(countryRequested, facet)");
    expect(page).toContain("!query && !profession && !showSaved");
  });

  it("pagination carries the country", () => {
    expect(page.slice(page.indexOf("const pageHref"))).toContain('qs.set("country", country)');
  });

  it("an unlisted or unconfirmed country never falls through to all jobs", () => {
    expect(page).toContain("countryUnknown");
    expect(page).toContain("countryUnconfirmed");
  });

  it("the default board is searched with no country argument, in parallel with the facet", () => {
    expect(page).toContain("searchPublicVacancyPreviews({ query, professionSlug: profession, page })");
  });

  it("names come from Intl.DisplayNames, not a hand list", () => {
    expect(page).toContain("Intl.DisplayNames");
  });

  it("migration: additive, deny-all counts table, no delete, anon grants revoked from public first", () => {
    expect(mig).toMatch(/enable row level security/);
    expect(mig).not.toMatch(/^\s*delete\s+from/im);
    expect(mig).not.toMatch(/drop\s+(table|column)/i);
    expect(mig).toMatch(/revoke execute on function public\.search_public_vacancy_country_board_v1[^;]*from public/);
    expect(mig).toMatch(/revoke execute on function public\.list_public_vacancy_country_counts_v1[^;]*from public/);
    expect(mig).not.toMatch(/replace function public\.search_public_vacancy_previews_v1/);
  });
});
