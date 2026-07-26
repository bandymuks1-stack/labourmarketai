import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Conversation find-work — BEHAVIOUR tests against the canonical marketplace
 * use case (PR #864 × #868 integration).
 *
 * These run the REAL `findWorkForChat()` with the use case stubbed, so what is
 * asserted is what the conversation actually does with a canonical result:
 *   • it calls the ONE use case with surface "conversation" and a limit;
 *   • it preserves the use case's order — no second sort;
 *   • it never re-slices the match set;
 *   • every card id is the REAL demand id (`requestId`), never a position;
 *   • the first reason bullet is the canonical §19 basis, taken from the
 *     result — no percentage and no aggregate score assembled here;
 *   • no-worker and empty results degrade honestly.
 *
 * i18n is stubbed as `key(values)` so the assertions read the CANONICAL KEY
 * that was used, which is the point: the conversation must reuse
 * `opportunities.recommendations.basisCompact`, not a private wording.
 */

const loadMatchesMock = vi.fn();

vi.mock("next-intl/server", () => ({
  getLocale: vi.fn(async () => "lt"),
  // Namespaced translator: returns "<namespace>.<key>" plus any values, so a
  // test can see WHICH key a surface chose.
  getTranslations: vi.fn(async (ns: string) => {
    const t = (key: string, values?: Record<string, unknown>) =>
      values ? `${ns}.${key}(${JSON.stringify(values)})` : `${ns}.${key}`;
    (t as unknown as { has: (k: string) => boolean }).has = () => true;
    return t;
  }),
}));

vi.mock("@/lib/marketplace/worker-opportunities", () => ({
  loadWorkerOpportunityMatches: (...args: unknown[]) => loadMatchesMock(...args),
}));

vi.mock("@/lib/taxonomy/work-categories", () => ({
  buildWorkTypeLabelMap: () => ({ tiler: "Plytelių klojėjas", welder: "Suvirintojas" }),
}));

const { findWorkForChat } = await import("./find-work");
const { CONVERSATION_FIND_WORK_LIMIT } = await import("./find-work-contract");

const ID = {
  a: "11111111-1111-4111-8111-111111111111",
  b: "22222222-2222-4222-8222-222222222222",
  c: "33333333-3333-4333-8333-333333333333",
} as const;

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
  return {
    kind: "ready",
    surface: "conversation",
    capabilities: {
      boardAvailable: true,
      seenAvailable: false,
      seenReadDegraded: false,
      interestAvailable: true,
    },
    interestStatusByRequestId: {},
    matches,
    totalRecommendable: matches.length,
    newCount: matches.length,
    ...over,
  };
}

beforeEach(() => {
  loadMatchesMock.mockReset();
});

describe("delegation to the canonical use case", () => {
  it("calls the ONE use case with surface \"conversation\" and the display limit", async () => {
    loadMatchesMock.mockResolvedValue(ready([rec(ID.a)]));
    await findWorkForChat();
    expect(loadMatchesMock).toHaveBeenCalledTimes(1);
    expect(loadMatchesMock).toHaveBeenCalledWith({
      surface: "conversation",
      limit: CONVERSATION_FIND_WORK_LIMIT,
    });
    expect(CONVERSATION_FIND_WORK_LIMIT).toBe(3);
  });

  it("a non-ready view is an honest blocked message, not an empty list", async () => {
    loadMatchesMock.mockResolvedValue({ kind: "no-worker" });
    const res = await findWorkForChat();
    expect(res.kind).toBe("blocked");
    expect(res).toMatchObject({
      message: "conversation.findWork.blockedNoWorker",
    });
  });

  it("an unapplied board RPC is blocked, never \"no matches\"", async () => {
    loadMatchesMock.mockResolvedValue(
      ready([], {
        capabilities: {
          boardAvailable: false,
          seenAvailable: false,
          seenReadDegraded: false,
          interestAvailable: true,
        },
      }),
    );
    const res = await findWorkForChat();
    expect(res).toEqual({
      kind: "blocked",
      message: "conversation.findWork.blockedNoAccess",
    });
  });

  it("a genuinely empty canonical result is an honest empty state", async () => {
    loadMatchesMock.mockResolvedValue(ready([]));
    const res = await findWorkForChat();
    expect(res).toEqual({
      kind: "empty",
      message: "conversation.findWork.emptyState",
    });
  });
});

describe("order, count and identity come from the use case", () => {
  it("keeps the canonical order — no second sort", async () => {
    // Deliberately NOT in "best first" order by any local heuristic: a weak
    // match first, a strong one last. The conversation must not reorder.
    loadMatchesMock.mockResolvedValue(
      ready([
        rec(ID.c, { status: "weak", basis: { pct: 33, matchedTotal: 1, needTotal: 3, matchedConfirmed: 0 } }),
        rec(ID.a, { status: "possible" }),
        rec(ID.b, { status: "strong" }),
      ]),
    );
    const res = await findWorkForChat();
    expect(res.kind).toBe("matches");
    if (res.kind !== "matches") return;
    expect(res.matches.map((m) => m.id)).toEqual([ID.c, ID.a, ID.b]);
  });

  it("renders every match the use case returned — no extra slice", async () => {
    loadMatchesMock.mockResolvedValue(ready([rec(ID.a), rec(ID.b), rec(ID.c)]));
    const res = await findWorkForChat();
    if (res.kind !== "matches") throw new Error("expected matches");
    expect(res.matches).toHaveLength(3);
  });

  it("every card id is the REAL demand id, never a list position", async () => {
    loadMatchesMock.mockResolvedValue(ready([rec(ID.a), rec(ID.b), rec(ID.c)]));
    const res = await findWorkForChat();
    if (res.kind !== "matches") throw new Error("expected matches");
    const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    for (const [i, m] of res.matches.entries()) {
      expect(m.id, `card ${i}`).toMatch(UUID);
      expect(m.id).not.toBe(String(i));
    }
    expect(res.matches.map((m) => m.id)).toEqual([ID.a, ID.b, ID.c]);
  });

  it("ids are unique, so they work as stable React keys", async () => {
    loadMatchesMock.mockResolvedValue(ready([rec(ID.a), rec(ID.b), rec(ID.c)]));
    const res = await findWorkForChat();
    if (res.kind !== "matches") throw new Error("expected matches");
    expect(new Set(res.matches.map((m) => m.id)).size).toBe(3);
  });
});

