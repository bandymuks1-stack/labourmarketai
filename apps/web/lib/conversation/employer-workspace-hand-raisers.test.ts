import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/company/employer-company-context", () => ({
  resolveEmployerCompanyContext: async () => ({ kind: "ok" }),
}));

const runScouting = vi.fn();
vi.mock("@/lib/scouting/scouting", () => ({
  listCompanyDemands: async () => [],
  runScouting: (...a: unknown[]) => runScouting(...a),
}));
const loadDemandPipelineFacts = vi.fn();
vi.mock("@/lib/pipeline/candidate-pipeline-facts", () => ({
  loadDemandPipelineFacts: (...a: unknown[]) => loadDemandPipelineFacts(...a),
}));

import { loadEmployerCandidatesForChat } from "@/lib/conversation/employer-workspace";
import { EMPLOYER_CANDIDATES_LIMIT } from "@/lib/conversation/employer-workspace-contract";
import { toUnassessedHandRaiser } from "@/lib/scouting/scout-safe-view";

/**
 * Owner decision 2026-10-22 in the chat candidates panel: the adapter carries
 * hand-raisers on a need that names no trade to the panel, server-side, with
 * no match field at all.
 */

const DEMAND = {
  id: "req-1",
  title: "Ieškome žmonių",
  status: "submitted",
  structured: false,
  needSource: null,
  createdAt: "2026-10-20T08:00:00.000Z",
  ownedByCaller: true,
};

function raiser(workerId: string, over: Partial<Parameters<typeof toUnassessedHandRaiser>[0]> = {}) {
  return toUnassessedHandRaiser({
    workerId,
    professionSlug: "tiler",
    subject: {
      skills: [{ uri: "tiling", evidence: "manager_confirmed" }],
      professionSlug: "tiler",
      country: "LT",
      preferredCountries: ["LT"],
      availabilityStatus: "available",
      availableFrom: null,
    },
    interestStatus: "interested",
    shortlistStatus: null,
    lastActiveBucket: "active",
    actionability: { kind: "actionable" },
    ...over,
  });
}

beforeEach(() => {
  runScouting.mockReset();
  loadDemandPipelineFacts.mockReset();
  loadDemandPipelineFacts.mockResolvedValue({ bookingByWorker: new Map(), conversationByWorker: new Set() });
});

describe("loadEmployerCandidatesForChat — not-structured need", () => {
  it("projects hand-raisers with matchAssessed:false and no match field", async () => {
    runScouting.mockResolvedValue({
      kind: "not-structured",
      demand: DEMAND,
      handRaisers: [raiser("w-1", { shortlistStatus: "saved", shortlistNote: "call" })],
    });
    const r = await loadEmployerCandidatesForChat("req-1");
    expect(r.kind).toBe("not-structured");
    if (r.kind !== "not-structured") return;
    expect(r.handRaisersTotal).toBe(1);
    expect(r.handRaisers).toHaveLength(1);
    const h = r.handRaisers[0]!;
    expect(h).toMatchObject({
      matchAssessed: false,
      workerId: "w-1",
      professionSlug: "tiler",
      country: "LT",
      canContact: true,
      shortlistStatus: "saved",
      shortlistNote: "call",
      bookingStatus: null,
    });
    expect(h.label).not.toMatch(/^Candidate /); // the bare anonymized token
    for (const key of ["matchStatus", "coveragePct", "confirmedCount", "eligible", "gaps"]) {
      expect(h).not.toHaveProperty(key);
    }
    expect(loadDemandPipelineFacts).toHaveBeenCalledWith("req-1", ["w-1"]);
  });

  it("caps the panel list and reports the real total", async () => {
    const many = Array.from({ length: EMPLOYER_CANDIDATES_LIMIT + 3 }, (_, i) => raiser(`w-${i}`));
    runScouting.mockResolvedValue({ kind: "not-structured", demand: DEMAND, handRaisers: many });
    const r = await loadEmployerCandidatesForChat("req-1");
    if (r.kind !== "not-structured") throw new Error(r.kind);
    expect(r.handRaisers).toHaveLength(EMPLOYER_CANDIDATES_LIMIT);
    expect(r.handRaisersTotal).toBe(EMPLOYER_CANDIDATES_LIMIT + 3);
  });

  it("no hand-raisers → the plain not-structured state", async () => {
    runScouting.mockResolvedValue({ kind: "not-structured", demand: DEMAND, handRaisers: [] });
    const r = await loadEmployerCandidatesForChat("req-1");
    expect(r).toMatchObject({ kind: "not-structured", handRaisers: [], handRaisersTotal: 0 });
  });
});
