import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The reports hub documents tile never asserts "no worker has agreed" from a
 * zero it cannot vouch for: the aggregate still reads the retired agency pool,
 * so a live agency roster always counts 0. Zero renders the honest
 * unavailable note, exactly like the document centre's own zero case.
 */
const centre = vi.hoisted(() => ({ value: null as unknown }));
vi.mock("@/lib/documents/document-centre", () => ({
  getOrgDocumentCentre: vi.fn(async () => centre.value),
}));

import { readOrgDocumentCounts } from "@/lib/reports/reports-hub";

const summary = (workers: number) => ({
  kind: "ok",
  summary: { workers, total: workers * 2, valid: workers, expiring: 1, attention: 0 },
});

beforeEach(() => {
  centre.value = null;
});

describe("reports hub documents tile", () => {
  it("zero counted workers is unavailable, never a zero tile", async () => {
    centre.value = summary(0);
    expect(await readOrgDocumentCounts()).toEqual({ state: "unavailable" });
  });

  it("real counts still render", async () => {
    centre.value = summary(3);
    expect(await readOrgDocumentCounts()).toEqual({ state: "ok", workers: 3, expiring: 1, attention: 0 });
  });

  it("an unavailable centre stays unavailable", async () => {
    centre.value = { kind: "unavailable" };
    expect(await readOrgDocumentCounts()).toEqual({ state: "unavailable" });
  });
});
