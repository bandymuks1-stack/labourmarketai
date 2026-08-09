/**
 * VACANCY REPOSITORY — behaviour tests.
 *
 * These assert what the repository DOES to a database, not that particular
 * strings appear in its source. The fake client records every operation, so a
 * claim like "a re-run writes nothing" is proven by the absence of a write
 * call rather than by reading the code and believing it.
 *
 * Several of these are negative controls by construction: the "steady state"
 * test fails against the obvious naive implementation (a single bare
 * `.upsert()` over the whole batch), which is exactly the implementation this
 * module exists to avoid.
 */
import { describe, it, expect } from "vitest";

import {
  persistVacancies,
  readVacancyCursor,
  writeVacancyCursor,
} from "./vacancy-repository";
import { toPublicVacancyRow } from "./vacancy-row";
import { computeVacancyContentHash } from "@/lib/vacancy-sources/vacancy-hash";
import type { PublicVacancyV1 } from "@/lib/vacancy-sources/vacancy-contract";

const SEEN_AT = "2026-08-09T10:00:00.000Z";

function vacancy(over: Partial<PublicVacancyV1> = {}): PublicVacancyV1 {
  const identity = {
    providerKey: "arbetsformedlingen" as const,
    externalId: over.externalId ?? "ad-1",
    titleRaw: over.titleRaw ?? "Snickare",
    descriptionRaw: over.descriptionRaw ?? "Vi söker en snickare.",
    sourceLanguage: "sv",
    employer: over.employer ?? {
      name: "Bygg AB",
      externalOrgId: "5566778899",
      homepage: null,
    },
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

interface RecordedOp {
  readonly table: string;
  readonly kind: "select" | "upsert" | "update";
  readonly payload?: unknown;
}

/**
 * Minimal stand-in for the PostgREST builder: every filter returns the chain,
 * and the chain resolves to the configured result. Enough to exercise the
 * repository's real call shape without a database.
 */
function fakeClient(options: {
  existing?: readonly { provider_key: string; external_id: string; content_hash: string }[];
  cursorRow?: { cursor_value: string | null; consecutive_failures: number } | null;
} = {}) {
  const ops: RecordedOp[] = [];

  const chainFor = (table: string, result: { data: unknown; error: unknown }) => {
    const chain: Record<string, unknown> = {};
    const self = () => chain;
    chain.select = () => {
      ops.push({ table, kind: "select" });
      return chain;
    };
    chain.in = self;
    chain.eq = self;
    chain.maybeSingle = () => Promise.resolve(result);
    chain.then = (
      onOk: (v: unknown) => unknown,
      onErr?: (e: unknown) => unknown,
    ) => Promise.resolve(result).then(onOk, onErr);
    chain.upsert = (payload: unknown) => {
      ops.push({ table, kind: "upsert", payload });
      return Promise.resolve({ data: null, error: null });
    };
    chain.update = (payload: unknown) => {
      ops.push({ table, kind: "update", payload });
      return chain;
    };
    return chain;
  };

  const client = {
    from(table: string) {
      if (table === "vacancy_import_cursors") {
        return chainFor(table, {
          data: options.cursorRow ?? null,
          error: null,
        }) as never;
      }
      return chainFor(table, {
        data: options.existing ?? [],
        error: null,
      }) as never;
    },
  };

  return { client: client as never, ops };
}

describe("persistVacancies — exact accounting", () => {
  it("an empty batch touches the database at all", async () => {
    const { client, ops } = fakeClient();
    const result = await persistVacancies(client, [], SEEN_AT);

    expect(result).toEqual({ inserted: 0, updated: 0, unchanged: 0 });
    // Not merely "wrote nothing" — it must not even open a read.
    expect(ops).toHaveLength(0);
  });

  it("counts a first-time batch as inserted, not updated", async () => {
    const { client, ops } = fakeClient({ existing: [] });
    const result = await persistVacancies(
      client,
      [vacancy({ externalId: "ad-1" }), vacancy({ externalId: "ad-2" })],
      SEEN_AT,
    );

    expect(result).toEqual({ inserted: 2, updated: 0, unchanged: 0 });
    const upserts = ops.filter((o) => o.kind === "upsert");
    expect(upserts).toHaveLength(1);
    expect((upserts[0].payload as unknown[]).length).toBe(2);
  });

  it("STEADY STATE: re-importing an unchanged ad writes no row and counts it as neither inserted nor updated", async () => {
    // This is the negative control for the naive implementation. A single
    // bare `.upsert(batch)` would report 2 written rows here and issue 2
    // pointless writes; that is the fabricated-evidence failure the module
    // was built to prevent.
    const a = vacancy({ externalId: "ad-1" });
    const b = vacancy({ externalId: "ad-2" });
    const { client, ops } = fakeClient({
      existing: [
        { provider_key: a.providerKey, external_id: a.externalId, content_hash: a.contentHash },
        { provider_key: b.providerKey, external_id: b.externalId, content_hash: b.contentHash },
      ],
    });

    const result = await persistVacancies(client, [a, b], SEEN_AT);

    expect(result).toEqual({ inserted: 0, updated: 0, unchanged: 2 });
    expect(ops.filter((o) => o.kind === "upsert")).toHaveLength(0);

    // The only writes are liveness touches, and they carry ONLY last_seen_at —
    // a touch must not quietly rewrite content.
    const touches = ops.filter((o) => o.kind === "update");
    expect(touches).toHaveLength(2);
    for (const touch of touches) {
      expect(Object.keys(touch.payload as object)).toEqual(["last_seen_at"]);
    }
  });

  it("a changed ad counts as updated, and an unrelated stored ad is left alone", async () => {
    const stored = vacancy({ externalId: "ad-1" });
    const revised = vacancy({ externalId: "ad-1", titleRaw: "Snickare (uppdaterad)" });
    expect(revised.contentHash).not.toBe(stored.contentHash);

    const { client, ops } = fakeClient({
      existing: [
        {
          provider_key: stored.providerKey,
          external_id: stored.externalId,
          content_hash: stored.contentHash,
        },
      ],
    });

    const result = await persistVacancies(client, [revised], SEEN_AT);

    expect(result).toEqual({ inserted: 0, updated: 1, unchanged: 0 });
    const upserts = ops.filter((o) => o.kind === "upsert");
    expect(upserts).toHaveLength(1);
    expect((upserts[0].payload as { title_raw: string }[])[0].title_raw).toBe(
      "Snickare (uppdaterad)",
    );
  });

  it("partitions a mixed batch into all three buckets in one pass", async () => {
    const unchanged = vacancy({ externalId: "keep" });
    const changed = vacancy({ externalId: "moved", titleRaw: "New title" });
    const fresh = vacancy({ externalId: "new" });

    const { client } = fakeClient({
      existing: [
        {
          provider_key: unchanged.providerKey,
          external_id: "keep",
          content_hash: unchanged.contentHash,
        },
        {
          provider_key: changed.providerKey,
          external_id: "moved",
          content_hash: "a-different-stored-hash",
        },
      ],
    });

    const result = await persistVacancies(
      client,
      [unchanged, changed, fresh],
      SEEN_AT,
    );

    expect(result).toEqual({ inserted: 1, updated: 1, unchanged: 1 });
  });
});

describe("toPublicVacancyRow — the mapping is where a persistence layer lies", () => {
  it("stores a publisher WITHDRAWAL as inactive rather than deleting or hiding it", async () => {
    const removed = vacancy({ externalId: "ad-9", lifecycle: "removed" });
    const row = toPublicVacancyRow(removed, SEEN_AT);

    expect(row.is_active).toBe(false);
    expect(row.lifecycle).toBe("removed");
  });

  it("keeps a live ad active", () => {
    expect(toPublicVacancyRow(vacancy(), SEEN_AT).is_active).toBe(true);
  });

  it("does NOT fold expiry into is_active — a fact with a timestamp stays a fact", () => {
    // An ad that expired last year is still `is_active` in the store; whether
    // it has expired is a question about *now*, answered by the read layer.
    // Baking it in at write time makes the row wrong as soon as time passes.
    const expired = vacancy({ expiresAt: "2020-01-01T00:00:00.000Z" });
    const row = toPublicVacancyRow(expired, SEEN_AT);

    expect(row.is_active).toBe(true);
    expect(row.expires_at).toBe("2020-01-01T00:00:00.000Z");
  });

  it("never echoes the original into a translated field when no provider is configured", () => {
    const untranslated = vacancy({
      translation: {
        targetLanguage: "en",
        status: "unavailable",
        titleText: null,
        descriptionText: null,
        provider: null,
      },
    });
    const row = toPublicVacancyRow(untranslated, SEEN_AT);

    expect(row.translation_status).toBe("unavailable");
    expect(row.translation_title_text).toBeNull();
    expect(row.translation_description_text).toBeNull();
    // The publisher's own words survive untouched.
    expect(row.title_raw).toBe("Snickare");
  });

  it("keeps publisher facts and derived guesses in separate columns", () => {
    const categorized = vacancy({
      occupationRaw: "Snickare",
      occupationConceptId: "sv-ssyk-7115",
      professionSlug: "carpenter",
      skillSlugs: ["formwork"],
      categorizationOrigin: "derived",
    });
    const row = toPublicVacancyRow(categorized, SEEN_AT);

    expect(row.occupation_raw).toBe("Snickare");
    expect(row.occupation_concept_id).toBe("sv-ssyk-7115");
    expect(row.profession_slug).toBe("carpenter");
    // The origin marker is what stops a derived guess being rendered as fact.
    expect(row.categorization_origin).toBe("derived");
  });

  it("preserves an empty description on a links-channel record instead of nulling it", () => {
    const link = vacancy({ channel: "links", descriptionRaw: "" });
    expect(toPublicVacancyRow(link, SEEN_AT).description_raw).toBe("");
  });

  it("is deterministic — the same input and clock produce an identical row", () => {
    const v = vacancy();
    expect(toPublicVacancyRow(v, SEEN_AT)).toEqual(toPublicVacancyRow(v, SEEN_AT));
  });

  it("never defaults an unstated headcount to 1", () => {
    expect(toPublicVacancyRow(vacancy({ positions: null }), SEEN_AT).positions).toBeNull();
  });
});

describe("the cursor store", () => {
  it("reports no checkpoint when none was ever written", async () => {
    const { client } = fakeClient({ cursorRow: null });
    expect(await readVacancyCursor(client, "arbetsformedlingen", "stream")).toEqual({
      cursorValue: null,
      consecutiveFailures: 0,
    });
  });

  it("returns the stored checkpoint and failure streak", async () => {
    const { client } = fakeClient({
      cursorRow: { cursor_value: "2026-08-09T09:00:00Z", consecutive_failures: 2 },
    });
    expect(await readVacancyCursor(client, "arbetsformedlingen", "stream")).toEqual({
      cursorValue: "2026-08-09T09:00:00Z",
      consecutiveFailures: 2,
    });
  });

  it("a FAILED run does not advance the cursor, and increments the streak", async () => {
    // The one unrecoverable mistake available here: advancing past records
    // that were never stored means no later run ever looks for them again.
    const { client, ops } = fakeClient();
    await writeVacancyCursor(client, {
      providerKey: "arbetsformedlingen",
      channel: "stream",
      succeeded: false,
      nextCursor: "2026-08-09T10:00:00Z",
      previousFailures: 1,
      failureCode: "http_503",
      runAtIso: SEEN_AT,
    });

    const written = ops.find((o) => o.kind === "upsert")?.payload as Record<string, unknown>;
    expect(written).not.toHaveProperty("cursor_value");
    expect(written.consecutive_failures).toBe(2);
    expect(written.last_failure_code).toBe("http_503");
  });

  it("a successful run advances the cursor and clears the failure streak", async () => {
    const { client, ops } = fakeClient();
    await writeVacancyCursor(client, {
      providerKey: "arbetsformedlingen",
      channel: "stream",
      succeeded: true,
      nextCursor: "2026-08-09T10:00:00Z",
      previousFailures: 3,
      failureCode: null,
      runAtIso: SEEN_AT,
    });

    const written = ops.find((o) => o.kind === "upsert")?.payload as Record<string, unknown>;
    expect(written.cursor_value).toBe("2026-08-09T10:00:00Z");
    expect(written.consecutive_failures).toBe(0);
    expect(written.last_failure_code).toBeNull();
    expect(written.last_success_at).toBe(SEEN_AT);
  });
});
