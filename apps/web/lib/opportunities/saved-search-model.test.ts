import { describe, expect, it } from "vitest";

import { EMPTY_DISCOVERY_FILTERS, type DiscoveryFilterState } from "@/lib/opportunities/discovery-filters";
import type { OpportunityNeed } from "@/lib/opportunities/opportunity-fit";
import {
  alertableSearches,
  hasAnyCriteria,
  readSavedSearches,
  savedSearchHref,
  toDiscoveryFilterState,
  toStoredCriteria,
  type SavedSearch,
} from "@/lib/opportunities/saved-search-model";

const need = (
  id: string,
  profession: string | null,
  country: string | null,
  createdAt: string | null,
): { need: OpportunityNeed } => ({
  need: {
    id,
    roleText: profession,
    country,
    teamSize: null,
    startPeriod: null,
    accommodation: null,
    createdAt,
  } as OpportunityNeed,
});

const search = (
  id: string,
  criteria: Partial<DiscoveryFilterState>,
  lastSeenAt: string | null = null,
  notify = true,
): SavedSearch => ({
  id,
  label: id,
  criteria: { ...EMPTY_DISCOVERY_FILTERS, ...criteria },
  notify,
  lastSeenAt,
});

describe("the stored shape is exactly the seven dimensions", () => {
  it("drops empty values, so an unset filter is not stored as a blank", () => {
    expect(
      toStoredCriteria({ ...EMPTY_DISCOVERY_FILTERS, profession: "welder", country: "  " }),
    ).toEqual({ profession: "welder" });
  });

  it("narrows an unexpected stored object to the known keys", () => {
    // The database rejects an eighth key, so this is the type boundary rather
    // than the security one — it exists so a row written before a schema
    // change cannot arrive as a surprising shape.
    const state = toDiscoveryFilterState({ profession: "welder", note: "leaked", country: 7 });
    expect(state.profession).toBe("welder");
    expect(state.country).toBeNull();
    expect(Object.keys(state).sort()).toEqual(
      Object.keys(EMPTY_DISCOVERY_FILTERS).sort(),
    );
    expect(JSON.stringify(state)).not.toContain("leaked");
  });

  it("an empty question is not a question", () => {
    // Saving it would create an alert that fires on the whole board.
    expect(hasAnyCriteria(EMPTY_DISCOVERY_FILTERS)).toBe(false);
    expect(hasAnyCriteria({ ...EMPTY_DISCOVERY_FILTERS, tool: "excavator-operator" })).toBe(true);
  });

  it("the board link is rebuilt from the criteria, never stored", () => {
    const href = savedSearchHref("/dashboard/opportunities", {
      ...EMPTY_DISCOVERY_FILTERS,
      profession: "welder",
      country: "NL",
    });
    expect(href).toContain("profession=welder");
    expect(href).toContain("country=NL");
  });
});

describe("matching is the board's own, and counts what the worker can see", () => {
  const cards = [
    need("a", "welder", "NL", "2026-09-10"),
    need("b", "welder", "BE", "2026-09-11"),
    need("c", "painter", "NL", "2026-09-12"),
  ];

  it("counts the matches of each saved question", () => {
    const [r] = readSavedSearches([search("s", { profession: "welder" })], cards);
    expect(r.matchCount).toBe(2);
  });

  it("never having looked means everything matching is new", () => {
    const [r] = readSavedSearches([search("s", { country: "NL" }, null)], cards);
    expect(r.matchCount).toBe(2);
    expect(r.newSinceSeen).toBe(2);
  });

  it("counts only matches created after the worker last looked", () => {
    const [r] = readSavedSearches([search("s", { country: "NL" }, "2026-09-11")], cards);
    expect(r.matchCount).toBe(2);
    expect(r.newSinceSeen).toBe(1);
  });

  it("nothing new is a real zero when every match carries a date", () => {
    const [r] = readSavedSearches([search("s", { country: "NL" }, "2026-12-31")], cards);
    expect(r.newSinceSeen).toBe(0);
  });
});

describe("'new' is unknown, not zero, when it cannot be known — SEP-7", () => {
  it("one undated match makes the whole count unknowable", () => {
    // We cannot say "3 new" while a fourth might also be new, and we must
    // not say "nothing new" either — that is a claim on no evidence.
    const cards = [need("a", "welder", "NL", "2026-09-10"), need("b", "welder", "NL", null)];
    const [r] = readSavedSearches([search("s", { profession: "welder" }, "2026-01-01")], cards);
    expect(r.matchCount).toBe(2);
    expect(r.newSinceSeen).toBeNull();
  });

  it("an unknown count never triggers an alert", () => {
    const cards = [need("a", "welder", "NL", null)];
    const readings = readSavedSearches([search("s", { profession: "welder" })], cards);
    expect(readings[0].newSinceSeen).toBeNull();
    expect(alertableSearches(readings)).toEqual([]);
  });
});

describe("an alert is only for a worker who asked for one", () => {
  const cards = [need("a", "welder", "NL", "2026-09-10")];

  it("notify off means no alert, however many matches there are", () => {
    const readings = readSavedSearches([search("s", { profession: "welder" }, null, false)], cards);
    expect(readings[0].newSinceSeen).toBe(1);
    expect(alertableSearches(readings)).toEqual([]);
  });

  it("nothing new means no alert", () => {
    const readings = readSavedSearches(
      [search("s", { profession: "welder" }, "2026-12-31")],
      cards,
    );
    expect(alertableSearches(readings)).toEqual([]);
  });

  it("an unseen match on a notifying search does alert", () => {
    const readings = readSavedSearches([search("s", { profession: "welder" })], cards);
    expect(alertableSearches(readings).map((r) => r.id)).toEqual(["s"]);
  });
});
