/**
 * PROFILE-DIRECTED CANDIDATE POOL — retrieval proof (doctrine TEST A).
 *
 * The board shortlist used to be drawn ONLY from the newest ads overall, so a
 * worker whose profession sat deeper in the supply never saw it, no matter
 * what their profile said. This pins the fix:
 *
 *   1. A declared profession widens WHICH ads compete (a second, bounded,
 *      profession-filtered read) — an ad relevant to the worker that is NOT
 *      in the newest page reaches the shortlist.
 *   2. Without a declared profession, no extra read is issued — the pool is
 *      profile-driven, never speculative.
 *   3. An explicit profession filter (chip) narrows the PRIMARY read instead
 *      and issues no extra pool read.
 *   4. The rendered shortlist stays capped: the pool widens candidates, not
 *      the page length.
 *
 * The mock client answers `.range()` according to the profession filter the
 * query actually carried — retrieval behaviour is what is being tested.
 */
import { describe, it, expect } from "vitest";

import { loadExternalVacancyCards } from "./external-vacancies";
import { toPublicVacancyRow } from "@/lib/vacancy-store/vacancy-row";
import { computeVacancyContentHash } from "@/lib/vacancy-sources/vacancy-hash";
import type { PublicVacancyV1 } from "@/lib/vacancy-sources/vacancy-contract";
import type { MatchSubject } from "@/lib/market/match-v1";

const NOW = "2026-08-14T08:00:00.000Z";

function vacancy(
  over: Partial<PublicVacancyV1> & { externalId: string },
): PublicVacancyV1 {
  const identity = {
    providerKey: "arbetsformedlingen" as const,
    externalId: over.externalId,
    titleRaw: over.titleRaw ?? "Annons",
    descriptionRaw: "Beskrivning",
    sourceLanguage: "sv",
    employer: { name: "AB", externalOrgId: null, homepage: null },
    location: {
      country: "SE",
      region: null,
      city: "Stockholm",
      lat: null,
      lng: null,
    },
    compensation: { currency: null, min: null, max: null, description: null },
    employmentForm: "permanent" as const,
    workingTime: "full_time" as const,
    positions: 1,
    startDate: null,
    publishedAt: over.publishedAt ?? "2026-08-10T00:00:00.000Z",
    expiresAt: null,
    transformVersion: "vacancy-arbetsformedlingen-v1",
  };
  return {
    ...identity,
    contentHash: computeVacancyContentHash(identity),
    lifecycle: "published",
    channel: "snapshot",
    capturedAt: NOW,
    occupationRaw: null,
    occupationConceptId: null,
    professionSlug: over.professionSlug ?? null,
    skillSlugs: over.skillSlugs ?? [],
    categorizationOrigin: "derived",
    requiredLanguages: [],
    applicationUrl: "https://arbetsformedlingen.se/ad",
    attributionCode: "vacancySources.attribution.arbetsformedlingen",
    translation: null,
    requestRef: "test",
  } as PublicVacancyV1;
}

/** 25 recent cook ads (the newest page is all cooks) + 1 older electrician
 *  ad that never makes the newest-20 page. */
const COOK_ADS = Array.from({ length: 25 }, (_, i) =>
  vacancy({
    externalId: `cook-${i}`,
    titleRaw: `Kock ${i}`,
    professionSlug: "cook",
    skillSlugs: ["menu-planning"],
    publishedAt: `2026-08-12T${String(10 + (i % 12)).padStart(2, "0")}:00:00.000Z`,
  }),
);
const ELECTRICIAN_AD = vacancy({
  externalId: "el-1",
  titleRaw: "Elektriker",
  professionSlug: "electrician",
  skillSlugs: ["electrical-installation"],
  publishedAt: "2026-08-01T00:00:00.000Z",
});

const ALL_ROWS = [...COOK_ADS, ELECTRICIAN_AD].map((v) =>
  toPublicVacancyRow(v, NOW, null),
);

