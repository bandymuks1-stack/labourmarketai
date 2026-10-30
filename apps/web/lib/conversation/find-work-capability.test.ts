import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `work.find` over the capability door (MCP) — the sentence AND the rows.
 *
 * Before: an external assistant got only the chat's one-line readback
 * ("found 3"): no demand id to express interest in, no engine verdict, no
 * skill basis. These tests pin that it now gets the panel's own rows, read
 * with the chat's limit and the caller's filters, and that every outcome
 * stays a DISTINCT answer (no worker / unreadable / honest empty / rows).
 */

const loadViewMock = vi.fn();
const loadResultMock = vi.fn();
const findWorkMock = vi.fn();
const VIEW = { kind: "ready", marker: "the-one-view" };

vi.mock("server-only", () => ({}));
vi.mock("@/lib/marketplace/worker-opportunities", () => ({
  loadWorkerOpportunityMatches: (...args: unknown[]) => loadViewMock(...args),
}));
vi.mock("@/lib/marketplace/opportunities-result", () => ({
  projectOpportunitiesResult: (...args: unknown[]) => loadResultMock(...args),
}));
vi.mock("./find-work-readback", () => ({
  findWorkReadback: (...args: unknown[]) => findWorkMock(...args),
}));

const { findWorkForCapability } = await import("./find-work-capability");
const { CONVERSATION_FIND_WORK_LIMIT } = await import("./find-work-contract");

const ID = "11111111-1111-4111-8111-111111111111";

const MATCH = {
  requestId: ID,
  roleSlug: "tiler",
  country: "LT",
  locationLabel: "Vilnius",
  startPeriod: "asap",
  basis: { matchedTotal: 2, needTotal: 2, matchedConfirmed: 1 },
  salary: "unknown",
  matchedSkillSlugs: ["tiling", "waterproofing"],
  missingSkillSlugs: [],
  needSkillsUnconfirmed: true,
  isNew: true,
  companyName: "Synthetic Co",
  fitStatus: "strong",
  interestStatus: null,
};

function ready(over: Record<string, unknown> = {}) {
  return {
    kind: "ready",
    matches: [MATCH],
    totalRecommendable: 1,
    newCount: 1,
    seenDegraded: false,
    interestLabels: { express: "x" },
    external: [],
    totalExternal: 0,
    ...over,
  };
}

beforeEach(() => {
  loadViewMock.mockReset();
  loadViewMock.mockResolvedValue(VIEW);
  loadResultMock.mockReset();
  findWorkMock.mockReset();
});

describe("work.find capability adapter", () => {
  it("reads the board ONCE (chat limit, caller's filters); sentence and rows come from that one view", async () => {
    loadResultMock.mockResolvedValue(ready());
    findWorkMock.mockResolvedValue({ kind: "matches", count: 1, intro: "one" });
    const filters = { country: "LT" } as never;
    await findWorkForCapability(filters);
    expect(loadViewMock).toHaveBeenCalledTimes(1);
    expect(loadViewMock).toHaveBeenCalledWith({
      surface: "conversation",
      limit: CONVERSATION_FIND_WORK_LIMIT,
      filters,
    });
    expect(loadResultMock).toHaveBeenCalledWith(VIEW);
    expect(findWorkMock).toHaveBeenCalledWith(VIEW);
  });

  it("returns the rows with the skill basis, the engine verdict and the demand id", async () => {
    loadResultMock.mockResolvedValue(ready());
    findWorkMock.mockResolvedValue({ kind: "matches", count: 1, intro: "one" });
    const res = await findWorkForCapability();
    expect(res.ok).toBe(true);
    const data = (res as { data: Record<string, unknown> }).data;
    expect(data.kind).toBe("matches");
    expect(data.count).toBe(1);
    const [row] = data.matches as (typeof MATCH)[];
    expect(row.requestId).toBe(ID);
    expect(row.fitStatus).toBe("strong");
    expect(row.matchedSkillSlugs).toEqual(["tiling", "waterproofing"]);
    expect(row.needSkillsUnconfirmed).toBe(true);
    expect(data.interestAvailable).toBe(true);
    // UI copy for the web button never crosses to an external client.
    expect(data).not.toHaveProperty("interestLabels");
  });

  it("an honest empty is ok:true with kind 'empty' — not an error", async () => {
    loadResultMock.mockResolvedValue(ready({ matches: [], totalRecommendable: 0 }));
    findWorkMock.mockResolvedValue({ kind: "empty", message: "nothing fits" });
    const res = await findWorkForCapability();
    expect(res).toMatchObject({ ok: true, data: { kind: "empty", message: "nothing fits", matches: [] } });
  });

  it("no worker profile is its own refusal, not 'unavailable'", async () => {
    loadResultMock.mockResolvedValue({ kind: "no-worker" });
    const res = await findWorkForCapability();
    expect(res).toMatchObject({ ok: false, code: "no_worker_profile" });
    expect(findWorkMock).not.toHaveBeenCalled();
  });

  it("an unreadable board is 'unavailable' — never an empty result", async () => {
    loadResultMock.mockResolvedValue({ kind: "unavailable" });
    findWorkMock.mockResolvedValue({ kind: "blocked", message: "no access" });
    const res = await findWorkForCapability();
    expect(res).toMatchObject({ ok: false, code: "unavailable" });
  });

  it("external ads counted while platform rows are unreadable: rows are null, not []", async () => {
    loadResultMock.mockResolvedValue({ kind: "unavailable" });
    findWorkMock.mockResolvedValue({ kind: "matches", count: 2, intro: "two ads" });
    const res = await findWorkForCapability();
    expect(res).toMatchObject({ ok: true, data: { kind: "matches", matches: null, external: null } });
  });
});
