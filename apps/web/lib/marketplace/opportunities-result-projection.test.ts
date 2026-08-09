import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The `opportunities` RESULT projection — behaviour tests against the canonical
 * marketplace use case.
 *
 * WHY THIS FILE EXISTS. These invariants used to live in
 * `lib/conversation/find-work.test.ts`, because the chat THREAD rendered the
 * job rows. The Context Panel result is the single renderer now, so the rows
 * travel through `loadOpportunitiesResultAction` instead — and the guarantees
 * travelled with them rather than being deleted along with the old renderer.
 * Dropping them would have been the quiet way to lose the §19 contract while
 * appearing to simplify.
 *
 * What is pinned here, exactly as before, only at the new boundary:
 *   • the ONE use case is called with surface "conversation" and a fixed limit;
 *   • the use case's order survives — no second sort;
 *   • the match set is never re-sliced;
 *   • every id is the REAL demand id (`requestId`), never a list position;
 *   • the §19 basis crosses whole — counts AND confirmed share, never a bare
 *     percentage and never an aggregate score;
 *   • `fitStatus` is a passthrough of the canonical status, not a recomputation;
 *   • the worker's own interest status comes from the use case, never a guess;
 *   • the interest copy is resolved ONCE, and is null when the owner-gated
 *     table is absent, so the panel cannot render a button that cannot write;
 *   • no-worker and unapplied-board degrade honestly, and DISTINCTLY.
 */

const loadMatchesMock = vi.fn();
const resolveLabelsMock = vi.fn();

vi.mock("next-intl/server", () => ({
  getLocale: vi.fn(async () => "lt"),
  // Root translator: echoes the key so a test can see WHICH code the action
  // resolved — mirroring find-work.test.ts's namespaced variant.
  getTranslations: vi.fn(async (ns?: string) => {
    const t = (key: string, values?: Record<string, unknown>) => {
      const full = ns ? `${ns}.${key}` : key;
      return values ? `${full}(${JSON.stringify(values)})` : full;
    };
    (t as unknown as { has: (k: string) => boolean }).has = () => true;
    return t;
  }),
}));

vi.mock("@/lib/marketplace/worker-opportunities", () => ({
  loadWorkerOpportunityMatches: (...args: unknown[]) => loadMatchesMock(...args),
  markOpportunitiesShown: vi.fn(),
}));

vi.mock("@/lib/opportunities/interest-labels", () => ({
  resolveInterestLabels: (...args: unknown[]) => resolveLabelsMock(...args),
}));

const { loadOpportunitiesResultAction } = await import("./worker-opportunities-actions");
const { OPPORTUNITIES_RESULT_LIMIT } = await import("./worker-opportunities-contract");

const ID = {
  a: "11111111-1111-4111-8111-111111111111",
  b: "22222222-2222-4222-8222-222222222222",
  c: "33333333-3333-4333-8333-333333333333",
} as const;

const LABELS = {
  express: "express",
  sent: "sent",
  reviewed: "reviewed",
  contacted: "contacted",
  withdraw: "withdraw",
  internalNote: "internalNote",
  error: "error",
  contactedLink: "contactedLink",
  contactEmployer: "contactEmployer",
  contactError: "contactError",
};

/** A canonical `JobRecommendation`, already ranked and explained. */
function rec(
  requestId: string,
  over: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    requestId,
    roleSlug: "tiler",
    country: "NL",
    locationLabel: "Amsterdam",
    startPeriod: "asap",
    companyName: "Dev Construction",
    status: "strong",
    basis: { pct: 100, matchedTotal: 3, needTotal: 3, matchedConfirmed: 1 },
    topReasonCodes: [],
    salary: "unknown",
    matchedSkillSlugs: ["tiling"],
    missingSkillSlugs: [],
    unseen: true,
    isNew: true,
    ...over,
  };
}

function ready(matches: Record<string, unknown>[], over: Record<string, unknown> = {}) {
  const { capabilities, ...rest } = over;
  return {
    kind: "ready",
    surface: "conversation",
    interestStatusByRequestId: {},
    matches,
    totalRecommendable: matches.length,
    newCount: matches.length,
    externalCards: [],
    totalExternal: 0,
    ...rest,
    // Merged LAST and separately, so overriding one capability cannot silently
    // drop the others (an earlier version of this helper did exactly that and
    // turned a ready view into an "unavailable" one).
    capabilities: {
      boardAvailable: true,
      seenAvailable: false,
      seenReadDegraded: false,
      interestAvailable: true,
      ...((capabilities as Record<string, unknown>) ?? {}),
    },
  };
}

beforeEach(() => {
  loadMatchesMock.mockReset();
  resolveLabelsMock.mockReset();
  resolveLabelsMock.mockResolvedValue(LABELS);
});

