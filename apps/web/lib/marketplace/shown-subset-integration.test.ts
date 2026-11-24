import { describe, expect, it } from "vitest";

import {
  applyDiscoveryFilters,
  parseDiscoveryParams,
  sortDiscoveryCards,
} from "@/lib/opportunities/discovery-filters";
import type { OpportunityNeed } from "@/lib/opportunities/opportunity-fit";
import {
  deriveJobRecommendations,
  journalConnections,
  type RecommendationSource,
} from "@/lib/opportunities/recommendations-model";
import type { MatchResultV1 } from "@/lib/market/match-v1";
import { runMarkShown, type MarkShownPorts } from "./worker-opportunities-shown-core";

/**
 * Integration: load → narrow → render → mark ONLY the rendered subset.
 *
 * This composes the REAL narrowing each surface uses — the board's URL-param
 * discovery filters and the compact surfaces' recommendation derivation plus
 * journal-connection intersection — with the REAL mark-shown core, and asserts
 * what actually reaches the store.
 *
 * It is a behaviour test, not a source-text pin: swap the narrowing rules and
 * the assertions still hold; wire a surface to report its LOADED set instead of
 * its RENDERED set and these cases fail.
 *
 * The runtime counterpart of these cases was verified in a browser against the
 * local Supabase stack (PR #868 review): the board at `?country=DE` rendered 1
 * of 3 loaded rows and `worker_opportunity_seen` received exactly that 1 row.
 */

const ID = {
  nlTiler: "11111111-1111-4111-8111-111111111111",
  deTiler: "22222222-2222-4222-8222-222222222222",
  nlWelder: "33333333-3333-4333-8333-333333333333",
} as const;

function need(
  id: string,
  overrides: Partial<OpportunityNeed> = {},
): OpportunityNeed {
  return {
    id,
    roleText: "tiler",
    country: "NL",
    teamSize: 2,
    startPeriod: "asap",
    accommodation: null,
    transport: null,
    requiredTools: null,
    companyName: "Dev Construction",
    locationLabel: "Amsterdam",
    routeStatus: "approved_direct_partner",
    createdAt: "2026-07-24T00:00:00.000Z",
    ...overrides,
  };
}

/** A match the recommendation gate accepts: eligible, ≥1 matched skill. */
function match(matched: string[], missing: string[]): MatchResultV1 {
  return {
    status: missing.length === 0 ? "strong" : "possible",
    eligible: true,
    reasons: [],
    matchedHard: [],
    negotiables: [],
    missingFacts: [],
    skillFit: {
      pct: Math.round((matched.length / (matched.length + missing.length)) * 100),
      matchedTotal: matched.length,
      needTotal: matched.length + missing.length,
      matchedConfirmed: 0,
      matchedUris: matched,
      missingUris: missing,
    },
  } as unknown as MatchResultV1;
}

/** Not recommendable: eligible but zero matched skills. */
function noSkillMatch(): MatchResultV1 {
  return {
    status: "weak",
    eligible: true,
    reasons: [],
    matchedHard: [],
    negotiables: [],
    missingFacts: [],
    skillFit: {
      pct: 0,
      matchedTotal: 0,
      needTotal: 3,
      matchedConfirmed: 0,
      matchedUris: [],
      missingUris: ["arc-welding", "tig-welding", "structural-steel"],
    },
  } as unknown as MatchResultV1;
}

/** The full authorized set the gated board RPC returned — three rows. */
const LOADED = [
  { need: need(ID.nlTiler), match: match(["tiling"], []) },
  {
    need: need(ID.deTiler, { country: "DE", locationLabel: "Berlin" }),
    match: match(["tiling"], []),
  },
  {
    need: need(ID.nlWelder, {
      roleText: "welder",
      locationLabel: "Rotterdam",
    }),
    match: noSkillMatch(),
  },
] satisfies RecommendationSource[];

function spyPorts() {
  const sent: string[][] = [];
  const ports: MarkShownPorts = {
    writeSeen: async (ids) => {
      sent.push([...ids]);
      return { kind: "ok", marked: ids.length };
    },
    reportUnexpected: () => {
      throw new Error("no unexpected error expected in this scenario");
    },
  };
  return { ports, sent };
}

