import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * "Kas iš komandos laisvas pirmadienį?" — the named day narrows the ONE
 * availability read (whoIsAvailableCore) to that day. No second calculation.
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

const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);

beforeEach(() => {
  h.requireEmployerCompany.mockReset().mockResolvedValue({ ok: true, companyId: "c1" });
  h.listActiveCompanyWorkers.mockReset().mockResolvedValue({
    kind: "ok",
    rows: [
      {
        workerId: "w1",
        status: "active",
        displayName: "Jonas",
        email: null,
        companyId: "c1",
        profileId: "p1",
      },
    ],
  });
  h.getEmployerWorkerAvailability.mockReset().mockResolvedValue({ status: "ok", unavailability: [] });
  h.getEmployerWorkerCommitments.mockReset();
});

describe("a day the sentence named narrows the ONE availability read to that day", () => {
  it("the window is exactly the named day; busy only on ANOTHER day means free on it", async () => {
    h.getEmployerWorkerCommitments.mockResolvedValue({
      status: "ok",
      commitments: [{ workerId: "w1", startDate: day(5), endDate: day(6), label: "Site A" }],
    });
    const res = await loadWhoIsAvailableForChat(undefined, day(3));
    if (res.kind !== "ok") throw new Error("expected ok");
    expect(res.from).toBe(day(3));
    expect(res.to).toBe(day(3));
    expect(res.rows[0].state).toBe("free");
  });

  it("committed ON the named day is committed on it", async () => {
    h.getEmployerWorkerCommitments.mockResolvedValue({
      status: "ok",
      commitments: [{ workerId: "w1", startDate: day(5), endDate: day(6), label: "Site A" }],
    });
    const res = await loadWhoIsAvailableForChat(undefined, day(5));
    if (res.kind !== "ok") throw new Error("expected ok");
    expect(res.rows[0].state).toBe("committed");
  });

  it("a day in the past, beyond 120 days, or malformed is ignored (default window)", async () => {
    h.getEmployerWorkerCommitments.mockResolvedValue({ status: "ok", commitments: [] });
    for (const bad of [day(-2), day(200), "2026-13-45", "pirmadienį", ""]) {
      const res = await loadWhoIsAvailableForChat(undefined, bad);
      if (res.kind !== "ok") throw new Error("expected ok");
      expect(res.from).toBe(day(0));
      expect(res.to).toBe(day(6));
    }
  });
});