describe("delegation to the canonical use case", () => {
  it('calls the ONE use case with surface "conversation" and the fixed limit', async () => {
    loadMatchesMock.mockResolvedValue(ready([rec(ID.a)]));
    await loadOpportunitiesResultAction();
    expect(loadMatchesMock).toHaveBeenCalledTimes(1);
    expect(loadMatchesMock).toHaveBeenCalledWith({
      surface: "conversation",
      limit: OPPORTUNITIES_RESULT_LIMIT,
    });
  });

  it("a non-ready view is no-worker — never an empty list", async () => {
    loadMatchesMock.mockResolvedValue({ kind: "no-worker" });
    const res = await loadOpportunitiesResultAction();
    expect(res.kind).toBe("no-worker");
  });

  it('an unapplied board RPC is "unavailable", never "no matches"', async () => {
    loadMatchesMock.mockResolvedValue(
      ready([], { capabilities: { boardAvailable: false } }),
    );
    const res = await loadOpportunitiesResultAction();
    // The two absences stay DISTINCT: "there is no demand data at all" is not
    // "nothing matched you".
    expect(res.kind).toBe("unavailable");
  });

  it("a genuinely empty canonical result is ready-with-no-rows", async () => {
    loadMatchesMock.mockResolvedValue(ready([]));
    const res = await loadOpportunitiesResultAction();
    expect(res.kind).toBe("ready");
    if (res.kind !== "ready") return;
    expect(res.matches).toEqual([]);
  });
});

describe("order, count and identity come from the use case", () => {
  it("keeps the canonical order — no second sort", async () => {
    loadMatchesMock.mockResolvedValue(
      ready([
        rec(ID.c, { status: "weak" }),
        rec(ID.a, { status: "possible" }),
        rec(ID.b, { status: "strong" }),
      ]),
    );
    const res = await loadOpportunitiesResultAction();
    if (res.kind !== "ready") throw new Error("expected ready");
    expect(res.matches.map((m) => m.requestId)).toEqual([ID.c, ID.a, ID.b]);
  });

  it("projects every match the use case returned — no extra slice", async () => {
    loadMatchesMock.mockResolvedValue(ready([rec(ID.a), rec(ID.b), rec(ID.c)]));
    const res = await loadOpportunitiesResultAction();
    if (res.kind !== "ready") throw new Error("expected ready");
    expect(res.matches).toHaveLength(3);
  });

  it("every id is the REAL demand id, never a list position", async () => {
    loadMatchesMock.mockResolvedValue(ready([rec(ID.a), rec(ID.b), rec(ID.c)]));
    const res = await loadOpportunitiesResultAction();
    if (res.kind !== "ready") throw new Error("expected ready");
    const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    for (const [i, m] of res.matches.entries()) {
      expect(m.requestId, `row ${i}`).toMatch(UUID);
      expect(m.requestId).not.toBe(String(i));
    }
    expect(new Set(res.matches.map((m) => m.requestId)).size).toBe(3);
  });
});

describe("§19 — the basis crosses the boundary WHOLE", () => {
  it("carries counts and the confirmed share together", async () => {
    loadMatchesMock.mockResolvedValue(
      ready([
        rec(ID.a, {
          basis: { pct: 80, matchedTotal: 4, needTotal: 5, matchedConfirmed: 2 },
        }),
      ]),
    );
    const res = await loadOpportunitiesResultAction();
    if (res.kind !== "ready") throw new Error("expected ready");
    expect(res.matches[0].basis).toEqual({
      matchedTotal: 4,
      needTotal: 5,
      matchedConfirmed: 2,
    });
  });

  it("no percentage and no aggregate score reach the panel", async () => {
    loadMatchesMock.mockResolvedValue(
      ready([
        rec(ID.a, {
          basis: { pct: 80, matchedTotal: 4, needTotal: 5, matchedConfirmed: 2 },
        }),
      ]),
    );
    const res = await loadOpportunitiesResultAction();
    if (res.kind !== "ready") throw new Error("expected ready");
    // `pct` exists on the domain object and must NOT be projected: a bare
    // percentage is the one form §19 forbids, so it cannot even be available
    // to render.
    expect(JSON.stringify(res.matches[0])).not.toContain("pct");
    expect(res.matches[0]).not.toHaveProperty("score");
  });

  it("fitStatus is a passthrough of the canonical status, not a recomputation", async () => {
    loadMatchesMock.mockResolvedValue(
      ready([rec(ID.a, { status: "weak" }), rec(ID.b, { status: "possible" })]),
    );
    const res = await loadOpportunitiesResultAction();
    if (res.kind !== "ready") throw new Error("expected ready");
    expect(res.matches.map((m) => m.fitStatus)).toEqual(["weak", "possible"]);
  });

  it("never invents a company — an unnamed demand carries null, honestly", async () => {
    loadMatchesMock.mockResolvedValue(ready([rec(ID.a, { companyName: null })]));
    const res = await loadOpportunitiesResultAction();
    if (res.kind !== "ready") throw new Error("expected ready");
    // The panel falls back to the role label; the projection does not invent
    // a name to hide the absence.
    expect(res.matches[0].companyName).toBeNull();
  });
});

