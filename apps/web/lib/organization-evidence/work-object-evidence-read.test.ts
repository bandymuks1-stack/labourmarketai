import { describe, expect, it } from "vitest";

import type { DomainCaller } from "@/lib/domain/caller";
import {
  displayPersonName,
  readEvidenceForProject,
  readEvidenceForWorkObject,
} from "./work-object-evidence-read";

type Result = { data?: unknown; error?: { code?: string } | null };

/** A thenable query builder: every chained call returns itself, awaiting yields the result. */
function builder(result: Result, calls: { in: [string, unknown][] }) {
  const b: Record<string, unknown> = {};
  for (const m of ["select", "order", "limit", "range", "eq"]) b[m] = () => b;
  b.in = (col: string, v: unknown) => {
    calls.in.push([col, v]);
    return b;
  };
  b.then = (res: (v: Result) => unknown) => Promise.resolve({ data: null, error: null, ...result }).then(res);
  return b;
}

function caller(byTable: Record<string, Result>) {
  const calls = { in: [] as [string, unknown][] };
  const c = {
    supabase: { from: (t: string) => builder(byTable[t] ?? { data: [] }, calls) },
    userId: "u",
    locale: "en",
  } as unknown as DomainCaller;
  return { c, calls };
}

const row = (id: string, state = "ORGANIZATION_REPORTED", events: unknown[] = []) => ({
  id,
  organization_person_id: "p1",
  activity_kind: "work",
  activity_date: "2024-05-01",
  hours: 8,
  original_text: "x",
  original_language: "en",
  context_label: "Site A",
  work_object_id: "w1",
  supplier_role: "employer",
  source_kind: "csv",
  imported_at: "2024-06-01",
  evidence_state: state,
  derived: {},
  organization_id: "o1",
  organization_people: { display_name: "Jonas", linked_profile_id: null },
  organization_evidence_events: events,
  organization_evidence_parties: [],
});

describe("readEvidenceForWorkObject", () => {
  it("empty is ok with no records", async () => {
    const { c } = caller({ organization_evidence_records: { data: [] } });
    expect(await readEvidenceForWorkObject(c, "w1")).toEqual({ kind: "ok", records: [] });
  });

  it("a failed read is unavailable, never an empty list", async () => {
    const { c } = caller({ organization_evidence_records: { error: { code: "500" } } });
    expect(await readEvidenceForWorkObject(c, "w1")).toEqual({ kind: "unavailable" });
  });

  it("a missing store is unprovisioned, not empty", async () => {
    const { c } = caller({ organization_evidence_records: { error: { code: "42P01" } } });
    expect(await readEvidenceForWorkObject(c, "w1")).toEqual({ kind: "unprovisioned" });
  });

  it("returns live records, filters by work object, excludes withdrawn", async () => {
    const withdrawn = row("r2", "ORGANIZATION_REPORTED", [
      { event_type: "withdrawn", actor_role: "employer", actor_profile_id: "u", created_at: "2024-07-01" },
    ]);
    const { c, calls } = caller({ organization_evidence_records: { data: [row("r1"), withdrawn] } });
    const res = await readEvidenceForWorkObject(c, "w1");
    expect(res.kind).toBe("ok");
    if (res.kind === "ok") expect(res.records.map((r) => r.id)).toEqual(["r1"]);
    expect(calls.in).toContainEqual(["work_object_id", ["w1"]]);
  });
});

describe("readEvidenceForProject", () => {
  it("a project with no work objects is an honest empty", async () => {
    const { c } = caller({ work_objects: { data: [] } });
    expect(await readEvidenceForProject(c, "p")).toEqual({ kind: "ok", records: [] });
  });

  it("a failed work-object read is unavailable", async () => {
    const { c } = caller({ work_objects: { error: { code: "500" } } });
    expect(await readEvidenceForProject(c, "p")).toEqual({ kind: "unavailable" });
  });

  it("resolves work objects then reads their records", async () => {
    const { c } = caller({
      work_objects: { data: [{ id: "w1" }] },
      organization_evidence_records: { data: [row("r1")] },
    });
    const res = await readEvidenceForProject(c, "p");
    expect(res.kind === "ok" && res.records.length).toBe(1);
  });
});

describe("displayPersonName", () => {
  it("never shows a raw id as a name", () => {
    expect(displayPersonName("3f2b8c1e-1111-4222-8333-444455556666")).toBeNull();
    expect(displayPersonName("  ")).toBeNull();
    expect(displayPersonName(null)).toBeNull();
    expect(displayPersonName(" Jonas ")).toBe("Jonas");
  });
});