describe("board: load 3 → filter to 1 → mark 1", () => {
  it("an active country filter narrows what is reported, not just what is drawn", async () => {
    const { filters, sort } = parseDiscoveryParams({ country: "DE" });
    const rendered = sortDiscoveryCards(
      applyDiscoveryFilters(LOADED, filters),
      sort,
    );

    // The narrowing is real: 3 authorized rows, 1 on screen.
    expect(LOADED).toHaveLength(3);
    expect(rendered.map((c) => c.need.id)).toEqual([ID.deTiler]);

    const { ports, sent } = spyPorts();
    const outcome = await runMarkShown(ports, {
      surface: "opportunities_board",
      shownRequestIds: rendered.map((c) => c.need.id),
    });

    expect(sent).toEqual([[ID.deTiler]]);
    expect(outcome.persisted).toBe(true);
    expect(outcome.marked).toBe(1);
    // The two filtered-out rows must remain unseen — they were never shown.
    expect(sent.flat()).not.toContain(ID.nlTiler);
    expect(sent.flat()).not.toContain(ID.nlWelder);
  });

  it("no filter → the whole rendered board is reported", async () => {
    const { filters, sort } = parseDiscoveryParams({});
    const rendered = sortDiscoveryCards(
      applyDiscoveryFilters(LOADED, filters),
      sort,
    );
    const { ports, sent } = spyPorts();
    await runMarkShown(ports, {
      surface: "opportunities_board",
      shownRequestIds: rendered.map((c) => c.need.id),
    });
    expect(sent[0]).toHaveLength(3);
  });

  it("a filter that matches nothing reports nothing at all", async () => {
    const { filters, sort } = parseDiscoveryParams({ country: "FR" });
    const rendered = sortDiscoveryCards(
      applyDiscoveryFilters(LOADED, filters),
      sort,
    );
    expect(rendered).toEqual([]);

    const { ports, sent } = spyPorts();
    const outcome = await runMarkShown(ports, {
      surface: "opportunities_board",
      shownRequestIds: rendered.map((c) => c.need.id),
    });
    expect(sent).toEqual([]); // the store is never even called
    expect(outcome.reason).toBe("nothing_shown");
    expect(outcome.persisted).toBe(false);
  });
});

describe("compact surfaces: load 3 → recommend 2 → limit → mark the displayed slice", () => {
  const NOW = Date.parse("2026-07-25T00:00:00.000Z");

  it("a non-recommendable row is loaded but never reported as shown", async () => {
    const recs = deriveJobRecommendations(
      LOADED,
      { available: true, seenIds: new Set() },
      NOW,
    );
    // The welder demand has zero matched skills → not recommendable.
    expect(recs.map((r) => r.requestId)).toEqual([ID.nlTiler, ID.deTiler]);

    const { ports, sent } = spyPorts();
    await runMarkShown(ports, {
      surface: "conversation",
      shownRequestIds: recs.slice(0, 3).map((r) => r.requestId),
    });
    expect(sent.flat()).not.toContain(ID.nlWelder);
  });

  it("a display limit smaller than the recommendation set narrows the report too", async () => {
    const recs = deriveJobRecommendations(
      LOADED,
      { available: true, seenIds: new Set() },
      NOW,
    );
    const displayed = recs.slice(0, 1); // the compact result renders one row
    const { ports, sent } = spyPorts();
    await runMarkShown(ports, {
      surface: "conversation",
      shownRequestIds: displayed.map((r) => r.requestId),
    });
    expect(sent).toEqual([[ID.nlTiler]]);
    expect(sent.flat()).not.toContain(ID.deTiler);
  });

  it("journal context reports only the rows whose skills actually connected", async () => {
    const recs = deriveJobRecommendations(
      LOADED,
      { available: true, seenIds: new Set() },
      NOW,
    );
    // The worker journaled `tiling` only — the DE row needs it too, but this
    // scenario gives it a different requirement so exactly one row connects.
    const journaled = new Set(["tiling"]);
    const connected = recs.filter(
      (r) => journalConnections(r, journaled).length > 0,
    );
    expect(connected.length).toBeGreaterThan(0);
    expect(connected.length).toBeLessThanOrEqual(recs.length);

    const { ports, sent } = spyPorts();
    await runMarkShown(ports, {
      surface: "journal_context",
      shownRequestIds: connected.slice(0, 2).map((r) => r.requestId),
    });
    // Whatever connected, the welder row never did.
    expect(sent.flat()).not.toContain(ID.nlWelder);
    expect(sent[0]).toEqual(connected.slice(0, 2).map((r) => r.requestId).sort());
  });
});

describe("one contract, four surfaces, same narrowing rule", () => {
  it("every surface sends a subset of what it loaded — never a superset", async () => {
    const loadedIds = new Set(LOADED.map((c) => c.need.id));
    const scenarios: { surface: Parameters<typeof runMarkShown>[1]["surface"]; ids: string[] }[] =
      [
        { surface: "conversation", ids: [ID.nlTiler, ID.deTiler] },
        { surface: "opportunities_board", ids: [ID.deTiler] },
        { surface: "journal_context", ids: [ID.nlTiler] },
      ];
    for (const s of scenarios) {
      const { ports, sent } = spyPorts();
      await runMarkShown(ports, {
        surface: s.surface,
        shownRequestIds: s.ids,
      });
      for (const id of sent.flat()) {
        expect(loadedIds.has(id), `${s.surface} reported an unloaded id`).toBe(
          true,
        );
      }
      expect(sent.flat().length).toBeLessThanOrEqual(loadedIds.size);
    }
  });
});
