import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { readSignalsForWorkers } from "./history-signals-read";

type Table = { data: unknown[] | null; error?: { code: string } | null };

/** Table-keyed fake that also records the filters each read applied. */
function fake(tables: Record<string, Table>) {
  const calls: { table: string; eq: [string, unknown][]; usedServiceRole: false }[] = [];
  const client = {
    from: (table: string) => {
      const t = tables[table] ?? { data: [] };
      const call = { table, eq: [] as [string, unknown][], usedServiceRole: false as const };
      calls.push(call);
      const b: Record<string, unknown> = {};
      for (const m of ["select", "in", "order", "limit", "not"]) b[m] = () => b;
      b.eq = (col: string, val: unknown) => {
        call.eq.push([col, val]);
        return b;
      };
      b.then = (resolve: (v: unknown) => unknown) =>
        resolve({ data: t.error ? null : t.data, error: t.error ?? null });
      return b;
    },
  };
  return { client: client as never, calls };
}

const person = (id: string, worker: string) => ({ id, linked_worker_id: worker });
const rec = (id: string, personId: string, events: unknown[] = []) => ({
  id,
  organization_person_id: personId,
  evidence_state: "ORGANIZATION_REPORTED",
  organization_people: { linked_profile_id: "u1" },
  organization_evidence_events: events,
});
const sig = (record_id: string, skill_slug: string | null) => ({ record_id, skill_slug });

describe("readSignalsForWorkers", () => {
  it("reads LINKED roster rows only", async () => {
    const { client, calls } = fake({ organization_people: { data: [] } });
    const out = await readSignalsForWorkers(client, ["w1"]);
    expect(out).toEqual({ kind: "ok", byWorker: new Map() });
    const people = calls.find((c) => c.table === "organization_people")!;
    expect(people.eq).toContainEqual(["link_state", "linked"]);
    expect(people.eq).toContainEqual(["link_method", "worker_confirmed"]);
  });

  it("counts DISTINCT live records per worker and skill, labelled organization_provided", async () => {
    const { client } = fake({
      organization_people: { data: [person("p1", "w1"), person("p2", "w2")] },
      organization_evidence_records: { data: [rec("r1", "p1"), rec("r2", "p1"), rec("r3", "p2")] },
      organization_evidence_competency_signals: {
        data: [sig("r1", "tiling"), sig("r1", "tiling"), sig("r2", "tiling"), sig("r2", "screed"), sig("r3", "tiling")],
      },
    });
    const out = await readSignalsForWorkers(client, ["w1", "w2"]);
    expect(out.kind).toBe("ok");
    if (out.kind !== "ok") return;
    expect(out.byWorker.get("w1")).toEqual([
      { slug: "tiling", records: 2, provenance: "organization_provided" },
      { slug: "screed", records: 1, provenance: "organization_provided" },
    ]);
    expect(out.byWorker.get("w2")).toEqual([
      { slug: "tiling", records: 1, provenance: "organization_provided" },
    ]);
  });

  it("a withdrawn record counts nowhere", async () => {
    const { client } = fake({
      organization_people: { data: [person("p1", "w1")] },
      organization_evidence_records: {
        data: [
          rec("r1", "p1", [
            { event_type: "withdrawn", actor_role: "employer", actor_profile_id: "m1", created_at: "2026-09-17T00:00:00Z" },
          ]),
          rec("r2", "p1"),
        ],
      },
      organization_evidence_competency_signals: { data: [sig("r1", "tiling"), sig("r2", "screed")] },
    });
    const out = await readSignalsForWorkers(client, ["w1"]);
    expect(out.kind === "ok" && out.byWorker.get("w1")).toEqual([
      { slug: "screed", records: 1, provenance: "organization_provided" },
    ]);
  });

  it("a worker with no history is ABSENT (unknown), not an empty list", async () => {
    const { client } = fake({
      organization_people: { data: [person("p1", "w1")] },
      organization_evidence_records: { data: [rec("r1", "p1")] },
      organization_evidence_competency_signals: { data: [sig("r1", "tiling")] },
    });
    const out = await readSignalsForWorkers(client, ["w1", "w9"]);
    expect(out.kind === "ok" && out.byWorker.has("w9")).toBe(false);
  });

  it("a failed read is UNAVAILABLE, never an empty result", async () => {
    for (const failing of ["organization_people", "organization_evidence_records", "organization_evidence_competency_signals"]) {
      const { client } = fake({
        organization_people: { data: [person("p1", "w1")] },
        organization_evidence_records: { data: [rec("r1", "p1")] },
        organization_evidence_competency_signals: { data: [sig("r1", "tiling")] },
        [failing]: { data: null, error: { code: "XX000" } },
      });
      const out = await readSignalsForWorkers(client, ["w1"]);
      expect(out).toEqual({ kind: "unavailable", reason: "read_failed" });
    }
  });

  it("a store that is not installed is unavailable too", async () => {
    const { client } = fake({ organization_people: { data: null, error: { code: "42P01" } } });
    expect(await readSignalsForWorkers(client, ["w1"])).toEqual({
      kind: "unavailable",
      reason: "not_installed",
    });
  });

  it("no workers asked about = nothing to read", async () => {
    const { client, calls } = fake({});
    expect(await readSignalsForWorkers(client, [])).toEqual({ kind: "ok", byWorker: new Map() });
    expect(calls).toHaveLength(0);
  });
});