describe("explainability is the canonical §19 basis", () => {
  it("the first reason is opportunities.recommendations.basisCompact with the canonical counts", async () => {
    loadMatchesMock.mockResolvedValue(
      ready([
        rec(ID.a, {
          basis: { pct: 80, matchedTotal: 4, needTotal: 5, matchedConfirmed: 2 },
        }),
      ]),
    );
    const res = await findWorkForChat();
    if (res.kind !== "matches") throw new Error("expected matches");
    expect(res.matches[0].reasons[0]).toBe(
      'opportunities.recommendations.basisCompact({"matched":4,"total":5,"confirmed":2})',
    );
  });

  it("no percentage and no aggregate score reach the chat card", async () => {
    loadMatchesMock.mockResolvedValue(
      ready([rec(ID.a, { basis: { pct: 80, matchedTotal: 4, needTotal: 5, matchedConfirmed: 2 } })]),
    );
    const res = await findWorkForChat();
    if (res.kind !== "matches") throw new Error("expected matches");
    const card = res.matches[0];
    const blob = JSON.stringify(card);
    // The canonical basis carries counts only; `pct` must not be interpolated.
    expect(blob).not.toMatch(/"pct"/);
    expect(blob).not.toMatch(/\b80\b/);
    expect(blob).not.toMatch(/aiScore|overallScore|matchScore/);
  });

  it("the fit label is a lookup on the canonical status, not a recomputation", async () => {
    loadMatchesMock.mockResolvedValue(
      ready([rec(ID.a, { status: "possible" }), rec(ID.b, { status: "weak" })]),
    );
    const res = await findWorkForChat();
    if (res.kind !== "matches") throw new Error("expected matches");
    expect(res.matches[0].fitLabel).toBe("conversation.findWork.fitPossible");
    expect(res.matches[1].fitLabel).toBe("conversation.findWork.fitWeak");
  });

  it("never invents a company — an unnamed demand falls back to its role label", async () => {
    loadMatchesMock.mockResolvedValue(
      ready([rec(ID.a, { companyName: null, roleSlug: "welder" })]),
    );
    const res = await findWorkForChat();
    if (res.kind !== "matches") throw new Error("expected matches");
    expect(res.matches[0].name).toBe("Suvirintojas");
  });
});

describe("the match is actionable through the canonical interest path", () => {
  it("carries the worker's OWN interest status, straight from the use case", async () => {
    loadMatchesMock.mockResolvedValue(
      ready([rec(ID.a), rec(ID.b)], {
        interestStatusByRequestId: { [ID.a]: "interested" },
      }),
    );
    const res = await findWorkForChat();
    if (res.kind !== "matches") throw new Error("expected matches");
    expect(res.matches[0].interestStatus).toBe("interested");
    // No signal must stay NULL — never defaulted into a concrete status.
    expect(res.matches[1].interestStatus).toBeNull();
  });

  it("resolves the canonical interest copy — no chat-private wording", async () => {
    loadMatchesMock.mockResolvedValue(ready([rec(ID.a)]));
    const res = await findWorkForChat();
    if (res.kind !== "matches") throw new Error("expected matches");
    expect(res.interestLabels).not.toBeNull();
    // The SAME namespace the opportunities board renders.
    expect(res.interestLabels?.express).toBe("opportunities.interest.express");
    expect(res.interestLabels?.internalNote).toBe("opportunities.interest.internalNote");
  });

  it("offers NO control when the owner-gated interest table is absent", async () => {
    loadMatchesMock.mockResolvedValue(
      ready([rec(ID.a)], {
        capabilities: {
          boardAvailable: true,
          seenAvailable: false,
          seenReadDegraded: false,
          interestAvailable: false,
        },
      }),
    );
    const res = await findWorkForChat();
    if (res.kind !== "matches") throw new Error("expected matches");
    // A dead button is a fake capability — the cards stay read-only instead.
    expect(res.interestLabels).toBeNull();
  });
});

describe("what the chat reports as shown", () => {
  it("the ids the card renders are exactly the ids the marker would report", async () => {
    // The employer-match card maps `matches` 1:1 and the marker is handed
    // `m.matches.map((match) => match.id)` — so the reported set is provably
    // the rendered set, and it contains only real demand ids.
    loadMatchesMock.mockResolvedValue(ready([rec(ID.a), rec(ID.b)]));
    const res = await findWorkForChat();
    if (res.kind !== "matches") throw new Error("expected matches");
    const rendered = res.matches.map((m) => m.id);
    expect(rendered).toEqual([ID.a, ID.b]);
    expect(rendered).not.toContain(ID.c); // never returned ⇒ never reported
  });

  it("an empty result produces no cards, so there is nothing to report", async () => {
    loadMatchesMock.mockResolvedValue(ready([]));
    const res = await findWorkForChat();
    expect(res.kind).toBe("empty");
    expect(res).not.toHaveProperty("matches");
  });
});
