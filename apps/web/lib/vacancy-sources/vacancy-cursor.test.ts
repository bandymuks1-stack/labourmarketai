import { describe, it, expect } from "vitest";
import {
  VACANCY_CURSOR_OVERLAP_MS,
  computeNextVacancyCursor,
  cursorRequestBound,
  planVacancyWindows,
} from "./vacancy-cursor";
import { computeVacancyContentHash } from "./vacancy-hash";
import type { PublicVacancyV1 } from "./vacancy-contract";

function at(publishedAt: string): PublicVacancyV1 {
  const identity = {
    providerKey: "arbetsformedlingen" as const,
    externalId: publishedAt,
    titleRaw: "Snickare",
    descriptionRaw: "",
    sourceLanguage: "sv",
    employer: { name: null, externalOrgId: null, homepage: null },
    location: { country: "SE", region: null, city: null, lat: null, lng: null },
    compensation: { currency: null, min: null, max: null, description: null },
    employmentForm: "unknown" as const,
    workingTime: "unknown" as const,
    positions: null,
    startDate: null,
    publishedAt,
    expiresAt: null,
    transformVersion: "vacancy-arbetsformedlingen-v1",
  };
  return {
    ...identity,
    contentHash: computeVacancyContentHash(identity),
    lifecycle: "published",
    channel: "stream",
    capturedAt: "2026-08-04T09:00:00.000Z",
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
  };
}

describe("the cursor advances to the newest publisher timestamp", () => {
  it("takes the maximum publishedAt in the batch", () => {
    const next = computeNextVacancyCursor(null, [
      at("2026-08-01T00:00:00.000Z"),
      at("2026-08-03T12:00:00.000Z"),
      at("2026-08-02T00:00:00.000Z"),
    ]);
    expect(next).toBe("2026-08-03T12:00:00.000Z");
  });

  it("advances past a previous cursor when the batch is newer", () => {
    const next = computeNextVacancyCursor("2026-08-01T00:00:00.000Z", [
      at("2026-08-05T00:00:00.000Z"),
    ]);
    expect(next).toBe("2026-08-05T00:00:00.000Z");
  });
});

describe("the cursor NEVER moves backwards", () => {
  it("an older batch leaves the checkpoint where it was", () => {
    const previous = "2026-08-10T00:00:00.000Z";
    const next = computeNextVacancyCursor(previous, [
      at("2026-08-01T00:00:00.000Z"),
    ]);
    expect(next).toBe(previous);
  });

  it("an empty batch leaves the checkpoint where it was", () => {
    const previous = "2026-08-10T00:00:00.000Z";
    expect(computeNextVacancyCursor(previous, [])).toBe(previous);
  });

  it("an all-unparseable batch leaves the checkpoint where it was", () => {
    const previous = "2026-08-10T00:00:00.000Z";
    expect(
      computeNextVacancyCursor(previous, [at("not a date"), at("")]),
    ).toBe(previous);
  });

  it("no previous cursor and no usable timestamp yields null — an honest 'no checkpoint'", () => {
    expect(computeNextVacancyCursor(null, [])).toBeNull();
    expect(computeNextVacancyCursor(null, [at("nonsense")])).toBeNull();
    expect(computeNextVacancyCursor("also nonsense", [])).toBeNull();
  });
});

describe("the request bound re-reads a small overlap", () => {
  it("nudges the cursor back so a same-second publication is not dropped", () => {
    const bound = cursorRequestBound("2026-08-03T12:00:00.000Z");
    expect(bound).toBe("2026-08-03T11:59:59.000Z");
    expect(VACANCY_CURSOR_OVERLAP_MS).toBe(1_000);
  });

  it("returns null with no cursor — the caller must run a snapshot, not an unbounded stream", () => {
    expect(cursorRequestBound(null)).toBeNull();
    expect(cursorRequestBound("")).toBeNull();
    expect(cursorRequestBound("garbage")).toBeNull();
  });

  it("the overlap is small enough to be free — dedup collapses the re-read", () => {
    expect(VACANCY_CURSOR_OVERLAP_MS).toBeLessThanOrEqual(5_000);
  });
});

describe("planVacancyWindows — the bounded walk", () => {
  const plan = (over: Partial<Parameters<typeof planVacancyWindows>[0]> = {}) =>
    planVacancyWindows({
      fromIso: "2026-08-04T00:00:00.000Z",
      nowIso: "2026-08-04T09:00:00.000Z",
      widthSeconds: 3 * 60 * 60,
      safetyLagSeconds: 60,
      maxWindows: 50,
      ...over,
    });

  it("slices the backlog into abutting windows with no gap between them", () => {
    const { windows, reachedPresent } = plan();

    expect(windows).toHaveLength(3);
    expect(reachedPresent).toBe(true);
    // A gap between two slices is a record nobody ever asks for.
    for (let i = 1; i < windows.length; i += 1) {
      expect(windows[i].startIso).toBe(windows[i - 1].endIso);
    }
    expect(windows[0].startIso).toBe("2026-08-04T00:00:00.000Z");
    expect(windows[2].endIso).toBe("2026-08-04T08:59:00.000Z");
  });

  it("never plans a slice wider than the configured width", () => {
    for (const w of plan({ nowIso: "2026-08-09T09:00:00.000Z" }).windows) {
      expect(Date.parse(w.endIso) - Date.parse(w.startIso)).toBeLessThanOrEqual(
        3 * 60 * 60 * 1000,
      );
    }
  });

  it("trails the present by the safety lag", () => {
    // The window end becomes the checkpoint, so a slice closing at exactly
    // "now" would skip anything the publisher writes a moment later.
    const { windows } = plan();
    const last = windows[windows.length - 1];
    expect(Date.parse(last.endIso)).toBe(
      Date.parse("2026-08-04T09:00:00.000Z") - 60_000,
    );
  });

  it("reports truncation instead of pretending the walk finished", () => {
    const { windows, reachedPresent } = plan({ maxWindows: 2 });

    expect(windows).toHaveLength(2);
    expect(reachedPresent).toBe(false);
    expect(windows[1].endIso).toBe("2026-08-04T06:00:00.000Z");
  });

  it("plans nothing, and is caught up, when the cursor is level with now", () => {
    const { windows, reachedPresent } = plan({
      fromIso: "2026-08-04T08:59:30.000Z",
    });

    expect(windows).toEqual([]);
    // Nothing to do is CAUGHT UP, not a stalled walk.
    expect(reachedPresent).toBe(true);
  });

  it("plans nothing, and is NOT caught up, without a checkpoint", () => {
    const { windows, reachedPresent } = plan({ fromIso: null });

    expect(windows).toEqual([]);
    expect(reachedPresent).toBe(false);
  });
});
