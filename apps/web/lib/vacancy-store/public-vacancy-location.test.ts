import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { readPublicVacancyLocations } from "./public-vacancy-preview";

/**
 * Country + city for signed-out visitors (owner decision 2026-11-03). The
 * reader and the SQL boundary are pinned together: the function exposes only
 * id / country / city, for live allow-listed ads, never by location search.
 */
function client(answer: { data: unknown; error: { code: string } | null }) {
  const calls: { name: string; args: unknown }[] = [];
  return {
    calls,
    c: {
      rpc: async (name: string, args: unknown) => {
        calls.push({ name, args });
        return answer;
      },
    } as never,
  };
}

describe("readPublicVacancyLocations", () => {
  it("maps rows by id and drops rows without a country", async () => {
    const { c } = client({
      data: [
        { id: "a", country: "SE", city: "Stenungsund" },
        { id: "b", country: "NO", city: null },
        { id: "c", country: null, city: "x" },
      ],
      error: null,
    });
    const m = await readPublicVacancyLocations(["a", "b", "c"], c);
    expect([...m.entries()]).toEqual([
      ["a", { country: "SE", city: "Stenungsund" }],
      ["b", { country: "NO", city: null }],
    ]);
  });

  it("sends at most 50 unique ids and skips the call for none", async () => {
    const empty = client({ data: [], error: null });
    expect((await readPublicVacancyLocations([], empty.c)).size).toBe(0);
    expect(empty.calls).toEqual([]);

    const many = client({ data: [], error: null });
    const ids = Array.from({ length: 80 }, (_, i) => `id-${i % 60}`);
    await readPublicVacancyLocations(ids, many.c);
    expect(many.calls[0].name).toBe("public_vacancy_locations_v1");
    expect((many.calls[0].args as { p_ids: string[] }).p_ids).toHaveLength(50);
  });

  it("a missing function (not applied / rolled back) reads as no location", async () => {
    for (const code of ["42883", "PGRST202"]) {
      const { c } = client({ data: null, error: { code } });
      expect((await readPublicVacancyLocations(["a"], c)).size).toBe(0);
    }
  });

  it("any other error is not swallowed", async () => {
    const { c } = client({ data: null, error: { code: "57014" } });
    await expect(readPublicVacancyLocations(["a"], c)).rejects.toBeTruthy();
  });
});

describe("public_vacancy_locations_v1 SQL boundary", () => {
  const sql = readFileSync(
    join(process.cwd(), "../../supabase/migrations/20261103130000_public_vacancy_locations_v1.sql"),
    "utf-8",
  );
  const body = sql.slice(sql.indexOf("as $$"), sql.lastIndexOf("$$;"));

  it("returns only id, country and city", () => {
    expect(sql).toMatch(/returns table \(\s*id uuid,\s*country text,\s*city text\s*\)/);
  });

  it("never selects withheld fields", () => {
    for (const col of ["title_raw", "employer_name", "region", "lat", "lng", "application_url", "attribution_code", "description_raw"]) {
      expect(body, col).not.toMatch(new RegExp(`\\bv\\.${col}\\b`));
    }
  });

  it("answers only live, allow-listed ads, by id, one page at a time", () => {
    expect(body).toMatch(/v\.is_active/);
    expect(body).toMatch(/v\.expires_at is null or v\.expires_at > now\(\)/);
    expect(body).toMatch(/v\.provider_key in \('arbetsformedlingen', 'nav'\)/);
    expect(body).toMatch(/\[1:50\]/);
    expect(body).not.toMatch(/like|ilike|~\*?\s*p_/i);
  });

  it("is definer with a pinned search_path and PUBLIC revoked before the grant", () => {
    expect(sql).toMatch(/security definer set search_path = public/);
    const revoke = sql.indexOf("revoke execute on function public.public_vacancy_locations_v1(p_ids uuid[]) from public;");
    const grant = sql.indexOf("grant execute on function public.public_vacancy_locations_v1(p_ids uuid[]) to anon, authenticated;");
    expect(revoke).toBeGreaterThan(-1);
    expect(grant).toBeGreaterThan(revoke);
  });

  it("ships a rollback that drops exactly this function", () => {
    const down = readFileSync(
      join(process.cwd(), "../../supabase/rollbacks/20261103130000_public_vacancy_locations_v1.down.sql"),
      "utf-8",
    );
    expect(down).toMatch(/drop function if exists public\.public_vacancy_locations_v1\(p_ids uuid\[\]\);/);
  });
});
