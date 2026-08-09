/**
 * VACANCY READ LAYER — behaviour tests.
 *
 * The load-bearing assertions here are the two that separate honest states
 * from convenient ones:
 *   - a MISSING TABLE is reported as `not_provisioned`, never as "no results";
 *   - a user's search term can never carry PostgREST filter syntax.
 */
import { describe, it, expect } from "vitest";

import {
  searchPublicVacancies,
  getPublicVacancy,
  fromPublicVacancyRow,
  VACANCY_SEARCH_MAX_LIMIT,
} from "./vacancy-read";
import { toPublicVacancyRow } from "./vacancy-row";
import { computeVacancyContentHash } from "@/lib/vacancy-sources/vacancy-hash";
import type { PublicVacancyV1 } from "@/lib/vacancy-sources/vacancy-contract";

const NOW = "2026-08-09T12:00:00.000Z";

function vacancy(over: Partial<PublicVacancyV1> = {}): PublicVacancyV1 {
  const identity = {
    providerKey: "arbetsformedlingen" as const,
    externalId: over.externalId ?? "ad-1",
    titleRaw: over.titleRaw ?? "Snickare",
    descriptionRaw: over.descriptionRaw ?? "Vi söker en snickare.",
    sourceLanguage: "sv",
    employer: over.employer ?? { name: "Bygg AB", externalOrgId: "556", homepage: null },
    location: over.location ?? {
      country: "SE",
      region: "Stockholms län",
      city: "Stockholm",
      lat: null,
      lng: null,
    },
    compensation: over.compensation ?? {
      currency: "SEK",
      min: null,
      max: null,
      description: null,
    },
    employmentForm: over.employmentForm ?? ("permanent" as const),
    workingTime: over.workingTime ?? ("full_time" as const),
    positions: over.positions ?? 2,
    startDate: over.startDate ?? null,
    publishedAt: over.publishedAt ?? "2026-08-01T00:00:00.000Z",
    expiresAt: over.expiresAt ?? null,
    transformVersion: "vacancy-arbetsformedlingen-v1",
  };
  return {
    ...identity,
    contentHash: computeVacancyContentHash(identity),
    lifecycle: over.lifecycle ?? "published",
    channel: over.channel ?? "snapshot",
    capturedAt: over.capturedAt ?? "2026-08-04T09:00:00.000Z",
    occupationRaw: null,
    occupationConceptId: null,
    professionSlug: null,
    skillSlugs: [],
    categorizationOrigin: "derived",
    requiredLanguages: [],
    applicationUrl: null,
    attributionCode: "vacancySources.attribution.arbetsformedlingen",
    translation: null,
    requestRef: "test",
    ...over,
  } as PublicVacancyV1;
}

interface Filter {
  readonly op: string;
  readonly args: readonly unknown[];
}

function fakeClient(result: { data?: unknown; error?: unknown }) {
  const filters: Filter[] = [];
  const chain: Record<string, unknown> = {};
  const record = (op: string) => (...args: unknown[]) => {
    filters.push({ op, args });
    return chain;
  };
  chain.select = record("select");
  chain.eq = record("eq");
  chain.or = record("or");
  chain.order = record("order");
  chain.range = record("range");
  chain.maybeSingle = () =>
    Promise.resolve({ data: result.data ?? null, error: result.error ?? null });
  chain.then = (ok: (v: unknown) => unknown, err?: (e: unknown) => unknown) =>
    Promise.resolve({ data: result.data ?? null, error: result.error ?? null }).then(ok, err);

  return {
    client: { from: () => chain as never } as never,
    filters,
  };
}

