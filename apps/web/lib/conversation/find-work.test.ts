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
    externalCards: [],
    totalExternal: 0,
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

/** An external card as the use case returns it — only the engine's verdict
 *  matters to the sentence. `{}` (no verdict) is NOT ASSESSED. */
const ext = (status?: string, over: Record<string, unknown> = {}) =>
  status ? { match: { status, eligible: true, gaps: [], missingData: [], blocking: [], ...over } } : {};

describe("external public-source ads reach the chat's answer (real-supply train)", () => {
  it("zero platform matches but real external ads is an ANSWER, not an empty state", async () => {
    // The exact production state on 2026-08-09: job_demands empty, 87 real
    // Swedish ads stored. A chat that said "nothing matched" here would
    // disagree with the board the person opens next.
    loadMatchesMock.mockResolvedValue(
      ready([], { externalCards: [ext("strong"), ext("possible")], totalExternal: 2 }),
    );
    const res = await findWorkForChat();
    if (res.kind !== "matches") throw new Error("expected matches");
    expect(res.count).toBe(2);
    expect(res.intro).toBe('conversation.findWork.introExternalAssessed({"count":2})');
  });

  it("platform and external counts travel as ONE total with both sentences", async () => {
    loadMatchesMock.mockResolvedValue(
      ready([rec(ID.a)], { externalCards: [ext("strong"), ext("strong"), ext("possible")], totalExternal: 3 }),
    );
    const res = await findWorkForChat();
    if (res.kind !== "matches") throw new Error("expected matches");
    expect(res.count).toBe(4);
    expect(res.intro).toBe(
      'conversation.findWork.introOne conversation.findWork.introExternalAssessed({"count":3})',
    );
  });

  it("an unapplied board RPC with real external ads still answers with the ads", async () => {
    // "blocked" is only the truth when NOTHING can be shown. External ads
    // read from their own store and do not depend on the gated demand RPC.
    loadMatchesMock.mockResolvedValue(
      ready([], {
        externalCards: [{}],
        totalExternal: 1,
        capabilities: {
          boardAvailable: false,
          seenAvailable: false,
          seenReadDegraded: false,
          interestAvailable: true,
        },
      }),
    );
    const res = await findWorkForChat();
    if (res.kind !== "matches") throw new Error("expected matches");
    expect(res.count).toBe(1);
  });

  it("the external count in the sentence is capped at the panel's own display limit", async () => {
    const cards = Array.from({ length: 9 }, () => ext("strong"));
    loadMatchesMock.mockResolvedValue(
      ready([], { externalCards: cards, totalExternal: 9 }),
    );
    const res = await findWorkForChat();
    if (res.kind !== "matches") throw new Error("expected matches");
    // The chat states what the panel proves — and the panel renders at most
    // its contract limit, never the full stored set.
    expect(res.count).toBe(5);
    expect(res.intro).toBe('conversation.findWork.introExternalAssessed({"count":5})');
  });
});

describe("a found posting is not a suitable one — the sentence counts BY BAND (#1689, defect H)", () => {
  /* NEGATIVE CONTROL: production, "Ieškau naujo darbo" — two external ads
     the engine had NOT assessed as fits (insufficient_data "Senior AI
     Engineer", weak "Rörmokare") were announced as "Radau 2 tinkamų
     variantų". The pre-fix adapter counted every external card as suitable
     (`introExternal`). Nothing below may ever produce that key. */

  it("only not-assessed rows → the DISCOVERED sentence alone, never the fit sentence", async () => {
    loadMatchesMock.mockResolvedValue(
      ready([], {
        externalCards: [
          ext("insufficient_data", { missingData: ["need_not_structured"] }),
          ext("insufficient_data", { missingData: ["need_not_structured"] }),
        ],
        totalExternal: 2,
      }),
    );
    const res = await findWorkForChat();
    if (res.kind !== "matches") throw new Error("expected matches");
    expect(res.count).toBe(2);
    expect(res.intro).toBe('conversation.findWork.introExternalDiscovered({"count":2})');
    expect(res.intro).not.toContain("introExternalAssessed");
    expect(res.intro).not.toContain("introExternal(");
    expect(res.intro).not.toContain("tinkam");
  });

  it("weak rows (missing requirement / conflict) are DISCOVERED too — the engine did not say they fit", async () => {
    loadMatchesMock.mockResolvedValue(
      ready([], {
        externalCards: [
          ext("weak", { gaps: [{ code: "skills_missing", count: 2, uris: ["a", "b"] }] }),
          ext("weak", { eligible: false, gaps: [{ code: "country_mismatch" }] }),
        ],
        totalExternal: 2,
      }),
    );
    const res = await findWorkForChat();
    if (res.kind !== "matches") throw new Error("expected matches");
    expect(res.intro).toBe('conversation.findWork.introExternalDiscovered({"count":2})');
  });

  it("a card with no verdict at all is not assessed — never counted as a fit", async () => {
    loadMatchesMock.mockResolvedValue(ready([], { externalCards: [{}, {}], totalExternal: 2 }));
    const res = await findWorkForChat();
    if (res.kind !== "matches") throw new Error("expected matches");
    expect(res.intro).toBe('conversation.findWork.introExternalDiscovered({"count":2})');
  });

  it("mixed bands → both sentences, each with its own count, assessed first", async () => {
    loadMatchesMock.mockResolvedValue(
      ready([], {
        externalCards: [ext("strong"), ext("insufficient_data"), ext("possible"), ext("weak")],
        totalExternal: 4,
      }),
    );
    const res = await findWorkForChat();
    if (res.kind !== "matches") throw new Error("expected matches");
    expect(res.count).toBe(4);
    expect(res.intro).toBe(
      'conversation.findWork.introExternalAssessed({"count":2}) conversation.findWork.introExternalDiscovered({"count":2})',
    );
  });

  it("the bands are counted over the panel's display slice only — the sentence never claims rows the panel will not render", async () => {
    // 3 fits beyond the 5-row cap: the sentence counts what the panel shows.
    const cards = [...Array.from({ length: 5 }, () => ext("insufficient_data")), ext("strong"), ext("strong"), ext("strong")];
    loadMatchesMock.mockResolvedValue(ready([], { externalCards: cards, totalExternal: 8 }));
    const res = await findWorkForChat();
    if (res.kind !== "matches") throw new Error("expected matches");
    expect(res.count).toBe(5);
    expect(res.intro).toBe('conversation.findWork.introExternalDiscovered({"count":5})');
  });
});
