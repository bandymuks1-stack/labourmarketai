import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * BEFORE -> a real team change -> AFTER (company capacity / forecast order).
 * The same roster, read twice around an assignment: the answer must MOVE, and
 * an assignment nobody dated is "on work, window unknown" — never "free"
 * (SEP-7). The outlook is DERIVED and is null — not a calm row of zeros —
 * when a read did not answer.
 */

const h = vi.hoisted(() => ({
  requireEmployerCompany: vi.fn(),
  listActiveCompanyWorkers: vi.fn(),
  getEmployerWorkerAvailability: vi.fn(),
  getEmployerWorkerCommitments: vi.fn(),
}));

vi.mock("next-intl/server", () => ({
  getTranslations: async () => Object.assign((key: string) => key, { has: () => false }),
}));
vi.mock("@/lib/company/employer-company-context", () => ({
  requireEmployerCompany: h.requireEmployerCompany,
}));
vi.mock("@/lib/company/company-workers", () => ({
  listActiveCompanyWorkers: h.listActiveCompanyWorkers,
}));
vi.mock("@/lib/planning/employer-committed-work", () => ({
  getEmployerWorkerCommitments: h.getEmployerWorkerCommitments,
}));
vi.mock("@/lib/planning/employer-availability", () => ({
  getEmployerWorkerAvailability: h.getEmployerWorkerAvailability,
  unavailabilityOverlaps: (
    w: { startDate: string; endDate: string },
    item: { startDate: string; endDate: string | null },
  ) => item.startDate <= w.endDate && (item.endDate ?? item.startDate) >= w.startDate,
}));

import { loadWhoIsAvailableForChat } from "@/lib/conversation/capacity";
import { whoIsAvailableCore } from "@/lib/conversation/capacity-core";
import { buildRosterCommitmentsView } from "@/lib/planning/roster-commitments-model";
import type { CompanyWorkersListResult, LinkedCompanyWorker } from "@/lib/company/company-workers";

function worker(workerId: string, displayName: string): LinkedCompanyWorker {
  return {
    companyId: "company-1",
    profileId: `profile-${workerId}`,
    createdAt: "2026-09-01T00:00:00Z",
    operationsRole: null,
    operationsTitle: null,
    journalReviewEnabled: false,
    engagementContextLinked: false,
    availabilityStatus: null,
    availableFrom: null,
    locationCountry: null,
    currentProjects: [],
    workerId,
    status: "active",
    displayName,
    email: null,
  };
}

const ROSTER: CompanyWorkersListResult = {
  kind: "ok",
  rows: [worker("w1", "Jonas"), worker("w2", "Rasa")],
};

beforeEach(() => {
  for (const f of Object.values(h)) f.mockReset();
  h.requireEmployerCompany.mockResolvedValue({ ok: true, companyId: "c1" });
  h.listActiveCompanyWorkers.mockResolvedValue(ROSTER);
  h.getEmployerWorkerAvailability.mockResolvedValue({ status: "ok", unavailability: [] });
});

describe("capacity answer follows a real team change", () => {
  it("assigning a person (dated or not) changes the row, the counts and the outlook", async () => {
    h.getEmployerWorkerCommitments.mockResolvedValue({ status: "ok", commitments: [], undatedProjects: [] });
    const before = await loadWhoIsAvailableForChat();
    if (before.kind !== "ok") throw new Error("expected ok");
    expect(before.counts).toEqual({ free: 2, committed: 0, unavailable: 0 });
    expect(before.outlook?.map((w) => w.free)).toEqual([2, 2, 2, 2]);

    // AFTER: Jonas is put on an UNDATED project.
    h.getEmployerWorkerCommitments.mockResolvedValue({
      status: "ok",
      commitments: [],
      undatedProjects: [{ workerId: "w1", projectId: "p1", label: "Roof" }],
    });
    const afterUndated = await loadWhoIsAvailableForChat();
    if (afterUndated.kind !== "ok") throw new Error("expected ok");
    expect(afterUndated.counts).toEqual({ free: 1, committed: 1, unavailable: 0 });
    expect(afterUndated.rows.find((r) => r.workerId === "w1")).toMatchObject({
      state: "committed",
      undated: true,
      unavailableUntil: null,
      committedTo: "Roof",
    });
    expect(afterUndated.outlook?.every((w) => w.free === 1 && w.unclear === 1)).toBe(true);

    // AFTER: Rasa gets a DATED commitment in week 2 only.
    const from = new Date(Date.now() + 8 * 86_400_000).toISOString().slice(0, 10);
    h.getEmployerWorkerCommitments.mockResolvedValue({
      status: "ok",
      commitments: [{ workerId: "w2", kind: "project", sourceId: "p2", label: "Floor", startDate: from, endDate: from }],
      undatedProjects: [],
    });
    const afterDated = await loadWhoIsAvailableForChat();
    if (afterDated.kind !== "ok") throw new Error("expected ok");
    expect(afterDated.counts?.free).toBe(2);
    expect(afterDated.outlook?.map((w) => w.free)).toEqual([2, 1, 2, 2]);
  });

  it("chat, the company home, /api/mcp and the planning roster agree on the same change", async () => {
    const committed = {
      status: "ok" as const,
      commitments: [],
      undatedProjects: [{ workerId: "w1", projectId: "p1", label: "Roof" }],
    };
    h.getEmployerWorkerCommitments.mockResolvedValue(committed);
    // chat + company home both go through loadWhoIsAvailableForChat; the MCP
    // capability calls whoIsAvailableCore directly with its own caller.
    const viaChatAndHome = await loadWhoIsAvailableForChat({ roster: ROSTER });
    const viaMcp = await whoIsAvailableCore("c1", { supabase: {} as never, userId: "u1" });
    expect(viaMcp).toEqual(viaChatAndHome);
    if (viaMcp.kind !== "ok") throw new Error("expected ok");
    // planning: the person with an undated assignment is NOT counted as
    // "nothing on record", exactly as capacity does not count them as free.
    const planning = buildRosterCommitmentsView(
      [
        { workerId: "w1", name: "Jonas" },
        { workerId: "w2", name: "Rasa" },
      ],
      committed,
    );
    if (planning.status !== "ok") throw new Error("expected ok");
    expect(planning.withoutCommitment).toBe(viaMcp.counts?.free);
    expect(planning.rows.map((r) => r.workerId)).toEqual(["w1"]);
  });

  it("the outlook is null when a read did not answer", async () => {
    h.getEmployerWorkerCommitments.mockResolvedValue({ status: "unavailable" });
    const res = await loadWhoIsAvailableForChat();
    if (res.kind !== "ok") throw new Error("expected ok");
    expect(res.outlook).toBeNull();
    expect(res.commitmentsKnown).toBe(false);
  });
});
