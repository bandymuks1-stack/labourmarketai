import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Conversation find-work — BEHAVIOUR tests for a THIN INTENT ADAPTER.
 *
 * The chat no longer renders job rows: the Context Panel `opportunities`
 * result is the single renderer and the single action surface. So this module
 * shrank to "is there an answer, and how do I say so in one sentence", and
 * these tests shrank with it.
 *
 * The row-level guarantees this file used to assert — canonical order, real
 * demand ids, no re-slice, the §19 basis crossing whole, interest status and
 * copy — did NOT disappear with the old renderer. They moved, with the rows,
 * to `lib/marketplace/opportunities-result-projection.test.ts`.
 *
 * What stays here is what the ADAPTER still decides: it delegates to the ONE
 * use case, and it keeps blocked / empty / matches distinct — because
 * "there is no demand data at all", "nothing matched you" and "here is your
 * answer" are three different things to tell a person.
 *
 * i18n is stubbed as `key(values)` so an assertion reads the CANONICAL KEY.
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

describe("the answer is a count and a sentence — the panel renders the rows", () => {
  it("reports how many rows the panel will render", async () => {
    loadMatchesMock.mockResolvedValue(ready([rec(ID.a), rec(ID.b), rec(ID.c)]));
    const res = await findWorkForChat();
    if (res.kind !== "matches") throw new Error("expected matches");
    expect(res.count).toBe(3);
  });

  it("uses the singular opening for exactly one match", async () => {
    loadMatchesMock.mockResolvedValue(ready([rec(ID.a)]));
    const res = await findWorkForChat();
    if (res.kind !== "matches") throw new Error("expected matches");
    expect(res.count).toBe(1);
    expect(res.intro).toBe("conversation.findWork.introOne");
  });

  it("states the real count in the plural opening — never a number of its own", async () => {
    loadMatchesMock.mockResolvedValue(ready([rec(ID.a), rec(ID.b)]));
    const res = await findWorkForChat();
    if (res.kind !== "matches") throw new Error("expected matches");
    expect(res.intro).toBe('conversation.findWork.intro({"count":2})');
  });

  it("hands the chat NO rows, NO ids and NO labels to render", async () => {
    loadMatchesMock.mockResolvedValue(ready([rec(ID.a), rec(ID.b)]));
    const res = await findWorkForChat();
    if (res.kind !== "matches") throw new Error("expected matches");
    // The whole point of the consolidation: a second renderer cannot come
    // back by accident, because there is nothing here to render.
    expect(res).not.toHaveProperty("matches");
    expect(res).not.toHaveProperty("interestLabels");
    expect(Object.keys(res).sort()).toEqual(["count", "intro", "kind"]);
  });
});
