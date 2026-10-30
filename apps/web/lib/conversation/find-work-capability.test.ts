import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `work.find` over the capability door (MCP) — the sentence AND the rows.
 *
 * Before: an external assistant got only the chat's one-line readback
 * ("found 3"): no demand id to express interest in, no engine verdict, no
 * skill basis. These tests pin that it now gets the panel's own rows, that the
 * sentence and the rows come from ONE board read, and that every outcome stays
 * a DISTINCT answer (no worker / unreadable / honest empty / rows).
 *
 * The readback runs for real (i18n stubbed as `<ns>.<key>`); only the use
 * case's load and the panel projection are stubbed.
 */

const loadViewMock = vi.fn();
const projectMock = vi.fn();
const externalMock = vi.fn();

vi.mock("server-only", () => ({}));
vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(async (ns: string) => {
    const t = (key: string, values?: Record<string, unknown>) =>
      values ? `${ns}.${key}(${JSON.stringify(values)})` : `${ns}.${key}`;
    (t as unknown as { has: (k: string) => boolean }).has = () => true;
    return t;
  }),
}));
vi.mock("@/lib/marketplace/worker-opportunities", () => ({
  loadWorkerOpportunityMatches: (...args: unknown[]) => loadViewMock(...args),
}));
vi.mock("@/lib/marketplace/opportunities-result", () => ({
  projectOpportunitiesResult: (...args: unknown[]) => projectMock(...args),
  projectExternalVacancies: (...args: unknown[]) => externalMock(...args),
}));

const { findWorkForCapability } = await import("./find-work-capability");
const { CONVERSATION_FIND_WORK_LIMIT } = await import("./find-work-contract");

const ID = "11111111-1111-4111-8111-111111111111";

const ROW = {
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

function view(matches: { status: string }[], boardAvailable = true, externalCards: unknown[] = []) {
  return {
    kind: "ready",
    surface: "conversation",
    capabilities: { boardAvailable, seenAvailable: false, seenReadDegraded: false, interestAvailable: true },
    interestStatusByRequestId: {},
    matches,
    totalRecommendable: matches.length,
    newCount: 0,
    externalCards,
    totalExternal: externalCards.length,
  };
}

function projected(over: Record<string, unknown> = {}) {
  return {
    kind: "ready",
    matches: [ROW],
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
  projectMock.mockReset();
  externalMock.mockReset();
});

describe("work.find capability adapter", () => {
  it("reads the board ONCE (chat limit, caller's filters); the rows are projected from that same view", async () => {
    const v = view([{ status: "strong" }]);
    loadViewMock.mockResolvedValue(v);
    projectMock.mockResolvedValue(projected());
    const filters = { country: "LT" } as never;
    await findWorkForCapability(filters);
    expect(loadViewMock).toHaveBeenCalledTimes(1);
    expect(loadViewMock).toHaveBeenCalledWith({
      surface: "conversation",
      limit: CONVERSATION_FIND_WORK_LIMIT,
      filters,
    });
    expect(projectMock).toHaveBeenCalledWith(v);
  });

  it("returns the rows with the skill basis, the engine verdict and the demand id", async () => {
    loadViewMock.mockResolvedValue(view([{ status: "strong" }]));
    projectMock.mockResolvedValue(projected());
    const res = await findWorkForCapability();
    expect(res.ok).toBe(true);
    const data = (res as { data: Record<string, unknown> }).data;
    expect(data.kind).toBe("matches");
    expect(data.count).toBe(1);
    const [row] = data.matches as (typeof ROW)[];
    expect(row.requestId).toBe(ID);
    expect(row.fitStatus).toBe("strong");
    expect(row.matchedSkillSlugs).toEqual(["tiling", "waterproofing"]);
    expect(row.needSkillsUnconfirmed).toBe(true);
    expect(data.interestAvailable).toBe(true);
    // UI copy for the web button never crosses to an external client.
    expect(data).not.toHaveProperty("interestLabels");
  });

  it("an honest empty is ok:true with kind 'empty' — not an error", async () => {
    loadViewMock.mockResolvedValue(view([]));
    projectMock.mockResolvedValue(projected({ matches: [], totalRecommendable: 0 }));
    const res = await findWorkForCapability();
    expect(res).toMatchObject({ ok: true, data: { kind: "empty", matches: [] } });
  });

  it("no worker profile is its own refusal, not 'unavailable'", async () => {
    loadViewMock.mockResolvedValue({ kind: "no-worker" });
    projectMock.mockResolvedValue({ kind: "no-worker" });
    const res = await findWorkForCapability();
    expect(res).toMatchObject({ ok: false, code: "no_worker_profile" });
  });

  it("an unreadable board with nothing else to show is 'unavailable' — never an empty result", async () => {
    loadViewMock.mockResolvedValue(view([], false));
    projectMock.mockResolvedValue({ kind: "unavailable" });
    const res = await findWorkForCapability();
    expect(res).toMatchObject({ ok: false, code: "unavailable" });
  });

  it("platform demand unreadable but public ads found: the ads are returned, only the platform rows are null", async () => {
    // A card the ONE engine judged; the readback counts it as found work.
    const card = {
      key: "src:1",
      match: { status: "possible", eligible: true, gaps: [], missingData: [], reasons: [], skillFit: null },
    };
    const v = view([], false, [card]);
    loadViewMock.mockResolvedValue(v);
    projectMock.mockResolvedValue({ kind: "unavailable" });
    const AD = { key: "src:1", title: "Tiler", band: "possible", originalUrl: "https://example.invalid/ad" };
    externalMock.mockResolvedValue([AD]);
    const res = await findWorkForCapability();
    expect(res.ok).toBe(true);
    const data = (res as { data: Record<string, unknown> }).data;
    expect(data.kind).toBe("matches");
    expect(externalMock).toHaveBeenCalledWith(v);
    expect(data.external).toEqual([AD]);
    expect(data.totalExternal).toBe(1);
    expect(data.matches).toBeNull();
  });
});