describe("the table does not exist yet — the state this whole layer turns on", () => {
  it("reports not_provisioned rather than an empty result set", async () => {
    // The persistence migration is owner-gated and ships UNAPPLIED, so this is
    // production's ACTUAL state on the day this merges. "No jobs for you" and
    // "this is not switched on yet" look identical in a database and mean
    // opposite things to a worker.
    const { client } = fakeClient({ error: { code: "42P01" } });

    const result = await searchPublicVacancies(client, { nowIso: NOW });

    expect(result.status).toBe("not_provisioned");
    expect(result.vacancies).toEqual([]);
  });

  it("reports not_provisioned on a detail read too", async () => {
    const { client } = fakeClient({ error: { code: "42P01" } });
    expect(await getPublicVacancy(client, "arbetsformedlingen", "ad-1")).toEqual({
      status: "not_provisioned",
    });
  });

  it("an EMPTY but provisioned table is `ok`, not `not_provisioned`", async () => {
    // The negative control for the test above: these two must not collapse
    // into one another in either direction.
    const { client } = fakeClient({ data: [] });
    const result = await searchPublicVacancies(client, { nowIso: NOW });

    expect(result.status).toBe("ok");
    expect(result.vacancies).toEqual([]);
  });

  it("any OTHER database error is raised, never disguised as an empty board", async () => {
    const { client } = fakeClient({ error: { code: "08006" } });
    await expect(searchPublicVacancies(client, { nowIso: NOW })).rejects.toThrow(
      /vacancy_search_failed:08006/,
    );
  });
});

describe("liveness is decided at read time", () => {
  it("admits an ad with no expiry and one whose expiry is still ahead", async () => {
    const { client, filters } = fakeClient({ data: [] });
    await searchPublicVacancies(client, { nowIso: NOW });

    const or = filters.find((f) => f.op === "or");
    expect(or?.args[0]).toBe(`expires_at.is.null,expires_at.gt.${NOW}`);
    // Withdrawal and expiry are separate facts, checked separately.
    expect(filters.some((f) => f.op === "eq" && f.args[0] === "is_active")).toBe(true);
  });

  it("orders by publisher recency, not by when we happened to import", async () => {
    const { client, filters } = fakeClient({ data: [] });
    await searchPublicVacancies(client, { nowIso: NOW });

    const order = filters.find((f) => f.op === "order");
    expect(order?.args[0]).toBe("published_at");
    expect(order?.args[1]).toEqual({ ascending: false });
  });
});

describe("a search term can never carry query syntax", () => {
  it("a term carrying filter syntax cannot ADD a clause — it stays one inert string", async () => {
    // `or=` is a comma-separated, parenthesised grammar. An interpolated comma
    // does not merely break the query, it appends filter clauses. Same class
    // of bug as SQL injection, one layer up.
    //
    // The property under test is NOT "the payload's characters are absent" —
    // `is_active.eq.false` surviving as literal search text is harmless, and
    // asserting its absence would test the wrong thing. The property is that
    // the payload cannot ESCAPE its slot: no comma to terminate the clause, no
    // parenthesis to open a group. It stays a needle nobody will find, not a
    // filter.
    const { client, filters } = fakeClient({ data: [] });
    await searchPublicVacancies(client, {
      nowIso: NOW,
      query: "snickare,is_active.eq.false)(",
    });

    const clause = String(filters.filter((f) => f.op === "or").at(-1)?.args[0]);

    // Exactly the two clauses this layer intends, and no third one.
    const parts = clause.split(",");
    expect(parts).toHaveLength(2);
    expect(parts[0].startsWith("title_raw.ilike.")).toBe(true);
    expect(parts[1].startsWith("description_raw.ilike.")).toBe(true);
    expect(clause).not.toContain("(");
    expect(clause).not.toContain(")");
  });

  it("strips wildcards so one character cannot scan every ad", async () => {
    const { client, filters } = fakeClient({ data: [] });
    await searchPublicVacancies(client, { nowIso: NOW, query: "%" });

    // Nothing searchable survived, so no text filter is added at all.
    const textFilters = filters.filter(
      (f) => f.op === "or" && String(f.args[0]).includes("ilike"),
    );
    expect(textFilters).toHaveLength(0);
  });

  it("searches the publisher's own words, not a translation we may not have", async () => {
    const { client, filters } = fakeClient({ data: [] });
    await searchPublicVacancies(client, { nowIso: NOW, query: "snickare" });

    const clause = String(filters.filter((f) => f.op === "or").at(-1)?.args[0]);
    expect(clause).toContain("title_raw.ilike.%snickare%");
    expect(clause).toContain("description_raw.ilike.%snickare%");
  });
});