describe("actionability through the canonical interest path", () => {
  it("carries the worker's OWN interest status, straight from the use case", async () => {
    loadMatchesMock.mockResolvedValue(
      ready([rec(ID.a), rec(ID.b)], {
        interestStatusByRequestId: { [ID.a]: "sent" },
      }),
    );
    const res = await loadOpportunitiesResultAction();
    if (res.kind !== "ready") throw new Error("expected ready");
    expect(res.matches[0].interestStatus).toBe("sent");
    // An absent key means "no signal", NOT "not interested".
    expect(res.matches[1].interestStatus).toBeNull();
  });

  it("resolves the canonical interest copy ONCE — no panel-private wording", async () => {
    loadMatchesMock.mockResolvedValue(ready([rec(ID.a), rec(ID.b)]));
    const res = await loadOpportunitiesResultAction();
    if (res.kind !== "ready") throw new Error("expected ready");
    expect(resolveLabelsMock).toHaveBeenCalledTimes(1);
    expect(res.interestLabels).toEqual(LABELS);
  });

  it("offers NO control when the owner-gated interest table is absent", async () => {
    loadMatchesMock.mockResolvedValue(
      ready([rec(ID.a)], { capabilities: { interestAvailable: false } }),
    );
    const res = await loadOpportunitiesResultAction();
    if (res.kind !== "ready") throw new Error("expected ready");
    // Null copy IS the availability signal — there is no second boolean that
    // could disagree with it — so the panel renders read-only rows.
    expect(res.interestLabels).toBeNull();
    expect(resolveLabelsMock).not.toHaveBeenCalled();
  });
});

describe("external public-source ads cross the boundary with their provenance", () => {
  /** A canonical external card, as the use case returns it. */
  function extCard(key: string, over: Record<string, unknown> = {}) {
    return {
      key,
      view: {
        title: "Snickare till byggprojekt",
        employerName: "Bygg AB",
        city: "Stockholm",
        country: "SE",
        publishedAt: "2026-08-09T14:08:35.000Z",
        provenance: {
          attributionCode: "vacancySources.attribution.arbetsformedlingen",
          applicationRoute: "source_original",
          applicationUrl: "https://arbetsformedlingen.se/platsbanken/annonser/1",
        },
        ...over,
      },
      capabilities: {},
      match: {},
      matchingGaps: [],
    };
  }

  it("projects the compact row with RESOLVED attribution and the original URL — nothing else", async () => {
    loadMatchesMock.mockResolvedValue(
      ready([], { externalCards: [extCard("arbetsformedlingen:1")], totalExternal: 1 }),
    );
    const res = await loadOpportunitiesResultAction();
    if (res.kind !== "ready") throw new Error("expected ready");
    expect(res.external).toEqual([
      {
        key: "arbetsformedlingen:1",
        title: "Snickare till byggprojekt",
        employerName: "Bygg AB",
        city: "Stockholm",
        country: "SE",
        publishedAt: "2026-08-09",
        originalUrl: "https://arbetsformedlingen.se/platsbanken/annonser/1",
        // TEXT, resolved server-side (the mock echoes the key). A raw CODE
        // here rendered verbatim in production on 2026-08-10 — the client
        // bundle has no vacancySources namespace.
        attributionText: "vacancySources.attribution.arbetsformedlingen",
      },
    ]);
    expect(res.totalExternal).toBe(1);
  });

  it("slices to the contract's external display cap and reports the true total", async () => {
    const cards = Array.from({ length: 9 }, (_, i) => extCard(`arbetsformedlingen:${i}`));
    loadMatchesMock.mockResolvedValue(
      ready([], { externalCards: cards, totalExternal: 9 }),
    );
    const res = await loadOpportunitiesResultAction();
    if (res.kind !== "ready") throw new Error("expected ready");
    expect(res.external).toHaveLength(5);
    expect(res.totalExternal).toBe(9);
  });

  it("a card without a source_original route carries a NULL url — no invented action", async () => {
    loadMatchesMock.mockResolvedValue(
      ready([], {
        externalCards: [
          extCard("arbetsformedlingen:2", {
            provenance: {
              attributionCode: "vacancySources.attribution.arbetsformedlingen",
              applicationRoute: "none",
              applicationUrl: null,
            },
          }),
        ],
        totalExternal: 1,
      }),
    );
    const res = await loadOpportunitiesResultAction();
    if (res.kind !== "ready") throw new Error("expected ready");
    expect(res.external[0].originalUrl).toBeNull();
  });
});
