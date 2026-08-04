import { describe, it, expect } from "vitest";
import { dedupeVacancies, emptyDedupState } from "./vacancy-dedup";
import { computeVacancyContentHash, vacancyIdentityKey } from "./vacancy-hash";
import type { PublicVacancyV1 } from "./vacancy-contract";

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
  };
}

describe("content hash — identity, not freshness", () => {
  it("the same ad captured twice hashes identically", () => {
    const a = vacancy({ capturedAt: "2026-08-04T09:00:00.000Z" });
    const b = vacancy({ capturedAt: "2026-08-05T09:00:00.000Z" });
    expect(a.contentHash).toBe(b.contentHash);
  });

  it("capture time, channel, lifecycle and categorization stay OUT of the hash", () => {
    const base = vacancy();
    const recategorized = vacancy({
      channel: "stream",
      lifecycle: "removed",
      professionSlug: "carpenter",
      skillSlugs: ["carpentry"],
      translation: {
        targetLanguage: "en",
        status: "available",
        titleText: "Carpenter",
        descriptionText: "We are looking for a carpenter.",
        provider: "test",
      },
    });
    expect(recategorized.contentHash).toBe(base.contentHash);
  });

  it("a real change to what the employer asks for yields a new hash", () => {
    const base = vacancy();
    expect(vacancy({ positions: 5 }).contentHash).not.toBe(base.contentHash);
    expect(
      vacancy({
        compensation: {
          currency: "SEK",
          min: 30000,
          max: 40000,
          description: null,
        },
      }).contentHash,
    ).not.toBe(base.contentHash);
    expect(vacancy({ titleRaw: "Målare" }).contentHash).not.toBe(
      base.contentHash,
    );
  });

  it("identity key is provider-scoped", () => {
    expect(vacancyIdentityKey("arbetsformedlingen", "ad-1")).toBe(
      "arbetsformedlingen:ad-1",
    );
  });
});

describe("dedupe — replay vs revision vs withdrawal", () => {
  it("an unseen ad is new and is persisted", () => {
    const res = dedupeVacancies([vacancy()], emptyDedupState());
    expect(res.counts).toEqual({
      new: 1,
      revision: 0,
      removal: 0,
      duplicate: 0,
    });
    expect(res.toPersist).toHaveLength(1);
  });

  it("an identical replay is a duplicate and is NOT persisted", () => {
    const v = vacancy();
    const res = dedupeVacancies([v], {
      knownContentHashes: new Set([v.contentHash]),
      knownIdentityHashes: new Map([
        [vacancyIdentityKey(v.providerKey, v.externalId), v.contentHash],
      ]),
    });
    expect(res.counts.duplicate).toBe(1);
    expect(res.toPersist).toHaveLength(0);
  });

  it("an edited ad is a REVISION and is persisted — a stale salary never freezes", () => {
    const stored = vacancy();
    const edited = vacancy({
      compensation: {
        currency: "SEK",
        min: 35000,
        max: 42000,
        description: null,
      },
    });
    const res = dedupeVacancies([edited], {
      knownContentHashes: new Set([stored.contentHash]),
      knownIdentityHashes: new Map([
        [
          vacancyIdentityKey(stored.providerKey, stored.externalId),
          stored.contentHash,
        ],
      ]),
    });
    expect(res.counts).toMatchObject({ revision: 1, new: 0, duplicate: 0 });
    expect(res.toPersist).toHaveLength(1);
  });

  it("a withdrawal of a held ad is a removal; of an unheld ad it is nothing", () => {
    const stored = vacancy();
    const withdrawal = vacancy({ lifecycle: "removed", channel: "stream" });

    const held = dedupeVacancies([withdrawal], {
      knownContentHashes: new Set([stored.contentHash]),
      knownIdentityHashes: new Map([
        [
          vacancyIdentityKey(stored.providerKey, stored.externalId),
          stored.contentHash,
        ],
      ]),
    });
    expect(held.counts.removal).toBe(1);
    expect(held.toPersist).toHaveLength(1);

    const unheld = dedupeVacancies([withdrawal], emptyDedupState());
    expect(unheld.counts.removal).toBe(0);
    expect(unheld.counts.duplicate).toBe(1);
    expect(unheld.toPersist).toHaveLength(0);
  });

  it("within one batch the newest state of an ad wins", () => {
    const older = vacancy({ publishedAt: "2026-08-01T00:00:00.000Z" });
    const newer = vacancy({
      publishedAt: "2026-08-03T00:00:00.000Z",
      titleRaw: "Snickare (uppdaterad)",
    });
    const res = dedupeVacancies([newer, older], emptyDedupState());
    expect(res.decisions).toHaveLength(1);
    expect(res.decisions[0]!.vacancy.titleRaw).toBe("Snickare (uppdaterad)");
  });

  it("snapshot and stream overlap collapses to one row", () => {
    const fromSnapshot = vacancy({ channel: "snapshot" });
    const fromStream = vacancy({ channel: "stream" });
    const res = dedupeVacancies([fromSnapshot, fromStream], emptyDedupState());
    expect(res.decisions).toHaveLength(1);
    expect(res.toPersist).toHaveLength(1);
  });

  it("distinct ads are all kept", () => {
    const res = dedupeVacancies(
      [vacancy({ externalId: "a" }), vacancy({ externalId: "b" })],
      emptyDedupState(),
    );
    expect(res.counts.new).toBe(2);
  });
});