/** Query-aware mock: `.eq("profession_slug", X)` narrows what `.range`
 *  returns; ordering is newest-first like the real read layer. Records every
 *  profession filter each read carried. */
function queryAwareClient(log: (professionFilter: string | null) => void) {
  const makeChain = () => {
    let professionFilter: string | null = null;
    const chain: Record<string, unknown> = {};
    const self = () => chain;
    chain.select = self;
    chain.or = self;
    chain.order = self;
    chain.eq = (col: string, val: string) => {
      if (col === "profession_slug") professionFilter = val;
      return chain;
    };
    chain.range = (from: number, to: number) => {
      log(professionFilter);
      const rows = ALL_ROWS.filter(
        (r) =>
          professionFilter === null ||
          (r as { profession_slug?: unknown }).profession_slug ===
            professionFilter,
      )
        .sort((a, b) =>
          String(
            (b as { published_at?: unknown }).published_at ?? "",
          ).localeCompare(
            String((a as { published_at?: unknown }).published_at ?? ""),
          ),
        )
        .slice(from, to + 1);
      return {
        then: (ok: (v: unknown) => unknown, err?: (e: unknown) => unknown) =>
          Promise.resolve({ data: rows, error: null }).then(ok, err),
      };
    };
    chain.limit = () => ({
      then: (ok: (v: unknown) => unknown, err?: (e: unknown) => unknown) =>
        Promise.resolve({ data: [{ last_seen_at: NOW }], error: null }).then(
          ok,
          err,
        ),
    });
    return chain;
  };
  return { from: () => makeChain() as never } as never;
}

const ELECTRICIAN_SUBJECT: MatchSubject = {
  skills: [{ uri: "electrical-installation", evidence: "self_declared" }],
  professionSlug: "electrician",
  country: "SE",
  preferredCountries: ["SE"],
};

const BARE_SUBJECT: MatchSubject = {
  skills: [],
  professionSlug: null,
  country: "SE",
  preferredCountries: ["SE"],
};

describe("profile-directed candidate pool", () => {
  it("a declared profession surfaces the relevant ad the newest page misses", async () => {
    const filters: (string | null)[] = [];
    const result = await loadExternalVacancyCards(
      queryAwareClient((f) => filters.push(f)),
      ELECTRICIAN_SUBJECT,
      { nowIso: NOW },
    );

    // Two reads: the newest page (unfiltered) + the profession pool.
    expect(filters).toEqual([null, "electrician"]);
    const keys = result.cards.map((c) => c.key);
    expect(keys).toContain("arbetsformedlingen:el-1");
    // …and it competes on match rank: the one fitting ad ranks first.
    expect(result.cards[0].key).toBe("arbetsformedlingen:el-1");
  });

  it("no declared profession → no speculative extra read", async () => {
    const filters: (string | null)[] = [];
    const result = await loadExternalVacancyCards(
      queryAwareClient((f) => filters.push(f)),
      BARE_SUBJECT,
      { nowIso: NOW },
    );
    expect(filters).toEqual([null]);
    expect(result.cards.map((c) => c.key)).not.toContain(
      "arbetsformedlingen:el-1",
    );
  });

  it("an explicit profession filter narrows the primary read, no extra pool", async () => {
    const filters: (string | null)[] = [];
    const result = await loadExternalVacancyCards(
      queryAwareClient((f) => filters.push(f)),
      ELECTRICIAN_SUBJECT,
      { nowIso: NOW, professionSlug: "cook" },
    );
    expect(filters).toEqual(["cook"]);
    expect(result.cards.every((c) => c.view.professionSlug === "cook")).toBe(
      true,
    );
  });

  it("the shortlist stays capped at the board limit", async () => {
    const result = await loadExternalVacancyCards(
      queryAwareClient(() => undefined),
      ELECTRICIAN_SUBJECT,
      { nowIso: NOW },
    );
    expect(result.cards.length).toBeLessThanOrEqual(20);
  });
});
