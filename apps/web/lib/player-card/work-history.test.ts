import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * CV-15 / G-7 — THE CARD READS THE ONE HISTORY (decision 0025).
 *
 * `getOwnWorkHistory` used to run its own `engagement_contexts` query: 20
 * rows, `manager` left out. A director, or a person with more than 20
 * engagements, then had one history on the profile card and another in Work
 * in Numbers. These tests run the REAL decision-0025 reader against a fake
 * client that honours the query's own relationship filter and limit, so the
 * old query would fail them, and compare the card to what Work in Numbers
 * reads (`readOwnExperienceRelationships`).
 */

const USER = "00000000-0000-4000-8000-000000000001";
const LED_ORG = "00000000-0000-4000-8000-0000000000aa";

type Row = Record<string, unknown>;
let engagementRows: Row[] = [];
let failEngagementRead = false;

function query(table: string) {
  const state: { inList?: string[]; limit?: number } = {};
  const builder = {
    select: () => builder,
    eq: () => builder,
    order: () => builder,
    in: (col: string, list: string[]) => {
      if (col === "relationship_slug") state.inList = list;
      return builder;
    },
    limit: (n: number) => {
      state.limit = n;
      return builder;
    },
    then: (resolve: (v: { data: Row[] | null; error: { code: string } | null }) => unknown) => {
      if (table !== "engagement_contexts") return resolve({ data: [], error: null });
      if (failEngagementRead) return resolve({ data: null, error: { code: "XX000" } });
      let rows = engagementRows;
      if (state.inList) rows = rows.filter((r) => state.inList!.includes(r.relationship_slug as string));
      if (state.limit !== undefined) rows = rows.slice(0, state.limit);
      return resolve({ data: rows, error: null });
    },
  };
  return builder;
}

const fakeClient = {
  auth: { getUser: async () => ({ data: { user: { id: USER } } }) },
  from: (table: string) => query(table),
  rpc: async () => ({ data: [], error: null }),
};

vi.mock("react", async (orig) => ({
  ...(await orig<typeof import("react")>()),
  cache: <T,>(fn: T) => fn,
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => fakeClient }));
vi.mock("@/lib/organization-evidence/my-organizations-read", () => ({
  readMyLedOrganizations: async () => ({
    kind: "ok",
    // A leader with no engagement row of that relationship: a role of its own.
    organizations: [{ organizationId: LED_ORG, relationship: "owner", name: "Led Org", periods: [] }],
  }),
}));

function engagement(i: number, slug: string): Row {
  const month = String((i % 12) + 1).padStart(2, "0");
  return {
    id: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
    relationship_slug: slug,
    title: `Role ${i}`,
    organization_id: `10000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
    status: "ended",
    started_at: `${2000 + i}-${month}-01`,
    ended_at: `${2000 + i}-12-31`,
    country_code: "LT",
    organizations: { display_name: `Org ${i}`, legal_name: null },
  };
}

async function load() {
  const { getOwnWorkHistory } = await import("./work-history");
  const { readOwnExperienceRelationships } = await import("@/lib/journal/professional-experience-read");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const relationships = await readOwnExperienceRelationships(fakeClient as any, USER);
  const card = await getOwnWorkHistory();
  return { relationships, card };
}

beforeEach(() => {
  failEngagementRead = false;
  engagementRows = [];
});

describe("the profile card's history = the decision-0025 reading", () => {
  it("a person with more than 20 engagements gets every one on the card, as in Work in Numbers", async () => {
    engagementRows = Array.from({ length: 27 }, (_, i) => engagement(i + 1, "employee"));
    const { relationships, card } = await load();
    expect(relationships).not.toBeNull();
    expect(card.status).toBe("ok");
    if (card.status !== "ok") return;
    const engagementIds = (relationships ?? []).filter((r) => r.engagementContextId).map((r) => r.engagementContextId);
    expect(engagementIds).toHaveLength(27);
    expect(card.entries.filter((e) => engagementIds.includes(e.id))).toHaveLength(27);
    // Same set, nothing added, nothing dropped.
    expect(card.entries).toHaveLength((relationships ?? []).length);
  });

  it("a director's manager relationship and a led organization are on the card, as in Work in Numbers", async () => {
    engagementRows = [engagement(1, "employee"), engagement(2, "manager")];
    const { relationships, card } = await load();
    if (card.status !== "ok") throw new Error("card read failed");
    const wiSet = (relationships ?? []).map((r) => `${r.organizationId}|${r.relationship}`).sort();
    const cardOrgs = new Map(
      (relationships ?? []).map((r) => [r.engagementContextId ?? `${r.source}:${r.organizationId}:${r.relationship}`, r.organizationId]),
    );
    const cardSet = card.entries.map((e) => `${cardOrgs.get(e.id)}|${e.relationshipSlug}`).sort();
    expect(cardSet).toEqual(wiSet);
    expect(card.entries.map((e) => e.relationshipSlug)).toEqual(expect.arrayContaining(["manager", "owner", "employee"]));
    const led = card.entries.find((e) => e.relationshipSlug === "owner");
    // Nothing invented for a membership-only role: no dates, no title.
    expect(led).toMatchObject({ organizationName: "Led Org", startedAt: null, endedAt: null, title: null, current: true });
  });

  it("current membership stays in history without claiming current work", async () => {
    engagementRows = [{ ...engagement(1, "employee"), status: "active", ended_at: null }];
    const { card } = await load();
    if (card.status !== "ok") throw new Error("card read failed");
    const { isCurrentWork, countCurrentEngagements } = await import("./work-history-model");
    const membership = card.entries.find(e => e.source === "membership");
    expect(membership).toMatchObject({ current: true, relationshipSlug: "owner" });
    expect(isCurrentWork(membership!)).toBe(false);
    expect(card.entries.filter(isCurrentWork).map(e => e.organizationName)).toEqual(["Org 1"]);
    expect(countCurrentEngagements(card.entries)).toBe(1);
  });

  it("keeps the engagement's own fields and orders newest first", async () => {
    engagementRows = [engagement(3, "employee"), engagement(9, "freelancer")];
    const { card } = await load();
    if (card.status !== "ok") throw new Error("card read failed");
    expect(card.entries[0]).toMatchObject({ title: "Role 9", organizationName: "Org 9", countryCode: "LT", current: false });
    expect(card.entries[1]?.title).toBe("Role 3");
  });

  it("a failed read is unavailable, never an empty history", async () => {
    failEngagementRead = true;
    const { card } = await load();
    expect(card).toEqual({ status: "unavailable" });
  });
});

describe("the card's display bound is a render-time bound", () => {
  it("shownWorkHistory shows the newest WORK_HISTORY_LIMIT rows; the model keeps all", async () => {
    const { shownWorkHistory, WORK_HISTORY_LIMIT, workHistoryFromExperience } = await import("./work-history-model");
    const all = workHistoryFromExperience(
      Array.from({ length: 30 }, (_, i) => ({
        engagementContextId: `e${i}`,
        organizationId: `o${i}`,
        organizationName: `Org ${i}`,
        relationship: "employee",
        title: null,
        startedAt: `${2000 + i}-01-01`,
        endedAt: null,
        current: true,
        source: "engagement" as const,
        businessPeriods: [],
      })),
    );
    expect(all).toHaveLength(30);
    const shown = shownWorkHistory(all);
    expect(shown).toHaveLength(WORK_HISTORY_LIMIT);
    expect(shown[0]?.startedAt).toBe("2029-01-01");
  });
});