describe("paging is bounded", () => {
  it("clamps an absurd limit to the ceiling", async () => {
    const { client, filters } = fakeClient({ data: [] });
    await searchPublicVacancies(client, { nowIso: NOW, limit: 100_000 });

    const range = filters.find((f) => f.op === "range");
    expect(range?.args).toEqual([0, VACANCY_SEARCH_MAX_LIMIT]);
  });

  it("refuses a negative offset instead of passing it through", async () => {
    const { client, filters } = fakeClient({ data: [] });
    await searchPublicVacancies(client, { nowIso: NOW, offset: -5, limit: 10 });

    expect(filters.find((f) => f.op === "range")?.args).toEqual([0, 10]);
  });

  it("reports hasMore from the extra row rather than a second count query", async () => {
    const rows = Array.from({ length: 11 }, (_, i) =>
      toPublicVacancyRow(vacancy({ externalId: `ad-${i}` }), NOW),
    );
    const { client } = fakeClient({ data: rows });

    const result = await searchPublicVacancies(client, { nowIso: NOW, limit: 10 });

    expect(result.hasMore).toBe(true);
    expect(result.vacancies).toHaveLength(10);
  });
});

describe("row -> contract is the exact inverse of contract -> row", () => {
  it("round-trips a fully-populated vacancy without losing a field", async () => {
    const original = vacancy({
      occupationRaw: "Snickare",
      occupationConceptId: "ssyk-7115",
      professionSlug: "carpenter",
      skillSlugs: ["formwork", "framing"],
      requiredLanguages: ["sv", "en"],
      applicationUrl: "https://arbetsformedlingen.se/ad/1",
      positions: 3,
      startDate: "2026-09-01",
      expiresAt: "2026-12-01T00:00:00.000Z",
      compensation: {
        currency: "SEK",
        min: 30000,
        max: 40000,
        description: "Enligt avtal",
      },
    });

    const row = toPublicVacancyRow(original, NOW);
    const back = fromPublicVacancyRow(row as unknown as Record<string, unknown>);

    expect(back).toEqual(original);
  });

  it("reads numeric columns that PostgREST returns as strings", () => {
    const row = toPublicVacancyRow(vacancy(), NOW) as unknown as Record<string, unknown>;
    // PostgREST serialises `numeric` as a string; a naive typeof check would
    // silently drop the salary.
    const back = fromPublicVacancyRow({
      ...row,
      compensation_min: "30000.00",
      compensation_max: "40000.00",
    });

    expect(back.compensation.min).toBe(30000);
    expect(back.compensation.max).toBe(40000);
  });

  it("keeps 'never asked for a translation' distinct from 'asked and got nothing'", () => {
    const row = toPublicVacancyRow(vacancy(), NOW) as unknown as Record<string, unknown>;
    expect(fromPublicVacancyRow(row).translation).toBeNull();

    const asked = fromPublicVacancyRow({
      ...row,
      translation_status: "unavailable",
      translation_target_language: "en",
    });
    expect(asked.translation?.status).toBe("unavailable");
    expect(asked.translation?.titleText).toBeNull();
  });

  it("never promotes a derived categorization into a publisher fact", () => {
    const row = toPublicVacancyRow(vacancy(), NOW) as unknown as Record<string, unknown>;
    const back = fromPublicVacancyRow({ ...row, categorization_origin: "nonsense" });
    // An unrecognised origin falls back to `derived` — the weaker claim.
    expect(back.categorizationOrigin).toBe("derived");
  });
});
